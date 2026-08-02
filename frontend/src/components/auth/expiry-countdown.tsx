"use client";

import { useEffect, useRef } from "react";

export function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export interface ExpiryCountdownProps {
  expiresAtMs: number;
  /** Called once, exactly when the countdown reaches zero - NOT on every
   * tick. The ticking itself writes straight to the DOM via ref instead
   * of React state, so a live countdown never re-renders its parent
   * (which would otherwise re-render an entire form, inputs included,
   * once a second). */
  onExpire?: () => void;
  className?: string;
}

export function ExpiryCountdown({ expiresAtMs, onExpire, className }: ExpiryCountdownProps) {
  const spanRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    function tick() {
      const remainingMs = expiresAtMs - Date.now();
      if (remainingMs <= 0) {
        onExpire?.();
        return;
      }
      const el = spanRef.current;
      if (el) {
        el.textContent = formatCountdown(remainingMs);
        el.classList.toggle("text-destructive", remainingMs < 60_000);
      }
    }
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [expiresAtMs, onExpire]);

  return <span ref={spanRef} className={className ?? "tabular-nums"} />;
}
