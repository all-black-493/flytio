import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/api/client";
import { isAuthenticated } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

const SUBNAV_LINKS = [
  { label: "Dashboard", href: "/admin" },
  { label: "Bookings", href: "/admin/bookings" },
  { label: "Users", href: "/admin/users" },
  { label: "Pricing", href: "/admin/pricing" },
];

// Only shown/reachable for a superuser - group/permission management is
// gated the same way on the backend (utils/rbac.py's require_superuser
// on every /api/admin/groups* and /api/admin/permissions route).
const SUPERUSER_SUBNAV_LINK = { label: "Groups", href: "/admin/groups" };

/** Real enforcement lives on the backend (every /api/admin/* route
 * checks is_staff/permissions itself, see backend/utils/rbac.py) - this
 * is the UX layer, so a non-staff visitor gets redirected home instead
 * of hitting a wall of 403s from every fetch on the page. */
export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  if (!(await isAuthenticated())) redirect("/login?next=/admin");

  let staff = false;
  let superuser = false;
  try {
    const me = await getCurrentUser();
    staff = me.is_staff;
    superuser = me.is_superuser;
  } catch {
    staff = false;
  }
  if (!staff) redirect("/");

  const links = superuser ? [...SUBNAV_LINKS, SUPERUSER_SUBNAV_LINK] : SUBNAV_LINKS;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-mono text-[11px] tracking-[0.25em] text-muted-foreground">
          STAFF ADMIN
        </h1>
        <nav className="flex flex-wrap items-center gap-2">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "rounded-lg border px-3 py-1.5 font-mono text-[11px] tracking-[0.15em] text-muted-foreground",
                "transition-colors hover:border-signal hover:text-foreground hover:bg-muted/50",
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
      {children}
    </div>
  );
}
