"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import * as z from "zod";

import { friendlyAuthError } from "@/components/auth/form-error";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { contactSupport } from "@/lib/api/client";
import { formLabelClass as labelClass } from "@/lib/utils";

const contactSchema = z.object({
  name: z.string().min(1, "Required"),
  email: z.email("Enter a valid email"),
  subject: z.string().min(1, "Required"),
  message: z.string().min(1, "Required").max(5000),
  booking_reference: z.string().optional(),
});

type ContactValues = z.infer<typeof contactSchema>;

export interface ContactFormProps {
  defaultSubject?: string;
  defaultBookingReference?: string;
}

export function ContactForm({ defaultSubject, defaultBookingReference }: ContactFormProps) {
  const form = useForm<ContactValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      name: "",
      email: "",
      subject: defaultSubject ?? "",
      message: "",
      booking_reference: defaultBookingReference ?? "",
    },
  });

  const mutation = useMutation({
    mutationFn: (values: ContactValues) =>
      contactSupport({
        ...values,
        booking_reference: values.booking_reference || undefined,
      }),
  });

  if (mutation.isSuccess) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center">
        <p className="font-semibold">Message sent</p>
        <p className="mt-1 text-sm text-muted-foreground">
          We&apos;ve emailed you a confirmation - our team will reply as soon as possible.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
      className="space-y-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel className={labelClass}>NAME</FieldLabel>
          <Input {...form.register("name")} />
          <FieldError errors={[form.formState.errors.name]} />
        </Field>
        <Field>
          <FieldLabel className={labelClass}>EMAIL</FieldLabel>
          <Input type="email" {...form.register("email")} />
          <FieldError errors={[form.formState.errors.email]} />
        </Field>
      </div>
      <Field>
        <FieldLabel className={labelClass}>BOOKING REFERENCE (OPTIONAL)</FieldLabel>
        <Input placeholder="e.g. ABC123" {...form.register("booking_reference")} />
      </Field>
      <Field>
        <FieldLabel className={labelClass}>SUBJECT</FieldLabel>
        <Input {...form.register("subject")} />
        <FieldError errors={[form.formState.errors.subject]} />
      </Field>
      <Field>
        <FieldLabel className={labelClass}>MESSAGE</FieldLabel>
        <Textarea rows={6} {...form.register("message")} />
        <FieldError errors={[form.formState.errors.message]} />
      </Field>
      {mutation.isError && (
        <p className="text-sm text-destructive">
          {friendlyAuthError(mutation.error, "Couldn't send your message")}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full font-semibold" disabled={mutation.isPending}>
        {mutation.isPending ? "Sending…" : "Send message"}
      </Button>
    </form>
  );
}
