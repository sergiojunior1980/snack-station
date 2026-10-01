export const paymentMethods = [
  { id: "dinheiro", label: "Dinheiro" },
  { id: "pix", label: "PIX" },
  { id: "cartao", label: "Cartão" },
] as const;

export type PaymentMethod = (typeof paymentMethods)[number]["id"];

export function categoryLabel(id: string) {
  return id
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toLocaleUpperCase("pt-BR") + part.slice(1))
    .join(" ");
}

export function paymentLabel(id: string) {
  if (id === "misto") return "Mais de uma forma";
  if (id === "saldo") return "Saldo da conta";
  return paymentMethods.find((item) => item.id === id)?.label ?? id;
}
