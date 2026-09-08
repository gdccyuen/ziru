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
    <section className="border-top mt-2 pt-1">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="d-flex w-100 align-items-center gap-1 py-2 border-0 bg-transparent text-start small text-uppercase fw-semibold text-secondary hover:text-body"
      >
        <ChevronDown className={cn("transition-transform", open && "rotate-180")} style={{ width: "1em", height: "1em" }} />
        {icon}
        <span>{title}</span>
        {badge}
      </button>
      {open ? <div className="pb-2">{children}</div> : null}
    </section>
  );
}
