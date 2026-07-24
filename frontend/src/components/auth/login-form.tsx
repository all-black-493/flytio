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
import { loginUser } from "@/lib/api/client";

const labelClass = "font-mono text-[11px] tracking-widest text-muted-foreground";

const loginSchema = z.object({
  email: z.email("Enter a valid email"),
  password: z.string().min(1, "Required"),
});

type LoginValues = z.infer<typeof loginSchema>;

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const mutation = useMutation({
    mutationFn: (values: LoginValues) => loginUser(values.email, values.password),
    onSuccess: () => {
      toast.success("Signed in");
      router.push(next || "/");
      router.refresh();
    },
    onError: (error) => {
      toast.error(friendlyAuthError(error, "Sign in failed"));
    },
  });

  return (
    <AuthCard
      strip="CHECK-IN"
      gate="GATE 01"
      title="Welcome back"
      subtitle="Sign in to manage your trips and fares."
      footer={
        <>
          New to flyt?{" "}
          <Link href="/register" className="font-semibold text-signal">
            Create an account
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
        <Field>
          <FieldLabel htmlFor="password" className={labelClass}>
            PASSWORD
          </FieldLabel>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            {...form.register("password")}
          />
          <FieldError errors={[form.formState.errors.password]} />
        </Field>
        <Button
          type="submit"
          size="lg"
          className="w-full font-semibold"
          disabled={mutation.isPending}
        >
          {mutation.isPending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </AuthCard>
  );
}
