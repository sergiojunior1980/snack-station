export const BRAZIL_STATES = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;

export const TAX_REGIMES = [
  { id: 1, label: "Simples Nacional" },
  { id: 2, label: "Simples Nacional, excesso" },
  { id: 3, label: "Regime Normal" },
] as const;

export const FISCAL_ENVIRONMENTS = [
  { id: "homologacao", label: "Homologação (teste da SEFAZ)" },
  { id: "producao", label: "Produção" },
] as const;

export const CERT_MAX_BYTES = 102_400;
export const CERT_TYPE_ERROR = "O certificado precisa ser um arquivo PFX ou P12.";
export const CERT_SIZE_ERROR = "O certificado passa de 100 KB.";

export type ShopFiscal = {
  legalName: string;
  tradeName: string;
  cnpj: string;
  stateRegistration: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  cityName: string;
  cityCode: string;
  state: string;
  zip: string;
  crt: number;
  nfceSeries: number;
  nfceNextNumber: number;
  environment: string;
  cscId: string;
  cscConfigured: boolean;
  certificateConfigured: boolean;
};

export const emptyShopFiscal: ShopFiscal = {
  legalName: "",
  tradeName: "",
  cnpj: "",
  stateRegistration: "",
  street: "",
  number: "",
  complement: "",
  district: "",
  cityName: "",
  cityCode: "",
  state: "SP",
  zip: "",
  crt: 1,
  nfceSeries: 1,
  nfceNextNumber: 1,
  environment: "homologacao",
  cscId: "",
  cscConfigured: false,
  certificateConfigured: false,
};

export type CompanyInput = {
  legalName: string;
  tradeName: string;
  cnpj: string;
  stateRegistration: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  cityName: string;
  cityCode: string;
  state: string;
  zip: string;
  crt: number;
  nfceSeries: number;
  nfceNextNumber: number;
  environment: string;
  cscId: string;
  cscToken: string;
  certificatePassword: string;
};

export function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

export function isValidCnpj(value: string) {
  const digits = onlyDigits(value);
  if (!/^\d{14}$/.test(digits) || /^(\d)\1{13}$/.test(digits)) return false;
  const digit = (base: string, factors: number[]) => {
    const sum = factors.reduce((total, factor, index) => total + Number(base[index]) * factor, 0);
    const mod = sum % 11;
    return mod < 2 ? 0 : 11 - mod;
  };
  const first = digit(digits, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = digit(digits, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return digits.endsWith(`${first}${second}`);
}

export function formatCnpj(value: string) {
  const digits = onlyDigits(value).slice(0, 14);
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

export function formatZip(value: string) {
  const digits = onlyDigits(value).slice(0, 8);
  return digits.replace(/^(\d{5})(\d)/, "$1-$2");
}

export function certificateAccepted(name: string, bytes: Uint8Array) {
  const ext = name.toLowerCase().split(".").pop();
  return (ext === "pfx" || ext === "p12") && bytes.length >= 4 && bytes[0] === 0x30;
}

function lengthBetween(value: string, min: number, max: number) {
  const size = value.trim().length;
  return size >= min && size <= max;
}

export function companyError(
  input: CompanyInput,
  current: { cscConfigured: boolean; certificateConfigured: boolean },
  hasFile: boolean,
) {
  if (!lengthBetween(input.legalName, 2, 60)) return "Informe a razão social com até 60 caracteres.";
  if (!lengthBetween(input.tradeName, 1, 60)) return "Informe o nome fantasia com até 60 caracteres.";
  if (!isValidCnpj(input.cnpj)) return "Informe um CNPJ válido.";
  const ie = input.stateRegistration.trim().toUpperCase();
  if (ie !== "ISENTO" && !/^[0-9A-Z]{2,14}$/.test(ie)) return "Informe a inscrição estadual ou ISENTO.";
  if (!lengthBetween(input.street, 2, 60)) return "Informe o logradouro com até 60 caracteres.";
  if (!lengthBetween(input.number, 1, 60)) return "Informe o número do endereço.";
  if (input.complement.trim().length > 60) return "O complemento passa de 60 caracteres.";
  if (!lengthBetween(input.district, 2, 60)) return "Informe o bairro com até 60 caracteres.";
  if (!lengthBetween(input.cityName, 2, 60)) return "Informe o município com até 60 caracteres.";
  if (!/^\d{7}$/.test(input.cityCode)) return "O código do município tem 7 dígitos.";
  if (!BRAZIL_STATES.includes(input.state as (typeof BRAZIL_STATES)[number])) return "Escolha a UF.";
  if (!/^\d{8}$/.test(input.zip)) return "Informe o CEP com 8 dígitos.";
  if (![1, 2, 3].includes(input.crt)) return "Escolha o regime tributário.";
  if (!Number.isInteger(input.nfceSeries) || input.nfceSeries < 1 || input.nfceSeries > 999) return "A série da NFC-e fica entre 1 e 999.";
  if (!Number.isInteger(input.nfceNextNumber) || input.nfceNextNumber < 1 || input.nfceNextNumber > 999_999_999) {
    return "O próximo número da NFC-e precisa ser maior que zero.";
  }
  if (input.environment !== "homologacao" && input.environment !== "producao") return "Escolha o ambiente da nota.";

  const cscId = input.cscId.trim();
  const cscToken = input.cscToken.trim();
  if (cscId && !/^\d{1,6}$/.test(cscId)) return "O identificador CSC tem de 1 a 6 dígitos.";
  if (cscToken && (cscToken.length < 16 || cscToken.length > 36)) return "O token CSC precisa ter de 16 a 36 caracteres.";
  if ((cscId || current.cscConfigured) && !cscId) return "Informe o identificador CSC.";
  if (cscToken && !cscId && !current.cscConfigured) return "Informe o identificador e o token CSC juntos.";
  if (cscId && !cscToken && !current.cscConfigured) return "Informe o identificador e o token CSC juntos.";

  const password = input.certificatePassword;
  if (hasFile && !password) return "Informe a senha do certificado.";
  if (hasFile && password.length > 64) return "A senha do certificado passa de 64 caracteres.";
  if (!hasFile && password && !current.certificateConfigured) return "Envie o certificado junto com a senha.";
  if (!hasFile && password.length > 64) return "A senha do certificado passa de 64 caracteres.";
  return null;
}
