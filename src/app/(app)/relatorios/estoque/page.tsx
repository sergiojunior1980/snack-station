import { ModuleNav } from "@/components/module-nav";
import { EmptyState, PageHero } from "@/components/page-hero";
import { listProducts } from "@/server/queries";

export default async function StockReportPage() {
  const products = (await listProducts())
    .slice()
    .sort((a, b) => a.stock_quantity - b.stock_quantity || a.name.localeCompare(b.name, "pt"));

  return (
    <div className="space-y-3">
      <PageHero
        eyebrow="Estoque"
        title="Quantidade de cada item"
        description="Do produto com menos unidades para o que tem mais."
      />
      <ModuleNav items={[{ href: "/relatorios/estoque", label: "Estoque" }, { href: "/relatorios/financeiro", label: "Financeiro" }]} />
      {products.length === 0 ? (
        <EmptyState title="Nenhum produto" description="O estoque aparece aqui depois do cadastro." />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-left text-sm">
            <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Produto</th>
                <th className="px-3 py-2 font-medium">Quantidade</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id} className="border-b last:border-0">
                  <td className="px-3 py-2 font-medium">
                    {product.name}
                    {!product.active ? <span className="ml-2 text-xs font-normal text-muted-foreground">Inativo</span> : null}
                  </td>
                  <td className="px-3 py-2">{product.stock_quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
