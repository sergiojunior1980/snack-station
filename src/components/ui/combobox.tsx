"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function Combobox({
  name,
  label,
  options,
  value,
  onChange,
  placeholder = "Escolha",
  searchPlaceholder = "Buscar categoria",
  emptyLabel = "Nenhuma categoria encontrada.",
}: {
  name: string;
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = options.find((option) => option.value === value);
  const visible = options.filter((option) => option.label.toLowerCase().includes(query.trim().toLowerCase()));

  useEffect(() => {
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    window.addEventListener("mousedown", onPointer);
    return () => window.removeEventListener("mousedown", onPointer);
  }, []);

  return (
    <div ref={rootRef} className="relative space-y-1.5">
      <label className="text-sm font-medium" htmlFor={listId}>
        {label}
      </label>
      <input type="hidden" name={name} value={value} />
      <button
        id={listId}
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => {
          setOpen((current) => !current);
          setQuery("");
        }}
        className="flex h-11 w-full items-center justify-between rounded-xl border bg-card px-3 text-left text-sm"
      >
        <span className={selected ? "" : "text-muted-foreground"}>{selected?.label ?? placeholder}</span>
        <ChevronDown className="size-4 text-muted-foreground" />
      </button>
      {open ? (
        <div className="absolute z-20 mt-1 w-full rounded-xl border bg-card p-2 shadow-lg">
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            className="mb-2 h-9 w-full rounded-lg border bg-background px-3 text-sm outline-none"
          />
          <ul role="listbox" className="max-h-52 overflow-auto">
            {visible.length === 0 ? (
              <li className="px-2 py-3 text-sm text-muted-foreground">{emptyLabel}</li>
            ) : (
              visible.map((option) => (
                <li key={option.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={option.value === value}
                    className={cn(
                      "w-full rounded-lg px-2 py-2 text-left text-sm hover:bg-secondary",
                      option.value === value && "bg-secondary font-medium",
                    )}
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                  >
                    {option.label}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
