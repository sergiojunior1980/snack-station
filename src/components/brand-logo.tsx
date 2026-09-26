"use client";

import Link from "next/link";
import { useAppearance } from "@/components/appearance";
import { cn } from "@/lib/utils";

export function BrandLogo({
  className,
  inverted = false,
  href = "/",
}: {
  className?: string;
  inverted?: boolean;
  href?: string;
}) {
  const { logoUrl } = useAppearance();

  return (
    <Link href={href} className={cn("flex items-center gap-2.5", className)}>
      {logoUrl ? (
        <img
          src={logoUrl}
          alt="Logo"
          className={cn("h-9 max-w-[8.5rem] object-contain", inverted && "rounded-md bg-white px-2 py-1")}
        />
      ) : (
        <>
          <span className={cn("font-heading text-xl tracking-tight", inverted ? "text-white" : "text-primary")}>FISK</span>
          <span className={cn("h-6 w-px", inverted ? "bg-white/40" : "bg-border")} />
          <span className="leading-tight">
            <span className={cn("block text-sm font-semibold tracking-tight", inverted && "text-white")}>Snack Station</span>
            <span className={cn("block text-[11px]", inverted ? "text-white/75" : "text-muted-foreground")}>estação de lanches</span>
          </span>
        </>
      )}
    </Link>
  );
}
