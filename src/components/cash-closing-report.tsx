import type { ReactNode } from "react";
import { PrintCashClosing } from "@/components/print-cash-closing";
import { Badge } from "@/components/ui/badge";
import type { CashClosing, CashClosingLine } from "@/lib/cash-closing";
import { formatDateTime } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { cn } from "@/lib/utils";

export function CashClosingReport({ shopName, sessions }: { shopName: string; sessions: CashClosing[] }) {
  return (
    <div className="space-y-3">
      {sessions.map((session) => (
        <article key={session.id} className="space-y-3 rounded-xl border bg-card p-3">
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-medium">
                  {formatDateTime(session.openedAt)}
                  {session.closedAt ? ` – ${formatDateTime(session.closedAt)}` : ""}
                </h2>
                <Badge tone={session.open ? "watch" : "muted"}>{session.open ? "Aberto" : "Fechado"}</Badge>
                <Difference session={session} />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Aberto por {session.openedBy}
                {session.closedBy ? ` · fechado por ${session.closedBy}` : ""}
                {` · ${shiftLength(session.openedAt, session.closedAt)}`}
              </p>
              {session.openingNote || session.closingNote ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {[session.openingNote ? `Abertura: ${session.openingNote}` : "", session.closingNote ? `Fechamento: ${session.closingNote}` : ""]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              ) : null}
            </div>
            <PrintCashClosing shopName={shopName} session={session} />
          </header>

          <section className="grid gap-2 sm:grid-cols-4">
            <Metric label="Faturamento" value={formatBRL(session.billedCents)} />
            <Metric label="Vendas" value={String(session.saleCount)} hint={session.saleCount ? `Ticket ${formatBRL(Math.round(session.billedCents / session.saleCount))}` : "Nenhuma venda"} />
            <Metric label="Unidades" value={String(session.units)} />
            <Metric label="Valor esperado" value={formatBRL(session.expectedCents)} hint={session.countedCents == null ? "Ainda sem contagem" : `Contado ${formatBRL(session.countedCents)}`} />
          </section>

          <div className="grid gap-3 lg:grid-cols-2">
            <Section title="Faturamento por forma">
              <Lines
                rows={session.revenue}
                label={(line) => line.name}
                detail={(line) => `${line.count ?? 0} lançamentos`}
                value={(line) => formatBRL(line.cents)}
              />
            </Section>
            <Section title="Composição do caixa">
              <dl className="space-y-1 text-sm">
                <Pair label="Fundo de troco" value={formatBRL(session.openingCents)} />
                <Pair label={session.cashMethods ? `Vendas no caixa (${session.cashMethods})` : "Vendas no caixa"} value={formatBRL(session.cashSalesCents)} />
                <Pair label="Entradas" value={formatBRL(session.inCents)} />
                <Pair label="Saídas" value={formatBRL(-session.outCents)} />
                <Pair label="Compras pagas pelo caixa" value={formatBRL(-session.purchaseCents)} />
                <Pair label="Soma da composição" value={formatBRL(session.composedCents)} strong />
                <Pair label="Valor esperado" value={formatBRL(session.expectedCents)} strong />
                <Pair label="Valor contado" value={session.countedCents == null ? "—" : formatBRL(session.countedCents)} strong />
                <Pair
                  label="Diferença"
                  value={session.differenceCents == null ? "—" : signed(session.differenceCents)}
                  strong
                  tone={(session.differenceCents ?? 0) < 0 ? "bad" : "ok"}
                />
              </dl>
              <p className="mt-2 text-xs text-muted-foreground">Fundo + vendas no caixa + entradas − saídas − compras pagas pelo caixa.</p>
              {session.mismatch ? (
                <p className="mt-1 text-xs text-muted-foreground">O valor gravado no fechamento foi {formatBRL(session.expectedCents)}. A soma acima foi recalculada com o movimento do turno.</p>
              ) : null}
            </Section>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <Section title="Vendedores">
              <Lines
                rows={session.sellers}
                label={(line) => line.name}
                detail={(line) => `${line.count ?? 0} vendas`}
                value={(line) => formatBRL(line.cents)}
              />
            </Section>
            <Section title="Produtos vendidos">
              <Lines
                rows={session.products}
                label={(line) => line.name}
                detail={(line) => `${line.quantity ?? 0} un`}
                value={(line) => formatBRL(line.cents)}
              />
            </Section>
          </div>

          <Section title="Entradas e retiradas">
            {session.movements.length === 0 ? (
              <Empty>Nenhuma entrada ou retirada neste turno.</Empty>
            ) : (
              <SimpleTable
                headers={["Hora", "Tipo", "Observação", "Quem lançou", "Valor"]}
                rows={session.movements.map((movement) => [
                  formatDateTime(movement.at),
                  movement.kind === "entrada" ? "Entrada" : "Retirada",
                  movement.note,
                  movement.actor,
                  signed(movement.kind === "entrada" ? movement.cents : -movement.cents),
                ])}
              />
            )}
          </Section>

          <Section title="Compras do turno">
            {session.purchases.length === 0 ? (
              <Empty>Nenhuma compra neste turno.</Empty>
            ) : (
              <SimpleTable
                headers={["Hora", "Fornecedor", "Itens", "Pagamento", "Valor"]}
                rows={session.purchases.map((purchase) => [
                  formatDateTime(purchase.at),
                  purchase.supplier,
                  purchase.items,
                  purchase.fromDrawer ? purchase.method : `${purchase.method} · fora do caixa`,
                  formatBRL(purchase.cents),
                ])}
              />
            )}
          </Section>

          <Section title="Vendas do turno">
            {session.sales.length === 0 ? (
              <Empty>Nenhuma venda neste turno.</Empty>
            ) : (
              <SimpleTable
                headers={["Hora", "Vendedor", "Itens", "Pagamento", "Total"]}
                rows={session.sales.map((sale) => [formatDateTime(sale.at), sale.seller, sale.items, sale.payments, formatBRL(sale.cents)])}
              />
            )}
          </Section>
        </article>
      ))}
    </div>
  );
}

function Difference({ session }: { session: CashClosing }) {
  if (session.differenceCents == null) return null;
  if (session.differenceCents === 0) return <Badge tone="ok">Fechou certo</Badge>;
  if (session.differenceCents < 0) return <Badge tone="high">Falta {formatBRL(Math.abs(session.differenceCents))}</Badge>;
  return <Badge>Sobra {formatBRL(session.differenceCents)}</Badge>;
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border bg-background px-3 py-2">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-heading text-lg">{value}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">{title}</h3>
      {children}
    </section>
  );
}

function Lines<T extends CashClosingLine>({
  rows,
  label,
  detail,
  value,
}: {
  rows: T[];
  label: (line: T) => string;
  detail: (line: T) => string;
  value: (line: T) => string;
}) {
  if (rows.length === 0) return <Empty>Nada neste turno.</Empty>;
  return (
    <ul className="divide-y rounded-lg border">
      {rows.map((line, index) => (
        <li key={`${label(line)}-${index}`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
          <div>
            <p>{label(line)}</p>
            <p className="text-xs text-muted-foreground">{detail(line)}</p>
          </div>
          <p className="whitespace-nowrap font-medium">{value(line)}</p>
        </li>
      ))}
    </ul>
  );
}

function Pair({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "ok" | "bad" }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className={strong ? "font-medium" : "text-muted-foreground"}>{label}</dt>
      <dd className={cn("whitespace-nowrap text-right", strong && "font-medium", tone === "bad" && "text-destructive", tone === "ok" && value.startsWith("+") && "text-primary")}>{value}</dd>
    </div>
  );
}

function SimpleTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="max-h-80 overflow-auto rounded-lg border">
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 border-b bg-card text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            {headers.map((header) => (
              <th key={header} className="px-3 py-2 font-medium">{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-b align-top last:border-0">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className={cn("px-3 py-2", cellIndex === row.length - 1 && "whitespace-nowrap text-right font-medium")}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">{children}</p>;
}

function signed(cents: number) {
  if (cents > 0) return `+${formatBRL(cents)}`;
  return formatBRL(cents);
}

function shiftLength(openedAt: string, closedAt: string | null) {
  const minutes = Math.max(0, Math.round(((closedAt ? new Date(closedAt).getTime() : Date.now()) - new Date(openedAt).getTime()) / 60000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours <= 0) return `${rest} min`;
  return `${hours} h ${rest} min`;
}
