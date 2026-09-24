import { redirect } from "next/navigation";
import { PageHero } from "@/components/page-hero";
import { TeamList } from "@/components/team-list";
import { listTeam, requireUser } from "@/server/queries";

export default async function TeamPage() {
  const { user, role } = await requireUser();
  if (!user) redirect("/login");
  if (role !== "admin") redirect("/vendas");
  const members = await listTeam();

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Equipe"
        title="Quem entra na estação"
        description="Crie o vendedor com usuário e senha. Ele só registra venda e cadastra produto."
      />
      <TeamList members={members} currentUserId={user.id} />
    </div>
  );
}
