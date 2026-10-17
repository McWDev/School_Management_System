"use client";

import { FormField } from "@/components/forms/form-field";
import { Input, Textarea } from "@/components/ui/input";

export type SchoolDetailsValues = {
  name: string;
  legalName: string | null;
  contactEmail: string | null;
  phone: string | null;
  address: string | null;
  currencyCode: string;
  timezone: string;
};

const COMMON_TIMEZONES = [
  "Africa/Mogadishu",
  "Africa/Nairobi",
  "Africa/Addis_Ababa",
  "Africa/Djibouti",
  "Asia/Dubai",
  "Europe/London",
  "UTC",
];

/** Shared school detail fields for registration and the school profile form. */
export function SchoolDetailFields({
  idPrefix,
  initial,
  errors,
}: {
  idPrefix: string;
  initial?: SchoolDetailsValues;
  errors: Record<string, string[]>;
}) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id={`${idPrefix}-name`} label="School name" required error={errors.name?.[0]}>
          {(props) => <Input {...props} name="name" defaultValue={initial?.name} maxLength={200} />}
        </FormField>
        <FormField id={`${idPrefix}-legal`} label="Legal name" error={errors.legalName?.[0]}>
          {(props) => <Input {...props} name="legalName" defaultValue={initial?.legalName ?? ""} />}
        </FormField>
        <FormField id={`${idPrefix}-email`} label="Contact email" error={errors.contactEmail?.[0]}>
          {(props) => (
            <Input
              {...props}
              name="contactEmail"
              type="email"
              defaultValue={initial?.contactEmail ?? ""}
            />
          )}
        </FormField>
        <FormField id={`${idPrefix}-phone`} label="Phone" error={errors.phone?.[0]}>
          {(props) => (
            <Input {...props} name="phone" type="tel" defaultValue={initial?.phone ?? ""} />
          )}
        </FormField>
      </div>
      <FormField id={`${idPrefix}-address`} label="Address" error={errors.address?.[0]}>
        {(props) => <Textarea {...props} name="address" defaultValue={initial?.address ?? ""} />}
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          id={`${idPrefix}-currency`}
          label="Currency"
          required
          helperText="3-letter ISO code. One currency per school."
          error={errors.currencyCode?.[0]}
        >
          {(props) => (
            <Input
              {...props}
              name="currencyCode"
              defaultValue={initial?.currencyCode ?? "USD"}
              maxLength={3}
              className="uppercase"
            />
          )}
        </FormField>
        <FormField
          id={`${idPrefix}-timezone`}
          label="Time zone"
          required
          helperText="Used to show dates and times."
          error={errors.timezone?.[0]}
        >
          {(props) => (
            <>
              <Input
                {...props}
                name="timezone"
                list={`${idPrefix}-timezones`}
                defaultValue={initial?.timezone ?? "Africa/Mogadishu"}
              />
              <datalist id={`${idPrefix}-timezones`}>
                {COMMON_TIMEZONES.map((tz) => (
                  <option key={tz} value={tz} />
                ))}
              </datalist>
            </>
          )}
        </FormField>
      </div>
    </>
  );
}
