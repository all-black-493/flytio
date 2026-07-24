"use client";

import { QueryClientProvider } from "@tanstack/react-query";

import { getQueryClient } from "./get-query-client";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  // NOTE: no useState here — if this component suspends on first render
  // with no boundary above it, React would throw away and remake the
  // client on retry, losing anything already fetched.
  const queryClient = getQueryClient();

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
