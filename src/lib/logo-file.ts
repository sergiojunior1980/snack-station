export const LOGO_MAX_BYTES = 102_400;

export const LOGO_TYPE_ERROR = "O sistema não aceita esse tipo de arquivo. Envie PNG, JPG ou WebP.";
export const LOGO_SIZE_ERROR = "O arquivo é maior do que o esperado. O limite é 100 KB.";

export function logoKind(bytes: Uint8Array) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg" as const;
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
    return "image/png" as const;
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp" as const;
  }
  return null;
}

export async function logoFileError(file: File) {
  if (file.size > LOGO_MAX_BYTES) return LOGO_SIZE_ERROR;
  const kind = logoKind(new Uint8Array(await file.slice(0, 16).arrayBuffer()));
  if (!kind) return LOGO_TYPE_ERROR;
  return null;
}
