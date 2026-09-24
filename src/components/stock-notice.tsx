"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function StockNotice() {
  const [open, setOpen] = useState(true);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#07071e]/45 px-4">
      <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-xl">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Estoque</p>
        <h2 className="font-heading mt-2 text-2xl">Reposição é pela compra</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          A entrada de estoque de reposição deve ser feita na opção Compras. Use esta tela só para ajuste: perda, vencimento, consumo ou correção de quantidade.
        </p>
        <Button className="mt-6 w-full" onClick={() => setOpen(false)}>
          Entendi, é só ajuste
        </Button>
      </div>
    </div>
  );
}
