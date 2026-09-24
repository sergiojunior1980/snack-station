import { ModuleNav } from "@/components/module-nav";
import { PageHero } from "@/components/page-hero";
import { ProductManager } from "@/components/product-manager";
import { listCategories, listProducts, requireUser } from "@/server/queries";

export default async function ProductsPage() {
  const [{ role }, products, categories] = await Promise.all([requireUser(), listProducts(), listCategories()]);
  const links = [{ href: "/produtos", label: "Cadastro" }];
  if (role === "admin") links.push({ href: "/categorias", label: "Categorias" });
  return (
    <div className="space-y-8">
      <PageHero
        eyebrow="Catálogo"
        title="Produtos e estoque"
        description="Nome, marca, valor e quantidade. O tamanho em ml só entra quando a categoria for um líquido."
      />
      <ModuleNav items={links} />
      <ProductManager products={products} categories={categories} />
    </div>
  );
}
