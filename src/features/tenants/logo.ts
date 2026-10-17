import { checkImage, IMAGE_MAX_BYTES, type ImageCheck } from "@/lib/images";

/** School logo rules: PNG, JPEG or WebP, up to 1 MB, checked by file content. */
export const LOGO_MAX_BYTES = IMAGE_MAX_BYTES;

export function checkLogo(bytes: Uint8Array): ImageCheck {
  return checkImage(bytes, "logo");
}
