import { redirect } from "next/navigation";
import { PageHero } from "@/components/page-hero";
import { ReportControls } from "@/components/report-controls";
import { SaleXmlForm } from "@/components/sale-xml-form";
import { companyFiscalGaps } from "@/lib/nfce-xml";
import { formatBRL } from "@/lib/money";
import { formatDateTime } from "@/lib/dates";
import { resolveReportSearch } from "@/lib/report-search";
import { salesForXml } from "@/server/fiscal-data";
import { requireUser } from "@/server/queries";

export default async function SaleXmlPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; inicio?: string; fim?: string }>;
}) {
  const { user, role } = await requireUser();
  if (!user) redirect("/login");
  if (role !== "admin") redirect("/");
  const report = resolveReportSearch(await searchParams);
  const { company, sales, truncated } = await salesForXml(report.selected.from, report.selected.to);
  const gaps = company ? companyFiscalGaps(company) : ["cadastro da empresa"];

  return (
    <div className="space-y-4">
      <PageHero
        eyebrow="Fiscal"
        title="XML das vendas"
        description="Um arquivo por venda, no período escolhido. A SEFAZ só autoriza depois do envio."
      />
      <ReportControls base="/fiscal/vendas" report={report} />
      <p className="text-sm text-muted-foreground">{report.description}</p>
      {gaps.length ? (
        <p className="rounded-xl border border-dashed px-4 py-3 text-sm text-destructive">
          Antes de gerar, complete na Empresa: {gaps.join(", ")}.
        </p>
      ) : (
        <SaleXmlForm inicio={report.startValue} fim={report.endValue} />
      )}
      {truncated ? <p className="text-sm text-muted-foreground">A lista mostra as 100 primeiras vendas do período.</p> : null}
      {sales.length === 0 ? (
        <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">Nenhuma venda neste período.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-left text-sm">
            <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Quando</th>
                <th className="px-3 py-2 font-medium">Total</th>
                <th className="px-3 py-2 font-medium">XML</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((sale) => (
                <tr key={sale.id} className="border-b last:border-0">
                  <td className="whitespace-nowrap px-3 py-2">{formatDateTime(sale.createdAt)}</td>
                  <td className="whitespace-nowrap px-3 py-2">{formatBRL(sale.totalCents)}</td>
                  <td className="px-3 py-2">{sale.storedXml ? "Gerado" : sale.pending ? sale.pending : "Pronto para gerar"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
