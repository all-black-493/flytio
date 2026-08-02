"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";

import { friendlyAuthError } from "@/components/auth/form-error";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { changePassword } from "@/lib/api/client";
import { formLabelClass as labelClass } from "@/lib/utils";

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Required"),
    newPassword: z.string().min(8, "Must be at least 8 characters"),
    confirm: z.string().min(8, "Must be at least 8 characters"),
  })
  .refine((data) => data.newPassword === data.confirm, {
    message: "Passwords do not match",
    path: ["confirm"],
  });

type ChangePasswordValues = z.infer<typeof changePasswordSchema>;

/** Self-service password change from the account page - distinct from
 * the /forgot-password + /reset-password flow, which is for when you
 * don't remember your current password. */
export function ChangePasswordForm() {
  const form = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirm: "" },
  });

  const mutation = useMutation({
    mutationFn: (values: ChangePasswordValues) =>
      changePassword(values.currentPassword, values.newPassword),
    onSuccess: () => {
      toast.success("Password updated.");
      form.reset();
    },
    onError: (error) => {
      toast.error(friendlyAuthError(error, "Couldn't update your password"));
    },
  });

  return (
    <form
      onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
      className="mt-4 grid gap-4 border-t border-dashed pt-4"
    >
      <p className="font-mono text-[11px] tracking-[0.2em] text-muted-foreground">
        CHANGE PASSWORD
      </p>
      <Field>
        <FieldLabel htmlFor="current-password" className={labelClass}>
          CURRENT PASSWORD
        </FieldLabel>
        <Input
          id="current-password"
          type="password"
          autoComplete="current-password"
          {...form.register("currentPassword")}
        />
        <FieldError errors={[form.formState.errors.currentPassword]} />
      </Field>
      <Field>
        <FieldLabel htmlFor="new-password" className={labelClass}>
          NEW PASSWORD
        </FieldLabel>
        <Input
          id="new-password"
          type="password"
          autoComplete="new-password"
          {...form.register("newPassword")}
        />
        <FieldError errors={[form.formState.errors.newPassword]} />
      </Field>
      <Field>
        <FieldLabel htmlFor="confirm-password" className={labelClass}>
          CONFIRM NEW PASSWORD
        </FieldLabel>
        <Input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          {...form.register("confirm")}
        />
        <FieldError errors={[form.formState.errors.confirm]} />
      </Field>
      <Button
        type="submit"
        variant="outline"
        className="w-full font-semibold"
        disabled={mutation.isPending}
      >
        {mutation.isPending ? "Updating…" : "Update password"}
      </Button>
    </form>
  );
}
