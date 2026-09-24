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
