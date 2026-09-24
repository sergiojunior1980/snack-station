export const categories = [
  { id: "refrigerante", label: "Refrigerante" },
  { id: "doce", label: "Doce" },
  { id: "biscoito", label: "Biscoito" },
  { id: "agua", label: "Água" },
  { id: "outro", label: "Outro" },
] as const;

export type CategoryId = (typeof categories)[number]["id"];

export const paymentMethods = [
  { id: "dinheiro", label: "Dinheiro" },
  { id: "pix", label: "PIX" },
  { id: "cartao", label: "Cartão" },
] as const;

export type PaymentMethod = (typeof paymentMethods)[number]["id"];

export function categoryLabel(id: string) {
  const labels: Record<string, string> = {
    refrigerante: "Refrigerante",
    "biscoito-doce": "Biscoito doce",
    "biscoito-salgado": "Biscoito salgado",
    bala: "Bala",
    chocolate: "Chocolate",
    agua: "Água",
    outro: "Outro",
    doce: "Doce",
    biscoito: "Biscoito",
  };
  return labels[id] ?? id;
}

export function paymentLabel(id: string) {
  return paymentMethods.find((item) => item.id === id)?.label ?? id;
}
