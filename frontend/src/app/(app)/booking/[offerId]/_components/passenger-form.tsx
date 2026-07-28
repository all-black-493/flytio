"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { isValidPhoneNumber } from "react-phone-number-input";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import * as z from "zod";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { OfferPassenger } from "@/lib/api/schemas";
import type { OrderPassenger } from "@/lib/api/types";
import { compactLabelClass as labelClass } from "@/lib/utils";

export type PassengerDetails = Omit<OrderPassenger, "id" | "seat_designator">;

const passportSchema = z.object({
  unique_identifier: z.string().min(1, "Required"),
  issuing_country_code: z
    .string()
    .length(2, "2-letter country code, e.g. KE")
    .transform((v) => v.toUpperCase()),
  expires_on: z.string().min(1, "Required"),
});

const passportOptionalSchema = z.object({
  unique_identifier: z.string().optional(),
  issuing_country_code: z.string().optional(),
  expires_on: z.string().optional(),
});

function buildPassengerSchema(identityDocumentRequired: boolean) {
  return z.object({
    title: z.string().min(1, "Required"),
    gender: z.string().min(1, "Required"),
    given_name: z.string().min(1, "Required"),
    family_name: z.string().min(1, "Required"),
    born_on: z.string().min(1, "Required"),
    email: z.email("Enter a valid email"),
    phone_number: z.string().refine(isValidPhoneNumber, "Enter a valid phone number"),
    passport: identityDocumentRequired ? passportSchema : passportOptionalSchema,
  });
}

function buildPassengersFormSchema(identityDocumentRequired: boolean) {
  return z.object({
    passengers: z.array(buildPassengerSchema(identityDocumentRequired)),
  });
}

type PassengersFormValues = z.infer<ReturnType<typeof buildPassengersFormSchema>>;

const EMPTY_DETAILS: PassengersFormValues["passengers"][number] = {
  title: "mr",
  gender: "m",
  given_name: "",
  family_name: "",
  born_on: "",
  email: "",
  phone_number: "",
  passport: { unique_identifier: "", issuing_country_code: "", expires_on: "" },
};

export interface PassengerFormProps {
  passengers: OfferPassenger[];
  /** From Offer.passenger_identity_documents_required - some itineraries
   * require passport details before Duffel will accept the order. */
  identityDocumentRequired: boolean;
  onBack: () => void;
  onSubmit: (passengers: PassengerDetails[]) => void;
  isSubmitting: boolean;
  submitLabel: string;
}

export function PassengerForm({
  passengers,
  identityDocumentRequired,
  onBack,
  onSubmit,
  isSubmitting,
  submitLabel,
}: PassengerFormProps) {
  const form = useForm<PassengersFormValues>({
    resolver: zodResolver(buildPassengersFormSchema(identityDocumentRequired)),
    defaultValues: { passengers: passengers.map(() => EMPTY_DETAILS) },
  });
  const { fields } = useFieldArray({ control: form.control, name: "passengers" });

  function handleSubmit(values: PassengersFormValues) {
    onSubmit(
      values.passengers.map(({ passport, ...rest }) => ({
        ...rest,
        identity_documents: identityDocumentRequired
          ? [
              {
                unique_identifier: passport.unique_identifier ?? "",
                type: "passport",
                issuing_country_code: passport.issuing_country_code ?? "",
                expires_on: passport.expires_on ?? "",
              },
            ]
          : undefined,
      })),
    );
  }

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
      {fields.map((field, index) => {
        const passenger = passengers[index];
        const errors = form.formState.errors.passengers?.[index];

        return (
          <div key={field.id} className="space-y-4 rounded-xl border p-4">
            <p className="font-mono text-[11px] tracking-[0.2em] text-muted-foreground">
              PASSENGER {index + 1} ·{" "}
              {(passenger?.type ?? "adult").replace(/_/g, " ").toUpperCase()}
            </p>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Controller
                name={`passengers.${index}.title`}
                control={form.control}
                render={({ field: f }) => (
                  <Field>
                    <FieldLabel className={labelClass}>TITLE</FieldLabel>
                    <Select value={f.value} onValueChange={(v) => v && f.onChange(v)}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mr">Mr</SelectItem>
                        <SelectItem value="mrs">Mrs</SelectItem>
                        <SelectItem value="ms">Ms</SelectItem>
                        <SelectItem value="miss">Miss</SelectItem>
                        <SelectItem value="dr">Dr</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                )}
              />
              <Controller
                name={`passengers.${index}.gender`}
                control={form.control}
                render={({ field: f }) => (
                  <Field>
                    <FieldLabel className={labelClass}>GENDER</FieldLabel>
                    <Select value={f.value} onValueChange={(v) => v && f.onChange(v)}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="m">Male</SelectItem>
                        <SelectItem value="f">Female</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                )}
              />
              <Field className="col-span-2 sm:col-span-1">
                <FieldLabel className={labelClass}>DATE OF BIRTH</FieldLabel>
                <Input type="date" {...form.register(`passengers.${index}.born_on`)} />
                <FieldError errors={[errors?.born_on]} />
              </Field>
            </div>

            <Field>
              <FieldLabel className={labelClass}>PHONE</FieldLabel>
              <Controller
                name={`passengers.${index}.phone_number`}
                control={form.control}
                render={({ field: f }) => (
                  <PhoneInput
                    // National format includes the leading trunk 0 (e.g.
                    // Kenya: 0757 573984) - it's stripped automatically
                    // when converted to E.164 (+254757573984), the format
                    // Duffel actually requires. Defaults to Kenya, this
                    // product's primary market.
                    placeholder="0757 573984"
                    defaultCountry="KE"
                    value={f.value}
                    onChange={f.onChange}
                    onBlur={f.onBlur}
                  />
                )}
              />
              <FieldError errors={[errors?.phone_number]} />
            </Field>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel className={labelClass}>GIVEN NAME</FieldLabel>
                <Input {...form.register(`passengers.${index}.given_name`)} />
                <FieldError errors={[errors?.given_name]} />
              </Field>
              <Field>
                <FieldLabel className={labelClass}>FAMILY NAME</FieldLabel>
                <Input {...form.register(`passengers.${index}.family_name`)} />
                <FieldError errors={[errors?.family_name]} />
              </Field>
            </div>

            <Field>
              <FieldLabel className={labelClass}>EMAIL</FieldLabel>
              <Input type="email" {...form.register(`passengers.${index}.email`)} />
              <FieldError errors={[errors?.email]} />
            </Field>

            {identityDocumentRequired && (
              <div className="space-y-3 rounded-lg border border-dashed p-3">
                <p className="text-xs text-muted-foreground">
                  This itinerary requires passport details for every passenger.
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Field>
                    <FieldLabel className={labelClass}>PASSPORT NUMBER</FieldLabel>
                    <Input
                      {...form.register(`passengers.${index}.passport.unique_identifier`)}
                    />
                    <FieldError errors={[errors?.passport?.unique_identifier]} />
                  </Field>
                  <Field>
                    <FieldLabel className={labelClass}>ISSUING COUNTRY</FieldLabel>
                    <Input
                      placeholder="KE"
                      maxLength={2}
                      {...form.register(
                        `passengers.${index}.passport.issuing_country_code`,
                      )}
                    />
                    <FieldError errors={[errors?.passport?.issuing_country_code]} />
                  </Field>
                  <Field>
                    <FieldLabel className={labelClass}>EXPIRY DATE</FieldLabel>
                    <Input
                      type="date"
                      {...form.register(`passengers.${index}.passport.expires_on`)}
                    />
                    <FieldError errors={[errors?.passport?.expires_on]} />
                  </Field>
                </div>
              </div>
            )}
          </div>
        );
      })}

      <div className="flex gap-3">
        <Button type="button" variant="outline" size="lg" onClick={onBack}>
          Back
        </Button>
        <Button
          type="submit"
          size="lg"
          className="flex-1 font-semibold"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Redirecting to payment…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
