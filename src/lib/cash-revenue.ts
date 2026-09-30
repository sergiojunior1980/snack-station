export type SlipRevenueLine = { name: string; cents: number };

type ReceiptMethod = {
  id: string;
  name: string;
  kind: string;
  sortOrder: number;
};

const coreMethods = [
  { id: "dinheiro", name: "Dinheiro", sortOrder: 1 },
  { id: "pix", name: "PIX", sortOrder: 2 },
];

export function slipRevenue(
  methods: ReceiptMethod[],
  payments: { method: string; cents: number }[],
): { lines: SlipRevenueLine[]; billedCents: number } {
  const receipts = methods.filter((method) => method.kind === "recebimento");
  const byId = new Map(receipts.map((method) => [method.id, method]));
  const totals = new Map<string, number>();
  for (const payment of payments) {
    totals.set(payment.method, (totals.get(payment.method) ?? 0) + payment.cents);
  }

  const included = new Map<string, { name: string; cents: number; sortOrder: number }>();
  const add = (id: string, fallbackName: string, fallbackSort: number) => {
    if (included.has(id)) return;
    const method = byId.get(id);
    included.set(id, {
      name: method?.name || fallbackName,
      cents: totals.get(id) ?? 0,
      sortOrder: method?.sortOrder ?? fallbackSort,
    });
  };

  for (const method of coreMethods) add(method.id, method.name, method.sortOrder);
  for (const [id, cents] of totals) {
    if (cents > 0) add(id, byId.get(id)?.name || id, 1000);
  }

  const lines = [...included.values()]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "pt"))
    .map(({ name, cents }) => ({ name, cents }));
  const billedCents = [...totals.values()].reduce((sum, cents) => sum + cents, 0);
  return { lines, billedCents };
}
