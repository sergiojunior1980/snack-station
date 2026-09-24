"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type Tab = "caixa" | "formas";

function tabFromHash() {
  return window.location.hash === "#formas" ? "formas" : "caixa";
}

export function FinanceTabs({ caixa, formas }: { caixa: React.ReactNode; formas: React.ReactNode }) {
  const [tab, setTab] = useState<Tab>("caixa");

  useEffect(() => {
    const read = () => setTab(tabFromHash());
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  function choose(next: Tab) {
    const url = next === "formas" ? "/financeiro#formas" : "/financeiro";
    window.history.replaceState(null, "", url);
    setTab(next);
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => choose("caixa")}
          className={cn("rounded-full px-3 py-1.5 text-sm", tab === "caixa" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground")}
        >
          Caixa
        </button>
        <button
          type="button"
          onClick={() => choose("formas")}
          className={cn(
            "rounded-full px-3 py-1.5 text-sm",
            tab === "formas" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground",
          )}
        >
          Formas de pagamento
        </button>
      </div>
      <div className={tab === "caixa" ? "space-y-8" : "hidden"}>{caixa}</div>
      <div className={tab === "formas" ? "space-y-8" : "hidden"}>{formas}</div>
    </div>
  );
}
