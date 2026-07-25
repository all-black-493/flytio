"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Input } from "@/components/ui/input";
import { searchPlaces } from "@/lib/api/client";
import type { Place } from "@/lib/api/schemas";
import { cn } from "@/lib/utils";

function placeCode(place: Place): string {
  return place.iata_code ?? place.iata_city_code ?? "";
}

function placeLabel(place: Place): string {
  const code = placeCode(place);
  const name = place.city_name ?? place.name;
  return code ? `${code} — ${name}` : name;
}

interface PlaceAutocompleteProps {
  id: string;
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  icon: React.ReactNode;
  className?: string;
}

interface DropdownRect {
  top: number;
  left: number;
  width: number;
}

/** Airport/city autocomplete for the FROM/TO fields, backed by Duffel's
 * own place-suggestions endpoint - GET /shopping/places
 * (lib/api/client.ts's searchPlaces) already existed and was already
 * Duffel-backed, just never wired into the UI until now. Falls back to
 * plain free-text entry (no forced selection), matching the plain <Input>
 * this replaces - Duffel search itself is the real validation. */
export function PlaceAutocomplete({
  id,
  value,
  onValueChange,
  placeholder,
  icon,
  className,
}: PlaceAutocompleteProps) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dropdownRect, setDropdownRect] = useState<DropdownRect | null>(null);

  // Keeps the visible text in sync when the parent changes `value` out
  // from under us (e.g. the origin/destination swap button) - adjusting
  // state during render (React's documented pattern for this) rather
  // than in an effect, which this repo's react-hooks/set-state-in-effect
  // rule disallows and which would also cause a visible flash of stale
  // text before the effect ran.
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setQuery(value);
  }

  const trimmed = query.trim();
  const { data, isFetching } = useQuery({
    queryKey: ["place-suggestions", trimmed],
    queryFn: () => searchPlaces({ query: trimmed }),
    enabled: open && trimmed.length >= 2,
    staleTime: 60_000,
  });

  const suggestions = data?.data ?? [];
  const showDropdown = open && trimmed.length >= 2;

  // The search bar's own Card has overflow-hidden for its rounded header,
  // which would clip a plain absolutely-positioned dropdown, so this
  // renders through a portal into document.body instead (see the return
  // statement below) and needs its own viewport coordinates rather than
  // relying on CSS containment. Measured in the event handlers that open
  // the dropdown, not during render - react-hooks/refs (this repo's
  // stricter lint config) disallows reading a ref's .current outside of
  // an event handler or effect.
  function measureAndOpen() {
    setOpen(true);
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) setDropdownRect({ top: rect.bottom, left: rect.left, width: rect.width });
  }

  // Keeps the portal aligned if the page scrolls/resizes while the
  // dropdown is open - registering listeners is the legitimate use of an
  // effect here (subscribing to an external system); the ref read inside
  // the listener callback runs in response to a real browser event, not
  // during render, so it's unaffected by the same rule.
  useEffect(() => {
    if (!showDropdown) return;
    function updatePosition() {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) setDropdownRect({ top: rect.bottom, left: rect.left, width: rect.width });
    }
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [showDropdown]);

  function selectPlace(place: Place) {
    onValueChange(placeCode(place));
    setQuery(placeLabel(place));
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      {icon}
      <Input
        id={id}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          onValueChange(e.target.value.toUpperCase());
          measureAndOpen();
          setHighlighted(0);
        }}
        onFocus={measureAndOpen}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (!showDropdown || suggestions.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlighted((i) => (i + 1) % suggestions.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlighted((i) => (i - 1 + suggestions.length) % suggestions.length);
          } else if (e.key === "Enter" && suggestions[highlighted]) {
            e.preventDefault();
            selectPlace(suggestions[highlighted]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder={placeholder}
        autoComplete="off"
        required
        className={className}
      />
      {showDropdown &&
        dropdownRect &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            style={{
              position: "fixed",
              top: dropdownRect.top + 4,
              left: dropdownRect.left,
              width: dropdownRect.width,
            }}
            className="z-50 max-h-64 overflow-y-auto rounded-lg border bg-popover text-popover-foreground shadow-md"
          >
            {isFetching && (
              <p className="p-3 text-sm text-muted-foreground">Searching…</p>
            )}
            {!isFetching && suggestions.length === 0 && (
              <p className="p-3 text-sm text-muted-foreground">No matches</p>
            )}
            {suggestions.map((place, index) => (
              <button
                key={place.id}
                type="button"
                // Fires before the input's onBlur, so the click registers
                // instead of the dropdown closing first.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectPlace(place)}
                className={cn(
                  "flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-muted",
                  index === highlighted && "bg-muted",
                )}
              >
                <span className="font-mono font-medium">
                  {placeCode(place)} — {place.city_name ?? place.name}
                </span>
                {place.type === "airport" && place.name !== place.city_name && (
                  <span className="text-xs text-muted-foreground">{place.name}</span>
                )}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
