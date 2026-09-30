import { LoginForm } from "@/components/login-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ aviso?: string }> }) {
  const params = await searchParams;
  return <LoginForm suspended={params.aviso === "suspensa"} passwordReset={params.aviso === "senha"} />;
}
