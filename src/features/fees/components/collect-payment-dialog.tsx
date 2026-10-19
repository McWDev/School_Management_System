"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { CircleCheck } from "lucide-react";
import { FormAlert } from "@/components/forms/form-alert";
import { FormField } from "@/components/forms/form-field";
import { keepValues } from "@/components/forms/keep-values";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Input, Select, Textarea } from "@/components/ui/input";
import { IDLE, type FormResult } from "@/lib/form-result";
import { formatMoney, fromCents, toCents } from "@/lib/money";
import { PAYMENT_METHODS, paymentMethodLabels } from "../schemas";

type Result = FormResult<{ paymentId: string; receiptNumber: string }>;

type Props = {
  studentName: string;
  /** Open charges, oldest first. */
  charges: { id: string; label: string; remaining: string }[];
  currencyCode: string;
  /** Today in the school's time zone (default payment date). */
  today: string;
  defaultOpen?: boolean;
  action: (prev: Result, formData: FormData) => Promise<Result>;
};

export function CollectPaymentDialog(props: Props) {
  const [open, setOpen] = useState(props.defaultOpen ?? false);
  const [formKey, setFormKey] = useState(0);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setFormKey((k) => k + 1);
      }}
    >
      <DialogTrigger asChild>
        <Button>Collect payment</Button>
      </DialogTrigger>
      <DialogContent
        title={`Collect payment from ${props.studentName}`}
        description="Tick the fees being paid. Change an amount for a part payment."
        className="max-w-xl"
      >
        <CollectForm
          key={formKey}
          {...props}
          onClose={() => {
            setOpen(false);
            setFormKey((k) => k + 1);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

/** Whole cents of a typed amount, or null when it is not a valid amount. */
function cents(value: string) {
  return /^\d{1,10}(\.\d{1,2})?$/.test(value.trim()) ? toCents(value) : null;
}

function CollectForm({
  charges,
  currencyCode,
  today,
  action,
  onClose,
}: Props & { onClose: () => void }) {
  const [state, formAction, pending] = useActionState(action, IDLE as Result);
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(charges.map((c) => [c.id, c.remaining])),
  );
  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};

  if (state.status === "success") {
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <CircleCheck className="size-10 text-success" aria-hidden="true" />
        <p role="status" className="font-medium">
          {state.message}
        </p>
        <div className="flex gap-2">
          <Button asChild>
            <Link href={`/fees/receipts/${state.data.paymentId}`} onClick={onClose}>
              Print receipt
            </Link>
          </Button>
          <DialogClose asChild>
            <Button variant="outline">Close</Button>
          </DialogClose>
        </div>
      </div>
    );
  }

  const total = charges.reduce((sum, c) => {
    if (!ticked[c.id]) return sum;
    return sum + (cents(amounts[c.id] ?? "") ?? BigInt(0));
  }, BigInt(0));

  return (
    <form onSubmit={keepValues(formAction)} className="flex flex-col gap-4" noValidate>
      {state.status === "error" && <FormAlert>{state.message}</FormAlert>}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">
          Fees to pay
          <span className="text-danger" aria-hidden="true">
            *
          </span>
        </legend>
        {charges.length === 0 && (
          <p className="text-sm text-muted-foreground">Nothing is owed right now.</p>
        )}
        <ul className="flex flex-col divide-y rounded-md border">
          {charges.map((charge) => (
            <li key={charge.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
              <label className="flex min-w-40 flex-1 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="pay"
                  value={charge.id}
                  checked={ticked[charge.id] ?? false}
                  onChange={(e) => setTicked((t) => ({ ...t, [charge.id]: e.target.checked }))}
                  className="size-4 accent-[var(--color-primary)]"
                />
                <span>
                  <span className="block font-medium">{charge.label}</span>
                  <span className="block text-xs text-muted-foreground">
                    Owed {formatMoney(charge.remaining, currencyCode)}
                  </span>
                </span>
              </label>
              <Input
                name={`amount:${charge.id}`}
                aria-label={`Amount for ${charge.label}`}
                inputMode="decimal"
                value={amounts[charge.id] ?? ""}
                onChange={(e) => setAmounts((a) => ({ ...a, [charge.id]: e.target.value }))}
                disabled={!ticked[charge.id]}
                className="w-32"
              />
            </li>
          ))}
        </ul>
        {errors.lines?.[0] && (
          <p role="alert" className="text-xs font-medium text-danger">
            {errors.lines[0]}
          </p>
        )}
        <p className="text-right text-sm">
          Total:{" "}
          <strong className="tabular-nums">{formatMoney(fromCents(total), currencyCode)}</strong>
        </p>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="payment-date" label="Payment date" required error={errors.paymentDate?.[0]}>
          {(p) => <Input {...p} name="paymentDate" type="date" max={today} defaultValue={today} />}
        </FormField>
        <FormField id="payment-method" label="Method" required error={errors.method?.[0]}>
          {(p) => (
            <Select {...p} name="method" defaultValue="cash">
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {paymentMethodLabels[m]}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <FormField
          id="payment-reference"
          label="Reference"
          helperText="e.g. mobile money or bank transaction number."
          error={errors.reference?.[0]}
          className="sm:col-span-2"
        >
          {(p) => <Input {...p} name="reference" maxLength={100} />}
        </FormField>
        <FormField
          id="payment-notes"
          label="Notes"
          error={errors.notes?.[0]}
          className="sm:col-span-2"
        >
          {(p) => <Textarea {...p} name="notes" rows={2} maxLength={500} />}
        </FormField>
      </div>

      <div className="flex justify-end gap-2">
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={pending || charges.length === 0}>
          {pending ? "Saving…" : "Record payment"}
        </Button>
      </div>
    </form>
  );
}
