export const OFFICIAL_PAYMENT_CODES = [
  { code: "01", label: "Dinheiro" },
  { code: "02", label: "Cheque" },
  { code: "03", label: "Cartão de crédito" },
  { code: "04", label: "Cartão de débito" },
  { code: "05", label: "Crédito da loja" },
  { code: "10", label: "Vale-alimentação" },
  { code: "11", label: "Vale-refeição" },
  { code: "12", label: "Vale-presente" },
  { code: "13", label: "Vale-combustível" },
  { code: "14", label: "Duplicata mercantil" },
  { code: "15", label: "Boleto" },
  { code: "16", label: "Depósito bancário" },
  { code: "17", label: "PIX" },
  { code: "18", label: "Transferência ou carteira digital" },
  { code: "19", label: "Fidelidade, cashback ou crédito virtual" },
  { code: "90", label: "Sem pagamento" },
  { code: "99", label: "Outros" },
] as const;

const officialCodes = new Set<string>(OFFICIAL_PAYMENT_CODES.map((item) => item.code));

export function isOfficialPaymentCode(value: string) {
  return officialCodes.has(value);
}
