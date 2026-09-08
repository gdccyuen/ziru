"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FilePlus,
  ListChecks,
  MessageSquare,
  Tags,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { visibleTabs } from "@/lib/access";
import { useAuth } from "@/lib/auth-context";

const ICONS: Record<string, LucideIcon> = {
  MessageSquare,
  Users,
  Tags,
  ListChecks,
  FilePlus,
};

export function AppTabs() {
  const pathname = usePathname();
  const { user } = useAuth();
  const tabs = visibleTabs(user);

  return (
    <ul className="nav nav-pills gap-1" aria-label="Primary">
      {tabs.map((tab) => {
        const active = pathname.startsWith(tab.href);
        const Icon = ICONS[tab.icon];
        return (
          <li className="nav-item" key={tab.id}>
            <Link
              href={tab.href}
              className={cn(
                "nav-link d-inline-flex align-items-center gap-1 text-nowrap px-2 py-1",
                active && "active",
              )}
            >
              <Icon style={{ width: "1em", height: "1em" }} />
              <span className="d-none d-md-inline">{tab.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
