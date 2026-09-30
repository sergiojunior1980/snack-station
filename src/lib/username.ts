const USER_DOMAIN = "usuarios.snackstation.local";

export function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

export function usernameToEmail(username: string) {
  return `${normalizeUsername(username)}@${USER_DOMAIN}`;
}

export function loginToEmail(value: string) {
  const text = value.trim();
  if (text.includes("@")) return text.toLowerCase();
  return usernameToEmail(text);
}

export function normalizeShop(value: string) {
  return value.trim().toLowerCase();
}

export function shopLoginEmail(shop: string, username: string) {
  const slug = normalizeShop(shop);
  const user = normalizeUsername(username);
  if (slug === "fiskparaiso") return `${user}@${USER_DOMAIN}`;
  return `${slug}.${user}@${USER_DOMAIN}`;
}
