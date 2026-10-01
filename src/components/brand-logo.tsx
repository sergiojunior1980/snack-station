"use client";

import Link from "next/link";
import { useAppearance } from "@/components/appearance";
import { cn } from "@/lib/utils";

export function BrandLogo({
  className,
  inverted = false,
  href = "/",
  logoUrl,
  name,
}: {
  className?: string;
  inverted?: boolean;
  href?: string;
  logoUrl?: string;
  name?: string;
}) {
  const appearance = useAppearance();
  const url = logoUrl === undefined ? appearance.logoUrl : logoUrl;
  const label = (name === undefined ? appearance.name : name).trim() || "Loja";

  return (
    <Link href={href} className={cn("flex items-center gap-2.5", className)}>
      {url ? (
        <img
          src={url}
          alt="Logo"
          className={cn("h-9 max-w-[8.5rem] object-contain", inverted && "rounded-md bg-white px-2 py-1")}
        />
      ) : (
        <span className={cn("font-heading text-xl tracking-tight", inverted ? "text-white" : "text-primary")}>{label}</span>
      )}
    </Link>
  );
}
