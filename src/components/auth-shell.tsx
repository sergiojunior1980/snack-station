"use client";

import type { CSSProperties } from "react";
import { createContext, useContext } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { defaultLoginBrand, readableInk, type LoginBrand } from "@/lib/brand";

const LoginBrandContext = createContext<LoginBrand>(defaultLoginBrand);

export function LoginBrandProvider({ value, children }: { value: LoginBrand; children: React.ReactNode }) {
  return <LoginBrandContext.Provider value={value}>{children}</LoginBrandContext.Provider>;
}

export function AuthShell({
  children,
  title,
  description,
}: {
  children: React.ReactNode;
  title: string;
  description: string;
}) {
  const brand = useContext(LoginBrandContext);
  const buttonInk = readableInk(brand.buttonColor);
  const theme = {
    "--primary": brand.buttonColor,
    "--primary-foreground": buttonInk,
    "--background": brand.backgroundColor,
    "--ring": brand.buttonColor,
  } as CSSProperties;

  return (
    <div className="grid min-h-screen lg:grid-cols-2" style={theme}>
      <aside className="relative hidden overflow-hidden bg-primary px-12 py-10 text-primary-foreground lg:flex lg:flex-col">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(800px 380px at 0% 0%, rgba(255,255,255,0.16), transparent 55%), radial-gradient(640px 360px at 100% 100%, rgba(7,7,30,0.28), transparent 50%)",
          }}
        />
        <BrandLogo inverted className="relative" href="/login" logoUrl={brand.logoUrl} />
        <div className="relative mt-auto max-w-lg pb-8">
          <h1 className="font-heading text-5xl leading-[1.08] tracking-tight">{brand.tagline}</h1>
          <p className="mt-5 text-lg leading-relaxed text-primary-foreground/75">{brand.taglineNote}</p>
        </div>
      </aside>
      <div className="flex flex-col bg-background">
        <header className="flex h-16 items-center justify-between border-b border-border/80 bg-card px-6 lg:hidden">
          <BrandLogo href="/login" logoUrl={brand.logoUrl} />
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
