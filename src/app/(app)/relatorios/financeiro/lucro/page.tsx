import { ModuleNav } from "@/components/module-nav";
import { EmptyState, PageHero } from "@/components/page-hero";
import { formatBRL } from "@/lib/money";
import { reportLinks } from "@/lib/report-nav";
import { productMargins } from "@/server/queries";

export default async function ProfitReportPage() {
  const margins = await productMargins();

  return (
    <div className="space-y-3">
      <PageHero
        eyebrow="Financeiro"
        title="Lucro por produto"
        description="O lucro de cada produto é o preço de venda menos o preço de custo."
      />
      <ModuleNav items={reportLinks} />
      {margins.length === 0 ? (
        <EmptyState title="Nenhum produto" description="O lucro de cada produto aparece aqui quando houver cadastro." />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-left text-sm">
            <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Produto</th>
                <th className="px-3 py-2 font-medium">Preço de custo</th>
                <th className="px-3 py-2 font-medium">Preço de venda</th>
                <th className="px-3 py-2 font-medium">Lucro</th>
              </tr>
            </thead>
            <tbody>
              {margins.map((item) => (
                <tr key={item.id} className="border-b last:border-0">
                  <td className="px-3 py-2 font-medium">{item.name}</td>
                  <td className="px-3 py-2">{formatBRL(item.cost)}</td>
                  <td className="px-3 py-2">{formatBRL(item.sale)}</td>
                  <td className="px-3 py-2">{formatBRL(item.profit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
