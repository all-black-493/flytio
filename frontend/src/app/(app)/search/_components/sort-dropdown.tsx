"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { OfferSortKey } from "@/lib/api/types";
import {
  parseFilterSortParams,
  withFilterSortParams,
} from "@/app/(app)/search/_lib/pagination-params";

const OPTIONS: { value: OfferSortKey; label: string }[] = [
  { value: "price", label: "Cheapest price" },
  { value: "duration", label: "Fastest" },
  { value: "departure", label: "Earliest departure" },
  { value: "arrival", label: "Earliest arrival" },
];

/** Reads/writes the `sort` URL param directly (see pagination-params.ts) —
 * a sort change is a real request to the backend now that sorting happens
 * server-side, so this is a navigation, not local state. */
export function SortDropdown() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { sort } = parseFilterSortParams(Object.fromEntries(searchParams.entries()));

  function handleChange(value: OfferSortKey) {
    const query = withFilterSortParams(searchParams, { sort: value });
    router.push(`${pathname}?${query}`);
  }

  return (
    <Select value={sort} onValueChange={(v) => handleChange(v as OfferSortKey)}>
      <SelectTrigger
        aria-label="Sort results"
        className="w-full border-transparent bg-board-ink/10 text-board-ink hover:bg-board-ink/15 sm:w-56 [&_svg]:text-board-muted"
      >
        <span className="font-mono text-[10px] tracking-widest text-board-muted">SORT</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
