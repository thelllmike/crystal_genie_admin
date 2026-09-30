"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button, Empty, ErrorBox, Field, Loading, PageHeader, Pill, Stat, inputClass } from "@/components/ui";
import { check, dateTime, supabase } from "@/lib/supabase";
import { explainSetup, fetchStats, type JobStatus, type TrainTask, type TrainingJob } from "@/lib/training";
import { useLoad } from "@/lib/useLoad";

const fetchJobs = async () =>
  (check(await supabase.from("training_jobs").select("*").order("created_at", { ascending: false }).limit(30)) ??
    []) as TrainingJob[];

const statusPill: Record<JobStatus, { color: "green" | "amber" | "blue" | "gray" | "red"; label: string }> = {
  queued: { color: "amber", label: "Waiting for trainer" },
  running: { color: "blue", label: "Training" },
  succeeded: { color: "green", label: "Finished" },
  failed: { color: "red", label: "Failed" },
  canceled: { color: "gray", label: "Canceled" },
};

const pct = (n?: number) => (n == null ? "—" : `${(n * 100).toFixed(1)}%`);

/** Headline score: accuracy for whole-photo models, mAP50 for box models. */
const score = (j: Pick<TrainingJob, "metrics">) => pct(j.metrics?.map50 ?? j.metrics?.top1);

const MODELS: Record<TrainTask, { value: string; label: string }[]> = {
  classify: [
    { value: "yolo11n-cls.pt", label: "Nano — fastest, fine for a CPU server" },
    { value: "yolo11s-cls.pt", label: "Small — more accurate, ~3× slower" },
  ],
  detect: [
    { value: "yolo11n.pt", label: "Nano — fastest" },
    { value: "yolo11s.pt", label: "Small — same size as the original model, ~3× slower" },
  ],
};

export default function TrainingPage() {
  const stats = useLoad(fetchStats);
  const jobs = useLoad(fetchJobs);
  const [minImages, setMinImages] = useState(20);
  const [epochs, setEpochs] = useState(30);
  const [task, setTask] = useState<TrainTask>("detect");
  const [baseModel, setBaseModel] = useState(MODELS.detect[0].value);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [now, setNow] = useState(() => Date.now());

  const active = jobs.data?.some((j) => j.status === "queued" || j.status === "running") ?? false;

  // Poll while a job is waiting or training.
  const { reload: reloadJobs } = jobs;
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => {
      reloadJobs();
      setNow(Date.now());
    }, 5000);
    return () => clearInterval(t);
  }, [active, reloadJobs]);

  if (stats.error || jobs.error) return <ErrorBox message={explainSetup(stats.error || jobs.error)} />;
  if (!stats.data || !jobs.data) return <Loading />;

  const detect = task === "detect";
  const classes = detect ? (stats.data.box_classes ?? []) : stats.data.classes;
  const eligible = classes.filter((c) => c.count >= minImages);
  const eligibleImages = eligible.reduce((s, c) => s + c.count, 0);
  const minClasses = detect ? 1 : 2; // a detector can find a single kind of thing
  const maxCount = Math.max(1, ...classes.map((c) => c.count));
  const live = jobs.data
    .filter((j) => j.deployed_at)
    .sort((a, b) => b.deployed_at!.localeCompare(a.deployed_at!))[0];

  async function startTraining() {
    setBusy(true);
    setFormError("");
    try {
      check(
        await supabase.from("training_jobs").insert({
          params: { task, epochs, imgsz: detect ? 640 : 224, base_model: baseModel, min_images: minImages },
        }),
      );
      jobs.reload();
    } catch (e) {
      setFormError(explainSetup((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function switchToOriginal() {
    if (!confirm("Switch the app back to the original model (the 5-crystal detector)?")) return;
    try {
      check(await supabase.from("training_jobs").update({ deployed_at: null }).not("deployed_at", "is", null));
      jobs.reload();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function update(job: TrainingJob, patch: Partial<TrainingJob>) {
    try {
      check(await supabase.from("training_jobs").update(patch).eq("id", job.id));
      jobs.reload();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  function deploy(job: TrainingJob) {
    const n = job.classes?.length ?? 0;
    if (
      !confirm(
        `Make model #${job.id} live?\n\nThe app will recognise only these ${n} crystals from now on ` +
          `(the scanner switches within about a minute). You can switch back to an older model any time.`,
      )
    )
      return;
    update(job, { deployed_at: new Date().toISOString() });
  }

  return (
    <>
      <PageHeader title="Training" action={<Button variant="ghost" onClick={() => { stats.reload(); jobs.reload(); }}>Refresh</Button>} />

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-4">
        <Stat label="Labeled photos" value={stats.data.labeled} />
        <Stat label="Still to label" value={<Link href="/dataset" className="hover:underline">{stats.data.unlabeled}</Link>} />
        <Stat label="Crystals with photos" value={classes.length} />
        <Stat
          label="Live model"
          value={live ? <span title={dateTime(live.deployed_at!)}>#{live.id} · {score(live)}</span> : "Original"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Photos per crystal */}
        <section className="rounded-xl border border-black/5 bg-white p-4 shadow-sm">
          <h2 className="mb-3 font-semibold">{detect ? "Photos with boxes, per crystal" : "Labeled photos per crystal"}</h2>
          {classes.length === 0 ? (
            <Empty>
              No labeled photos yet. <Link href="/dataset" className="text-brand-dark underline">Upload and label some</Link>.
            </Empty>
          ) : (
            <div className="max-h-[420px] space-y-1.5 overflow-y-auto pr-2">
              {classes.map((c) => {
                const ok = c.count >= minImages;
                return (
                  <div key={c.label} className="flex items-center gap-3 text-sm">
                    <span className="w-40 flex-none truncate" title={c.label}>
                      {c.label}
                    </span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-100">
                      <div className={`h-full ${ok ? "bg-brand" : "bg-amber-400"}`} style={{ width: `${(c.count / maxCount) * 100}%` }} />
                    </div>
                    <span className="w-24 flex-none text-right tabular-nums text-neutral-600">
                      {c.count}
                      {!ok && <span className="text-amber-700"> (+{minImages - c.count})</span>}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* New training run */}
        <section className="space-y-4 rounded-xl border border-black/5 bg-white p-4 shadow-sm">
          <h2 className="font-semibold">Train a new model</h2>
          <Field label="What to learn from">
            <select
              className={inputClass}
              value={task}
              onChange={(e) => {
                const t = e.target.value as TrainTask;
                setTask(t);
                setBaseModel(MODELS[t][0].value);
              }}
            >
              <option value="detect">Boxes — finds and outlines each crystal (like the original model)</option>
              <option value="classify">Whole-photo labels — names the one crystal in the photo</option>
            </select>
          </Field>
          <Field label="Minimum photos per crystal" hint="Crystals with fewer photos are left out of this model.">
            <input className={inputClass} type="number" min={5} value={minImages} onChange={(e) => setMinImages(Math.max(5, Number(e.target.value) || 5))} />
          </Field>
          <Field label="Epochs" hint="More = slower but usually more accurate. 30 is a good start.">
            <input className={inputClass} type="number" min={1} max={300} value={epochs} onChange={(e) => setEpochs(Math.min(300, Math.max(1, Number(e.target.value) || 1)))} />
          </Field>
          <Field label="Model size">
            <select className={inputClass} value={baseModel} onChange={(e) => setBaseModel(e.target.value)}>
              {MODELS[task].map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </Field>
          <p className="text-sm text-neutral-600">
            Will train on <b>{eligible.length}</b> crystals · {detect ? "about " : ""}
            <b>{eligibleImages}</b> photos
            {eligible.length > 0 && <> (20% held back to measure accuracy)</>}.
          </p>
          {detect && (
            <p className="text-xs text-neutral-500">
              Box models train on 640px photos: much slower than whole-photo models on the 1-core server. Start with few
              epochs, or run the trainer on a faster machine.
            </p>
          )}
          {formError && <p className="text-sm text-red-700">{formError}</p>}
          <Button className="w-full" disabled={busy || active || eligible.length < minClasses} onClick={startTraining}>
            {active
              ? "A job is already running"
              : eligible.length < minClasses
                ? `Need ${minClasses === 1 ? "a crystal" : "at least 2 crystals"} with ${minImages}+ photos`
                : "Start training"}
          </Button>
        </section>
      </div>

      {/* Jobs */}
      <div className="mb-3 mt-8 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Training runs</h2>
        {live && (
          <Button variant="ghost" onClick={switchToOriginal}>
            Switch app back to original model
          </Button>
        )}
      </div>
      {jobs.data.length === 0 ? (
        <Empty>No training runs yet.</Empty>
      ) : (
        <div className="space-y-3">
          {jobs.data.map((j) => {
            const s = statusPill[j.status] ?? statusPill.queued;
            const isLive = live?.id === j.id;
            const waitingLong = j.status === "queued" && now - new Date(j.created_at).getTime() > 2 * 60_000;
            const epochPct = j.progress?.epochs ? ((j.progress.epoch ?? 0) / j.progress.epochs) * 100 : 0;
            return (
              <div key={j.id} className="rounded-xl border border-black/5 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-semibold">#{j.id}</span>
                  <Pill color={s.color}>{s.label}</Pill>
                  {isLive && <Pill color="green">● Live in app</Pill>}
                  <span className="text-sm text-neutral-500">{dateTime(j.created_at)}</span>
                  <span className="text-sm text-neutral-500">
                    {j.params.task === "detect" ? "Boxes" : "Whole photo"} · {j.params.base_model?.replace(".pt", "")} · {j.params.epochs} epochs
                    {j.classes && ` · ${j.classes.length} crystals · ${j.image_count} photos`}
                  </span>
                  <span className="ml-auto" />
                  {j.status === "succeeded" && (
                    <span className="text-sm">
                      {j.metrics?.map50 != null ? (
                        <>
                          Box accuracy (mAP50) <b>{pct(j.metrics.map50)}</b>{" "}
                          <span className="text-neutral-500">(strict mAP {pct(j.metrics.map)})</span>
                        </>
                      ) : (
                        <>
                          Accuracy <b>{pct(j.metrics?.top1)}</b> <span className="text-neutral-500">(top-5 {pct(j.metrics?.top5)})</span>
                        </>
                      )}
                    </span>
                  )}
                  {j.status === "succeeded" && (
                    <Link href={`/test?model=${j.id}`}>
                      <Button variant="ghost">Test</Button>
                    </Link>
                  )}
                  {j.status === "succeeded" && !isLive && <Button onClick={() => deploy(j)}>Deploy to app</Button>}
                  {(j.status === "queued" || j.status === "running") && (
                    <Button variant="ghost" onClick={() => update(j, { status: "canceled" })}>
                      Cancel
                    </Button>
                  )}
                </div>

                {j.status === "running" && (
                  <div className="mt-3">
                    <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
                      <div className="h-full bg-brand transition-all" style={{ width: `${epochPct}%` }} />
                    </div>
                    <div className="mt-1 text-xs text-neutral-500">
                      {j.progress?.epochs ? `Epoch ${j.progress.epoch} of ${j.progress.epochs}` : "Preparing photos…"}
                    </div>
                  </div>
                )}
                {waitingLong && (
                  <p className="mt-2 text-sm text-amber-700">
                    Still waiting after 2 minutes — is the trainer running? See trainer/README.md in the backend.
                  </p>
                )}
                {j.error && <p className="mt-2 whitespace-pre-wrap text-sm text-red-700">{j.error}</p>}
                {(j.classes?.length || j.log) && (
                  <details className="mt-2 text-sm">
                    <summary className="cursor-pointer text-neutral-500">Details</summary>
                    {j.classes && <p className="mt-2 text-neutral-600">Crystals: {j.classes.join(", ")}</p>}
                    {j.log && <pre className="mt-2 max-h-60 overflow-auto rounded-lg bg-neutral-900 p-3 text-xs text-neutral-100">{j.log}</pre>}
                  </details>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
