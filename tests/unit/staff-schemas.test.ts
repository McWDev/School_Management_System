// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ageFrom, MIN_STAFF_AGE, staffInputSchema, usernameSchema } from "@/features/staff/schemas";
import { checkImage } from "@/lib/images";

const WORK_TYPE = "11111111-1111-4111-8111-111111111111";

/** A complete, valid staff member: every required field filled in. */
const VALID = {
  fullName: "Ahmed Ali",
  workTypeId: WORK_TYPE,
  phone: "+252 61 111 1111",
  gender: "male",
  dateOfBirth: "1990-04-02",
  hireDate: "2020-09-01",
  location: "Hodan district",
};

function messages(input: Record<string, unknown>) {
  const result = staffInputSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((i) => i.message);
}

describe("staff input", () => {
  it("accepts a complete staff member and defaults the status to Active", () => {
    expect(staffInputSchema.parse({ ...VALID, fullName: " Ahmed Ali " })).toMatchObject({
      fullName: "Ahmed Ali",
      status: "active",
      gender: "male",
    });
  });

  it("requires full name, work type, phone, gender, date of birth, hire date and location", () => {
    // The form always sends every field; blank ones must be reported.
    const blank = Object.fromEntries(Object.keys(VALID).map((key) => [key, ""]));
    expect(messages(blank)).toEqual(
      expect.arrayContaining([
        "Enter the full name.",
        "Choose a work type.",
        "Enter the phone number.",
        "Choose a gender.",
        "Enter the date of birth.",
        "Enter the hire date.",
        "Enter the location.",
      ]),
    );
  });

  it.each([
    ["phone", { phone: " " }, "Enter the phone number."],
    ["gender", { gender: "" }, "Choose a gender."],
    ["date of birth", { dateOfBirth: "" }, "Enter the date of birth."],
    ["hire date", { hireDate: "" }, "Enter the hire date."],
    ["location", { location: "" }, "Enter the location."],
  ])("rejects a blank %s", (_label, blank, message) => {
    expect(messages({ ...VALID, ...blank })).toContain(message);
  });

  it("keeps email and address optional (blank becomes null)", () => {
    expect(staffInputSchema.parse({ ...VALID, email: "", address: " " })).toMatchObject({
      email: null,
      address: null,
    });
  });

  it.each([
    [{ dateOfBirth: "2999-01-01" }, "Date of birth cannot be in the future."],
    [{ dateOfBirth: "1850-01-01" }, "Enter a valid date of birth."],
    [{ dateOfBirth: "31/12/1990" }, "Enter a valid date."],
    [
      { dateOfBirth: "1990-05-01", hireDate: "1980-01-01" },
      "Hire date must be after the date of birth.",
    ],
    [{ gender: "other" }, "Choose a gender."],
    [{ email: "not-an-email" }, "Enter a valid email address."],
  ])("rejects %j", (extra, message) => {
    expect(messages({ ...VALID, ...extra })).toContain(message);
  });
});

describe("age from date of birth", () => {
  const on = new Date("2026-10-17T12:00:00Z");
  it.each([
    ["1990-10-17", 36],
    ["1990-10-18", 35],
    ["2000-01-01", 26],
    ["2026-10-17", 0],
  ])("%s → %i", (dob, age) => {
    expect(ageFrom(dob, on)).toBe(age);
  });

  it("is null without a date", () => {
    expect(ageFrom(null, on)).toBeNull();
    expect(ageFrom("", on)).toBeNull();
  });
});

describe("photo checks", () => {
  it("names the photo in size errors", () => {
    const big = new Uint8Array(1024 * 1024 + 1);
    big.set([0xff, 0xd8, 0xff]);
    expect(checkImage(big, "photo")).toEqual({
      ok: false,
      message: "The photo must be 1 MB or smaller.",
    });
  });
});

describe("minimum staff age", () => {
  function yearsAgo(years: number, extraDays = 0) {
    const d = new Date();
    d.setUTCFullYear(d.getUTCFullYear() - years);
    d.setUTCDate(d.getUTCDate() + extraDays);
    return d.toISOString().slice(0, 10);
  }

  it("rejects staff younger than 15", () => {
    expect(messages({ ...VALID, dateOfBirth: yearsAgo(15, 1), hireDate: yearsAgo(0) })).toContain(
      `Staff must be at least ${MIN_STAFF_AGE} years old.`,
    );
  });

  it("accepts staff who are exactly 15", () => {
    expect(messages({ ...VALID, dateOfBirth: yearsAgo(15), hireDate: yearsAgo(0) })).toEqual([]);
  });
});

describe("status and username", () => {
  it("accepts Active, Inactive and Left", () => {
    for (const status of ["active", "inactive", "left"]) {
      expect(messages({ ...VALID, status })).toEqual([]);
    }
    expect(messages({ ...VALID, status: "x" })).not.toEqual([]);
  });

  it.each([
    ["Ahmed.Ali", true],
    ["ahmed_ali-2", true],
    ["ab", false],
    ["has space", false],
    ["a@b.so", false],
    ["-starts-with-dash", false],
  ])("username %j valid: %s", (username, ok) => {
    expect(usernameSchema.safeParse(username).success).toBe(ok);
  });

  it("stores usernames in lower case", () => {
    expect(usernameSchema.parse(" Ahmed.Ali ")).toBe("ahmed.ali");
  });
});

describe("hire date", () => {
  const dayOffset = (days: number) =>
    new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

  it("cannot be in the future", () => {
    expect(messages({ ...VALID, hireDate: dayOffset(2) })).toContain(
      "Hire date cannot be in the future.",
    );
  });

  it.each([0, -1, -400])("accepts today or a past date (offset %i days)", (days) => {
    expect(messages({ ...VALID, hireDate: dayOffset(days) })).toEqual([]);
  });
});
