"use client";

import { createContext, useContext, useRef, useState } from "react";
import { useActionState } from "react";
import { defaultAppearance, type Appearance } from "@/lib/brand";
import { logoFileError } from "@/lib/logo-file";
import { backgroundFromPhoto } from "@/lib/place-color";
import { LogoMaker } from "@/components/logo-maker";
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
  const chosenLogo = useRef<File | null>(null);
  const [state, action, pending] = useActionState(async (prev: ActionState, formData: FormData) => {
    const current = formData.get("logo");
    if (chosenLogo.current && (!(current instanceof File) || current.size === 0)) {
      formData.set("logo", chosenLogo.current);
    }
    return saveAppearance(prev, formData);
  }, null as ActionState);
  const [fileError, setFileError] = useState<string | null>(null);
  const [photoNote, setPhotoNote] = useState<string | null>(null);
  const [backgroundColor, setBackgroundColor] = useState(appearance.backgroundColor);
  const [photoPreview, setPhotoPreview] = useState(appearance.placePhotoUrl);
  const [pendingLogo, setPendingLogo] = useState<string | null>(null);
  const logoCheck = useRef(0);
  const photoCheck = useRef(0);

  return (
    <form
      action={action}
      className="space-y-3 rounded-2xl border bg-card p-4"
      onSubmit={(event) => {
        if (fileError) event.preventDefault();
      }}
    >
      <div>
        <h2 className="font-heading text-xl">Aparência</h2>
        <p className="text-sm text-muted-foreground">A logo, as cores e a frase da tela de entrada valem para a loja. Dá para enviar um arquivo, criar a logo pelo nome ou usar a foto do estabelecimento para sugerir a cor de fundo.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="buttonColor">Cor dos botões</Label>
          <Input id="buttonColor" name="buttonColor" type="color" defaultValue={appearance.buttonColor} className="h-10 w-full p-1" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="backgroundColor">Cor de fundo</Label>
          <Input id="backgroundColor" name="backgroundColor" type="color" value={backgroundColor} onChange={(event) => setBackgroundColor(event.target.value)} className="h-10 w-full p-1" />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="logo">Logo</Label>
          {pendingLogo ? (
            <img src={pendingLogo} alt="Logo escolhida" className="mb-2 h-12 max-w-[10rem] object-contain" />
          ) : appearance.logoUrl ? (
            <img src={appearance.logoUrl} alt="Logo atual" className="mb-2 h-12 max-w-[10rem] object-contain" />
          ) : (
            <p className="text-sm text-muted-foreground">Sem logo, o nome da loja aparece no lugar.</p>
          )}
          {pendingLogo ? <p className="mb-2 text-xs text-muted-foreground">Esta logo entra ao salvar a aparência.</p> : null}
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
              chosenLogo.current = null;
              setPendingLogo((current) => {
                if (current) URL.revokeObjectURL(current);
                return null;
              });
              void logoFileError(file).then((error) => {
                if (check !== logoCheck.current) return;
                if (error) input.value = "";
                setFileError(error);
              });
            }}
          />
          <p className="text-xs text-muted-foreground">PNG, JPG ou WebP, até 5 MB. Deixe em branco para manter a logo atual.</p>
          <LogoMaker
            shopName={appearance.name}
            onChoose={(file) => {
              chosenLogo.current = file;
              setPendingLogo((current) => {
                if (current) URL.revokeObjectURL(current);
                return URL.createObjectURL(file);
              });
              const input = document.getElementById("logo");
              if (input instanceof HTMLInputElement) input.value = "";
              setFileError(null);
            }}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="placePhoto">Foto do estabelecimento</Label>
          {photoPreview ? (
            <img src={photoPreview} alt="Foto do estabelecimento" className="mb-2 h-28 max-w-full rounded-lg object-cover" />
          ) : (
            <p className="text-sm text-muted-foreground">Envie uma foto da loja para sugerir a cor de fundo.</p>
          )}
          <Input
            id="placePhoto"
            name="placePhoto"
            type="file"
            accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
            onChange={(event) => {
              const input = event.currentTarget;
              const file = input.files?.[0];
              const check = ++photoCheck.current;
              if (!file) return;
              void logoFileError(file).then(async (error) => {
                if (check !== photoCheck.current) return;
                if (error) {
                  input.value = "";
                  setFileError(error);
                  setPhotoNote(null);
                  return;
                }
                setFileError(null);
                setPhotoPreview(URL.createObjectURL(file));
                const color = await backgroundFromPhoto(file);
                if (check !== photoCheck.current) return;
                if (!color) {
                  setPhotoNote("Não deu para ler uma cor nessa foto. Escolha a cor de fundo manualmente.");
                  return;
                }
                setBackgroundColor(color);
                setPhotoNote("A cor de fundo foi sugerida a partir da foto. Ajuste se quiser outra.");
              });
            }}
          />
          <p className="text-xs text-muted-foreground">PNG, JPG ou WebP, até 5 MB. A foto não substitui a logo.</p>
          {photoNote ? <p className="text-sm text-muted-foreground">{photoNote}</p> : null}
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
          Remover a logo
        </label>
      ) : null}
      {appearance.placePhotoUrl ? (
        <label className="flex items-center text-sm">
          <input type="checkbox" name="removePlacePhoto" className="mr-3 size-4 shrink-0 accent-primary" />
          Remover a foto do estabelecimento
        </label>
      ) : null}
      {fileError && !state?.ok ? <p className="text-sm text-destructive">{fileError}</p> : null}
      {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      {state?.ok ? <p className="text-sm text-emerald-700">{state.ok}</p> : null}
      <Button disabled={pending}>{pending ? "Salvando…" : "Salvar aparência"}</Button>
    </form>
  );
}
