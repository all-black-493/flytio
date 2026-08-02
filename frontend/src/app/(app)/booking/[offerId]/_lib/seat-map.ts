/**
 * Pure derivations over Duffel's seat map. No React here on purpose:
 * everything below is a plain function of the map data, so it can be
 * read, reasoned about and reused without rendering anything.
 *
 * Duffel gives us less than a seat-detail panel wants. It sends a
 * designator, a (usually empty) name and disclosures list, and the
 * services available to each passenger - but no "window seat" or "extra
 * legroom" flags. The rest has to be recovered from the shape of the
 * map itself, which is what this module does.
 */

import type { AvailableSeatService, SeatElement, SeatMapCabinRow } from "@/lib/api/schemas";

export type SeatPosition = "window" | "aisle" | "middle";

/** Availability and pricing are per-passenger in Duffel's seat map — a
 * seat can be open for one passenger and not another, so this always
 * asks about a specific passenger rather than a flat available flag. */
export function serviceFor(
  element: SeatElement,
  passengerId: string,
): AvailableSeatService | undefined {
  return element.available_services?.find((s) => s.passenger_id === passengerId);
}

/** A seat costing nothing is "included" rather than free-as-in-choice —
 * Duffel still models it as a service with a zero total. */
export function isIncluded(service: AvailableSeatService): boolean {
  return parseFloat(service.total_amount) === 0;
}

/** Leading digits of a designator: "12A" -> 12. Null when the airline
 * uses something we can't parse, so callers can omit the row chip
 * rather than print "Row NaN". */
export function rowNumber(designator: string | null | undefined): number | null {
  const match = designator?.match(/^(\d+)/);
  return match ? Number(match[1]) : null;
}

/** True when this row is an exit row, which Duffel marks by placing an
 * `exit_row` element in the row rather than flagging the seats. */
export function rowHasExit(row: SeatMapCabinRow): boolean {
  return row.sections.some((section) => section.elements.some((e) => e.type === "exit_row"));
}

/**
 * Where a seat sits in its row, derived from the map's geometry.
 *
 * Duffel splits a row into sections, and the gaps between sections are
 * the aisles. So the outer edge of the outermost sections is a window,
 * anything touching a section boundary that isn't that outer edge is on
 * an aisle, and whatever remains is a middle seat.
 *
 * Only seats count when working this out: galleys, lavatories and
 * `exit_row` markers share the element list, and letting them occupy an
 * edge would report the seat beside a galley as a window seat.
 *
 * A single-section row (no aisle in the map at all, common on small
 * regional aircraft) still yields window edges, which is right - the
 * outermost seats are against the fuselage either way.
 */
export function seatPosition(
  row: SeatMapCabinRow,
  sectionIndex: number,
  element: SeatElement,
): SeatPosition {
  const seatsIn = (index: number) => row.sections[index]?.elements.filter((e) => e.type === "seat") ?? [];

  const seats = seatsIn(sectionIndex);
  const positionInSection = seats.indexOf(element);
  if (positionInSection === -1) return "middle";

  const sectionsWithSeats = row.sections
    .map((_, index) => index)
    .filter((index) => seatsIn(index).length > 0);
  const isFirstSection = sectionIndex === sectionsWithSeats[0];
  const isLastSection = sectionIndex === sectionsWithSeats[sectionsWithSeats.length - 1];

  const atSectionStart = positionInSection === 0;
  const atSectionEnd = positionInSection === seats.length - 1;

  // The two fuselage edges of the whole row.
  if ((isFirstSection && atSectionStart) || (isLastSection && atSectionEnd)) return "window";
  // Any other section boundary is where an aisle runs.
  if (atSectionStart || atSectionEnd) return "aisle";
  return "middle";
}
