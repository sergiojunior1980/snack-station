import { AppearanceForm } from "@/components/appearance";
import { PageHero } from "@/components/page-hero";
import { SaleFilterForm } from "@/components/sale-filter-form";
import { SettingsTabs } from "@/components/settings-tabs";
import { appearance, listCategories, saleFilterSlugs } from "@/server/queries";

export default async function SettingsPage() {
  const [look, categories, filters] = await Promise.all([appearance(), listCategories(), saleFilterSlugs()]);

  return (
    <div className="space-y-4">
      <PageHero
        eyebrow="Configurações"
        title="Ajustes da loja"
        description="A aparência vale para todo o sistema. Os parâmetros escolhem o que aparece na venda."
      />
      <SettingsTabs
        aparencia={<AppearanceForm appearance={look} />}
        parametros={<SaleFilterForm categories={categories.map((category) => ({ slug: category.slug, name: category.name }))} selected={filters} />}
      />
    </div>
  );
}
