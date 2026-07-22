const SIZES = {
  sm: { tile: 28, text: "text-xl" },
  md: { tile: 36, text: "text-2xl" },
  lg: { tile: 44, text: "text-3xl" },
} as const;

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
      {/* the tile stays polar navy in both themes, like a physical board;
          the faint ring keeps it legible on dark backgrounds */}
      <rect width="48" height="48" rx="11" fill="#0B1526" />
      <rect
        x="0.5"
        y="0.5"
        width="47"
        height="47"
        rx="10.5"
        stroke="#3D5270"
        strokeOpacity="0.55"
      />
      {/* origin dot */}
      <circle cx="12" cy="35" r="2.5" fill="#C9D4DF" />
      {/* climb-out route */}
      <path
        d="M12 35 C 21 35.5, 27.5 29, 33 15.5"
        stroke="#F6F8FA"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeDasharray="4 4"
      />
      {/* destination dot — the "." in flyt.io */}
      <circle cx="34.8" cy="11.6" r="3.4" fill="#FF4F00" />
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
