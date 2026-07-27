"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useForm } from "react-hook-form";
import * as z from "zod";

import { AuthCard } from "@/components/auth/auth-card";
import { friendlyAuthError } from "@/components/auth/form-error";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { forgotPassword } from "@/lib/api/client";
import { formLabelClass as labelClass } from "@/lib/utils";

const forgotPasswordSchema = z.object({
  email: z.email("Enter a valid email"),
});

type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;

export function ForgotPasswordForm() {
  const form = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  const mutation = useMutation({
    mutationFn: (values: ForgotPasswordValues) => forgotPassword(values.email),
  });

  // The backend always returns the same ack whether or not the email is
  // registered (no user-enumeration) - the UI must not reveal that
  // either, so success here means "request sent", not "email found".
  if (mutation.isSuccess) {
    return (
      <AuthCard
        strip="CHECK-IN"
        gate="GATE 01"
        title="Check your email"
        subtitle="If that email is registered, we've sent a link to reset your password. It expires in 30 minutes."
        footer={
          <Link href="/login" className="font-semibold text-signal">
            Back to sign in
          </Link>
        }
      >
        <div />
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
