"use client";

import { useState } from "react";
import { Button, Empty, ErrorBox, Field, Loading, Modal, PageHeader, Pill, inputClass } from "@/components/ui";
import { check, money, supabase, type Product } from "@/lib/supabase";
import { useLoad } from "@/lib/useLoad";
import { PhotoPicker } from "@/components/PhotoPicker";

const fetchProducts = async () =>
  (check(await supabase.from("products").select("id, name, headline, price, image_url, stock").order("name")) as
    | Product[]
    | null) ?? [];

type Draft = { id?: number; name: string; headline: string; price: string; stock: string; image_url: string };

const blank: Draft = { name: "", headline: "", price: "", stock: "10", image_url: "" };

export default function ProductsPage() {
  const { data: products, error, reload } = useLoad(fetchProducts);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");

  function edit(p?: Product) {
    setFormError("");
    setDraft(
      p
        ? { id: p.id, name: p.name, headline: p.headline ?? "", price: String(p.price), stock: String(p.stock), image_url: p.image_url ?? "" }
        : blank,
    );
  }

  async function save() {
    if (!draft) return;
    const price = Number(draft.price);
    if (!draft.name.trim() || !draft.price.trim() || Number.isNaN(price) || price < 0) {
      setFormError("Name and a valid price are required.");
      return;
    }
    const row = {
      name: draft.name.trim(),
      headline: draft.headline.trim(),
      price,
      stock: Math.max(0, parseInt(draft.stock, 10) || 0),
      image_url: draft.image_url.trim() || null,
    };
    setBusy(true);
    try {
      if (draft.id) check(await supabase.from("products").update(row).eq("id", draft.id));
      else check(await supabase.from("products").insert(row));
      setDraft(null);
      reload();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!draft?.id || !confirm(`Delete "${draft.name}"? It will also be removed from customers' carts.`)) return;
    setBusy(true);
    try {
      check(await supabase.from("products").delete().eq("id", draft.id));
      setDraft(null);
      reload();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (error) return <ErrorBox message={error} />;
  if (!products) return <Loading />;

  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDraft((d) => (d ? { ...d, [k]: e.target.value } : d));

  return (
    <>
      <PageHeader title="Shop items" action={<Button onClick={() => edit()}>+ Add item</Button>} />

      {products.length === 0 ? (
        <Empty>No items in the shop yet.</Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {products.map((p) => (
            <button
              key={p.id}
              onClick={() => edit(p)}
              className="flex gap-4 rounded-xl border border-black/5 bg-white p-3 text-left shadow-sm transition hover:shadow-md"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary admin-entered URLs */}
              <img
                src={p.image_url || "/item.png"}
                alt=""
                onError={(e) => (e.currentTarget.src = "/item.png")}
                className="h-20 w-20 flex-none rounded-lg bg-neutral-100 object-cover"
              />
              <div className="min-w-0">
                <div className="truncate font-semibold">{p.name}</div>
                {p.headline && <div className="truncate text-sm italic text-neutral-500">{p.headline}</div>}
                <div className="mt-2 flex items-center gap-2">
                  <span className="font-semibold text-brand-dark">{money(p.price)}</span>
                  {p.stock > 0 ? <Pill color="gray">{p.stock} in stock</Pill> : <Pill color="red">Sold out</Pill>}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {draft && (
        <Modal
          title={draft.id ? "Edit shop item" : "Add shop item"}
          onClose={() => !busy && setDraft(null)}
          footer={
            <>
              {draft.id && (
                <Button variant="danger" className="mr-auto" disabled={busy} onClick={remove}>
                  Delete
                </Button>
              )}
              <Button variant="ghost" disabled={busy} onClick={() => setDraft(null)}>
                Cancel
              </Button>
              <Button disabled={busy} onClick={save}>
                {busy ? "Saving…" : draft.id ? "Save" : "Add"}
              </Button>
            </>
          }
        >
          <PhotoPicker
            bucket="product-images"
            nameHint={draft.name}
            value={draft.image_url}
            onChange={(url) => setDraft((d) => (d ? { ...d, image_url: url } : d))}
            onError={setFormError}
            onBusyChange={setBusy}
            disabled={busy}
          />
          <Field label="Name">
            <input className={inputClass} value={draft.name} onChange={set("name")} autoFocus />
          </Field>
          <Field label="Headline" hint="Short line shown under the name, e.g. “The stone of calm”.">
            <input className={inputClass} value={draft.headline} onChange={set("headline")} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Price ($)">
              <input className={inputClass} inputMode="decimal" value={draft.price} onChange={set("price")} />
            </Field>
            <Field label="Stock">
              <input className={inputClass} inputMode="numeric" value={draft.stock} onChange={set("stock")} />
            </Field>
          </div>
          {formError && <p className="text-sm text-red-700">{formError}</p>}
        </Modal>
      )}
    </>
  );
}
