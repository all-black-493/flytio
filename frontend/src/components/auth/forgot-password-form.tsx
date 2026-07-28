"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";

import { AuthCard } from "@/components/auth/auth-card";
import { ExpiryCountdown } from "@/components/auth/expiry-countdown";
import { friendlyAuthError } from "@/components/auth/form-error";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { forgotPassword } from "@/lib/api/client";
import { formLabelClass as labelClass } from "@/lib/utils";

// Matches backend/utils/security.py's PASSWORD_RESET_TOKEN_EXPIRE_MINUTES -
// there's no token to read an `exp` claim from yet at this point (the
// email hasn't been clicked), so this is the one place that duration has
// to be duplicated rather than decoded.
const RESET_LINK_EXPIRY_MINUTES = 30;

const forgotPasswordSchema = z.object({
  email: z.email("Enter a valid email"),
});

type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;

export function ForgotPasswordForm() {
  const form = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });
  // Set once, the instant the request succeeds - a single state update on
  // success (not a per-second one) is exactly what useState is for; the
  // ticking itself still never touches React state (see ExpiryCountdown).
  const [expiresAtMs, setExpiresAtMs] = useState<number | null>(null);

  const mutation = useMutation({
    mutationFn: (values: ForgotPasswordValues) => forgotPassword(values.email),
    onSuccess: () => {
      setExpiresAtMs(Date.now() + RESET_LINK_EXPIRY_MINUTES * 60_000);
    },
  });

  // The backend always returns the same ack whether or not the email is
  // registered (no user-enumeration) - the UI must not reveal that
  // either, so success here means "request sent", not "email found".
  if (mutation.isSuccess && expiresAtMs !== null) {
    return (
      <AuthCard
        strip="CHECK-IN"
        gate="GATE 01"
        title="Check your email"
        subtitle="If that email is registered, we've sent a link to reset your password."
        footer={
          <Link href="/login" className="font-semibold text-signal">
            Back to sign in
          </Link>
        }
      >
        <p className="text-center font-mono text-[11px] tracking-widest text-muted-foreground">
          IT EXPIRES IN <ExpiryCountdown expiresAtMs={expiresAtMs} />
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      strip="CHECK-IN"
      gate="GATE 01"
      title="Forgot your password?"
      subtitle="Enter your email and we'll send you a link to reset it."
      footer={
        <>
          Remembered it?{" "}
          <Link href="/login" className="font-semibold text-signal">
            Sign in
          </Link>
        </>
      }
    >
      <form
        onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
        className="mt-6 grid gap-4"
      >
        <Field>
          <FieldLabel htmlFor="email" className={labelClass}>
            EMAIL
          </FieldLabel>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            {...form.register("email")}
          />
          <FieldError errors={[form.formState.errors.email]} />
        </Field>
        {mutation.isError && (
          <p className="text-sm text-destructive">
            {friendlyAuthError(mutation.error, "Couldn't send the reset link")}
          </p>
        )}
        <Button
          type="submit"
          size="lg"
          className="w-full font-semibold"
          disabled={mutation.isPending}
        >
          {mutation.isPending ? "Sending…" : "Send reset link"}
        </Button>
      </form>
    </AuthCard>
  );
}
