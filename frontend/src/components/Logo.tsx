const SIZES = {
  sm: { tile: 28, text: "text-xl" },
  md: { tile: 36, text: "text-2xl" },
  lg: { tile: 44, text: "text-3xl" },
} as const;

/** Shape data kept in sync by hand with app/icon.svg (a static favicon file
 * that can't import this component) — edit both together.
 *
 * A hex "flower" of 7 dots (1 center + 6 around, 60° apart) — re-centered
 * and rescaled from the source artwork so the center dot lands on (24,24)
 * and the cluster gets breathing room comparable to the mark's previous
 * diagonal-stroke version. */
export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect width="48" height="48" rx="11" fill="#0B1526" />
      <g fill="var(--signal)">
        <circle cx="24" cy="24" r="5" />
        <circle cx="24" cy="12" r="5" />
        <circle cx="34.4" cy="18" r="5" />
        <circle cx="34.4" cy="30" r="5" />
        <circle cx="24" cy="36" r="5" />
        <circle cx="13.6" cy="30" r="5" />
        <circle cx="13.6" cy="18" r="5" />
      </g>
    </svg>
  );
}

export default function Logo({ size = "md" }: { size?: keyof typeof SIZES }) {
  const s = SIZES[size];
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark size={s.tile} />
      <span
        className={`${s.text} font-bold tracking-tight leading-none translate-y-[0.08em] text-foreground`}
      >
        flyt
      </span>
    </span>
  );
}
