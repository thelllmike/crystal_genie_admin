"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Runs `fetcher` on mount and whenever `reload()` is called.
 * `fetcher` must be stable (defined at module level or memoized).
 */
export function useLoad<T>(fetcher: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let live = true;
    fetcher().then(
      (d) => {
        if (!live) return;
        setData(d);
        setError("");
      },
      (e: Error) => live && setError(e.message),
    );
    return () => {
      live = false;
    };
  }, [fetcher, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { data, error, reload, setData };
}
