import { cn } from "@/lib/utils";

export function Badge({
  className,
  tone = "default",
  ...props
}: React.ComponentProps<"span"> & { tone?: "default" | "ok" | "watch" | "high" | "muted" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        tone === "default" && "bg-secondary text-secondary-foreground",
        tone === "ok" && "bg-emerald-100 text-emerald-800",
        tone === "watch" && "bg-amber-100 text-amber-900",
        tone === "high" && "bg-rose-100 text-rose-800",
        tone === "muted" && "bg-muted text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}
