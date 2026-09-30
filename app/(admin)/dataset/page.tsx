"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { BoxEditor } from "@/components/BoxEditor";
import { CrystalPicker } from "@/components/CrystalPicker";
import { Button, Empty, ErrorBox, Loading, Modal, PageHeader, Pill } from "@/components/ui";
import { check, supabase } from "@/lib/supabase";
import {
  deleteImages,
  explainSetup,
  saveBoxes,
  fetchCrystalNames,
  fetchStats,
  IMAGE_COLUMNS,
  imageUrl,
  setLabel,
  uploadTrainingImage,
  type Box,
  type TrainingImage,
} from "@/lib/training";
import { useLoad } from "@/lib/useLoad";

type Tab = "upload" | "label" | "boxes" | "browse";

export default function DatasetPage() {
  const [tab, setTab] = useState<Tab>("label");
  const names = useLoad(fetchCrystalNames);
  const stats = useLoad(fetchStats);

  if (names.error || stats.error) return <ErrorBox message={explainSetup(names.error || stats.error)} />;
  if (!names.data || !stats.data) return <Loading />;

  const tabs: { key: Tab; label: string }[] = [
    { key: "label", label: `Label (${stats.data.unlabeled})` },
    { key: "boxes", label: `Draw boxes (${stats.data.unboxed ?? 0})` },
    { key: "upload", label: "Upload" },
    { key: "browse", label: "Browse" },
  ];

  return (
    <>
      <PageHeader
        title="Dataset"
        action={
          <Link href="/training" className="text-sm font-medium text-brand-dark hover:underline">
            {stats.data.labeled} labeled photos · {stats.data.classes.length} crystals → Train
          </Link>
        }
      />
      <div className="mb-6 flex gap-1 border-b border-neutral-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              tab === t.key ? "border-brand text-brand-dark" : "border-transparent text-neutral-500 hover:text-neutral-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "upload" && <UploadTab names={names.data} onUploaded={stats.reload} goLabel={() => setTab("label")} />}
      {tab === "label" && <LabelTab names={names.data} onChange={stats.reload} goUpload={() => setTab("upload")} />}
      {tab === "boxes" && <BoxesTab names={names.data} onChange={stats.reload} goUpload={() => setTab("upload")} />}
      {tab === "browse" && <BrowseTab names={names.data} classes={stats.data.classes} onChange={stats.reload} />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

function UploadTab({ names, onUploaded, goLabel }: { names: string[]; onUploaded: () => void; goLabel: () => void }) {
  const [preLabel, setPreLabel] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ total: number; done: number; failed: string[] } | null>(null);
  const [dragging, setDragging] = useState(false);
  const uploading = progress !== null && progress.done + progress.failed.length < progress.total;

  async function start(fileList: FileList | File[]) {
    const files = Array.from(fileList).filter((f) => /^image\/(jpeg|png|webp)$/.test(f.type));
    if (!files.length || uploading) return;
    const label = preLabel;
    setProgress({ total: files.length, done: 0, failed: [] });
    let next = 0;
    // A few uploads at a time: fast, without flooding the connection.
    const worker = async () => {
      while (next < files.length) {
        const file = files[next++];
        try {
          await uploadTrainingImage(file, label);
          setProgress((p) => p && { ...p, done: p.done + 1 });
        } catch (e) {
          setProgress((p) => p && { ...p, failed: [...p.failed, `${file.name}: ${explainSetup((e as Error).message)}`] });
        }
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    onUploaded();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          start(e.dataTransfer.files);
        }}
        className={`flex min-h-72 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition ${
          dragging ? "border-brand bg-brand-soft" : "border-neutral-300 bg-white hover:border-brand"
        } ${uploading ? "pointer-events-none opacity-60" : ""}`}
      >
        <input
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) start(e.target.files);
            e.target.value = "";
          }}
        />
        <div className="text-lg font-medium">Drop photos here, or click to choose</div>
        <div className="mt-1 text-sm text-neutral-500">
          JPG, PNG or WebP · select as many as you like · big photos are shrunk automatically
        </div>
        {progress && (
          <div className="mt-6 w-full max-w-sm">
            <div className="h-2 overflow-hidden rounded-full bg-neutral-200">
              <div
                className="h-full bg-brand transition-all"
                style={{ width: `${((progress.done + progress.failed.length) / progress.total) * 100}%` }}
              />
            </div>
            <div className="mt-2 text-sm">
              {uploading ? "Uploading" : "Uploaded"} {progress.done} of {progress.total}
              {progress.failed.length > 0 && <span className="text-red-700"> · {progress.failed.length} failed</span>}
            </div>
          </div>
        )}
      </label>

      <div className="space-y-4">
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="mb-2 text-sm font-medium">Are these all the same crystal?</div>
          {preLabel ? (
            <div className="flex items-center justify-between gap-2">
              <Pill color="green">{preLabel}</Pill>
              <button className="text-sm text-neutral-500 hover:underline" onClick={() => setPreLabel(null)}>
                Clear
              </button>
            </div>
          ) : (
            <>
              <p className="mb-2 text-xs text-neutral-500">
                Pick it here and the photos are labeled as they upload. Leave empty to label them one by one.
              </p>
              <CrystalPicker names={names} onPick={setPreLabel} maxHeight="max-h-48" />
            </>
          )}
        </div>
        {progress && !uploading && progress.done > 0 && !preLabel && (
          <Button className="w-full" onClick={goLabel}>
            Label the new photos →
          </Button>
        )}
        {progress && progress.failed.length > 0 && (
          <div className="max-h-40 overflow-y-auto rounded-lg bg-red-50 p-3 text-xs text-red-800">
            {progress.failed.map((f, i) => (
              <div key={i}>{f}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Label queue (Label Studio–style: one photo at a time, keyboard first)
// ---------------------------------------------------------------------------

const BATCH = 40;

async function fetchUnlabeled(exclude: number[]): Promise<TrainingImage[]> {
  let q = supabase
    .from("training_images")
    .select(IMAGE_COLUMNS)
    .is("label", null)
    .order("created_at")
    .limit(BATCH);
  if (exclude.length) q = q.not("id", "in", `(${exclude.join(",")})`);
  return (check(await q) ?? []) as TrainingImage[];
}

function LabelTab({ names, onChange, goUpload }: { names: string[]; onChange: () => void; goUpload: () => void }) {
  const [queue, setQueue] = useState<TrainingImage[] | null>(null);
  const [error, setError] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const [history, setHistory] = useState<{ image: TrainingImage; label: string | null }[]>([]);
  const [count, setCount] = useState(0);
  const skipped = useRef<number[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const loadingMore = useRef(false);

  useEffect(() => {
    fetchUnlabeled([]).then(setQueue, (e: Error) => setError(explainSetup(e.message)));
  }, []);

  // Keep a few photos ahead so labeling never waits on the network.
  const topUp = useCallback(async (current: TrainingImage[]) => {
    if (loadingMore.current || current.length > 5) return;
    loadingMore.current = true;
    try {
      const more = await fetchUnlabeled([...current.map((i) => i.id), ...skipped.current]);
      setQueue((q) => {
        const have = new Set((q ?? []).map((i) => i.id));
        return [...(q ?? []), ...more.filter((i) => !have.has(i.id))];
      });
    } finally {
      loadingMore.current = false;
    }
  }, []);

  const current = queue?.[0];

  function advance() {
    const rest = (queue ?? []).slice(1);
    setQueue(rest);
    topUp(rest);
    inputRef.current?.focus();
  }

  async function label(name: string) {
    if (!current) return;
    const image = current;
    advance();
    setRecent((r) => [name, ...r.filter((x) => x !== name)].slice(0, 9));
    setHistory((h) => [...h.slice(-49), { image, label: name }]);
    try {
      await setLabel([image.id], name);
      setCount((c) => c + 1);
      onChange();
    } catch (e) {
      setError(explainSetup((e as Error).message));
      setQueue((q) => [image, ...(q ?? [])]);
    }
  }

  function skip() {
    if (!current) return;
    skipped.current.push(current.id);
    setHistory((h) => [...h.slice(-49), { image: current, label: null }]);
    advance();
  }

  async function remove() {
    if (!current) return;
    const image = current;
    advance();
    try {
      await deleteImages([image]);
      onChange();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function undo() {
    const last = history.at(-1);
    if (!last) return;
    setHistory((h) => h.slice(0, -1));
    skipped.current = skipped.current.filter((id) => id !== last.image.id);
    try {
      if (last.label) {
        await setLabel([last.image.id], null);
        setCount((c) => c - 1);
        onChange();
      }
      setQueue((q) => [last.image, ...(q ?? []).filter((i) => i.id !== last.image.id)]);
    } catch (e) {
      setError((e as Error).message);
    }
    inputRef.current?.focus();
  }

  if (error && !queue) return <ErrorBox message={error} />;
  if (!queue) return <Loading />;

  if (!current) {
    return (
      <Empty>
        <p className="font-medium text-neutral-700">Nothing left to label 🎉</p>
        {count > 0 && <p className="mt-1">You labeled {count} photos this session.</p>}
        <div className="mt-4 flex justify-center gap-2">
          <Button variant="ghost" onClick={goUpload}>
            Upload more
          </Button>
          <Link href="/training">
            <Button>Go to training →</Button>
          </Link>
        </div>
      </Empty>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div>
        <div className="flex aspect-square max-h-[70vh] w-full items-center justify-center overflow-hidden rounded-2xl bg-neutral-900">
          {/* eslint-disable-next-line @next/next/no-img-element -- Supabase storage */}
          <img key={current.id} src={imageUrl(current)} alt="Photo to label" className="max-h-full max-w-full object-contain" />
        </div>
        {queue[1] && (
          // eslint-disable-next-line @next/next/no-img-element -- preload the next photo
          <img src={imageUrl(queue[1])} alt="" className="hidden" />
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-neutral-500">
          <span>{count} labeled this session</span>
          <span className="ml-auto" />
          <Button variant="ghost" onClick={undo} disabled={!history.length}>
            Undo
          </Button>
          <Button variant="ghost" onClick={skip}>
            Skip (Esc)
          </Button>
          <Button variant="danger" onClick={remove}>
            Delete photo
          </Button>
        </div>
        {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      </div>

      <div className="space-y-4">
        {recent.length > 0 && (
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Recent — press the number</div>
            <div className="flex flex-wrap gap-2">
              {recent.map((name, i) => (
                <button
                  key={name}
                  onClick={() => label(name)}
                  className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm hover:border-brand hover:bg-brand-soft"
                >
                  <span className="mr-1.5 rounded bg-neutral-100 px-1.5 text-xs font-semibold text-neutral-600">{i + 1}</span>
                  {name}
                </button>
              ))}
            </div>
          </div>
        )}
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Which crystal is this?</div>
          <CrystalPicker
            names={names}
            onPick={label}
            autoFocus
            inputRef={inputRef}
            placeholder="Type a name, press Enter"
            maxHeight="max-h-[50vh]"
            onKeyDownEmpty={(e) => {
              const n = Number(e.key);
              if (n >= 1 && n <= recent.length) {
                e.preventDefault();
                label(recent[n - 1]);
              } else if (e.key === "Escape") {
                e.preventDefault();
                skip();
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Browse / fix labels
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Draw boxes (detection labeling)
// ---------------------------------------------------------------------------

async function fetchUnboxed(exclude: number[]): Promise<TrainingImage[]> {
  let q = supabase.from("training_images").select(IMAGE_COLUMNS).is("boxes", null).order("created_at").limit(BATCH);
  if (exclude.length) q = q.not("id", "in", `(${exclude.join(",")})`);
  return (check(await q) ?? []) as TrainingImage[];
}

/** Keeps the crystals used most recently first, max 9 (the number keys). */
function useRecent() {
  const [recent, setRecent] = useState<string[]>([]);
  const use = useCallback((label: string) => setRecent((r) => [label, ...r.filter((x) => x !== label)].slice(0, 9)), []);
  return [recent, use] as const;
}

function BoxesTab({ names, onChange, goUpload }: { names: string[]; onChange: () => void; goUpload: () => void }) {
  const [queue, setQueue] = useState<TrainingImage[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState(0);
  const [recent, rememberLabel] = useRecent();
  const skipped = useRef<number[]>([]);

  useEffect(() => {
    fetchUnboxed([]).then(setQueue, (e: Error) => setError(explainSetup(e.message)));
  }, []);

  async function next(rest: TrainingImage[]) {
    setQueue(rest);
    if (rest.length <= 5) {
      const more = await fetchUnboxed([...rest.map((i) => i.id), ...skipped.current]);
      setQueue((q) => {
        const have = new Set((q ?? []).map((i) => i.id));
        return [...(q ?? []), ...more.filter((i) => !have.has(i.id))];
      });
    }
  }

  const current = queue?.[0];

  async function save(boxes: Box[]) {
    if (!current) return;
    setBusy(true);
    try {
      await saveBoxes(current, boxes);
      setCount((c) => c + 1);
      onChange();
      await next((queue ?? []).slice(1));
      setError("");
    } catch (e) {
      setError(explainSetup((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!current || !confirm("Delete this photo? This can't be undone.")) return;
    setBusy(true);
    try {
      await deleteImages([current]);
      onChange();
      await next((queue ?? []).slice(1));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !queue) return <ErrorBox message={error} />;
  if (!queue) return <Loading />;
  if (!current) {
    return (
      <Empty>
        <p className="font-medium text-neutral-700">Every photo has its boxes 🎉</p>
        {count > 0 && <p className="mt-1">You boxed {count} photos this session.</p>}
        <div className="mt-4 flex justify-center gap-2">
          <Button variant="ghost" onClick={goUpload}>
            Upload more
          </Button>
          <Link href="/training">
            <Button>Go to training →</Button>
          </Link>
        </div>
      </Empty>
    );
  }

  return (
    <>
      <p className="mb-3 text-sm text-neutral-500">
        {count} boxed this session · {queue.length}
        {queue.length >= BATCH ? "+" : ""} waiting
      </p>
      {error && <p className="mb-3 text-sm text-red-700">{error}</p>}
      <BoxEditor
        key={current.id}
        image={current}
        names={names}
        recent={recent}
        onUseLabel={rememberLabel}
        onSave={save}
        onSkip={() => {
          skipped.current.push(current.id);
          next((queue ?? []).slice(1));
        }}
        onDelete={remove}
        busy={busy}
      />
      {queue[1] && (
        // eslint-disable-next-line @next/next/no-img-element -- preload the next photo
        <img src={imageUrl(queue[1])} alt="" className="hidden" />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------

const PAGE = 60;
const UNLABELED = "__unlabeled__";

function BrowseTab({
  names,
  classes,
  onChange,
}: {
  names: string[];
  classes: { label: string; count: number }[];
  onChange: () => void;
}) {
  const [filter, setFilter] = useState<string>(classes[0]?.label ?? UNLABELED);
  const [images, setImages] = useState<TrainingImage[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [relabeling, setRelabeling] = useState(false);
  const [boxing, setBoxing] = useState<TrainingImage | null>(null);
  const [recent, rememberLabel] = useRecent();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const fetchPage = useCallback(
    async (offset: number) => {
      let q = supabase
        .from("training_images")
        .select(IMAGE_COLUMNS)
        .order("created_at", { ascending: false })
        .range(offset, offset + PAGE - 1);
      q = filter === UNLABELED ? q.is("label", null) : q.eq("label", filter);
      return (check(await q) ?? []) as TrainingImage[];
    },
    [filter],
  );

  useEffect(() => {
    let live = true;
    fetchPage(0).then(
      (rows) => {
        if (!live) return;
        setImages(rows);
        setHasMore(rows.length === PAGE);
        setSelected(new Set());
      },
      (e: Error) => live && setError(e.message),
    );
    return () => {
      live = false;
    };
  }, [fetchPage]);

  async function loadMore() {
    const rows = await fetchPage(images?.length ?? 0);
    setImages((prev) => [...(prev ?? []), ...rows]);
    setHasMore(rows.length === PAGE);
  }

  function toggle(id: number) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function relabel(name: string) {
    setBusy(true);
    try {
      await setLabel([...selected], name);
      if (name !== filter) setImages((imgs) => imgs?.filter((i) => !selected.has(i.id)) ?? null);
      setSelected(new Set());
      setRelabeling(false);
      onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function removeSelected() {
    if (!confirm(`Delete ${selected.size} photo(s)? This can't be undone.`)) return;
    setBusy(true);
    try {
      await deleteImages((images ?? []).filter((i) => selected.has(i.id)));
      setImages((imgs) => imgs?.filter((i) => !selected.has(i.id)) ?? null);
      setSelected(new Set());
      onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={filter}
          onChange={(e) => {
            setImages(null);
            setFilter(e.target.value);
          }}
          className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
        >
          <option value={UNLABELED}>Unlabeled</option>
          {classes.map((c) => (
            <option key={c.label} value={c.label}>
              {c.label} ({c.count})
            </option>
          ))}
        </select>
        {selected.size > 0 && (
          <>
            <span className="text-sm text-neutral-600">{selected.size} selected</span>
            <Button disabled={busy} onClick={() => setRelabeling(true)}>
              Change label…
            </Button>
            {selected.size === 1 && (
              <Button variant="ghost" disabled={busy} onClick={() => setBoxing(images?.find((i) => selected.has(i.id)) ?? null)}>
                Draw boxes…
              </Button>
            )}
            <Button variant="danger" disabled={busy} onClick={removeSelected}>
              Delete
            </Button>
            <Button variant="ghost" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </>
        )}
        {images && images.length > 0 && selected.size === 0 && (
          <Button variant="ghost" onClick={() => setSelected(new Set(images.map((i) => i.id)))}>
            Select all shown
          </Button>
        )}
      </div>
      {error && <p className="mb-3 text-sm text-red-700">{error}</p>}

      {!images ? (
        <Loading />
      ) : images.length === 0 ? (
        <Empty>No photos here.</Empty>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8">
            {images.map((img) => {
              const on = selected.has(img.id);
              return (
                <button
                  key={img.id}
                  onClick={() => toggle(img.id)}
                  className={`relative aspect-square overflow-hidden rounded-lg ring-2 ${on ? "ring-brand" : "ring-transparent"}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- Supabase storage */}
                  <img src={imageUrl(img)} alt="" loading="lazy" className={`h-full w-full object-cover ${on ? "opacity-70" : ""}`} />
                  {img.boxes && (
                    <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 text-[10px] font-medium text-white">
                      {img.boxes.length} box{img.boxes.length === 1 ? "" : "es"}
                    </span>
                  )}
                  {on && (
                    <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-brand text-xs text-white">
                      ✓
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {hasMore && (
            <div className="mt-4 text-center">
              <Button variant="ghost" onClick={loadMore}>
                Load more
              </Button>
            </div>
          )}
        </>
      )}

      {boxing && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-neutral-50 p-4 md:p-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Draw boxes</h2>
            <Button variant="ghost" onClick={() => setBoxing(null)}>
              Close
            </Button>
          </div>
          <BoxEditor
            key={boxing.id}
            image={boxing}
            names={names}
            recent={recent}
            onUseLabel={rememberLabel}
            saveLabel="Save"
            busy={busy}
            onSave={async (boxes) => {
              setBusy(true);
              try {
                await saveBoxes(boxing, boxes);
                setImages((imgs) => imgs?.map((i) => (i.id === boxing.id ? { ...i, boxes } : i)) ?? null);
                setBoxing(null);
                setSelected(new Set());
                onChange();
              } catch (e) {
                setError(explainSetup((e as Error).message));
                setBoxing(null);
              } finally {
                setBusy(false);
              }
            }}
          />
        </div>
      )}

      {relabeling && (
        <Modal
          title={`Label ${selected.size} photo(s) as…`}
          onClose={() => !busy && setRelabeling(false)}
          footer={
            <Button variant="ghost" onClick={() => setRelabeling(false)}>
              Cancel
            </Button>
          }
        >
          <CrystalPicker names={names} onPick={relabel} autoFocus />
        </Modal>
      )}
    </>
  );
}
