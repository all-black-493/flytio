import Link from "next/link";

export const metadata = { title: "Cookie Policy | flyt" };

// Placeholder copy only - needs real legal review before launch, same as
// /terms and /privacy. Reflects the actual, current cookie/storage
// inventory (verified against the codebase, not assumed).
export default function CookiesPage() {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 px-4 py-16 text-sm leading-relaxed">
      <h1 className="text-2xl font-bold tracking-tight">Cookie Policy</h1>
      <p className="text-muted-foreground">Last updated: placeholder - not yet legally reviewed.</p>
      <p>
        flyt uses <strong>strictly necessary</strong>{" "}cookies and storage to run the site -
        these don&apos;t require your consent under GDPR, UK PECR, or Kenya&apos;s Data
        Protection Act. We also use <strong>Google Analytics</strong>{" "}to understand how the
        site is used, but only after you accept the cookie banner shown on your first visit -
        nothing analytics-related runs before that choice, and you can change it at any time via
        &quot;Cookie preferences&quot; in the footer.
      </p>

      <h2 className="text-lg font-semibold">What we set</h2>
      <table className="w-full border-collapse text-left text-xs">
        <thead>
          <tr className="border-b">
            <th className="py-2 pr-3 font-semibold">Name</th>
            <th className="py-2 pr-3 font-semibold">Type</th>
            <th className="py-2 pr-3 font-semibold">Purpose</th>
            <th className="py-2 font-semibold">Duration</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b align-top">
            <td className="py-2 pr-3 font-mono">flyt_token</td>
            <td className="py-2 pr-3">Essential cookie</td>
            <td className="py-2 pr-3">Keeps you signed in, httpOnly (invisible to page scripts)</td>
            <td className="py-2">Session / account settings</td>
          </tr>
          <tr className="border-b align-top">
            <td className="py-2 pr-3 font-mono">theme</td>
            <td className="py-2 pr-3">Local storage</td>
            <td className="py-2 pr-3">Remembers your light/dark mode preference</td>
            <td className="py-2">Until cleared</td>
          </tr>
          <tr className="border-b align-top">
            <td className="py-2 pr-3 font-mono">flyt_cookie_consent</td>
            <td className="py-2 pr-3">Local storage</td>
            <td className="py-2 pr-3">Remembers your cookie banner choice (accept/reject)</td>
            <td className="py-2">Until cleared</td>
          </tr>
          <tr className="align-top">
            <td className="py-2 pr-3 font-mono">_ga, _ga_*</td>
            <td className="py-2 pr-3">Analytics cookie (Google Analytics)</td>
            <td className="py-2 pr-3">
              Distinguishes visitors and sessions for site-usage analytics - only set if you
              accept
            </td>
            <td className="py-2">Up to 2 years</td>
          </tr>
        </tbody>
      </table>

      <h2 className="text-lg font-semibold">Third parties</h2>
      <p>
        If you pay by card, our payment partner&apos;s embedded card form may set its own
        cookies for fraud prevention - these are set directly by them, not by flyt, and are
        outside our control. If you pay via M-Pesa/mobile money, you&apos;re redirected to our
        payment provider&apos;s own site, which has its own separate cookie and privacy
        practices. Google Analytics is a third party too - see{" "}
        <a
          href="https://policies.google.com/technologies/partner-sites"
          className="font-semibold text-signal"
          target="_blank"
          rel="noreferrer"
        >
          how Google uses data from sites that use its services
        </a>
        .
      </p>

      <h2 className="text-lg font-semibold">Managing cookies</h2>
      <p>
        The essential cookies above are required for the site to work - blocking or clearing
        them in your browser will sign you out. Analytics cookies are entirely your choice: use
        &quot;Cookie preferences&quot; in the footer at any time to change your decision. You can
        also manage cookies generally through your browser&apos;s settings.
      </p>

      <p className="text-muted-foreground">
        See also our{" "}
        <Link href="/privacy" className="font-semibold text-signal">
          Privacy Policy
        </Link>
        .
      </p>
    </div>
  );
}
