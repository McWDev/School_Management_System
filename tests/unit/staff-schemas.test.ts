// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ageFrom, staffInputSchema } from "@/features/staff/schemas";
import { checkImage } from "@/lib/images";

const WORK_TYPE = "11111111-1111-4111-8111-111111111111";

describe("staff input", () => {
  it("requires full name and work type only", () => {
    const parsed = staffInputSchema.parse({ fullName: " Ahmed Ali ", workTypeId: WORK_TYPE });
    expect(parsed).toMatchObject({
      fullName: "Ahmed Ali",
      workTypeId: WORK_TYPE,
      status: "active",
    });
    const missing = staffInputSchema.safeParse({ fullName: "", workTypeId: "" });
    expect(missing.success).toBe(false);
    const messages = missing.error!.issues.map((i) => i.message);
    expect(messages).toEqual(
      expect.arrayContaining(["Enter the full name.", "Choose a work type."]),
    );
  });

  it("turns blank optional fields into null", () => {
    const parsed = staffInputSchema.parse({
      fullName: "Ahmed Ali",
      workTypeId: WORK_TYPE,
      gender: "",
      dateOfBirth: "",
      phone: " ",
      email: "",
      location: "",
      hireDate: "",
    });
    expect(parsed).toMatchObject({
      gender: null,
      dateOfBirth: null,
      phone: null,
      email: null,
      location: null,
      hireDate: null,
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
    [{ gender: "other" }, undefined],
    [{ email: "not-an-email" }, "Enter a valid email address."],
  ])("rejects %j", (extra, message) => {
    const result = staffInputSchema.safeParse({
      fullName: "Ahmed Ali",
      workTypeId: WORK_TYPE,
      ...extra,
    });
    expect(result.success).toBe(false);
    if (message) expect(result.error!.issues.map((i) => i.message)).toContain(message);
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
