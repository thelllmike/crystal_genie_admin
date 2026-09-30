"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useRef, useState } from "react";
import { CrystalPicker } from "@/components/CrystalPicker";
import { Button, ErrorBox, Loading, PageHeader, Pill, Stat } from "@/components/ui";
import { check, supabase } from "@/lib/supabase";
import { explainSetup, fetchCrystalNames, testModel, uploadTrainingImage, type Prediction, type TrainingJob } from "@/lib/training";
import { useLoad } from "@/lib/useLoad";

type Result = {
  id: number;
  file: File;
  preview: string;
  status: "pending" | "done" | "error";
  predictions?: Prediction[];
  error?: string;
  added?: boolean;
};

const fetchFinishedJobs = async () =>
  (check(
    await supabase
      .from("training_jobs")
      .select("id, metrics, classes, deployed_at, created_at")
      .eq("status", "succeeded")
      .order("created_at", { ascending: false }),
  ) ?? []) as Pick<TrainingJob, "id" | "metrics" | "classes" | "deployed_at" | "created_at">[];

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

export default function TestPage() {
  return (
    <Suspense fallback={<Loading />}>
      <TestModel />
    </Suspense>
  );
}

function TestModel() {
  const params = useSearchParams();
  const names = useLoad(fetchCrystalNames);
  const jobs = useLoad(fetchFinishedJobs);
  const [model, setModel] = useState<string>(params.get("model") ?? "live");
  const [expected, setExpected] = useState<string | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [dragging, setDragging] = useState(false);
  const [adding, setAdding] = useState(false);
  const nextId = useRef(0);

  if (names.error) return <ErrorBox message={names.error} />;
  if (!names.data) return <Loading />;

  const running = results.some((r) => r.status === "pending");
  const jobId = model === "live" ? null : Number(model);

  async function run(fileList: FileList | File[]) {
    const files = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;
    const batch: Result[] = files.map((file) => ({
      id: nextId.current++,
      file,
      preview: URL.createObjectURL(file),
      status: "pending",
    }));
    setResults((r) => [...batch, ...r]);
    const patch = (id: number, p: Partial<Result>) => setResults((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));

    let next = 0;
    // Two at a time: the server has one CPU core and also answers app scans.
    const worker = async () => {
      while (next < batch.length) {
        const item = batch[next++];
        try {
          const res = await testModel(item.file, jobId);
          patch(item.id, { status: "done", predictions: res.predictions });
        } catch (e) {
          patch(item.id, { status: "error", error: explainSetup((e as Error).message) });
        }
      }
    };
    await Promise.all([worker(), worker()]);
  }

  function clear() {
    results.forEach((r) => URL.revokeObjectURL(r.preview));
    setResults([]);
  }

  // Accuracy against the crystal these photos are supposed to be.
  const done = results.filter((r) => r.status === "done");
  const top1 = expected ? done.filter((r) => r.predictions?.[0]?.class_name === expected).length : 0;
  const top3 = expected ? done.filter((r) => r.predictions?.slice(0, 3).some((p) => p.class_name === expected)).length : 0;
  const wrong = expected ? done.filter((r) => r.predictions?.[0]?.class_name !== expected && !r.added) : [];
  const selectedJob = jobs.data?.find((j) => j.id === jobId);
  const unknownToModel = expected && selectedJob?.classes && !selectedJob.classes.includes(expected);

  async function addWrong() {
    if (!expected) return;
    setAdding(true);
    for (const r of wrong) {
      try {
        await uploadTrainingImage(r.file, expected);
        setResults((rs) => rs.map((x) => (x.id === r.id ? { ...x, added: true } : x)));
      } catch (e) {
        alert(explainSetup((e as Error).message));
        break;
      }
    }
    setAdding(false);
  }

  return (
    <>
      <PageHeader title="Test the model" action={results.length > 0 && <Button variant="ghost" onClick={clear} disabled={running}>Clear results</Button>} />

      <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_1fr_1.2fr]">
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="mb-2 text-sm font-medium">Which model?</div>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            disabled={running}
            className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
          >
            <option value="live">Live model (what the app uses now)</option>
            {jobs.data?.map((j) => (
              <option key={j.id} value={j.id}>
                Training run #{j.id}
                {j.metrics?.map50 != null ? ` · boxes ${pct(j.metrics.map50)}` : j.metrics?.top1 != null ? ` · ${pct(j.metrics.top1)}` : ""}
                {j.classes ? ` · ${j.classes.length} crystals` : ""}
                {j.deployed_at ? " · deployed" : ""}
              </option>
            ))}
          </select>
          {jobs.error && <p className="mt-2 text-xs text-amber-700">{explainSetup(jobs.error)}</p>}
        </div>

        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="mb-2 text-sm font-medium">Which crystal are these? (optional)</div>
          {expected ? (
            <div className="flex items-center justify-between gap-2">
              <Pill color="green">{expected}</Pill>
              <button className="text-sm text-neutral-500 hover:underline" onClick={() => setExpected(null)}>
                Clear
              </button>
            </div>
          ) : (
            <>
              <p className="mb-2 text-xs text-neutral-500">Set it to score accuracy. Leave empty to just see guesses.</p>
              <CrystalPicker names={names.data} onPick={setExpected} maxHeight="max-h-32" />
            </>
          )}
          {unknownToModel && (
            <p className="mt-2 text-xs text-amber-700">This model wasn’t trained on {expected}, so it can’t get these right.</p>
          )}
        </div>

        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            run(e.dataTransfer.files);
          }}
          className={`flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-4 text-center ${
            dragging ? "border-brand bg-brand-soft" : "border-neutral-300 bg-white hover:border-brand"
          }`}
        >
          <input
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              if (e.target.files) run(e.target.files);
              e.target.value = "";
            }}
          />
          <span className="font-medium">Drop test photos here</span>
          <span className="text-xs text-neutral-500">or click to choose · photos are not saved</span>
        </label>
      </div>

      {expected && done.length > 0 && (
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-4">
          <Stat label="Photos tested" value={done.length} />
          <Stat label="Right first guess" value={`${top1}/${done.length} · ${pct(top1 / done.length)}`} />
          <Stat label="Right in top 3" value={`${top3}/${done.length} · ${pct(top3 / done.length)}`} />
          <div className="flex flex-col justify-center rounded-xl border border-black/5 bg-white p-4 shadow-sm">
            {wrong.length > 0 ? (
              <>
                <Button onClick={addWrong} disabled={adding}>
                  {adding ? "Adding…" : `Add ${wrong.length} missed photo${wrong.length === 1 ? "" : "s"} to training`}
                </Button>
                <span className="mt-1 text-xs text-neutral-500">Labeled as {expected}, ready for the next run.</span>
              </>
            ) : (
              <span className="text-sm text-neutral-500">Nothing missed 🎉</span>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {results.map((r) => {
          const first = r.predictions?.[0]?.class_name;
          const verdict = !expected || r.status !== "done" ? null : first === expected ? "right" : r.predictions?.slice(0, 3).some((p) => p.class_name === expected) ? "close" : "wrong";
          const border = { right: "ring-green-400", close: "ring-amber-400", wrong: "ring-red-400" }[verdict ?? "right"];
          return (
            <div key={r.id} className={`flex gap-3 rounded-xl bg-white p-3 shadow-sm ${verdict ? `ring-2 ${border}` : ""}`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
              <img src={r.preview} alt="" className="h-24 w-24 flex-none rounded-lg object-cover" />
              <div className="min-w-0 flex-1 text-sm">
                {r.status === "pending" && <div className="text-neutral-500">Thinking…</div>}
                {r.status === "error" && <div className="text-red-700">{r.error}</div>}
                {r.status === "done" &&
                  (r.predictions?.length ? (
                    r.predictions.slice(0, 3).map((p, i) => (
                      <div key={p.class_name} className="mb-1.5">
                        <div className="flex justify-between gap-2">
                          <span className={`truncate ${i === 0 ? "font-semibold" : "text-neutral-600"} ${p.class_name === expected ? "text-green-700" : ""}`}>
                            {p.class_name}
                          </span>
                          <span className="tabular-nums text-neutral-500">{pct(p.confidence)}</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100">
                          <div className={`h-full ${i === 0 ? "bg-brand" : "bg-neutral-300"}`} style={{ width: `${p.confidence * 100}%` }} />
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-neutral-500">No crystal found</div>
                  ))}
                {r.added && <div className="mt-1 text-xs text-green-700">Added to training photos</div>}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
