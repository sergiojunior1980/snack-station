import { redirect } from "next/navigation";
import { PageHero } from "@/components/page-hero";
import { ShopDesk, type ShopRow } from "@/components/shop-desk";
import { requireUser } from "@/server/queries";

export default async function ShopsPage() {
  const { supabase, role } = await requireUser();
  if (role !== "plataforma" || !supabase) redirect("/");
  const listed = await supabase.rpc("list_shops");
  const shops = (listed.error ? [] : (listed.data ?? [])) as ShopRow[];

  return (
    <div className="space-y-4">
      <PageHero
        eyebrow="Plataforma"
        title="Lojas"
        description="Cada loja entra no sistema que já está no ar. Em cada loja, use Alterar dados para mudar o nome, o código, o administrador e a senha."
      />
      {listed.error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Não foi possível ler as lojas para edição. Atualize a página. Se continuar, o banco ainda não reconheceu a função de listagem.
        </p>
      ) : null}
      <ShopDesk shops={shops} />
    </div>
  );
}
