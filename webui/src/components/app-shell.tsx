"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { WebUILogoMark } from "@/components/webui-logo-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { AccountMenu } from "@/components/account-menu";
import { AppTabs } from "@/components/app-tabs";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/lib/auth-context";
import { gradeLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isChat = pathname === "/chat";

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, router, user]);

  useEffect(() => {
    if (user?.must_change_password) {
      router.replace("/force-change-password");
    }
  }, [router, user?.must_change_password]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Spinner className="size-6" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-4 border-b border-border/70 bg-background/95 px-4 backdrop-blur-sm lg:px-6">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <WebUILogoMark width={22} />
            <span className="truncate text-[16px] font-bold text-foreground">
              Ziru WebUI
            </span>
          </div>
          <AppTabs />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden text-right md:block">
            <span className="block max-w-[180px] truncate text-xs font-semibold text-foreground">
              {user.email}
            </span>
            <span className="block text-[10px] text-muted-foreground">
              {gradeLabel(user.grade)}
            </span>
          </span>
          <ThemeToggle />
          <AccountMenu />
        </div>
      </header>
      <main
        className={cn(
          "mx-auto w-full flex-1 py-6",
          isChat ? "max-w-[1700px] px-2 lg:px-3" : "max-w-6xl px-4 lg:px-6",
        )}
      >
        {children}
      </main>
    </div>
  );
}
