import { PageHero } from "@/components/page-hero";
import { RecentSales, SaleDesk, type RecentSale } from "@/components/sale-desk";
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
    <div className="space-y-4">
      <PageHero
        eyebrow="Balcão"
        title="Registrar venda"
        description="Toque nos produtos e divida o pagamento se precisar. A venda fica no nome de quem está logado. Duas pessoas podem vender ao mesmo tempo, com o caixa aberto."
      />
      <SaleDesk products={products} categories={categories} cashOpen={cashOpen} methods={methods.filter((method) => method.active !== false)} />
      <section className="space-y-3">
        <h2 className="font-heading text-2xl">Vendas recentes</h2>
        <RecentSales sales={sales as RecentSale[]} methods={methods} />
      </section>
    </div>
  );
}
