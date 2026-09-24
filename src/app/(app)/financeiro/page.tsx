import Link from "next/link";
import { CashDesk } from "@/components/cash-desk";
import { FinanceTabs } from "@/components/finance-tabs";
import { EmptyState, PageHero, Stat } from "@/components/page-hero";
import { FinanceChart } from "@/components/finance-chart";
import { PaymentMethodManager } from "@/components/payment-method-manager";
import { bucketKey, eachBucket, formatBucket, formatDateTime, periodRange, seriesRange, type ReportGrain, type ReportPeriod } from "@/lib/dates";
import { paymentLabel } from "@/lib/catalog";
import { formatBRL } from "@/lib/money";
import { Tape } from "@/components/tape";
import { accountBalance, cashDesk, financeEntries, listPaymentMethods, listTape } from "@/server/queries";

const periods: { id: ReportPeriod; label: string }[] = [
  { id: "hoje", label: "Hoje" },
  { id: "semana", label: "Esta semana" },
  { id: "mes", label: "Este mês" },
  { id: "30d", label: "30 dias" },
];

const grains: { id: ReportGrain; label: string }[] = [
  { id: "day", label: "Por dia" },
  { id: "week", label: "Por semana" },
  { id: "month", label: "Por mês" },
];

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; visao?: string }>;
}) {
  const params = await searchParams;
  const period = periods.some((item) => item.id === params.periodo) ? (params.periodo as ReportPeriod) : "mes";
  const grain = grains.some((item) => item.id === params.visao) ? (params.visao as ReportGrain) : "day";
  const selected = periodRange(period);
  const seriesWindow = seriesRange(grain);
  const from = new Date(Math.min(selected.from.getTime(), seriesWindow.from.getTime()));
  const to = new Date(Math.max(selected.to.getTime(), seriesWindow.to.getTime()));
  const [{ sales, purchases, movements: cashMoves, sessions }, desk, balance, tape, receipts, payments] = await Promise.all([
    financeEntries(from, to),
    cashDesk(),
    accountBalance(),
    listTape("caixa_vendas"),
    listPaymentMethods("recebimento"),
    listPaymentMethods("pagamento"),
  ]);

  const inPeriod = (createdAt: string) => {
    const time = new Date(createdAt).getTime();
    return time >= selected.from.getTime() && time < selected.to.getTime();
  };
  const periodSales = sales.filter((sale) => inPeriod(sale.created_at));
  const periodPurchases = purchases.filter((purchase) => inPeriod(purchase.created_at));
  const revenue = periodSales.reduce((sum, sale) => sum + sale.total_cents, 0);
  const expense = periodPurchases.reduce((sum, purchase) => sum + purchase.total_cents, 0);
  const result = revenue - expense;

  const buckets = new Map(eachBucket(seriesWindow.from, seriesWindow.to, grain).map((key) => [key, { faturamento: 0, despesa: 0 }]));
  for (const sale of sales) {
    const key = bucketKey(sale.created_at, grain);
    const row = buckets.get(key);
    if (row) row.faturamento += sale.total_cents;
  }
  for (const purchase of purchases) {
    const key = bucketKey(purchase.created_at, grain);
    const row = buckets.get(key);
    if (row) row.despesa += purchase.total_cents;
  }
  const chart = [...buckets.entries()].map(([key, row]) => ({
    label: formatBucket(key, grain),
    faturamento: row.faturamento,
    despesa: row.despesa,
  }));

  const movements = [
    ...periodSales.map((sale) => ({
      id: `sale-${sale.id}`,
      kind: "Venda" as const,
      detail: paymentLabel(sale.payment_method),
      cents: sale.total_cents,
      created_at: sale.created_at,
    })),
    ...periodPurchases.map((purchase) => ({
      id: `purchase-${purchase.id}`,
      kind: "Compra" as const,
      detail: purchase.supplier?.trim() || "Reposição de estoque",
      cents: purchase.total_cents,
      created_at: purchase.created_at,
    })),
    ...sessions.filter((session) => inPeriod(session.opened_at)).map((session) => ({
      id: `open-${session.id}`,
      kind: "Abertura" as const,
      detail: session.opening_note?.trim() || "Fundo de troco",
      cents: session.opening_cents,
      created_at: session.opened_at,
    })),
    ...sessions
      .filter((session) => session.closed_at && inPeriod(session.closed_at))
      .map((session) => ({
        id: `close-${session.id}`,
        kind: "Fechamento" as const,
        detail: session.closing_note?.trim() || "Valor contado",
        cents: session.counted_cents ?? 0,
        created_at: session.closed_at as string,
      })),
    ...cashMoves.filter((movement) => inPeriod(movement.created_at)).map((movement) => ({
      id: `cash-${movement.id}`,
      kind: movement.kind === "entrada" ? ("Entrada" as const) : ("Retirada" as const),
      detail: movement.note,
      cents: movement.amount_cents,
      created_at: movement.created_at,
    })),
  ]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 40);

  const periodLabel = periods.find((item) => item.id === period)?.label;

  return (
    <div className="space-y-8">
      <FinanceTabs
        caixa={
          <>
            <PageHero
              eyebrow="Caixa"
              title="Faturamento e despesa"
              description="O que entrou nas vendas, o que saiu nas compras e o movimento do caixa."
            />
            <CashDesk open={desk.open} expectedCents={desk.expectedCents} recent={desk.recent} />
      <div className="flex flex-wrap gap-2">
        {periods.map((item) => (
          <Link
            key={item.id}
            href={`/financeiro?periodo=${item.id}&visao=${grain}`}
            className={`rounded-full px-3 py-1.5 text-sm ${item.id === period ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"}`}
          >
            {item.label}
          </Link>
        ))}
      </div>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Conta corrente" value={formatBRL(balance)} hint="Aberturas, dinheiro, entradas, retiradas e compras no saldo" />
        <Stat label="Faturamento" value={formatBRL(revenue)} hint={`${periodSales.length} ${periodSales.length === 1 ? "venda" : "vendas"} · ${periodLabel}`} />
        <Stat label="Despesa" value={formatBRL(expense)} hint={`${periodPurchases.length} ${periodPurchases.length === 1 ? "compra" : "compras"} de produto`} />
        <Stat label="Resultado" value={formatBRL(result)} hint={result >= 0 ? "Faturamento cobriu a despesa" : "A despesa passou o faturamento"} />
      </section>
      <section className="rounded-2xl border bg-card p-5">
        <div className="mb-4 flex flex-wrap gap-2">
          {grains.map((item) => (
            <Link
              key={item.id}
              href={`/financeiro?periodo=${period}&visao=${item.id}`}
              className={`rounded-full px-3 py-1.5 text-sm ${item.id === grain ? "bg-secondary text-secondary-foreground" : "text-muted-foreground"}`}
            >
              {item.label}
            </Link>
          ))}
        </div>
        <FinanceChart data={chart} />
      </section>
      <section className="space-y-3">
        <h2 className="font-heading text-2xl">Movimento do período</h2>
        {movements.length === 0 ? (
          <EmptyState title="Nada lançado" description="Quando houver venda ou compra neste período, o valor aparece aqui." />
        ) : (
          <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
            {movements.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="font-medium">
                    {item.kind}
                    <span className="font-normal text-muted-foreground"> · {item.detail}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(item.created_at)}</p>
                </div>
                <p className={`text-sm font-medium ${item.kind === "Compra" || item.kind === "Retirada" || item.kind === "Fechamento" ? "text-foreground" : "text-primary"}`}>
                  {item.kind === "Compra" || item.kind === "Retirada" ? "−" : item.kind === "Fechamento" ? "" : "+"}
                  {formatBRL(item.cents)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
            <Tape title="Fita de caixa e vendas" entries={tape} />
          </>
        }
        formas={
          <>
            <PageHero
              eyebrow="Financeiro"
              title="Formas de recebimento e pagamento"
              description="Recebimento aparece na venda. Pagamento aparece na compra. Marque o que entra no caixa ou abate o saldo."
            />
            <PaymentMethodManager receipts={receipts} payments={payments} />
          </>
        }
      />
    </div>
  );
}
