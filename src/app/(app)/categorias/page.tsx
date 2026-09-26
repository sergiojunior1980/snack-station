import { CategoryManager } from "@/components/category-manager";
import { ModuleNav } from "@/components/module-nav";
import { PageHero } from "@/components/page-hero";
import { Tape } from "@/components/tape";
import { listCategories, listTape } from "@/server/queries";

export default async function CategoriesPage() {
  const [categories, tape] = await Promise.all([listCategories(), listTape("compras_estoque")]);

  return (
    <div className="space-y-4">
      <PageHero
        eyebrow="Catálogo"
        title="Categorias"
        description="Crie e edite as categorias dos produtos. O tamanho em ml ou gramas fica no cadastro de cada produto."
      />
      <ModuleNav items={[{ href: "/produtos", label: "Cadastro" }, { href: "/categorias", label: "Categorias" }]} />
      <CategoryManager categories={categories} />
      <Tape title="Fita de compras e estoque" entries={tape} />
    </div>
  );
}
