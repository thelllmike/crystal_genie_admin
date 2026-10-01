import { check, supabase } from "@/lib/supabase";

export const TRAINING_BUCKET = "training-images"; // only photos uploaded before the move to the VPS

// The API on the VPS stores new training photos on its own disk.
export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "https://srv1866657.hstgr.cloud").replace(/\/$/, "");

/** A box around one crystal; x/y = top-left corner, all 0..1 of the photo. */
export type Box = { label: string; x: number; y: number; w: number; h: number };

export type TrainingImage = {
  id: number;
  storage_path: string;
  label: string | null;
  stored_on: "vps" | "supabase";
  /** null = not boxed yet; [] = checked and has no crystals */
  boxes: Box[] | null;
  created_at: string;
};

export const IMAGE_COLUMNS = "id, storage_path, label, stored_on, boxes, created_at";

export type TrainingStats = {
  unlabeled: number;
  labeled: number;
  classes: { label: string; count: number }[];
  boxed: number;
  unboxed: number;
  /** count = photos containing the crystal, boxes = total boxes */
  box_classes: { label: string; count: number; boxes: number }[];
};

export type TrainTask = "classify" | "detect";

export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "canceled";

export type TrainingJob = {
  id: number;
  status: JobStatus;
  params: { task?: TrainTask; epochs?: number; imgsz?: number; base_model?: string; min_images?: number };
  classes: string[] | null;
  image_count: number | null;
  progress: { epoch?: number; epochs?: number } | null;
  metrics: { top1?: number; top5?: number; map50?: number; map?: number } | null;
  log: string | null;
  error: string | null;
  model_path: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  deployed_at: string | null;
};

export const imageUrl = (img: Pick<TrainingImage, "storage_path" | "stored_on">) =>
  img.stored_on === "vps"
    ? `${API_URL}/training-images/${img.storage_path}`
    : supabase.storage.from(TRAINING_BUCKET).getPublicUrl(img.storage_path).data.publicUrl;

/** Calls an admin endpoint on the VPS API with the signed-in admin's token. */
async function api(path: string, body: FormData | object) {
  const { data } = await supabase.auth.getSession();
  const isForm = body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${data.session?.access_token ?? ""}`,
        ...(isForm ? {} : { "Content-Type": "application/json" }),
      },
      body: isForm ? body : JSON.stringify(body),
    });
  } catch {
    throw new Error("Could not reach the server (VPS). Is the API running and updated?");
  }
  if (!res.ok) {
    const detail = await res.json().then((j) => j.detail, () => null);
    throw new Error(typeof detail === "string" ? detail : `Server error ${res.status}`);
  }
  return res.json();
}

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

/**
 * Adds a new crystal (label) with just a name; details can be filled in later
 * on the Crystals page. Labels must be crystal names so scans can find them.
 */
export async function createCrystal(name: string) {
  check(await supabase.from("crystals").insert({ name }));
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

/**
 * Saves the boxes for one photo. If every box is the same crystal and the
 * photo has no label yet, it gets that label too, so it also counts for
 * whole-photo (classification) training.
 */
export async function saveBoxes(image: Pick<TrainingImage, "id" | "label">, boxes: Box[]) {
  const labels = [...new Set(boxes.map((b) => b.label))];
  const patch: Record<string, unknown> = { boxes };
  if (!image.label && labels.length === 1) {
    const { data } = await supabase.auth.getUser();
    Object.assign(patch, { label: labels[0], labeled_at: new Date().toISOString(), labeled_by: data.user?.id });
  }
  check(await supabase.from("training_images").update(patch).eq("id", image.id));
}

/** Stable, distinct colour per crystal name. */
export function labelColor(label: string, alpha = 1) {
  let h = 0;
  for (const c of label) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h} 75% 45% / ${alpha})`;
}

export async function deleteImages(images: Pick<TrainingImage, "id">[]) {
  await api("/admin/training-images/delete", { ids: images.map((i) => i.id) });
}

/**
 * Shrinks big phone photos before upload (classification trains at ~224px, so
 * 1024px is plenty) — keeps uploads fast and storage small.
 */
export async function shrink(file: File): Promise<Blob> {
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

/** Uploads one photo to the VPS and records it, optionally already labeled. */
export async function uploadTrainingImage(file: File, label: string | null) {
  const blob = await shrink(file);
  const form = new FormData();
  form.append("file", blob, file.name);
  if (label) form.append("label", label);
  await api("/admin/training-images", form);
}

/** Hint appended to errors caused by training.sql not having been run. */
export function explainSetup(message: string) {
  return /training_|stored_on|boxes|bucket|relation|function/i.test(message)
    ? `${message} — run sql/training.sql in the Supabase SQL editor first.`
    : message;
}

export type Prediction = { class_name: string; confidence: number };

/** Top guesses for one photo from the live model, or from a training run's model. */
export async function testModel(file: File, jobId: number | null): Promise<{ model: string; predictions: Prediction[] }> {
  const form = new FormData();
  form.append("file", await shrink(file), file.name);
  if (jobId != null) form.append("job_id", String(jobId));
  return api("/admin/test-model", form);
}
