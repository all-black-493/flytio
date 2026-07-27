"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";

import { AuthCard } from "@/components/auth/auth-card";
import { friendlyAuthError } from "@/components/auth/form-error";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { resetPassword } from "@/lib/api/client";
import { formLabelClass as labelClass } from "@/lib/utils";

const resetPasswordSchema = z
  .object({
    password: z.string().min(8, "Must be at least 8 characters"),
    confirm: z.string().min(8, "Must be at least 8 characters"),
  })
  .refine((data) => data.password === data.confirm, {
    message: "Passwords do not match",
    path: ["confirm"],
  });

type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;

export function ResetPasswordForm({ token }: { token: string | undefined }) {
  const router = useRouter();
  const form = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirm: "" },
  });

  const mutation = useMutation({
    mutationFn: (values: ResetPasswordValues) => resetPassword(token ?? "", values.password),
    onSuccess: () => {
      toast.success("Password updated — sign in with your new password.");
      router.push("/login");
    },
    onError: (error) => {
      toast.error(friendlyAuthError(error, "That reset link is invalid or has expired"));
    },
  });

  if (!token) {
    return (
      <AuthCard
        strip="CHECK-IN"
        gate="GATE 01"
        title="Invalid reset link"
        subtitle="This link is missing its token. Request a new one below."
        footer={
          <Link href="/forgot-password" className="font-semibold text-signal">
            Request a new link
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
      title="Choose a new password"
      subtitle="Make it something you haven't used before."
      footer={
        <Link href="/login" className="font-semibold text-signal">
          Back to sign in
        </Link>
      }
    >
      <form
        onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
        className="mt-6 grid gap-4"
      >
        <Field>
          <FieldLabel htmlFor="password" className={labelClass}>
            NEW PASSWORD
          </FieldLabel>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            {...form.register("password")}
          />
          <FieldError errors={[form.formState.errors.password]} />
        </Field>
        <Field>
          <FieldLabel htmlFor="confirm" className={labelClass}>
            CONFIRM PASSWORD
          </FieldLabel>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            {...form.register("confirm")}
          />
          <FieldError errors={[form.formState.errors.confirm]} />
        </Field>
        <Button
          type="submit"
          size="lg"
          className="w-full font-semibold"
          disabled={mutation.isPending}
        >
          {mutation.isPending ? "Updating…" : "Update password"}
        </Button>
      </form>
    </AuthCard>
  );
}
