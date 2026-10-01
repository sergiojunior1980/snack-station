"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export function SettingsTabs({
  aparencia,
  parametros,
}: {
  aparencia: React.ReactNode;
  parametros: React.ReactNode;
}) {
  const [tab, setTab] = useState<"aparencia" | "parametros">("aparencia");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTab("aparencia")}
          className={cn("rounded-full px-3 py-1.5 text-sm", tab === "aparencia" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground")}
        >
          Aparência
        </button>
        <button
          type="button"
          onClick={() => setTab("parametros")}
          className={cn("rounded-full px-3 py-1.5 text-sm", tab === "parametros" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground")}
        >
          Parâmetros
        </button>
      </div>
      <div className={tab === "aparencia" ? undefined : "hidden"}>{aparencia}</div>
      <div className={tab === "parametros" ? undefined : "hidden"}>{parametros}</div>
    </div>
  );
}
