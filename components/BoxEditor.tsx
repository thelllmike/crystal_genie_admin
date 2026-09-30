"use client";

import { useEffect, useState } from "react";
import { BoxAnnotator } from "@/components/BoxAnnotator";
import { CrystalPicker } from "@/components/CrystalPicker";
import { Button } from "@/components/ui";
import { imageUrl, labelColor, type Box, type TrainingImage } from "@/lib/training";

/**
 * Label Studio–style box labeling for one photo.
 * Keys: 1–9 pick a crystal (or relabel the selected box), Delete removes the
 * selected box, Enter saves, Esc deselects / skips.
 * Give it `key={image.id}` so it starts fresh for each photo.
 */
export function BoxEditor({
  image,
  names,
  recent,
  onUseLabel,
  onSave,
  onSkip,
  onDelete,
  busy = false,
  saveLabel = "Save & next",
}: {
  image: TrainingImage;
  names: string[];
  /** Crystals shown as chips (most recent first); shared across photos. */
  recent: string[];
  onUseLabel: (label: string) => void;
  onSave: (boxes: Box[]) => void;
  onSkip?: () => void;
  onDelete?: () => void;
  busy?: boolean;
  saveLabel?: string;
}) {
  const [boxes, setBoxes] = useState<Box[]>(image.boxes ?? []);
  const [selected, setSelected] = useState<number | null>(null);
  const [active, setActive] = useState<string | null>(recent[0] ?? image.label ?? null);

  // Chips: recent crystals plus any already on this photo.
  const chips = [...new Set([...recent, ...boxes.map((b) => b.label), ...(image.label ? [image.label] : [])])].slice(0, 9);

  function choose(label: string) {
    onUseLabel(label);
    setActive(label);
    if (selected != null) setBoxes((bs) => bs.map((b, i) => (i === selected ? { ...b, label } : b)));
  }

  function removeSelected() {
    if (selected == null) return;
    setBoxes((bs) => bs.filter((_, i) => i !== selected));
    setSelected(null);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.target as HTMLElement).closest("input, textarea, select")) return;
      const n = Number(e.key);
      if (n >= 1 && n <= chips.length) {
        e.preventDefault();
        choose(chips[n - 1]);
      } else if ((e.key === "Delete" || e.key === "Backspace") && selected != null) {
        e.preventDefault();
        removeSelected();
      } else if (e.key === "Enter" && !busy) {
        e.preventDefault();
        onSave(boxes);
      } else if (e.key === "Escape") {
        e.preventDefault();
        if (selected != null) setSelected(null);
        else onSkip?.();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div>
        {/* Crystal chips, like Label Studio's label bar */}
        <div className="mb-3 flex flex-wrap gap-2">
          {chips.length === 0 && <span className="text-sm text-neutral-500">Pick a crystal on the right to start drawing →</span>}
          {chips.map((label, i) => (
            <button
              key={label}
              onClick={() => choose(label)}
              className={`flex items-center gap-2 rounded-lg border bg-white px-3 py-1.5 text-sm font-medium ${
                active === label ? "border-neutral-800 shadow-sm" : "border-neutral-200"
              }`}
            >
              <span className="h-4 w-1.5 rounded-full" style={{ background: labelColor(label) }} />
              {label}
              <sup className="text-[10px] text-neutral-500">[{i + 1}]</sup>
            </button>
          ))}
        </div>

        <div className="flex justify-center rounded-2xl bg-neutral-900 p-3">
          <BoxAnnotator
            src={imageUrl(image)}
            boxes={boxes}
            onChange={setBoxes}
            selected={selected}
            onSelect={setSelected}
            activeLabel={active}
          />
        </div>
        <p className="mt-2 text-xs text-neutral-500">
          Drag on the photo to draw a box around each crystal · drag a box to move it · drag its corners to resize ·{" "}
          <b>1–9</b> pick crystal · <b>Delete</b> remove box · <b>Enter</b> save · <b>Esc</b> {onSkip ? "skip" : "deselect"}
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            {selected != null ? "Change the selected box to…" : "Draw boxes as…"}
          </div>
          <CrystalPicker names={names} onPick={choose} maxHeight="max-h-40" placeholder="Search all crystals…" />
        </div>

        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Boxes on this photo ({boxes.length})</div>
          {boxes.length === 0 ? (
            <p className="text-sm text-neutral-500">None yet.</p>
          ) : (
            <ul className="space-y-1">
              {boxes.map((b, i) => (
                <li
                  key={i}
                  onClick={() => setSelected(i)}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${selected === i ? "bg-brand-soft" : "hover:bg-neutral-50"}`}
                >
                  <span className="h-3 w-3 flex-none rounded-sm" style={{ background: labelColor(b.label) }} />
                  <span className="flex-1 truncate">{b.label}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setBoxes((bs) => bs.filter((_, j) => j !== i));
                      setSelected(null);
                    }}
                    className="px-1 text-neutral-400 hover:text-red-700"
                    aria-label="Remove box"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-2 border-t border-neutral-200 pt-4">
          <Button className="w-full" disabled={busy} onClick={() => onSave(boxes)}>
            {busy ? "Saving…" : `${saveLabel} (Enter)`}
          </Button>
          {boxes.length === 0 && (
            <Button variant="ghost" className="w-full" disabled={busy} onClick={() => onSave([])}>
              No crystals in this photo
            </Button>
          )}
          <div className="flex gap-2">
            {onSkip && (
              <Button variant="ghost" className="flex-1" disabled={busy} onClick={onSkip}>
                Skip (Esc)
              </Button>
            )}
            {onDelete && (
              <Button variant="danger" className="flex-1" disabled={busy} onClick={onDelete}>
                Delete photo
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
