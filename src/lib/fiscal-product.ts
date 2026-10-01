export const PRODUCT_TAX_CODES = [
  { code: "102", label: "102 · Simples sem crédito" },
  { code: "103", label: "103 · Isenção no Simples" },
  { code: "300", label: "300 · Imune" },
  { code: "400", label: "400 · Não tributada no Simples" },
  { code: "500", label: "500 · ICMS já cobrado por substituição" },
  { code: "40", label: "40 · Isenta" },
  { code: "41", label: "41 · Não tributada" },
] as const;

export const PRODUCT_ORIGINS = [
  { code: "0", label: "0 · Nacional" },
  { code: "1", label: "1 · Estrangeira, importação direta" },
  { code: "2", label: "2 · Estrangeira, comprada no Brasil" },
] as const;

const taxCodes = new Set<string>(PRODUCT_TAX_CODES.map((item) => item.code));
const simplesCodes = new Set(["102", "103", "300", "400", "500"]);

export type ProductFiscal = {
  ncm: string;
  cfop: string;
  taxCode: string;
  origin: string;
};

export function cleanNcm(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits || "";
}

export function productFiscalError(input: ProductFiscal) {
  if (input.ncm && !/^\d{8}$/.test(input.ncm)) return "O NCM tem 8 dígitos.";
  if (!/^\d{4}$/.test(input.cfop)) return "O CFOP tem 4 dígitos.";
  if (!taxCodes.has(input.taxCode)) return "Escolha a situação tributária.";
  if (!PRODUCT_ORIGINS.some((item) => item.code === input.origin)) return "Escolha a origem da mercadoria.";
  return "";
}

export function productFiscalGaps(input: ProductFiscal, crt: number) {
  const gaps: string[] = [];
  if (!/^\d{8}$/.test(input.ncm)) gaps.push("está sem NCM");
  if (!/^\d{4}$/.test(input.cfop)) gaps.push("está sem CFOP");
  const simples = crt === 1 || crt === 2;
  if (simples && !simplesCodes.has(input.taxCode)) gaps.push("a situação tributária não serve para o Simples");
  if (!simples && simplesCodes.has(input.taxCode)) gaps.push("a situação tributária não serve para o regime normal");
  if (!PRODUCT_ORIGINS.some((item) => item.code === input.origin)) gaps.push("está sem origem");
  return gaps;
}
