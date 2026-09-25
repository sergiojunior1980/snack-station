import { redirect } from "next/navigation";
import { PageHero } from "@/components/page-hero";
import { TeamList } from "@/components/team-list";
import { Tape } from "@/components/tape";
import { listTeam, listTape, requireUser } from "@/server/queries";

export default async function TeamPage() {
  const { user, role } = await requireUser();
  if (!user) redirect("/login");
  if (role !== "admin") redirect("/vendas");
  const [members, tape] = await Promise.all([listTeam(), listTape("perfis")]);

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Equipe"
        title="Quem entra na estação"
        description="Crie o vendedor, veja o usuário e a senha, redefina a senha e escolha os menus que ele pode abrir."
      />
      <TeamList members={members} currentUserId={user.id} />
      <Tape title="Fita de perfis e usuários" entries={tape} />
    </div>
  );
}
