import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import { Toaster } from "sonner";
import { SessionFromUrl } from "@/components/session-from-url";
import "./globals.css";

const montserrat = Montserrat({ variable: "--font-montserrat", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Snack Station — estoque e vendas",
  description: "Controle de estoque, vendas e faturamento da estação de lanches.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${montserrat.variable} h-full antialiased`}>
      <body className="min-h-full bg-background text-foreground">
        <SessionFromUrl />
        {children}
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
