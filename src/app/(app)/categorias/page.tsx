import { CategoryManager } from "@/components/category-manager";
import { ModuleNav } from "@/components/module-nav";
import { PageHero } from "@/components/page-hero";
import { listCategories } from "@/server/queries";

export default async function CategoriesPage() {
  const categories = await listCategories();

  return (
    <div className="space-y-4">
      <PageHero
        eyebrow="Catálogo"
        title="Categorias"
        description="Cadastre as categorias dos produtos. Só as ativas aparecem como filtro na venda."
      />
      <ModuleNav items={[{ href: "/produtos", label: "Cadastro" }, { href: "/categorias", label: "Categorias" }]} />
      <CategoryManager categories={categories} />
    </div>
  );
}
