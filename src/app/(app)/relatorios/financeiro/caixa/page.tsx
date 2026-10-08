import { CashClosingReport } from "@/components/cash-closing-report";
import { ModuleNav } from "@/components/module-nav";
import { EmptyState, PageHero, Stat } from "@/components/page-hero";
import { ReportControls } from "@/components/report-controls";
import { formatBRL } from "@/lib/money";
import { reportLinks } from "@/lib/report-nav";
import { resolveReportSearch } from "@/lib/report-search";
import { cashClosingReport } from "@/server/queries";

const base = "/relatorios/financeiro/caixa";

export default async function CashReportPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; visao?: string; inicio?: string; fim?: string }>;
}) {
  const report = resolveReportSearch(await searchParams);
  const closing = await cashClosingReport(report.selected.from, report.selected.to);
  const closed = closing.sessions.filter((session) => !session.open);
  const billed = closing.sessions.reduce((sum, session) => sum + session.billedCents, 0);
  const sales = closing.sessions.reduce((sum, session) => sum + session.saleCount, 0);
  const difference = closed.reduce((sum, session) => sum + (session.differenceCents ?? 0), 0);

  return (
    <div className="space-y-3">
      <PageHero
        eyebrow="Financeiro"
        title="Fechamento de caixa"
        description="Cada turno mostra o faturamento por forma, a composição da gaveta, quem vendeu, os produtos, as entradas, as retiradas, as compras e a lista de vendas."
      />
      <ModuleNav items={reportLinks} />
      <ReportControls base={base} report={report} />
      {closing.sessions.length === 0 ? (
        <EmptyState title="Nenhum caixa neste período" description="A abertura e o fechamento aparecem aqui depois do turno." />
      ) : (
        <>
          <section className="grid gap-2 sm:grid-cols-4">
            <Stat label="Turnos" value={String(closing.sessions.length)} hint={closed.length === closing.sessions.length ? "Todos fechados" : `${closed.length} fechados`} />
            <Stat label="Faturamento" value={formatBRL(billed)} hint="Soma dos turnos do período" />
            <Stat label="Vendas" value={String(sales)} hint={sales ? `Ticket ${formatBRL(Math.round(billed / sales))}` : "Nenhuma venda"} />
            <Stat label="Diferença" value={closed.length ? (difference > 0 ? `+${formatBRL(difference)}` : formatBRL(difference)) : "—"} hint="Só dos turnos fechados" />
          </section>
          <CashClosingReport shopName={closing.shopName} sessions={closing.sessions} />
        </>
      )}
    </div>
  );
}
