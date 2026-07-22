"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { registerUser } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const labelClass =
  "font-mono text-[11px] tracking-widest text-muted-foreground";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password"));
    if (password !== String(form.get("confirm"))) {
      setError("Passwords do not match");
      return;
    }
    setError(null);
    setPending(true);
    try {
      await registerUser(String(form.get("email")), password);
      router.push("/login");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Registration failed");
      setPending(false);
    }
  }

  return (
    <Card className="w-full max-w-sm overflow-hidden py-0 gap-0 shadow-xl">
      <div className="flex items-center justify-between bg-board px-6 py-3">
        <span className="font-mono text-[11px] tracking-[0.25em] text-board-muted">
          NEW PASSENGER
        </span>
        <span className="font-mono text-[11px] tracking-[0.25em] text-signal">
          GATE 02
        </span>
      </div>
      <CardContent className="p-6">
        <h1 className="text-2xl font-bold tracking-tight">Join flyt</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          One account for your trips — or your whole team&apos;s.
        </p>
        <form onSubmit={onSubmit} className="mt-6 grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="email" className={labelClass}>
              EMAIL
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              required
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="password" className={labelClass}>
              PASSWORD
            </Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="confirm" className={labelClass}>
              CONFIRM PASSWORD
            </Label>
            <Input
              id="confirm"
              name="confirm"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button
            type="submit"
            size="lg"
            className="w-full font-semibold"
            disabled={pending}
          >
            {pending ? "Creating account…" : "Create account"}
          </Button>
        </form>
        <p className="mt-5 border-t border-dashed pt-4 text-sm text-muted-foreground">
          Already flying with us?{" "}
          <Link href="/login" className="font-semibold text-signal">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
