import { check, supabase } from "@/lib/supabase";

export const TRAINING_BUCKET = "training-images";

export type TrainingImage = {
  id: number;
  storage_path: string;
  label: string | null;
  created_at: string;
};

export type TrainingStats = {
  unlabeled: number;
  labeled: number;
  classes: { label: string; count: number }[];
};

export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "canceled";

export type TrainingJob = {
  id: number;
  status: JobStatus;
  params: { epochs?: number; imgsz?: number; base_model?: string; min_images?: number };
  classes: string[] | null;
  image_count: number | null;
  progress: { epoch?: number; epochs?: number } | null;
  metrics: { top1?: number; top5?: number } | null;
  log: string | null;
  error: string | null;
  model_path: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  deployed_at: string | null;
};

export const imageUrl = (path: string) => supabase.storage.from(TRAINING_BUCKET).getPublicUrl(path).data.publicUrl;

/** Every crystal name, for the label picker (labels must match crystal names). */
export async function fetchCrystalNames(): Promise<string[]> {
  const names: string[] = [];
  for (let from = 0; ; from += 1000) {
    const rows = (check(await supabase.from("crystals").select("name").order("name").range(from, from + 999)) ?? []) as {
      name: string;
    }[];
    names.push(...rows.map((r) => r.name));
    if (rows.length < 1000) break;
  }
  return names;
}

export async function fetchStats(): Promise<TrainingStats> {
  return check(await supabase.rpc("training_stats")) as TrainingStats;
}

export async function setLabel(ids: number[], label: string | null) {
  const { data } = await supabase.auth.getUser();
  check(
    await supabase
      .from("training_images")
      .update({
        label,
        labeled_at: label ? new Date().toISOString() : null,
        labeled_by: label ? data.user?.id : null,
      })
      .in("id", ids),
  );
}

export async function deleteImages(images: Pick<TrainingImage, "id" | "storage_path">[]) {
  check(
    await supabase
      .from("training_images")
      .delete()
      .in(
        "id",
        images.map((i) => i.id),
      ),
  );
  // Best effort: an orphaned file only costs storage, never breaks training.
  await supabase.storage.from(TRAINING_BUCKET).remove(images.map((i) => i.storage_path));
}

/**
 * Shrinks big phone photos before upload (classification trains at ~224px, so
 * 1024px is plenty) — keeps uploads fast and storage small.
 */
async function shrink(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 1_500_000) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", 0.9));
  } catch {
    return file;
  }
}

/** Uploads one photo and records it, optionally already labeled. */
export async function uploadTrainingImage(file: File, label: string | null) {
  const blob = await shrink(file);
  const ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
  const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;
  check(await supabase.storage.from(TRAINING_BUCKET).upload(path, blob, { contentType: blob.type || "image/jpeg" }));
  const { data } = await supabase.auth.getUser();
  check(
    await supabase.from("training_images").insert({
      storage_path: path,
      label,
      labeled_at: label ? new Date().toISOString() : null,
      labeled_by: label ? data.user?.id : null,
    }),
  );
}

/** Hint appended to errors caused by training.sql not having been run. */
export function explainSetup(message: string) {
  return /training_|bucket|relation|function/i.test(message)
    ? `${message} — run sql/training.sql in the Supabase SQL editor first.`
    : message;
}
