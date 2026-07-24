const SIZES = {
  sm: { tile: 28, text: "text-xl" },
  md: { tile: 36, text: "text-2xl" },
  lg: { tile: 44, text: "text-3xl" },
} as const;

/** Shape data kept in sync by hand with app/icon.svg (a static favicon file
 * that can't import this component) — edit both together. */
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
      {/* ascent — solid and straight so it stays legible at favicon size */}
      <line
        x1="13"
        y1="35"
        x2="32"
        y2="15"
        stroke="#F6F8FA"
        strokeWidth="7"
        strokeLinecap="round"
      />
      {/* destination dot — the "." in flyt.io */}
      <circle cx="34" cy="13.5" r="5.5" fill="#FF4F00" />
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
        flyt<span className="text-signal">.</span>
        <span className="text-muted-foreground">io</span>
      </span>
    </span>
  );
}
