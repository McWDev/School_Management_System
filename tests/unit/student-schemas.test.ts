// @vitest-environment node
import { describe, expect, it } from "vitest";
import { formatStudentNumber, studentInputSchema } from "@/features/students/schemas";

const valid = {
  fullName: " Amina Hassan ",
  gender: "female",
  dateOfBirth: "2014-03-02",
  classId: "6f1b1f3e-8a4b-4b6e-9a43-2f0f3f1b2c11",
  academicYearId: "2a4c1d7e-3b5f-4c6a-8d9e-1f2a3b4c5d6e",
  admissionDate: "2020-09-01",
  guardianName: "Hassan Ali",
  guardianPhone: "+252 61 000 0000",
  feeType: "full_payment",
  feeAmount: "50",
  registrationFee: "20",
};

function messages(input: Record<string, unknown>) {
  const result = studentInputSchema.safeParse(input);
  return result.success
    ? {}
    : Object.fromEntries(result.error.issues.map((i) => [i.path.join("."), i.message]));
}

describe("student input", () => {
  it("accepts the required fields, trims text and defaults to Active", () => {
    expect(studentInputSchema.parse({ ...valid, phone: "", address: "" })).toMatchObject({
      fullName: "Amina Hassan",
      phone: null,
      address: null,
      status: "active",
    });
  });

  it("explains every missing required field at once", () => {
    expect(messages({})).toEqual({
      fullName: "Enter the full name.",
      gender: "Choose a gender.",
      dateOfBirth: "Enter the date of birth.",
      classId: "Choose a class.",
      academicYearId: "Choose an academic year.",
      admissionDate: "Enter the admission date.",
      guardianName: "Enter the guardian's name.",
      guardianPhone: "Enter the guardian's phone number.",
      feeType: "Choose a fee type.",
      registrationFee: "Enter the registration fee (0 if none).",
    });
  });

  it("refuses future dates and an admission before birth", () => {
    expect(messages({ ...valid, dateOfBirth: "2999-01-01", admissionDate: "2999-01-02" })).toEqual({
      dateOfBirth: "Date of birth cannot be in the future.",
      admissionDate: "Admission date cannot be in the future.",
    });
    expect(messages({ ...valid, admissionDate: "2010-01-01" })).toEqual({
      admissionDate: "Admission date must be after the date of birth.",
    });
    expect(messages({ ...valid, dateOfBirth: "02/03/2014" })).toEqual({
      dateOfBirth: "Enter a valid date.",
    });
  });

  it("accepts the four statuses only", () => {
    for (const status of ["active", "graduated", "transferred", "left"]) {
      expect(messages({ ...valid, status })).toEqual({});
    }
    expect(messages({ ...valid, status: "deleted" })).toEqual({ status: "Choose a status." });
  });

  it("needs the amount for Full Payment and Partial Fee, and keeps money as exact text", () => {
    for (const feeType of ["full_payment", "partial_fee"]) {
      expect(messages({ ...valid, feeType, feeAmount: "" })).toEqual({
        feeAmount: "Enter the amount the student pays.",
      });
    }
    expect(messages({ ...valid, feeType: "full_scholarship", feeAmount: "" })).toEqual({});
    expect(messages({ ...valid, feeType: "partial_fee", feeAmount: "0" })).toEqual({
      feeAmount: "The amount must be more than 0.",
    });
    expect(messages({ ...valid, registrationFee: "12.345" })).toEqual({
      registrationFee: "Enter an amount like 25 or 25.50.",
    });
    expect(
      studentInputSchema.parse({ ...valid, feeType: "partial_fee", feeAmount: "15.50" }),
    ).toMatchObject({ feeType: "partial_fee", feeAmount: "15.50" });
    // Other fee types drop a leftover amount.
    expect(
      studentInputSchema.parse({ ...valid, feeType: "full_scholarship", feeAmount: "15" })
        .feeAmount,
    ).toBeNull();
  });

  it("marks the registration fee paid only when there is one", () => {
    expect(
      studentInputSchema.parse({ ...valid, registrationFeePaid: true }).registrationFeePaid,
    ).toBe(true);
    expect(
      studentInputSchema.parse({ ...valid, registrationFee: "0", registrationFeePaid: true })
        .registrationFeePaid,
    ).toBe(false);
  });

  it("formats Student IDs", () => {
    expect(formatStudentNumber(1)).toBe("STU-0001");
    expect(formatStudentNumber(12345)).toBe("STU-12345");
  });
});
