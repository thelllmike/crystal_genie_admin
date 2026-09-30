"use client";

import { useState } from "react";
import { check, supabase } from "@/lib/supabase";

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Photo preview + upload to a public Supabase storage bucket. Calls
 * `onChange` with the new public URL (or "" when removed); the caller saves it.
 */
export function PhotoPicker({
  bucket,
  nameHint,
  value,
  onChange,
  onError,
  onBusyChange,
  disabled = false,
}: {
  bucket: string;
  /** Used to build a readable filename, e.g. the crystal or product name. */
  nameHint: string;
  value: string;
  onChange: (url: string) => void;
  onError: (message: string) => void;
  onBusyChange?: (busy: boolean) => void;
  disabled?: boolean;
}) {
  const [uploading, setUploading] = useState(false);

  async function upload(file: File) {
    if (file.size > MAX_BYTES) {
      onError("That photo is over 5 MB — please pick a smaller one.");
      return;
    }
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const slug = nameHint.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "photo";
    // A fresh filename each time so phones don't keep showing a cached old photo.
    const path = `${slug}-${Date.now()}.${ext}`;
    setUploading(true);
    onBusyChange?.(true);
    onError("");
    try {
      check(await supabase.storage.from(bucket).upload(path, file, { contentType: file.type }));
      onChange(supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl);
    } catch (e) {
      const msg = (e as Error).message;
      onError(/bucket/i.test(msg) ? `${msg} — run the photo SQL in the sql/ folder in Supabase first.` : msg);
    } finally {
      setUploading(false);
      onBusyChange?.(false);
    }
  }

  const locked = disabled || uploading;

  return (
    <div>
      <span className="mb-1 block text-sm font-medium text-neutral-700">Photo</span>
      <div className="flex items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- Supabase storage / arbitrary URLs */}
        <img
          src={value || "/item.png"}
          alt=""
          onError={(e) => (e.currentTarget.src = "/item.png")}
          className={`h-28 w-28 flex-none rounded-xl border border-neutral-200 object-cover ${value ? "" : "opacity-40 grayscale"}`}
        />
        <div className="flex flex-col items-start gap-2">
          <label
            className={`cursor-pointer rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark ${
              locked ? "pointer-events-none opacity-50" : ""
            }`}
          >
            {uploading ? "Uploading…" : value ? "Change photo" : "Upload photo"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = ""; // allow picking the same file again
                if (file) upload(file);
              }}
            />
          </label>
          {value && (
            <button type="button" disabled={locked} onClick={() => onChange("")} className="text-sm text-red-700 hover:underline">
              Remove photo
            </button>
          )}
          <span className="text-xs text-neutral-500">JPG, PNG or WebP, up to 5 MB. Click Save to keep it.</span>
        </div>
      </div>
    </div>
  );
}
