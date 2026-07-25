import { cn } from "@/lib/utils";

interface AirlineLogoProps {
  logoUrl?: string | null;
  iataCode?: string | null;
  name?: string | null;
  /** Layout only (size/shape) - applied to both the logo image and the
   * IATA-code fallback badge. */
  className?: string;
  /** Background/text color for the fallback badge only. Never applied to
   * a real logo image, which always needs a solid white backing plate -
   * Duffel's logo assets are drawn for a light background regardless of
   * app theme - so a bg override here can't accidentally make a real
   * logo's backing translucent. */
  fallbackClassName?: string;
}

/** Renders a carrier's logo when Duffel supplied one (only available on a
 * segment's marketing_carrier/operating_carrier - Offer/Order `owner`
 * never has a logo field, see the flyt-airline-logos memory), else falls
 * back to the IATA-code badge treatment used everywhere before logos
 * existed. */
export function AirlineLogo({
  logoUrl,
  iataCode,
  name,
  className,
  fallbackClassName,
}: AirlineLogoProps) {
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- remote Duffel CDN logo, not worth a next.config remotePatterns entry for one component
      <img
        src={logoUrl}
        alt={name ?? iataCode ?? "Airline"}
        className={cn("size-6 shrink-0 rounded bg-white object-contain p-0.5", className)}
      />
    );
  }
  return (
    <span
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded bg-muted font-mono text-[10px] font-bold text-foreground",
        className,
        fallbackClassName,
      )}
    >
      {iataCode ?? "—"}
    </span>
  );
}
