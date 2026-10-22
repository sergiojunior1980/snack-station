import { ModuleNav } from "@/components/module-nav";
import { EmptyState, PageHero, Stat } from "@/components/page-hero";
import { formatBRL } from "@/lib/money";
import { reportLinks } from "@/lib/report-nav";
import { accumulatedProfit } from "@/server/queries";

function marginLabel(profit: number, revenue: number) {
  if (revenue <= 0) return "—";
  return `${((profit / revenue) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

function monthLabel(key: string) {
  return new Date(`${key}T12:00:00-03:00`).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  });
}

export default async function ProfitReportPage() {
  const summary = await accumulatedProfit();
  const hasSales = summary.sales > 0;

  return (
    <div className="space-y-3">
      <PageHero
        eyebrow="Financeiro"
        title="Lucro acumulado"
        description="Da primeira venda até agora. O lucro é o que entrou nas vendas menos o custo médio atual de cada produto vendido."
      />
      <ModuleNav items={reportLinks} />
      {hasSales ? (
        <>
          <section className="grid gap-2 sm:grid-cols-4">
            <Stat label="Faturamento" value={formatBRL(summary.revenue)} hint={`${summary.sales} vendas · ${summary.units} un.`} />
            <Stat label="Custo" value={formatBRL(summary.cost)} hint="Custo médio atual × quantidade vendida" />
            <Stat
              label="Lucro acumulado"
              value={formatBRL(summary.profit)}
              hint={summary.missing > 0 ? `${summary.missing} un. sem custo cadastrado` : "Até este momento"}
            />
            <Stat label="Margem" value={marginLabel(summary.profit, summary.revenue)} hint="Lucro sobre o faturamento" />
          </section>

          <section className="space-y-2">
            <h2 className="px-1 text-sm font-medium">Por mês</h2>
            <div className="overflow-x-auto rounded-xl border bg-card">
              <table className="w-full text-left text-sm">
                <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Mês</th>
                    <th className="px-3 py-2 font-medium">Faturamento</th>
                    <th className="px-3 py-2 font-medium">Custo</th>
                    <th className="px-3 py-2 font-medium">Lucro do mês</th>
                    <th className="px-3 py-2 font-medium">Lucro acumulado</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.months.map((month) => (
                    <tr key={month.key} className="border-b last:border-0">
                      <td className="px-3 py-2 font-medium">{monthLabel(month.key)}</td>
                      <td className="px-3 py-2">{formatBRL(month.revenue)}</td>
                      <td className="px-3 py-2">{formatBRL(month.cost)}</td>
                      <td className="px-3 py-2">{formatBRL(month.profit)}</td>
                      <td className="px-3 py-2 font-medium">{formatBRL(month.accumulated)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="px-1 text-sm font-medium">Por produto</h2>
            <div className="overflow-x-auto rounded-xl border bg-card">
              <table className="w-full text-left text-sm">
                <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Produto</th>
                    <th className="px-3 py-2 font-medium">Qtd</th>
                    <th className="px-3 py-2 font-medium">Faturamento</th>
                    <th className="px-3 py-2 font-medium">Custo</th>
                    <th className="px-3 py-2 font-medium">Lucro</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.products.map((item) => (
                    <tr key={item.name} className="border-b last:border-0">
                      <td className="px-3 py-2 font-medium">{item.name}</td>
                      <td className="px-3 py-2">{item.quantity}</td>
                      <td className="px-3 py-2">{formatBRL(item.revenue)}</td>
                      <td className="px-3 py-2">{item.cost === 0 ? "Sem custo" : formatBRL(item.cost)}</td>
                      <td className="px-3 py-2">{formatBRL(item.profit)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t font-medium">
                  <tr>
                    <td className="px-3 py-2">Total</td>
                    <td className="px-3 py-2">{summary.products.reduce((sum, item) => sum + item.quantity, 0)}</td>
                    <td className="px-3 py-2">{formatBRL(summary.products.reduce((sum, item) => sum + item.revenue, 0))}</td>
                    <td className="px-3 py-2">{formatBRL(summary.products.reduce((sum, item) => sum + item.cost, 0))}</td>
                    <td className="px-3 py-2">{formatBRL(summary.products.reduce((sum, item) => sum + item.profit, 0))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        </>
      ) : (
        <EmptyState title="Nenhuma venda ainda" description="O lucro acumulado aparece aqui depois da primeira venda." />
      )}
    </div>
  );
}
