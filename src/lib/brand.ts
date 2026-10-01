export const defaultTagline = "A venda sai. O estoque acompanha.";
export const defaultTaglineNote = "Cada venda baixa o estoque e cada compra repõe, com o faturamento do dia na mão.";

export const defaultAppearance = {
  name: "",
  buttonColor: "#b8002e",
  backgroundColor: "#fff7f7",
  logoUrl: "",
  tagline: defaultTagline,
  taglineNote: defaultTaglineNote,
};

export type LoginBrand = {
  name: string;
  logoUrl: string;
  tagline: string;
  taglineNote: string;
  buttonColor: string;
  backgroundColor: string;
};

export const defaultLoginBrand: LoginBrand = {
  name: "",
  logoUrl: "",
  tagline: defaultTagline,
  taglineNote: defaultTaglineNote,
  buttonColor: defaultAppearance.buttonColor,
  backgroundColor: defaultAppearance.backgroundColor,
};

export type Appearance = typeof defaultAppearance;

export function readableInk(hex: string) {
  const value = Number.parseInt(hex.slice(1), 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
  return luminance > 0.62 ? "#07071e" : "#ffffff";
}

export function isHexColor(value: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}
