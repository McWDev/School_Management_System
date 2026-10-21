"use client";

import { useState, useTransition } from "react";
import { Eye, EyeOff, Printer } from "lucide-react";
import { FormAlert } from "@/components/forms/form-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { FormResult } from "@/lib/form-result";
import type { PortalCredential, PortalStudentRow } from "../repository";

type Credential = Pick<PortalCredential, "fullName" | "studentNumber" | "username" | "password"> & {
  className?: string | null;
};
type Props = {
  rows: PortalStudentRow[];
  schoolName: string;
  schoolCode: string;
  reset: (
    studentId: string,
  ) => Promise<FormResult<Omit<PortalCredential, "studentId" | "className">>>;
  setAccess: (studentId: string, enabled: boolean) => Promise<FormResult<unknown>>;
};

const ACCESS = {
  none: { label: "No login", tone: "neutral" },
  active: { label: "Can sign in", tone: "success" },
  disabled: { label: "Turned off", tone: "warning" },
} as const;

/**
 * See and reset students' 6-digit portal passwords (logins are created
 * automatically) and turn logins off. A reset shows a printable slip.
 */
export function PortalAccessManager({ rows, schoolName, schoolCode, reset, setAccess }: Props) {
  const [sheet, setSheet] = useState<Credential[] | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "ok"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [showPasswords, setShowPasswords] = useState(false);

  const run = (fn: () => Promise<FormResult<unknown>>, ok: string) =>
    startTransition(async () => {
      const result = await fn();
      setMessage(
        result.status === "error"
          ? { tone: "error", text: result.message }
          : { tone: "ok", text: ok },
      );
    });

  return (
    <div className="flex flex-col gap-6">
      {message && (
        <div className="no-print">
          {message.tone === "error" ? (
            <FormAlert>{message.text}</FormAlert>
          ) : (
            <p
              role="status"
              className="rounded-md border border-success bg-success-soft p-3 text-sm font-medium"
            >
              {message.text}
            </p>
          )}
        </div>
      )}

      {sheet && sheet.length > 0 && (
        <Card className="border-primary print:border-0 print:shadow-none">
          <CardHeader className="no-print">
            <CardTitle>New portal logins</CardTitle>
            <CardDescription>
              Print this sheet and give each student their slip. You can see each password in the
              Password column below at any time, or reset it.
            </CardDescription>
            <div className="flex gap-2 pt-2">
              <Button type="button" onClick={() => window.print()}>
                <Printer className="size-4" aria-hidden="true" />
                Print logins
              </Button>
              <Button type="button" variant="outline" onClick={() => setSheet(null)}>
                Done
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <ul
              aria-label="New portal logins"
              className="grid gap-3 sm:grid-cols-2 print:grid-cols-2 print:gap-2"
            >
              {sheet.map((c) => (
                <li
                  key={c.username}
                  className="break-inside-avoid rounded-md border border-dashed border-neutral-400 bg-white p-3 text-sm text-black"
                >
                  <p className="font-semibold">{schoolName} · Students Portal</p>
                  <p className="mt-1">
                    {c.fullName} ({c.studentNumber}){c.className ? ` · ${c.className}` : ""}
                  </p>
                  <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3">
                    <dt className="text-neutral-600">Sign in at</dt>
                    {/* The sheet only appears after a button press, in the browser. */}
                    <dd className="break-all">
                      {window.location.origin}/student-login?school={schoolCode}
                    </dd>
                    <dt className="text-neutral-600">School code</dt>
                    <dd className="font-mono">{schoolCode}</dd>
                    <dt className="text-neutral-600">Student ID</dt>
                    <dd className="font-mono">{c.studentNumber}</dd>
                    <dt className="text-neutral-600">Password</dt>
                    <dd className="font-mono font-bold">{c.password}</dd>
                  </dl>
                  <p className="mt-2 text-xs text-neutral-600">
                    Keep your password private. You can change it after you sign in.
                  </p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className={sheet ? "no-print" : ""}>
        <Table aria-label="Students">
          <TableHeader>
            <TableRow>
              <TableHead>Student</TableHead>
              <TableHead className="hidden md:table-cell">Class</TableHead>
              <TableHead>
                <span className="flex items-center gap-1">
                  Password
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2"
                    aria-pressed={showPasswords}
                    onClick={() => setShowPasswords((v) => !v)}
                  >
                    {showPasswords ? (
                      <EyeOff className="size-4" aria-hidden="true" />
                    ) : (
                      <Eye className="size-4" aria-hidden="true" />
                    )}
                    {showPasswords ? "Hide" : "Show"}
                  </Button>
                </span>
              </TableHead>
              <TableHead>Portal</TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              return (
                <TableRow key={r.id}>
                  <TableCell>
                    <span className="block font-medium">{r.fullName}</span>
                    <span className="block text-xs text-muted-foreground tabular-nums">
                      {r.studentNumber}
                      {r.status !== "active" && ` · not Active`}
                    </span>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {r.className ?? "—"}
                    {r.academicYearName && (
                      <span className="block text-xs text-muted-foreground">
                        {r.academicYearName}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono tabular-nums">
                    {r.access === "none" ? (
                      "—"
                    ) : r.password === null ? (
                      <span className="font-sans text-xs text-muted-foreground">Reset to see</span>
                    ) : showPasswords ? (
                      r.password
                    ) : (
                      <span aria-label="Hidden password">••••••</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge tone={ACCESS[r.access].tone}>{ACCESS[r.access].label}</Badge>
                  </TableCell>
                  <TableCell>
                    {r.access !== "none" && (
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={() =>
                            startTransition(async () => {
                              const result = await reset(r.id);
                              if (result.status === "success") {
                                setSheet([{ ...result.data, className: r.className }]);
                                setMessage({
                                  tone: "ok",
                                  text: `New password for ${r.fullName}: print or note it now.`,
                                });
                              } else if (result.status === "error") {
                                setMessage({ tone: "error", text: result.message });
                              }
                            })
                          }
                        >
                          Reset password<span className="sr-only"> for {r.fullName}</span>
                        </Button>
                        {r.access === "active" ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={pending}
                            onClick={() =>
                              run(
                                () => setAccess(r.id, false),
                                `${r.fullName} can no longer sign in.`,
                              )
                            }
                          >
                            Turn off<span className="sr-only"> for {r.fullName}</span>
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={pending}
                            onClick={() =>
                              run(() => setAccess(r.id, true), `${r.fullName} can sign in again.`)
                            }
                          >
                            Turn on<span className="sr-only"> for {r.fullName}</span>
                          </Button>
                        )}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
