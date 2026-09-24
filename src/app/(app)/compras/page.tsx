import { PageHero } from "@/components/page-hero";
import { PurchaseDesk } from "@/components/purchase-desk";
import { formatDateTime } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { listProducts, recentPurchases } from "@/server/queries";

export default async function PurchasesPage() {
  const [products, purchases] = await Promise.all([listProducts(), recentPurchases()]);

  return (
    <div className="space-y-8">
      <PageHero
        eyebrow="Reposição"
        title="Comprar produto"
        description="Cada compra soma no estoque. Informe quanto você pagou por unidade para guardar o custo."
      />
      {products.length === 0 ? (
        <p className="rounded-2xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          Cadastre um produto antes de lançar a compra.
        </p>
      ) : (
        <PurchaseDesk products={products} />
      )}
      <section className="space-y-3">
        <h2 className="font-heading text-2xl">Compras recentes</h2>
        <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
          {purchases.length === 0 ? (
            <li className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhuma compra lançada.</li>
          ) : (
            purchases.map((purchase) => {
              const items = (purchase.purchase_items as { product_name: string; quantity: number }[]) ?? [];
              return (
                <li key={purchase.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <p className="text-sm">{items.map((item) => `${item.quantity}× ${item.product_name}`).join(", ")}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(purchase.created_at)}
                      {purchase.supplier ? ` · ${purchase.supplier}` : ""}
                    </p>
                  </div>
                  <p className="font-medium">{formatBRL(purchase.total_cents)}</p>
                </li>
              );
            })
          )}
        </ul>
      </section>
    </div>
  );
}
