"use client";

import { useMemo, useState } from "react";
import { inputClass } from "@/components/ui";

/**
 * Search-as-you-type crystal list. Enter picks the top match.
 * Labels must be exact crystal names so scans can show the crystal's details.
 */
export function CrystalPicker({
  names,
  onPick,
  autoFocus = false,
  placeholder = "Type a crystal name…",
  maxHeight = "max-h-72",
  inputRef,
  onKeyDownEmpty,
}: {
  names: string[];
  onPick: (name: string) => void;
  autoFocus?: boolean;
  placeholder?: string;
  maxHeight?: string;
  inputRef?: React.Ref<HTMLInputElement>;
  /** Key presses while the box is empty (used for number-key shortcuts). */
  onKeyDownEmpty?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}) {
  const [query, setQuery] = useState("");

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return names.slice(0, 50);
    const starts = names.filter((n) => n.toLowerCase().startsWith(q));
    const contains = names.filter((n) => !n.toLowerCase().startsWith(q) && n.toLowerCase().includes(q));
    return [...starts, ...contains].slice(0, 50);
  }, [names, query]);

  function pick(name: string) {
    onPick(name);
    setQuery("");
  }

  return (
    <div>
      <input
        ref={inputRef}
        className={inputClass}
        placeholder={placeholder}
        value={query}
        autoFocus={autoFocus}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (!query && onKeyDownEmpty) onKeyDownEmpty(e);
          if (e.defaultPrevented) return;
          if (e.key === "Enter" && query.trim() && matches[0]) {
            e.preventDefault();
            pick(matches[0]);
          }
        }}
      />
      <div className={`mt-2 overflow-y-auto rounded-lg border border-neutral-200 bg-white ${maxHeight}`}>
        {matches.length === 0 ? (
          <div className="px-3 py-4 text-sm text-neutral-500">
            No crystal called “{query}”. Add it on the Crystals page first.
          </div>
        ) : (
          matches.map((name, i) => (
            <button
              key={name}
              type="button"
              onClick={() => pick(name)}
              className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-brand-soft ${
                i === 0 && query ? "bg-brand-soft font-medium" : ""
              }`}
            >
              {name}
              {i === 0 && query && <span className="ml-2 text-xs text-neutral-500">Enter</span>}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
