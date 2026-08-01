import Link from "next/link";

import { LogoutButton } from "@/components/auth/logout-button";
import Logo from "@/components/Logo";
import { MobileNavMenu } from "@/components/MobileNavMenu";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { StatusTicker } from "@/components/StatusTicker";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/api/client";
import { isAuthenticated } from "@/lib/auth/session";

/** Best-effort - fails closed (hides the admin link) on any error, e.g.
 * the backend being briefly unreachable. isAuthenticated() alone (cookie
 * presence) can't tell staff apart from regular customers. */
async function checkIsStaff(): Promise<boolean> {
  try {
    return (await getCurrentUser()).is_staff;
  } catch {
    return false;
  }
}

const NAV_LINKS = [
  { label: "search", href: "/search" },
  { label: "departures", href: "/#board" },
  { label: "business", href: "/#business" },
  { label: "api", href: "/#business" },
];

const linkClass = "font-mono text-[11px] tracking-[0.15em] text-board-muted hover:text-board-ink";

export default async function TopNav() {
  const authed = await isAuthenticated();
  const staff = authed && (await checkIsStaff());

  return (
    <header className="sticky top-0 z-30 border-b border-board-line bg-board text-board-ink">
      <div className="mx-auto flex w-full max-w-[1440px] items-stretch px-6 lg:px-10">
        <Link
          href="/"
          className="flex shrink-0 items-center border-r border-board-line py-5 pr-6"
        >
          <Logo size="sm" />
        </Link>

        <div className="hidden items-center border-r border-board-line px-6 md:flex">
          <StatusTicker />
        </div>

        <nav className="ml-auto hidden items-center gap-6 px-8 md:flex">
          {NAV_LINKS.map((link) => (
            <Link key={link.label} href={link.href} className={linkClass}>
              {link.label}
            </Link>
          ))}

          <span className="mx-2 h-4 w-px bg-board-line" />
          <ThemeToggle />

          {authed ? (
            <>
              {staff && (
                <Link href="/admin" className={linkClass}>
                  admin
                </Link>
              )}
              <Link href="/account" className={linkClass}>
                account
              </Link>
              <NotificationBell triggerClassName="text-board-muted hover:text-board-ink" />
              <LogoutButton />
            </>
          ) : (
            <Link href="/login" className={linkClass}>
              sign in
            </Link>
          )}
        </nav>

        {!authed && (
          <Button
            render={<Link href="/register" />}
            nativeButton={false}
            className="hidden h-auto shrink-0 items-center self-stretch bg-signal px-8 font-mono text-[11px] font-semibold tracking-[0.15em] text-white hover:bg-signal/90 md:flex"
          >
            create account
          </Button>
        )}

        <div className="ml-auto flex items-center gap-1 pl-4 md:hidden">
          <MobileNavMenu authed={authed} staff={staff} />
        </div>
      </div>
    </header>
  );
}