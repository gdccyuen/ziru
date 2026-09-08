import type { Grade, User } from "@/lib/api";

/**
 * Unified tab access (Ziru.1 plan §3.1).
 *
 * | Tab              | Roles                        |
 * |------------------|------------------------------|
 * | Query            | all authenticated users      |
 * | User admin       | administrator                |
 * | Attributes       | administrator                |
 * | Jobs             | administrator, librarian     |
 * | Document Intake  | librarian (+ administrator)  |
 */

export type TabId =
  | "query"
  | "admin"
  | "attributes"
  | "jobs"
  | "intake";

export type TabDef = {
  id: TabId;
  label: string;
  href: string;
  icon: string; // lucide icon name, resolved by the tabs component
  roles: Grade[];
  adminOnly: boolean;
};

export const TABS: readonly TabDef[] = [
  { id: "query", label: "Query", href: "/chat", icon: "MessageSquare", roles: ["administrator", "librarian", "user"], adminOnly: false },
  { id: "intake", label: "Document", href: "/documents", icon: "FilePlus", roles: ["administrator", "librarian"], adminOnly: false },
  { id: "admin", label: "Admin", href: "/admin", icon: "Users", roles: ["administrator"], adminOnly: true },
  { id: "attributes", label: "Attributes", href: "/attributes", icon: "Tags", roles: ["administrator"], adminOnly: true },
  { id: "jobs", label: "Jobs", href: "/jobs", icon: "ListChecks", roles: ["administrator", "librarian"], adminOnly: false },
] as const;

export function userCanViewTab(user: User | null, tab: TabDef): boolean {
  if (!user) return false;
  return tab.roles.includes(user.grade);
}

export function visibleTabs(user: User | null): readonly TabDef[] {
  return TABS.filter((tab) => userCanViewTab(user, tab));
}

export type TabIconKey = TabDef["icon"];
