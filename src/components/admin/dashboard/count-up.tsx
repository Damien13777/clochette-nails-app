"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  value: number;
  duration?: number;
  /** "currency" formate en € (depuis cents), "integer" en nombre français. */
  format?: "currency" | "integer";
};

export function CountUp({ value, duration = 700, format = "integer" }: Props) {
  const [current, setCurrent] = useState(0);
  const startRef = useRef<number | null>(null);
  const reduceMotion = useRef(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      reduceMotion.current = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
    }
    if (reduceMotion.current) {
      setCurrent(value);
      return;
    }
    let raf = 0;
    const step = (ts: number) => {
      if (startRef.current === null) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const t = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setCurrent(Math.round(eased * value));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      startRef.current = null;
    };
  }, [value, duration]);

  if (format === "currency") {
    return <>{(current / 100).toFixed(2).replace(".", ",") + " €"}</>;
  }
  return <>{current.toLocaleString("fr-FR")}</>;
}
