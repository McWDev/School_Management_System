// @vitest-environment node
import { describe, expect, it } from "vitest";
import { branchInputSchema } from "@/features/branches/schemas";
import { checkLogo, LOGO_MAX_BYTES } from "@/features/tenants/logo";
import { schoolProfileSchema, schoolRegistrationSchema } from "@/features/tenants/schemas";
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
    const parsed = schoolProfileSchema.parse({ ...validSchool, status: "active", id: "x" });
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

describe("school profile (letterhead)", () => {
  it("normalizes the website and keeps the letterhead fields", () => {
    const parsed = schoolProfileSchema.parse({
      name: "Hodan School",
      managerName: "  Amina Ali ",
      website: "hodan.so",
      motto: "Knowledge is light",
      contactEmail: "Info@Hodan.so",
    });
    expect(parsed).toMatchObject({
      managerName: "Amina Ali",
      website: "https://hodan.so",
      motto: "Knowledge is light",
      contactEmail: "info@hodan.so",
    });
  });

  it.each(["javascript:alert(1)", "ftp://files.example", "not a site"])(
    "rejects website %j",
    (website) => {
      expect(schoolProfileSchema.safeParse({ name: "Hodan", website }).success).toBe(false);
    },
  );
});

describe("logo checks", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
  const webp = new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ");
  const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>');

  it("detects real PNG, JPEG and WebP bytes", () => {
    expect(checkLogo(png)).toEqual({ ok: true, type: "image/png" });
    expect(checkLogo(jpeg)).toEqual({ ok: true, type: "image/jpeg" });
    expect(checkLogo(webp)).toEqual({ ok: true, type: "image/webp" });
  });

  it("rejects SVG, empty and oversized files", () => {
    expect(checkLogo(svg).ok).toBe(false);
    expect(checkLogo(new Uint8Array()).ok).toBe(false);
    const big = new Uint8Array(LOGO_MAX_BYTES + 1);
    big.set(png);
    expect(checkLogo(big)).toEqual({ ok: false, message: "The logo must be 1 MB or smaller." });
  });
});
