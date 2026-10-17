"use client";

import { FormField } from "@/components/forms/form-field";
import { Input, Textarea } from "@/components/ui/input";

export type SchoolProfileValues = {
  name: string;
  legalName: string | null;
  managerName: string | null;
  contactEmail: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  motto: string | null;
};

type Errors = Record<string, string[]>;

/** Letterhead fields of the School Profile form. */
export function SchoolProfileFields({
  initial,
  errors,
}: {
  initial?: SchoolProfileValues;
  errors: Errors;
}) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="profile-name" label="School name" required error={errors.name?.[0]}>
          {(props) => <Input {...props} name="name" defaultValue={initial?.name} maxLength={200} />}
        </FormField>
        <FormField
          id="profile-manager"
          label="Manager name"
          helperText="Head of school, printed on letters and reports."
          error={errors.managerName?.[0]}
        >
          {(props) => (
            <Input {...props} name="managerName" defaultValue={initial?.managerName ?? ""} />
          )}
        </FormField>
        <FormField id="profile-email" label="Official email" error={errors.contactEmail?.[0]}>
          {(props) => (
            <Input
              {...props}
              name="contactEmail"
              type="email"
              defaultValue={initial?.contactEmail ?? ""}
            />
          )}
        </FormField>
        <FormField id="profile-phone" label="Phone" error={errors.phone?.[0]}>
          {(props) => (
            <Input {...props} name="phone" type="tel" defaultValue={initial?.phone ?? ""} />
          )}
        </FormField>
        <FormField
          id="profile-website"
          label="Website"
          helperText="e.g. www.yourschool.so"
          error={errors.website?.[0]}
        >
          {(props) => (
            <Input
              {...props}
              name="website"
              inputMode="url"
              defaultValue={initial?.website ?? ""}
            />
          )}
        </FormField>
        <FormField id="profile-motto" label="School motto" error={errors.motto?.[0]}>
          {(props) => (
            <Input {...props} name="motto" defaultValue={initial?.motto ?? ""} maxLength={200} />
          )}
        </FormField>
      </div>
      <FormField id="profile-address" label="Address" error={errors.address?.[0]}>
        {(props) => <Textarea {...props} name="address" defaultValue={initial?.address ?? ""} />}
      </FormField>
      <FormField
        id="profile-legal"
        label="Legal name (optional)"
        helperText="Only if the registered name differs from the school name."
        error={errors.legalName?.[0]}
      >
        {(props) => <Input {...props} name="legalName" defaultValue={initial?.legalName ?? ""} />}
      </FormField>
    </>
  );
}

const COMMON_TIMEZONES = [
  "Africa/Mogadishu",
  "Africa/Nairobi",
  "Africa/Addis_Ababa",
  "Africa/Djibouti",
  "Asia/Dubai",
  "Europe/London",
  "UTC",
];

/** Fields for registering a school (platform). */
export function SchoolRegistrationFields({ errors }: { errors: Errors }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="register-name" label="School name" required error={errors.name?.[0]}>
          {(props) => <Input {...props} name="name" maxLength={200} />}
        </FormField>
        <FormField id="register-email" label="Official email" error={errors.contactEmail?.[0]}>
          {(props) => <Input {...props} name="contactEmail" type="email" />}
        </FormField>
        <FormField id="register-phone" label="Phone" error={errors.phone?.[0]}>
          {(props) => <Input {...props} name="phone" type="tel" />}
        </FormField>
        <FormField id="register-address" label="Address" error={errors.address?.[0]}>
          {(props) => <Input {...props} name="address" />}
        </FormField>
        <FormField
          id="register-currency"
          label="Currency"
          required
          helperText="3-letter ISO code. One currency per school."
          error={errors.currencyCode?.[0]}
        >
          {(props) => (
            <Input
              {...props}
              name="currencyCode"
              defaultValue="USD"
              maxLength={3}
              className="uppercase"
            />
          )}
        </FormField>
        <FormField id="register-timezone" label="Time zone" required error={errors.timezone?.[0]}>
          {(props) => (
            <>
              <Input
                {...props}
                name="timezone"
                list="register-timezones"
                defaultValue="Africa/Mogadishu"
              />
              <datalist id="register-timezones">
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
