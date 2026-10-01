"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { inputClass } from "@/components/ui";

/**
 * When a page provides this, every CrystalPicker inside it offers
 * "+ Add … as a new label" for names that aren't in the list yet. The
 * function must create the crystal and add it to the `names` it passes down.
 */
export const NewLabelContext = createContext<((name: string) => Promise<void>) | null>(null);

/** Tidies a typed name: trims and collapses repeated spaces. */
const clean = (name: string) => name.trim().replace(/\s+/g, " ");

/**
 * Search-as-you-type crystal list. Enter picks the top match (or adds the
 * typed name as a new label when nothing matches and adding is allowed).
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
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const createLabel = useContext(NewLabelContext);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return names.slice(0, 50);
    const starts = names.filter((n) => n.toLowerCase().startsWith(q));
    const contains = names.filter((n) => !n.toLowerCase().startsWith(q) && n.toLowerCase().includes(q));
    return [...starts, ...contains].slice(0, 50);
  }, [names, query]);

  const typed = clean(query);
  const exact = names.find((n) => n.toLowerCase() === typed.toLowerCase());
  const canAdd = !!createLabel && typed.length > 0 && !exact;

  function pick(name: string) {
    onPick(name);
    setQuery("");
    setError("");
  }

  async function add() {
    if (!createLabel || !canAdd || adding) return;
    if (typed.length > 80) {
      setError("Keep the name under 80 characters.");
      return;
    }
    setAdding(true);
    setError("");
    try {
      await createLabel(typed);
      pick(typed);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAdding(false);
    }
  }

  return (
    <div>
      <input
        ref={inputRef}
        className={inputClass}
        placeholder={placeholder}
        value={query}
        autoFocus={autoFocus}
        onChange={(e) => {
          setQuery(e.target.value);
          setError("");
        }}
        onKeyDown={(e) => {
          if (!query && onKeyDownEmpty) onKeyDownEmpty(e);
          if (e.defaultPrevented || e.key !== "Enter" || !query.trim()) return;
          e.preventDefault();
          if (exact) pick(exact);
          else if (matches[0]) pick(matches[0]);
          else add();
        }}
      />
      <div className={`mt-2 overflow-y-auto rounded-lg border border-neutral-200 bg-white ${maxHeight}`}>
        {canAdd && (
          <button
            type="button"
            onClick={add}
            disabled={adding}
            className={`block w-full border-b border-neutral-100 px-3 py-2 text-left text-sm font-medium text-brand-dark hover:bg-brand-soft ${
              matches.length === 0 ? "bg-brand-soft" : ""
            }`}
          >
            {adding ? "Adding…" : <>+ Add “{typed}” as a new label</>}
            {matches.length === 0 && !adding && <span className="ml-2 text-xs font-normal text-neutral-500">Enter</span>}
          </button>
        )}
        {matches.length === 0 && !canAdd ? (
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
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  );
}
