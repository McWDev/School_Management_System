/*
 * School logo validation. The file's real type is decided from its first
 * bytes (magic numbers), never from the browser-supplied name or MIME type.
 * SVG is not accepted because it can contain scripts.
 */
export const LOGO_MAX_BYTES = 1024 * 1024;

export type LogoType = "image/png" | "image/jpeg" | "image/webp";

export function detectImageType(bytes: Uint8Array): LogoType | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export type LogoCheck = { ok: true; type: LogoType } | { ok: false; message: string };

export function checkLogo(bytes: Uint8Array): LogoCheck {
  if (bytes.length === 0) return { ok: false, message: "Choose an image file." };
  if (bytes.length > LOGO_MAX_BYTES)
    return { ok: false, message: "The logo must be 1 MB or smaller." };
  const type = detectImageType(bytes);
  if (!type) return { ok: false, message: "Use a PNG, JPEG or WebP image." };
  return { ok: true, type };
}
