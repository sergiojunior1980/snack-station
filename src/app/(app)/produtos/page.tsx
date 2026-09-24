import { PageHero } from "@/components/page-hero";
import { ProductManager } from "@/components/product-manager";
import { listCategories, listProducts } from "@/server/queries";

export default async function ProductsPage() {
  const [products, categories] = await Promise.all([listProducts(), listCategories()]);
  return (
    <div className="space-y-8">
      <PageHero
        eyebrow="Catálogo"
        title="Produtos e estoque"
        description="Nome, marca, valor e quantidade. O tamanho em ml só entra quando a categoria for um líquido."
      />
      <ProductManager products={products} categories={categories} />
    </div>
  );
}
