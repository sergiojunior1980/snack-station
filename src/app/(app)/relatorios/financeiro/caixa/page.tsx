import { ModuleNav } from "@/components/module-nav";
import { EmptyState, PageHero } from "@/components/page-hero";
import { ReportControls } from "@/components/report-controls";
import { formatDateTime } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { reportLinks } from "@/lib/report-nav";
import { resolveReportSearch } from "@/lib/report-search";
import { cashSessionReport } from "@/server/queries";
import { cn } from "@/lib/utils";

const base = "/relatorios/financeiro/caixa";

export default async function CashReportPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; visao?: string; inicio?: string; fim?: string }>;
}) {
  const report = resolveReportSearch(await searchParams);
  const sessions = await cashSessionReport(report.selected.from, report.selected.to);

  return (
    <div className="space-y-3">
      <PageHero
        eyebrow="Financeiro"
        title="Abertura e fechamento de caixa"
        description="Fundo, entradas, saídas, valor esperado, valor contado e a diferença de cada turno."
      />
      <ModuleNav items={reportLinks} />
      <ReportControls base={base} report={report} />
      {sessions.length === 0 ? (
        <EmptyState title="Nenhum caixa neste período" description="A abertura e o fechamento aparecem aqui depois do turno." />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-left text-sm">
            <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Aberto</th>
                <th className="px-3 py-2 font-medium">Fundo</th>
                <th className="px-3 py-2 font-medium">Entradas</th>
                <th className="px-3 py-2 font-medium">Saídas</th>
                <th className="px-3 py-2 font-medium">Fechado</th>
                <th className="px-3 py-2 font-medium">Esperado</th>
                <th className="px-3 py-2 font-medium">Contado</th>
                <th className="px-3 py-2 font-medium">Diferença</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => (
                <tr key={session.id} className="border-b align-top last:border-0">
                  <td className="px-3 py-2">
                    <p>{formatDateTime(session.opened_at)}</p>
                    <p className="text-xs text-muted-foreground">{session.openedBy}{session.opening_note ? ` · ${session.opening_note}` : ""}</p>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">{formatBRL(session.opening_cents)}</td>
                  <td className="whitespace-nowrap px-3 py-2">{formatBRL(session.inCents)}</td>
                  <td className="whitespace-nowrap px-3 py-2">{formatBRL(session.outCents)}</td>
                  <td className="px-3 py-2">
                    {session.closed_at ? (
                      <>
                        <p>{formatDateTime(session.closed_at)}</p>
                        <p className="text-xs text-muted-foreground">{session.closedBy}{session.closing_note ? ` · ${session.closing_note}` : ""}</p>
                      </>
                    ) : (
                      <p className="text-muted-foreground">Ainda aberto</p>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">{session.expected_cents == null ? "—" : formatBRL(session.expected_cents)}</td>
                  <td className="whitespace-nowrap px-3 py-2">{session.counted_cents == null ? "—" : formatBRL(session.counted_cents)}</td>
                  <td className={cn("whitespace-nowrap px-3 py-2 font-medium", (session.difference_cents ?? 0) < 0 && "text-destructive")}>
                    {session.difference_cents == null ? "—" : formatBRL(session.difference_cents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
