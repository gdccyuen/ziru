"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function CollapsibleSection({
  title,
  badge,
  icon,
  defaultOpen = false,
  children,
}: {
  title: string;
  badge?: ReactNode;
  icon?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="border-t border-border/60">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
      >
        <ChevronDown
          className={cn("size-3 transition-transform", open && "rotate-180")}
        />
        {icon}
        <span>{title}</span>
        {badge}
      </button>
      {open ? <div className="pb-2">{children}</div> : null}
    </section>
  );
}
