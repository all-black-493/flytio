"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";

import { AuthCard } from "@/components/auth/auth-card";
import { AuthDivider } from "@/components/auth/auth-divider";
import { friendlyAuthError } from "@/components/auth/form-error";
import { GoogleSignInButton } from "@/components/auth/google-signin-button";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { registerUser } from "@/lib/api/client";
import { formLabelClass as labelClass } from "@/lib/utils";

const registerSchema = z
  .object({
    email: z.email("Enter a valid email"),
    password: z.string().min(8, "Must be at least 8 characters"),
    confirm: z.string().min(8, "Must be at least 8 characters"),
  })
  .refine((data) => data.password === data.confirm, {
    message: "Passwords do not match",
    path: ["confirm"],
  });

type RegisterValues = z.infer<typeof registerSchema>;

export function RegisterForm() {
  const router = useRouter();
  const form = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: "", password: "", confirm: "" },
  });

  const mutation = useMutation({
    mutationFn: (values: RegisterValues) => registerUser(values.email, values.password),
    onSuccess: () => {
      toast.success("Account created — sign in to continue.");
      router.push("/login");
    },
    onError: (error) => {
      toast.error(friendlyAuthError(error, "Registration failed"));
    },
  });

  return (
    <AuthCard
      strip="NEW PASSENGER"
      gate="GATE 02"
      title="Join flyt"
      subtitle="One account for your trips — or your whole team's."
      footer={
        <>
          Already flying with us?{" "}
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
        <Field>
          <FieldLabel htmlFor="password" className={labelClass}>
            PASSWORD
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
          {mutation.isPending ? "Creating account…" : "Create account"}
        </Button>
      </form>
      <div className="mt-4 grid gap-4">
        <AuthDivider label="or continue with" />
        <GoogleSignInButton />
      </div>
    </AuthCard>
  );
}
