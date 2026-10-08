import { ComboManager } from "@/components/combo-manager";
import { ModuleNav } from "@/components/module-nav";
import { PageHero } from "@/components/page-hero";
import { listCategories, listProducts, requireUser } from "@/server/queries";

export default async function CombosPage() {
  const [{ role }, products, categories] = await Promise.all([requireUser(), listProducts(), listCategories()]);
  const links = [
    { href: "/produtos", label: "Cadastro" },
    { href: "/produtos/combos", label: "Combos" },
  ];
  if (role === "admin") links.push({ href: "/categorias", label: "Categorias" });

  return (
    <div className="space-y-4">
      <PageHero
        eyebrow="Catálogo"
        title="Combos"
        description="Junte dois ou mais produtos já cadastrados e defina o valor de venda. Na venda, o estoque sai de cada item do combo."
      />
      <ModuleNav items={links} />
      <ComboManager products={products} categories={categories} />
    </div>
  );
}
