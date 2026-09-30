import { ModuleNav } from "@/components/module-nav";
import { PageHero } from "@/components/page-hero";
import { ProductManager } from "@/components/product-manager";
import { costMode, listCategories, listProducts, requireUser } from "@/server/queries";

export default async function ProductsPage() {
  const [{ role }, products, categories, mode] = await Promise.all([
    requireUser(),
    listProducts(),
    listCategories(),
    costMode(),
  ]);
  const links = [{ href: "/produtos", label: "Cadastro" }];
  if (role === "admin") links.push({ href: "/categorias", label: "Categorias" });
  return (
    <div className="space-y-4">
      <PageHero
        eyebrow="Catálogo"
        title="Produtos e estoque"
        description="O valor de compra vem do estoque vigente. Combo é um produto novo feito de dois ou mais já cadastrados."
      />
      <ModuleNav items={links} />
      <ProductManager products={products} categories={categories} costMode={mode} admin={role === "admin"} />
    </div>
  );
}
