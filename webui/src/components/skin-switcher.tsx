"use client";

import { useEffect, useState } from "react";
import { SwatchBook, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Bootstrap-5-token skin switcher (Ziru.1 plan §3.2).
 *
 * Sets `data-skin` on <html> and persists the choice in localStorage. The
 * actual colours are declared as CSS variables (Bootstrap-5 token names,
 * e.g. --bs-primary/--bs-body-bg) in globals.css.
 */

const SKINS = [
  { id: "auto", label: "Auto (follow theme)", description: "Neutral default" },
  { id: "blue", label: "Blue", description: "Bootstrap default accent" },
  { id: "green", label: "Green", description: "Security / audit accent" },
  { id: "purple", label: "Purple", description: "Deep accent" },
  { id: "warm", label: "Warm", description: "Low-contrast warm accent" },
] as const;

type SkinId = (typeof SKINS)[number]["id"];

const SKIN_KEY = "ziru-skin";

function readStoredSkin(): SkinId {
  if (typeof window === "undefined") return "auto";
  const value = window.localStorage.getItem(SKIN_KEY);
  return (SKINS.some((s) => s.id === value) ? value : "auto") as SkinId;
}

export function SkinSwitcher() {
  const [skin, setSkin] = useState<SkinId>("auto");

  useEffect(() => {
    const stored = readStoredSkin();
    setSkin(stored);
    document.documentElement.setAttribute("data-skin", stored);
  }, []);

  function apply(next: SkinId) {
    setSkin(next);
    window.localStorage.setItem(SKIN_KEY, next);
    document.documentElement.setAttribute("data-skin", next);
  }

  const isActive = (id: SkinId) => skin === id;
  const Icon: LucideIcon = SwatchBook;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Switch skin"
          className="border-border/70 bg-background/80 hover:bg-accent/80"
        >
          <Icon className="size-[1.2rem]" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {SKINS.map((s) => (
          <DropdownMenuItem
            key={s.id}
            onClick={() => apply(s.id)}
            className={isActive(s.id) ? "bg-accent/60 font-semibold" : undefined}
          >
            <div className="grid w-full gap-0.5">
              <span className="text-sm">{s.label}</span>
              <span className="text-[11px] text-muted-foreground">
                {s.description}
              </span>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
