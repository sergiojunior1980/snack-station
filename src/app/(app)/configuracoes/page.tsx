import { AppearanceForm } from "@/components/appearance";
import { PageHero } from "@/components/page-hero";
import { appearance } from "@/server/queries";

export default async function SettingsPage() {
  const look = await appearance();

  return (
    <div className="space-y-4">
      <PageHero
        eyebrow="Configurações"
        title="Aparência da estação"
        description="A cor dos botões, o fundo e a logo do canto superior esquerdo valem para todo o sistema."
      />
      <AppearanceForm appearance={look} />
    </div>
  );
}
