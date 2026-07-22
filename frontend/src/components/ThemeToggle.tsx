"use client";

import { useSyncExternalStore } from "react";
import { useTheme, type ThemeMode } from "@/lib/theme";

/** Cockpit-dimmer vernacular: DAY / NIGHT / AUTO = light / dark / system. */
const MODES: { value: ThemeMode; label: string }[] = [
  { value: "light", label: "DAY" },
  { value: "dark", label: "NIGHT" },
  { value: "system", label: "AUTO" },
];

const emptySubscribe = () => () => {};

export default function ThemeToggle() {
  const { mode, setMode } = useTheme();
  /* false on the server and during hydration, true right after — so the
     active pill only renders client-side and never mismatches the SSR HTML */
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  return (
    <div
      role="radiogroup"
      aria-label="Display mode"
      className="inline-flex rounded-full border bg-card p-0.5 font-mono text-[10px] tracking-widest"
    >
      {MODES.map(({ value, label }) => {
        const active = mounted && mode === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setMode(value)}
            className={`rounded-full px-2.5 py-1.5 transition-colors ${
              active
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-signal"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
