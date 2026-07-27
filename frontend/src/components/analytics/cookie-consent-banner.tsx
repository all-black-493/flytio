"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useCookieConsent } from "@/lib/analytics/cookie-consent";

export function CookieConsentBanner() {
  const { status, grant, deny } = useCookieConsent();

  if (status !== "unknown") {
    return null;
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 p-4 sm:p-6">
      <Card className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-5 shadow-lg sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          We use analytics cookies to understand how flyt is used, so we can improve it. No
          analytics run until you accept. See our{" "}
          <Link href="/cookies" className="font-semibold text-signal">
            Cookie Policy
          </Link>
          .
        </p>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" onClick={deny}>
            Reject
          </Button>
          <Button onClick={grant}>Accept</Button>
        </div>
      </Card>
    </div>
  );
}
