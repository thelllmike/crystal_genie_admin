"use client";

import { useRef, useState } from "react";
import { labelColor, type Box } from "@/lib/training";

type Drag =
  | { mode: "draw"; x0: number; y0: number }
  | { mode: "move"; index: number; dx: number; dy: number }
  | { mode: "resize"; index: number; ax: number; ay: number }; // ax/ay = the corner that stays put

const HANDLES = ["nw", "ne", "sw", "se"] as const;
const MIN_SIZE = 0.01; // ignore accidental clicks-as-boxes

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

function fromCorners(x0: number, y0: number, x1: number, y1: number, label: string): Box {
  return { label, x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
}

/**
 * Photo with boxes on top. Drag on empty space to draw a box with
 * `activeLabel`; drag a box to move it; drag a selected box's corners to
 * resize. Coordinates are 0..1 of the photo, so they don't depend on
 * how big it's shown.
 */
export function BoxAnnotator({
  src,
  boxes,
  onChange,
  selected,
  onSelect,
  activeLabel,
}: {
  src: string;
  boxes: Box[];
  onChange: (boxes: Box[]) => void;
  selected: number | null;
  onSelect: (index: number | null) => void;
  activeLabel: string | null;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [draft, setDraft] = useState<Box | null>(null);

  function point(e: React.PointerEvent) {
    const r = wrap.current!.getBoundingClientRect();
    return { x: clamp((e.clientX - r.left) / r.width), y: clamp((e.clientY - r.top) / r.height) };
  }

  function replace(index: number, box: Box) {
    onChange(boxes.map((b, i) => (i === index ? box : b)));
  }

  function down(e: React.PointerEvent) {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    const handle = target.dataset.handle;
    const boxEl = target.closest<HTMLElement>("[data-box]");
    const p = point(e);

    if (boxEl) {
      const index = Number(boxEl.dataset.box);
      const b = boxes[index];
      drag.current = handle
        ? { mode: "resize", index, ax: handle.includes("w") ? b.x + b.w : b.x, ay: handle.includes("n") ? b.y + b.h : b.y }
        : { mode: "move", index, dx: p.x - b.x, dy: p.y - b.y };
      onSelect(index);
    } else {
      onSelect(null);
      if (!activeLabel) return; // nothing to draw with yet
      drag.current = { mode: "draw", x0: p.x, y0: p.y };
      setDraft(fromCorners(p.x, p.y, p.x, p.y, activeLabel));
    }
    wrap.current!.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function move(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const p = point(e);
    if (d.mode === "draw") {
      setDraft(fromCorners(d.x0, d.y0, p.x, p.y, activeLabel ?? ""));
    } else if (d.mode === "move") {
      const b = boxes[d.index];
      replace(d.index, { ...b, x: clamp(p.x - d.dx, 0, 1 - b.w), y: clamp(p.y - d.dy, 0, 1 - b.h) });
    } else {
      replace(d.index, fromCorners(d.ax, d.ay, p.x, p.y, boxes[d.index].label));
    }
  }

  function up() {
    const d = drag.current;
    drag.current = null;
    if (d?.mode === "draw") {
      if (draft && draft.w > MIN_SIZE && draft.h > MIN_SIZE) {
        onChange([...boxes, draft]);
        onSelect(boxes.length);
      }
      setDraft(null);
    }
  }

  return (
    <div
      ref={wrap}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      className={`relative inline-block touch-none select-none ${activeLabel ? "cursor-crosshair" : "cursor-default"}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- training photo */}
      <img src={src} alt="Photo to annotate" draggable={false} className="block max-h-[70vh] max-w-full" />

      {boxes.map((b, i) => {
        const color = labelColor(b.label);
        const isSelected = selected === i;
        return (
          <div
            key={i}
            data-box={i}
            className="absolute cursor-move"
            style={{
              left: `${b.x * 100}%`,
              top: `${b.y * 100}%`,
              width: `${b.w * 100}%`,
              height: `${b.h * 100}%`,
              border: `${isSelected ? 3 : 2}px solid ${color}`,
              background: labelColor(b.label, isSelected ? 0.25 : 0.15),
            }}
          >
            <span
              className="pointer-events-none absolute left-[-2px] top-0 max-w-[200px] -translate-y-full truncate rounded-t px-1.5 py-0.5 text-[11px] font-semibold text-white"
              style={{ background: color }}
            >
              {b.label}
            </span>
            {isSelected &&
              HANDLES.map((h) => (
                <div
                  key={h}
                  data-handle={h}
                  className="absolute h-3.5 w-3.5 rounded-sm border-2 bg-white"
                  style={{
                    borderColor: color,
                    [h.includes("n") ? "top" : "bottom"]: -7,
                    [h.includes("w") ? "left" : "right"]: -7,
                    cursor: h === "nw" || h === "se" ? "nwse-resize" : "nesw-resize",
                  }}
                />
              ))}
          </div>
        );
      })}

      {draft && (
        <div
          className="pointer-events-none absolute border-2 border-dashed"
          style={{
            left: `${draft.x * 100}%`,
            top: `${draft.y * 100}%`,
            width: `${draft.w * 100}%`,
            height: `${draft.h * 100}%`,
            borderColor: labelColor(draft.label),
            background: labelColor(draft.label, 0.15),
          }}
        />
      )}
    </div>
  );
}
