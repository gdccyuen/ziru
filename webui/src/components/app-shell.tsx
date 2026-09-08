"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { WebUILogoMark } from "@/components/webui-logo-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { SkinSwitcher } from "@/components/skin-switcher";
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
      {/* Bootstrap 5 shell (Ziru.1 unified UI) */}
      <nav
        className="navbar navbar-expand sticky-top border-bottom bg-body-tertiary px-3 px-lg-4"
        style={{ ["--bs-navbar-padding-y" as string]: "0.3rem" }}
      >
        <div className="container-fluid">
          <a className="navbar-brand d-flex align-items-center gap-2 fw-bold text-foreground" href="/chat">
            <WebUILogoMark width={22} />
            <span className="d-none d-sm-inline">Ziru</span>
          </a>
          <div className="navbar-collapse d-flex flex-wrap align-items-center gap-2">
            <AppTabs />
            <div className="ms-auto d-flex align-items-center gap-2">
              <span className="d-none d-md-block text-end me-1">
                <span className="d-block small fw-semibold text-foreground">
                  {user.email}
                </span>
                <span className="d-block text-secondary">
                  {gradeLabel(user.grade)}
                </span>
              </span>
              <ThemeToggle />
              <SkinSwitcher />
              <AccountMenu />
            </div>
          </div>
        </div>
      </nav>

      <main
        className={cn(
          "mx-auto w-full flex-1 py-4",
          isChat ? "max-w-[1700px] px-2 lg:px-3" : "max-w-6xl px-4 lg:px-6",
        )}
      >
        {children}
      </main>
    </div>
  );
}
