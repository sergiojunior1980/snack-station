"use client";

import { createContext, useContext, useRef, useState } from "react";
import { useActionState } from "react";
import { defaultAppearance, type Appearance } from "@/lib/brand";
import { logoFileError } from "@/lib/logo-file";
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
  const [fileError, setFileError] = useState<string | null>(null);
  const logoCheck = useRef(0);

  return (
    <form
      action={action}
      className="space-y-3 rounded-2xl border bg-card p-4"
      onSubmit={(event) => {
        const input = event.currentTarget.elements.namedItem("logo");
        const file = input instanceof HTMLInputElement ? input.files?.[0] : undefined;
        if (file && file.size > 0 && fileError) event.preventDefault();
      }}
    >
      <div>
        <h2 className="font-heading text-xl">Aparência</h2>
        <p className="text-sm text-muted-foreground">A logo, as cores e a frase da tela de entrada valem para a loja.</p>
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
          <Input
            id="logo"
            name="logo"
            type="file"
            accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
            onChange={(event) => {
              const input = event.currentTarget;
              const file = input.files?.[0];
              const check = ++logoCheck.current;
              if (!file) {
                setFileError(null);
                return;
              }
              void logoFileError(file).then((error) => {
                if (check !== logoCheck.current) return;
                if (error) input.value = "";
                setFileError(error);
              });
            }}
          />
          <p className="text-xs text-muted-foreground">PNG, JPG ou WebP, até 100 KB. Deixe em branco para manter a logo atual.</p>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="tagline">Frase da tela de entrada</Label>
          <Input id="tagline" name="tagline" maxLength={90} required defaultValue={appearance.tagline} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="taglineNote">Texto abaixo da frase</Label>
          <Input id="taglineNote" name="taglineNote" maxLength={220} required defaultValue={appearance.taglineNote} />
        </div>
      </div>
      {appearance.logoUrl ? (
        <label className="flex items-center text-sm">
          <input type="checkbox" name="removeLogo" className="mr-3 size-4 shrink-0 accent-primary" />
          Voltar para a palavra FISK
        </label>
      ) : null}
      {fileError && !state?.ok ? <p className="text-sm text-destructive">{fileError}</p> : null}
      {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      {state?.ok ? <p className="text-sm text-emerald-700">{state.ok}</p> : null}
      <Button disabled={pending}>{pending ? "Salvando…" : "Salvar aparência"}</Button>
    </form>
  );
}
