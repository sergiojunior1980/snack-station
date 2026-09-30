import { redirect } from "next/navigation";
import { PageHero } from "@/components/page-hero";
import { ShopDesk, type ShopRow } from "@/components/shop-desk";
import { requireUser } from "@/server/queries";

export default async function ShopsPage() {
  const { supabase, role } = await requireUser();
  if (role !== "plataforma" || !supabase) redirect("/");
  const { data } = await supabase.from("tenants").select("id, name, slug, status").order("name");

  return (
    <div className="space-y-4">
      <PageHero
        eyebrow="Plataforma"
        title="Lojas"
        description="Cada loja entra no sistema que já está no ar. O cliente usa o código da loja para entrar."
      />
      <ShopDesk shops={(data ?? []) as ShopRow[]} />
    </div>
  );
}
