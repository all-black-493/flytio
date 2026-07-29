import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/api/client";
import { isAuthenticated } from "@/lib/auth/session";

const SUBNAV_LINKS = [
  { label: "Dashboard", href: "/admin" },
  { label: "Bookings", href: "/admin/bookings" },
  { label: "Users", href: "/admin/users" },
];

/** Real enforcement lives on the backend (every /api/admin/* route
 * checks is_staff/permissions itself, see backend/utils/rbac.py) - this
 * is the UX layer, so a non-staff visitor gets redirected home instead
 * of hitting a wall of 403s from every fetch on the page. */
export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  if (!(await isAuthenticated())) redirect("/login?next=/admin");

  let staff = false;
  try {
    staff = (await getCurrentUser()).is_staff;
  } catch {
    staff = false;
  }
  if (!staff) redirect("/");

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="font-mono text-[11px] tracking-[0.25em] text-muted-foreground">
          STAFF ADMIN
        </h1>
        <nav className="flex items-center gap-4">
          {SUBNAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="font-mono text-[11px] tracking-[0.15em] text-muted-foreground hover:text-foreground"
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
