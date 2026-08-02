import { useEffect, useState } from "react";

/** Delays reflecting `value`'s changes by `delayMs` - for gating a network
 * call (e.g. an autocomplete search) behind a pause in typing rather than
 * firing on every keystroke. The input itself should still bind directly
 * to the raw, non-debounced value so it stays responsive; only the
 * network-triggering value (a query key, an `enabled` check) should use
 * this hook's return value. */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timeout);
  }, [value, delayMs]);

  return debounced;
}
