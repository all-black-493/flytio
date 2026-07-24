"use client";

import { Plane, Route, Wallet } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import {
  DEFAULT_FILTER_SORT,
  parseFilterSortParams,
  withFilterSortParams,
  type FilterSortParams,
} from "@/app/(app)/search/_lib/pagination-params";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { formatMoney } from "@/lib/api/format";
import type { OfferFacets } from "@/lib/api/schemas";

const sectionLabelClass =
  "flex items-center gap-1.5 font-mono text-[10px] tracking-[0.2em] text-muted-foreground";

export interface FilterSidebarProps {
  facets: OfferFacets;
  currency: string;
}

/** Reads filters from the URL and navigates to change them — filtering
 * happens server-side now (see backend/utils/offer_filtering.py), so a
 * filter change is a real (cache-backed, fast) request, not local state. */
export function FilterSidebar({ facets, currency }: FilterSidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filters = parseFilterSortParams(Object.fromEntries(searchParams.entries()));

  // Local-only: smooth thumb feedback while dragging, before the value is
  // committed to the URL (and re-fetched) on release.
  const [draftPriceMax, setDraftPriceMax] = useState<number | null>(null);

  const activeCount =
    filters.airlines.length + (filters.maxStops !== null ? 1 : 0) + (filters.priceMax !== null ? 1 : 0);
  const priceCeiling = draftPriceMax ?? filters.priceMax ?? facets.price_max;

  function navigate(patch: Partial<FilterSortParams>) {
    router.push(`${pathname}?${withFilterSortParams(searchParams, patch)}`);
  }

  function toggleAirline(code: string, checked: boolean) {
    navigate({
      airlines: checked ? [...filters.airlines, code] : filters.airlines.filter((c) => c !== code),
    });
  }

  return (
    <Card className="w-full shrink-0 gap-0 divide-y divide-dashed p-0 sm:w-64">
      <div className="flex items-center justify-between px-4 py-3.5">
        <h2 className="font-mono text-[11px] tracking-[0.25em] text-foreground">FILTERS</h2>
        {activeCount > 0 && (
          <button
            type="button"
            onClick={() => router.push(`${pathname}?${withFilterSortParams(searchParams, DEFAULT_FILTER_SORT)}`)}
            className="font-mono text-[10px] tracking-wide text-signal hover:underline"
          >
            RESET ({activeCount})
          </button>
        )}
      </div>

      {(facets.has_direct || facets.has_one_stop || facets.has_multi_stop) && (
        <div className="space-y-3 px-4 py-4">
          <Label className={sectionLabelClass}>
            <Route className="size-3.5 text-signal" />
            STOPS
          </Label>
          <div className="space-y-2.5">
            {[
              { label: "Any", value: null },
              ...(facets.has_direct ? [{ label: "Direct", value: 0 }] : []),
              ...(facets.has_one_stop || facets.has_multi_stop ? [{ label: "1 stop or fewer", value: 1 }] : []),
            ].map((option) => (
              <label key={option.label} className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="max-stops"
                  className="size-3.5 accent-signal"
                  checked={filters.maxStops === option.value}
                  onChange={() => navigate({ maxStops: option.value })}
                />
                {option.label}
              </label>
            ))}
          </div>
        </div>
      )}

      {facets.airlines.length > 1 && (
        <div className="space-y-3 px-4 py-4">
          <Label className={sectionLabelClass}>
            <Plane className="size-3.5 text-signal" />
            AIRLINE
          </Label>
          <div className="max-h-64 space-y-2.5 overflow-y-auto pr-1">
            {facets.airlines.map((airline) => (
              <label key={airline.code} className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={filters.airlines.includes(airline.code)}
                  onCheckedChange={(checked) => toggleAirline(airline.code, checked === true)}
                />
                <span className="flex-1 truncate">{airline.name}</span>
                <span className="font-mono text-[11px] text-muted-foreground">{airline.count}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {facets.price_max > facets.price_min && (
        <div className="space-y-3 px-4 py-4">
          <Label className={sectionLabelClass}>
            <Wallet className="size-3.5 text-signal" />
            MAX PRICE
          </Label>
          <Slider
            min={Math.floor(facets.price_min)}
            max={Math.ceil(facets.price_max)}
            step={1}
            value={[priceCeiling]}
            onValueChange={(next) => {
              const value = Array.isArray(next) ? next[0] : next;
              setDraftPriceMax(value);
            }}
            onValueCommitted={(next) => {
              const value = Array.isArray(next) ? next[0] : next;
              setDraftPriceMax(null);
              navigate({ priceMax: value });
            }}
          />
          <p className="font-mono text-xs text-muted-foreground">
            Up to {formatMoney(String(priceCeiling), currency)}
          </p>
        </div>
      )}
    </Card>
  );
}
