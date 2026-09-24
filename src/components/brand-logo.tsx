import Link from "next/link";
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
  return (
    <Link href={href} className={cn("flex items-center gap-2.5", className)}>
      <span
        className={cn(
          "font-heading text-xl tracking-tight",
          inverted ? "text-white" : "text-primary",
        )}
      >
        FISK
      </span>
      <span className={cn("h-6 w-px", inverted ? "bg-white/40" : "bg-border")} />
      <span className="leading-tight">
        <span className={cn("block text-sm font-semibold tracking-tight", inverted && "text-white")}>
          Snack Station
        </span>
        <span className={cn("block text-[11px]", inverted ? "text-white/75" : "text-muted-foreground")}>
          estação de lanches
        </span>
      </span>
    </Link>
  );
}
