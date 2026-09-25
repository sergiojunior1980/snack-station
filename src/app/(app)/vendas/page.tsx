import { PageHero } from "@/components/page-hero";
import { SaleDesk } from "@/components/sale-desk";
import { paymentLabel } from "@/lib/catalog";
import { formatDateTime } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { cashIsOpen, listCategories, listPaymentMethods, listProducts, recentSales, requireUser } from "@/server/queries";

export default async function SalesPage() {
  const [, products, sales, categories, cashOpen, methods] = await Promise.all([
    requireUser(),
    listProducts(),
    recentSales(8),
    listCategories(),
    cashIsOpen(),
    listPaymentMethods("recebimento"),
  ]);

  return (
    <div className="space-y-8">
      <PageHero
        eyebrow="Balcão"
        title="Registrar venda"
        description="Toque nos produtos e divida o pagamento se precisar. A venda só entra com o caixa aberto."
      />
      <SaleDesk products={products} categories={categories} cashOpen={cashOpen} methods={methods.filter((method) => method.active !== false)} />
      <section className="space-y-3">
        <h2 className="font-heading text-2xl">Vendas recentes</h2>
        <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
          {sales.length === 0 ? (
            <li className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhuma venda ainda.</li>
          ) : (
            sales.map((sale) => {
              const items = (sale.sale_items as { product_name: string; quantity: number }[]) ?? [];
              return (
                <li key={sale.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <p className="text-sm">{items.map((item) => `${item.quantity}× ${item.product_name}`).join(", ")}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(sale.created_at)} · {paymentLabel(sale.payment_method)}
                    </p>
                  </div>
                  <p className="font-medium">{formatBRL(sale.total_cents)}</p>
                </li>
              );
            })
          )}
        </ul>
      </section>
    </div>
  );
}
