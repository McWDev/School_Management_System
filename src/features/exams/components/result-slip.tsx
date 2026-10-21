import { UserRound } from "lucide-react";
import { Letterhead, type LetterheadSchool } from "@/components/print/letterhead";
import type { StudentResult } from "../repository";
import { describeParts, SUBJECT_MAX } from "../schemas";

/** 1 → "1st", 2 → "2nd", 11 → "11th". */
export function ordinal(n: number) {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${{ 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th"}`;
}

/**
 * A student's printable result slip on the school's letterhead (shown only
 * when printing). Used by the Examinations student page and the Students
 * Portal.
 */
export function ResultSlip({
  result,
  school,
  logoSrc,
  reportDate,
}: {
  result: StudentResult;
  school: LetterheadSchool;
  logoSrc: string | null;
  /** e.g. "21 October 2026". */
  reportDate: string;
}) {
  const passed = result.result === "pass";
  const photoSrc = result.student.photoVersion
    ? `/api/student-photo/${result.student.id}?v=${result.student.photoVersion}`
    : null;
  return (
    <article className="hidden bg-white text-black print:block">
      <Letterhead school={school} logoSrc={logoSrc} />
      <div className="mt-4 flex items-baseline justify-between gap-4">
        <h1 className="text-xl font-bold uppercase tracking-wide">Student result</h1>
        <p className="text-sm">
          Report date: <strong>{reportDate}</strong>
        </p>
      </div>
      <div className="mt-4 flex items-start gap-5">
        <div className="flex size-28 shrink-0 items-center justify-center overflow-hidden rounded-md border border-neutral-400">
          {photoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element -- private, session-protected photo route
            <img
              src={photoSrc}
              alt={`Photo of ${result.student.fullName}`}
              className="size-full object-cover"
            />
          ) : (
            <UserRound className="size-12 text-neutral-400" aria-label="No photo" />
          )}
        </div>
        <dl className="grid flex-1 grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-neutral-600">Student</dt>
          <dd className="font-medium">{result.student.fullName}</dd>
          <dt className="text-neutral-600">Student ID</dt>
          <dd className="tabular-nums">{result.student.studentNumber}</dd>
          <dt className="text-neutral-600">Gender</dt>
          <dd>{result.student.gender === "male" ? "Male" : "Female"}</dd>
          <dt className="text-neutral-600">Class</dt>
          <dd>{result.className}</dd>
          <dt className="text-neutral-600">Academic year</dt>
          <dd>{result.academicYearName}</dd>
        </dl>
      </div>
      <table className="mt-4 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-black text-left">
            <th scope="col" className="py-1.5">
              Subject
            </th>
            {result.rules.parts.map((p) => (
              <th key={p.key} scope="col" className="py-1.5 text-right">
                {p.label} /{p.max}
              </th>
            ))}
            <th scope="col" className="py-1.5 text-right">
              Total /{SUBJECT_MAX}
            </th>
          </tr>
        </thead>
        <tbody>
          {result.subjects.map((s) => (
            <tr key={s.id} className="border-b border-neutral-300">
              <td className="py-1.5">{s.name}</td>
              {result.rules.parts.map((p) => (
                <td key={p.key} className="py-1.5 text-right tabular-nums">
                  {s[p.key] ?? "—"}
                </td>
              ))}
              <td className="py-1.5 text-right font-semibold tabular-nums">{s.total ?? "—"}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-bold">
            <th scope="row" colSpan={result.rules.parts.length + 1} className="py-2 text-left">
              Total
            </th>
            <td className="py-2 text-right tabular-nums">
              {result.total} / {result.maxTotal}
            </td>
          </tr>
        </tfoot>
      </table>
      <div className="mt-3 flex flex-wrap gap-x-8 gap-y-1 text-sm">
        <p>
          Average: <strong className="tabular-nums">{result.average}</strong>
        </p>
        <p>
          Position:{" "}
          <strong>
            {ordinal(result.position)} of {result.classSize}
          </strong>
        </p>
        <p>
          Grade: <strong className="uppercase">{passed ? "Pass" : "Fail"}</strong>
        </p>
      </div>
      <p className="mt-2 text-xs text-neutral-600">
        Each subject is out of 100 ({describeParts(result.rules)}). A subject without marks counts
        as 0. Pass: average of {result.rules.passMark} or more.
      </p>
      <div className="mt-12 flex justify-between gap-8 text-sm">
        <p className="min-w-48 border-t border-black pt-1 text-center">Class teacher</p>
        <p className="min-w-48 border-t border-black pt-1 text-center">
          {school.managerName ? `${school.managerName} (Manager)` : "Manager"}
        </p>
      </div>
    </article>
  );
}
