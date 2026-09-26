import { BrandLogo } from "@/components/brand-logo";

export function AuthShell({
  children,
  title,
  description,
}: {
  children: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden bg-primary px-12 py-10 text-primary-foreground lg:flex lg:flex-col">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(800px 380px at 0% 0%, rgba(255,255,255,0.16), transparent 55%), radial-gradient(640px 360px at 100% 100%, rgba(7,7,30,0.28), transparent 50%)",
          }}
        />
        <BrandLogo inverted className="relative" href="/login" />
        <div className="relative mt-auto max-w-lg pb-8">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary-foreground/80">Fisk</p>
          <h1 className="font-heading mt-4 text-5xl leading-[1.08] tracking-tight">
            O lanche sai. O estoque acompanha.
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-primary-foreground/75">
            Refrigerante, doce, biscoito e água — cada venda baixa o estoque e cada compra repõe, com o faturamento do dia na mão.
          </p>
        </div>
      </aside>
      <div className="flex flex-col">
        <header className="flex h-16 items-center justify-between border-b border-border/80 bg-card px-6 lg:hidden">
          <BrandLogo href="/login" />
        </header>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-12">
          <p className="font-heading text-4xl tracking-tight">{title}</p>
          <p className="mt-3 text-muted-foreground">{description}</p>
          <div className="mt-8">{children}</div>
        </div>
      </div>
    </div>
  );
}
