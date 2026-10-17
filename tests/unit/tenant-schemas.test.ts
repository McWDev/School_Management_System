// @vitest-environment node
import { describe, expect, it } from "vitest";
import { branchInputSchema } from "@/features/branches/schemas";
import { schoolDetailsSchema, schoolRegistrationSchema } from "@/features/tenants/schemas";
import { ValidationError } from "@/lib/errors";
import { escapeLike, paginationSchema } from "@/lib/pagination";
import { parseInput } from "@/lib/validation";

const validSchool = {
  schoolCode: " hodan-01 ",
  name: "Hodan Primary",
  contactEmail: "  Office@Hodan.Example ",
  currencyCode: "usd",
  timezone: "Africa/Mogadishu",
};

describe("school registration schema", () => {
  it("normalizes codes, currency and email", () => {
    const parsed = schoolRegistrationSchema.parse(validSchool);
    expect(parsed.schoolCode).toBe("HODAN-01");
    expect(parsed.currencyCode).toBe("USD");
    expect(parsed.contactEmail).toBe("office@hodan.example");
  });

  it("turns blank optional fields into null", () => {
    const parsed = schoolRegistrationSchema.parse({
      ...validSchool,
      phone: "  ",
      contactEmail: "",
    });
    expect(parsed.phone).toBeNull();
    expect(parsed.contactEmail).toBeNull();
  });

  it.each([
    ["schoolCode", "-BAD"],
    ["schoolCode", "has space"],
    ["schoolCode", "X".repeat(21)],
    ["currencyCode", "US"],
    ["timezone", "Mars/Olympus"],
    ["contactEmail", "not-an-email"],
    ["name", "A"],
  ])("rejects invalid %s %j", (field, value) => {
    const result = schoolRegistrationSchema.safeParse({ ...validSchool, [field]: value });
    expect(result.success).toBe(false);
  });

  it("never accepts status or tenant fields from input", () => {
    const parsed = schoolDetailsSchema.parse({ ...validSchool, status: "active", id: "x" });
    expect(parsed).not.toHaveProperty("status");
    expect(parsed).not.toHaveProperty("id");
  });
});

describe("branch input schema", () => {
  it("strips tenantId so a branch cannot be created in another school", () => {
    const parsed = branchInputSchema.parse({ branchCode: "main", name: "Main", tenantId: "x" });
    expect(parsed).toEqual({ branchCode: "MAIN", name: "Main" });
  });
});

describe("parseInput", () => {
  it("throws ValidationError with per-field messages", () => {
    try {
      parseInput(branchInputSchema, { branchCode: "", name: "" });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect(Object.keys((error as ValidationError).fieldErrors ?? {})).toEqual(
        expect.arrayContaining(["branchCode", "name"]),
      );
    }
  });
});

describe("pagination helpers", () => {
  it("clamps bad page input to safe defaults", () => {
    expect(paginationSchema.parse({ page: "-3", pageSize: "100000" })).toEqual({
      page: 1,
      pageSize: 20,
    });
    expect(paginationSchema.parse({ page: "2", pageSize: "50" })).toEqual({
      page: 2,
      pageSize: 50,
    });
  });

  it("escapes LIKE wildcards", () => {
    expect(escapeLike("50%_off\\")).toBe("50\\%\\_off\\\\");
  });
});
