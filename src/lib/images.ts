/*
 * Image upload checks shared by school logos and staff photos. The real type
 * comes from the file's first bytes (magic numbers), never from the
 * browser-supplied name or MIME type. SVG is refused (it can contain scripts).
 */
export const IMAGE_MAX_BYTES = 1024 * 1024;

export type ImageType = "image/png" | "image/jpeg" | "image/webp";

export function detectImageType(bytes: Uint8Array): ImageType | null {
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && png.every((b, i) => bytes[i] === b)) return "image/png";
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

export type ImageCheck = { ok: true; type: ImageType } | { ok: false; message: string };

/** `label` names the image in messages, e.g. "logo" or "photo". */
export function checkImage(bytes: Uint8Array, label: string): ImageCheck {
  if (bytes.length === 0) return { ok: false, message: "Choose an image file." };
  if (bytes.length > IMAGE_MAX_BYTES) {
    return { ok: false, message: `The ${label} must be 1 MB or smaller.` };
  }
  const type = detectImageType(bytes);
  if (!type) return { ok: false, message: "Use a PNG, JPEG or WebP image." };
  return { ok: true, type };
}
