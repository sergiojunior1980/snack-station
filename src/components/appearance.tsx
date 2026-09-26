"use client";

import { createContext, useContext } from "react";
import { useActionState } from "react";
import { defaultAppearance, type Appearance } from "@/lib/brand";
import { saveAppearance, type ActionState } from "@/server/actions";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

const AppearanceContext = createContext<Appearance>(defaultAppearance);

export function AppearanceProvider({ value, children }: { value: Appearance; children: React.ReactNode }) {
  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance() {
  return useContext(AppearanceContext);
}

export function AppearanceForm({ appearance }: { appearance: Appearance }) {
  const [state, action, pending] = useActionState(saveAppearance, null as ActionState);

  return (
    <form action={action} className="space-y-3 rounded-2xl border bg-card p-4">
      <div>
        <h2 className="font-heading text-xl">Aparência</h2>
        <p className="text-sm text-muted-foreground">A cor dos botões, o fundo e a logo do canto superior esquerdo valem para todo o sistema.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="buttonColor">Cor dos botões</Label>
          <Input id="buttonColor" name="buttonColor" type="color" defaultValue={appearance.buttonColor} className="h-10 w-full p-1" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="backgroundColor">Cor de fundo</Label>
          <Input id="backgroundColor" name="backgroundColor" type="color" defaultValue={appearance.backgroundColor} className="h-10 w-full p-1" />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="logo">Logo</Label>
          {appearance.logoUrl ? (
            <img src={appearance.logoUrl} alt="Logo atual" className="mb-2 h-12 max-w-[10rem] object-contain" />
          ) : (
            <p className="text-sm text-muted-foreground">Hoje aparece a palavra FISK.</p>
          )}
          <Input id="logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp" />
          <p className="text-xs text-muted-foreground">PNG, JPG ou WebP, até 2 MB. Deixe em branco para manter a logo atual.</p>
        </div>
      </div>
      {appearance.logoUrl ? (
        <label className="flex items-center text-sm">
          <input type="checkbox" name="removeLogo" className="mr-3 size-4 shrink-0 accent-primary" />
          Voltar para a palavra FISK
        </label>
      ) : null}
      {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      {state?.ok ? <p className="text-sm text-emerald-700">{state.ok}</p> : null}
      <Button disabled={pending}>{pending ? "Salvando…" : "Salvar aparência"}</Button>
    </form>
  );
}
