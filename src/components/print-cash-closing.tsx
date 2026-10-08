"use client";

import { Button } from "@/components/ui/button";
import { printCashClosing, type CashClosing } from "@/lib/cash-closing";

export function PrintCashClosing({ shopName, session }: { shopName: string; session: CashClosing }) {
  return (
    <Button type="button" size="sm" variant="outline" onClick={() => printCashClosing(shopName, session)}>
      Imprimir
    </Button>
  );
}
