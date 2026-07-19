import Link from "next/link";
import FlightMap from "@/components/FlightMap";
import Logo from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";

export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="relative flex min-h-svh flex-col overflow-hidden">
      <FlightMap className="absolute inset-0" />
      <div className="absolute inset-0 bg-gradient-to-b from-background/85 via-background/60 to-background/90 pointer-events-none" />
      <header className="relative z-10 flex items-center justify-between px-4 sm:px-8 py-5">
        <Link href="/">
          <Logo size="sm" />
        </Link>
        <ThemeToggle />
      </header>
      <main className="relative z-10 flex flex-1 items-center justify-center px-4 pb-16">
        {children}
      </main>
    </div>
  );
}
