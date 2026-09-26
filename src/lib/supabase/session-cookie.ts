type CookieLifetime = { maxAge?: number; expires?: Date };

// Sem prazo de validade o navegador apaga o cookie ao fechar.
export function browserSessionOptions<T extends CookieLifetime>(options: T): T {
  if (options.maxAge === 0) return options;
  const next = { ...options };
  delete next.maxAge;
  delete next.expires;
  return next;
}
