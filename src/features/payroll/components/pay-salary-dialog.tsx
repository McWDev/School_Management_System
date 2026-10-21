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
import { PAYMENT_METHODS, paymentMethodLabels } from "@/features/fees/schemas";

type Result = FormResult<{ paymentId: string; payslipNumber: string }>;

type Props = {
  staffName: string;
  monthLabel: string;
  baseSalary: string;
  bonus: string;
  deduction: string;
  note: string | null;
  paid: string;
  currencyCode: string;
  /** Today in the school's time zone (default payment date). */
  today: string;
  action: (prev: Result, formData: FormData) => Promise<Result>;
};

/** "300.00" → "300", "0.00" → "" for editing. */
function plain(amount: string) {
  return amount === "0.00" ? "" : amount.replace(/\.00$/, "");
}

/** Whole cents of a typed amount ("" is 0), or null when it is not an amount. */
function cents(value: string) {
  if (value.trim() === "") return BigInt(0);
  return /^\d{1,10}(\.\d{1,2})?$/.test(value.trim()) ? toCents(value) : null;
}

export function PaySalaryDialog(props: Props) {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const close = () => {
    setOpen(false);
    setFormKey((k) => k + 1);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setFormKey((k) => k + 1);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          Pay<span className="sr-only"> {props.staffName}</span>
        </Button>
      </DialogTrigger>
      <DialogContent
        title={`Pay ${props.staffName} · ${props.monthLabel}`}
        description="Add a bonus or deduction if needed. Pay the full amount or part of it."
        className="max-w-lg"
      >
        <PayForm key={formKey} {...props} onClose={close} />
      </DialogContent>
    </Dialog>
  );
}

function PayForm({
  baseSalary,
  bonus,
  deduction,
  note,
  paid,
  currencyCode,
  today,
  action,
  onClose,
}: Props & { onClose: () => void }) {
  const [state, formAction, pending] = useActionState(action, IDLE as Result);
  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const [bonusText, setBonusText] = useState(plain(bonus));
  const [deductionText, setDeductionText] = useState(plain(deduction));
  const b = cents(bonusText);
  const d = cents(deductionText);
  const net = b !== null && d !== null ? toCents(baseSalary) + b - d : null;
  const remaining = net !== null ? net - toCents(paid) : null;
  const [amount, setAmount] = useState(() =>
    remaining !== null && remaining > BigInt(0) ? plain(fromCents(remaining)) : "",
  );
  const money = (value: bigint | string) =>
    formatMoney(typeof value === "string" ? value : fromCents(value), currencyCode);

  if (state.status === "success") {
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <CircleCheck className="size-10 text-success" aria-hidden="true" />
        <p role="status" className="font-medium">
          {state.message}
        </p>
        <div className="flex gap-2">
          <Button asChild>
            <Link href={`/staff/salaries/payslips/${state.data.paymentId}`} onClick={onClose}>
              Print payslip
            </Link>
          </Button>
          <DialogClose asChild>
            <Button variant="outline">Close</Button>
          </DialogClose>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={keepValues(formAction)} className="flex flex-col gap-4" noValidate>
      {state.status === "error" && <FormAlert>{state.message}</FormAlert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          id="pay-bonus"
          label={`Bonus (${currencyCode})`}
          helperText="Optional."
          error={errors.bonus?.[0]}
        >
          {(p) => (
            <Input
              {...p}
              name="bonus"
              inputMode="decimal"
              placeholder="0.00"
              value={bonusText}
              onChange={(e) => setBonusText(e.target.value)}
            />
          )}
        </FormField>
        <FormField
          id="pay-deduction"
          label={`Deduction (${currencyCode})`}
          helperText="Optional, e.g. an advance."
          error={errors.deduction?.[0]}
        >
          {(p) => (
            <Input
              {...p}
              name="deduction"
              inputMode="decimal"
              placeholder="0.00"
              value={deductionText}
              onChange={(e) => setDeductionText(e.target.value)}
            />
          )}
        </FormField>
        <FormField
          id="pay-note"
          label="Note"
          helperText="Why there is a bonus or deduction."
          error={errors.note?.[0]}
          className="sm:col-span-2"
        >
          {(p) => (
            <Textarea {...p} name="note" rows={1} maxLength={200} defaultValue={note ?? ""} />
          )}
        </FormField>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-md border p-3 text-sm">
        <dt className="text-muted-foreground">Salary</dt>
        <dd className="text-right tabular-nums">{money(baseSalary)}</dd>
        <dt className="text-muted-foreground">Net pay</dt>
        <dd className="text-right font-medium tabular-nums">{net === null ? "—" : money(net)}</dd>
        <dt className="text-muted-foreground">Already paid</dt>
        <dd className="text-right tabular-nums">{money(paid)}</dd>
        <dt className="font-medium">Still to pay</dt>
        <dd className="text-right font-semibold tabular-nums">
          {remaining === null ? "—" : money(remaining < BigInt(0) ? BigInt(0) : remaining)}
        </dd>
      </dl>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          id="pay-amount"
          label={`Amount paid now (${currencyCode})`}
          required
          error={errors.amount?.[0]}
        >
          {(p) => (
            <Input
              {...p}
              name="amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          )}
        </FormField>
        <FormField id="pay-date" label="Payment date" required error={errors.paymentDate?.[0]}>
          {(p) => <Input {...p} name="paymentDate" type="date" max={today} defaultValue={today} />}
        </FormField>
        <FormField id="pay-method" label="Method" required error={errors.method?.[0]}>
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
        <FormField id="pay-reference" label="Reference" error={errors.reference?.[0]}>
          {(p) => <Input {...p} name="reference" maxLength={100} />}
        </FormField>
      </div>

      <div className="flex justify-end gap-2">
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Record payment"}
        </Button>
      </div>
    </form>
  );
}
