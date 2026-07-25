import * as React from "react"

function subscribe() {
  return () => {}
}

/** True once hydrated on the client, false during SSR and the initial
 * client render. The useSyncExternalStore-based way to defer
 * theme-dependent UI until after hydration (see components/ThemeToggle.tsx):
 * next-themes resolves the theme synchronously on the client via its
 * anti-flash script, before hydration finishes, so reading resolvedTheme
 * directly still mismatches the server's render. A plain useState+useEffect
 * "mounted" flag would work too, but this repo's react-hooks/set-state-in-effect
 * rule disallows setState inside a bare effect - useSyncExternalStore is
 * the sanctioned React-native way to get the same hydration-safe result. */
export function useMounted() {
  return React.useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  )
}
