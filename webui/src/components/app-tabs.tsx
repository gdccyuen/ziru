"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, FileText, MessageSquare, Search } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  {
    href: "/search",
    label: "Search",
    icon: Search,
  },
  {
    href: "/documents",
    label: "Documents",
    icon: FileText,
  },
  {
    href: "/chat",
    label: "Chat",
    icon: MessageSquare,
  },
  {
    href: "/settings",
    label: "Settings",
    icon: BookOpen,
  },
] as const;

export function AppTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary" className="flex items-center gap-1">
      {ITEMS.map((item) => {
        const active = pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            <span className="hidden sm:inline">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
