import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import { Toaster } from "sonner";
import { AppearanceProvider } from "@/components/appearance";
import { SessionFromUrl } from "@/components/session-from-url";
import { readableInk } from "@/lib/brand";
import { appearance } from "@/server/queries";
import "./globals.css";

const montserrat = Montserrat({ variable: "--font-montserrat", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Snack Station — estoque e vendas",
  description: "Controle de estoque, vendas e faturamento da estação de lanches.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const look = await appearance();
  const buttonInk = readableInk(look.buttonColor);
  const pageInk = readableInk(look.backgroundColor);
  const theme = {
    "--background": look.backgroundColor,
    "--foreground": pageInk,
    "--primary": look.buttonColor,
    "--primary-foreground": buttonInk,
    "--ring": look.buttonColor,
    "--muted-foreground": pageInk === "#ffffff" ? "#d0d0d0" : "#666666",
  } as CSSProperties;

  return (
    <html lang="pt-BR" className={`${montserrat.variable} h-full antialiased`}>
      <body className="min-h-full bg-background text-foreground" style={theme}>
        <AppearanceProvider value={look}>
          <SessionFromUrl />
          {children}
          <Toaster position="top-center" richColors />
        </AppearanceProvider>
      </body>
    </html>
  );
}
