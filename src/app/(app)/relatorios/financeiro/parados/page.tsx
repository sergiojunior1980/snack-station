import { ModuleNav } from "@/components/module-nav";
import { EmptyState, PageHero } from "@/components/page-hero";
import { ReportControls } from "@/components/report-controls";
import { categoryLabel } from "@/lib/catalog";
import { reportLinks } from "@/lib/report-nav";
import { resolveReportSearch } from "@/lib/report-search";
import { unsoldProducts } from "@/server/queries";

const base = "/relatorios/financeiro/parados";

export default async function UnsoldReportPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; visao?: string; inicio?: string; fim?: string }>;
}) {
  const report = resolveReportSearch(await searchParams);
  const quiet = await unsoldProducts(report.selected.from, report.selected.to);

  return (
    <div className="space-y-3">
      <PageHero eyebrow="Financeiro" title="Não venderam" description={report.description} />
      <ModuleNav items={reportLinks} />
      <ReportControls base={base} report={report} />
      {quiet.length === 0 ? (
        <EmptyState title="Tudo girou" description="Todo produto ativo teve pelo menos uma venda neste período." />
      ) : (
        <ul className="space-y-1.5">
          {quiet.map((item) => (
            <li key={item.product_id} className="flex items-center justify-between rounded-xl border bg-card px-3 py-2">
              <div>
                <p className="font-medium">{item.product_name}</p>
                <p className="text-xs text-muted-foreground">{categoryLabel(item.category)}</p>
              </div>
              <p className="text-sm text-muted-foreground">{item.stock_quantity} em estoque</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
