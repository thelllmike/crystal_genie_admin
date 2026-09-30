"use client";

import { useState } from "react";
import { Button, Empty, ErrorBox, Field, Loading, Modal, PageHeader, inputClass } from "@/components/ui";
import { check, supabase, type Crystal } from "@/lib/supabase";
import { useLoad } from "@/lib/useLoad";
import { PhotoPicker } from "@/components/PhotoPicker";

type Draft = {
  isNew: boolean;
  name: string;
  headline: string;
  description: string;
  star_sign: string;
  chakras: string;
  image_url: string;
};

const BUCKET = "crystal-images";

/** Adds the "run the SQL" hint to errors caused by crystal_images.sql not being applied yet. */
function explain(message: string) {
  return /image_url|bucket/i.test(message)
    ? `${message} — run sql/crystal_images.sql in the Supabase SQL editor first.`
    : message;
}

const PAGE = 1000; // PostgREST's default row cap per request

async function fetchCrystals() {
  const all: Crystal[] = [];
  for (let from = 0; ; from += PAGE) {
    const rows =
      (check(
        await supabase
          .from("crystals")
          .select("*") // "*" so the list still loads before image_url exists
          .order("name")
          .range(from, from + PAGE - 1),
      ) as Crystal[] | null) ?? [];
    all.push(...rows);
    if (rows.length < PAGE) break;
  }
  return all;
}

export default function CrystalsPage() {
  const { data: crystals, error, reload } = useLoad(fetchCrystals);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");

  function edit(c?: Crystal) {
    setFormError("");
    setDraft({
      isNew: !c,
      name: c?.name ?? "",
      headline: c?.headline ?? "",
      description: c?.description ?? "",
      star_sign: c?.star_sign ?? "",
      chakras: c?.chakras ?? "",
      image_url: c?.image_url ?? "",
    });
  }

  async function save() {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) {
      setFormError("Name is required.");
      return;
    }
    if (draft.isNew && crystals?.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      setFormError(`A crystal called "${name}" already exists — edit that one instead.`);
      return;
    }
    const row = {
      headline: draft.headline.trim(),
      description: draft.description.trim(),
      star_sign: draft.star_sign.trim(),
      chakras: draft.chakras.trim(),
      image_url: draft.image_url || null,
    };
    setBusy(true);
    try {
      if (draft.isNew) check(await supabase.from("crystals").insert({ name, ...row }));
      else check(await supabase.from("crystals").update(row).eq("name", name));
      setDraft(null);
      reload();
    } catch (e) {
      setFormError(explain((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!draft || draft.isNew || !confirm(`Delete "${draft.name}"? Scans of this crystal will no longer show details.`)) return;
    setBusy(true);
    try {
      check(await supabase.from("crystals").delete().eq("name", draft.name));
      setDraft(null);
      reload();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (error) return <ErrorBox message={error} />;
  if (!crystals) return <Loading />;

  const q = query.trim().toLowerCase();
  const shown = q ? crystals.filter((c) => c.name.toLowerCase().includes(q)) : crystals;
  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setDraft((d) => (d ? { ...d, [k]: e.target.value } : d));

  return (
    <>
      <PageHeader title={`Crystals (${crystals.length})`} action={<Button onClick={() => edit()}>+ Add crystal</Button>} />
      <input
        placeholder="Search crystals…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className={`${inputClass} mb-4 max-w-md`}
      />

      {shown.length === 0 ? (
        <Empty>No crystals match “{query}”.</Empty>
      ) : (
        <div className="overflow-hidden rounded-xl border border-black/5 bg-white shadow-sm">
          {shown.map((c) => (
            <button
              key={c.name}
              onClick={() => edit(c)}
              className="flex w-full items-center gap-4 border-b border-neutral-50 px-4 py-3 text-left last:border-0 hover:bg-neutral-50"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- Supabase storage URLs */}
              <img
                src={c.image_url || "/item.png"}
                alt=""
                loading="lazy"
                className={`h-12 w-12 flex-none rounded-lg object-cover ${c.image_url ? "" : "opacity-40 grayscale"}`}
              />
              <div className="min-w-0 flex-1">
                <div className="font-medium">{c.name}</div>
                <div className="truncate text-sm text-neutral-500">
                  {c.headline || <span className="italic">No headline</span>}
                </div>
              </div>
              {!c.description && <span className="text-xs font-medium text-amber-700">No description</span>}
              <span className="text-sm text-brand-dark">Edit</span>
            </button>
          ))}
        </div>
      )}

      {draft && (
        <Modal
          wide
          title={draft.isNew ? "Add crystal" : `Edit ${draft.name}`}
          onClose={() => !busy && setDraft(null)}
          footer={
            <>
              {!draft.isNew && (
                <Button variant="danger" className="mr-auto" disabled={busy} onClick={remove}>
                  Delete
                </Button>
              )}
              <Button variant="ghost" disabled={busy} onClick={() => setDraft(null)}>
                Cancel
              </Button>
              <Button disabled={busy} onClick={save}>
                {busy ? "Saving…" : draft.isNew ? "Add" : "Save"}
              </Button>
            </>
          }
        >
          <Field
            label="Name"
            hint={
              draft.isNew
                ? "Must match the scanner’s class name exactly, or scans won’t find it."
                : "Names can’t be changed — the scanner uses them to find the crystal."
            }
          >
            <input className={inputClass} value={draft.name} onChange={set("name")} disabled={!draft.isNew} autoFocus={draft.isNew} />
          </Field>
          <PhotoPicker
            bucket={BUCKET}
            nameHint={draft.name}
            value={draft.image_url}
            onChange={(url) => setDraft((d) => (d ? { ...d, image_url: url } : d))}
            onError={setFormError}
            onBusyChange={setBusy}
            disabled={busy}
          />
          <Field label="Headline">
            <input className={inputClass} value={draft.headline} onChange={set("headline")} autoFocus={!draft.isNew} />
          </Field>
          <Field label="Description">
            <textarea className={`${inputClass} min-h-60`} value={draft.description} onChange={set("description")} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Star sign">
              <input className={inputClass} value={draft.star_sign} onChange={set("star_sign")} />
            </Field>
            <Field label="Chakras">
              <input className={inputClass} value={draft.chakras} onChange={set("chakras")} />
            </Field>
          </div>
          {formError && <p className="text-sm text-red-700">{formError}</p>}
        </Modal>
      )}
    </>
  );
}
