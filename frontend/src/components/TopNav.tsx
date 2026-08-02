import Link from "next/link";

import { LogoutButton } from "@/components/auth/logout-button";
import Logo from "@/components/Logo";
import { MobileNavMenu } from "@/components/MobileNavMenu";
import { NavLink } from "@/components/NavLink";
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

        {/* command rail: full-height uppercase sectors with a lit active tab */}
        <nav className="ml-auto hidden items-stretch md:flex">
          {NAV_LINKS.map((link) => (
            <NavLink key={link.label} href={link.href} className="px-4">
              {link.label}
            </NavLink>
          ))}

          {/* utilities cell, fenced off from the sectors like the ticker/logo */}
          <div className="ml-2 flex items-stretch gap-5 border-l border-board-line pl-6">
            <span className="flex items-center">
              <ThemeToggle />
            </span>

            {authed ? (
              <>
                {staff && (
                  <NavLink href="/admin" className="px-0">
                    admin
                  </NavLink>
                )}
                <NavLink href="/account" className="px-0">
                  account
                </NavLink>
                <span className="flex items-center">
                  <NotificationBell triggerClassName="text-board-muted hover:text-board-ink" />
                </span>
                <span className="flex items-center">
                  <LogoutButton className="uppercase tracking-[0.2em]" />
                </span>
              </>
            ) : (
              <NavLink href="/login" className="px-0">
                sign in
              </NavLink>
            )}
          </div>
        </nav>

        {!authed && (
          <Button
            render={<Link href="/register" />}
            nativeButton={false}
            className="ml-4 hidden h-auto shrink-0 items-center self-stretch bg-signal px-8 font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-white hover:bg-signal/90 md:flex"
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
