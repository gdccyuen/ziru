"use client";

import {
  ChevronDown,
  FileText,
  KeyRound,
  LayoutDashboard,
  ListTodo,
  LogOut,
  Menu,
  Moon,
  Settings,
  Sun,
  Tags,
  Users,
  Webhook,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, api } from "@/lib/api";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { gradeLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/users", label: "Users", icon: Users },
  { href: "/api-keys", label: "API Keys", icon: KeyRound },
  { href: "/attributes", label: "Attributes", icon: Tags },
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/jobs", label: "Jobs", icon: ListTodo },
  { href: "/webhooks", label: "Webhooks", icon: Webhook },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

const PAGE_TITLES: Record<string, string> = {
  "/": "Overview",
  "/users": "Users",
  "/api-keys": "API Keys",
  "/attributes": "Attribute Dictionary",
  "/documents": "Documents",
  "/jobs": "Jobs",
  "/webhooks": "Webhooks",
  "/settings": "Settings",
};

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label="Toggle theme"
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}

function SidebarNav({ grade, onNavigate }: { grade: string; onNavigate?: () => void }) {
  const pathname = usePathname();
  const visibleItems =
    grade === "administrator" ? NAV_ITEMS : NAV_ITEMS.filter((item) => item.href !== "/users");
  return (
    <nav className="flex flex-col gap-1 p-3">
      {visibleItems.map((item) => {
        const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function ForcedChangePassword() {
  const { refresh } = useAuth();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (newPassword !== confirm) {
      setError("New password and confirmation do not match");
      return;
    }
    setSubmitting(true);
    try {
      await api.changePassword(oldPassword, newPassword);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to change password");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Change your password</CardTitle>
          <CardDescription>
            Your administrator requires a password change before you can use the console.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="old-password">Current password</Label>
              <Input
                id="old-password"
                type="password"
                autoComplete="current-password"
                required
                value={oldPassword}
                onChange={(event) => setOldPassword(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                required
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm new password</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
              />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Updating…" : "Update password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

function RedirectTo({ to }: { to: string }) {
  const router = useRouter();
  useEffect(() => {
    router.replace(to);
  }, [router, to]);
  return null;
}

function ChangePasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!open) return;
    setOldPassword("");
    setNewPassword("");
    setConfirm("");
    setError(null);
    setSuccess(false);
  }, [open]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (newPassword !== confirm) {
      setError("New password and confirmation do not match");
      return;
    }
    setSubmitting(true);
    try {
      await api.changePassword(oldPassword, newPassword);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to change password");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Change password</DialogTitle>
          <DialogDescription>
            Your other sessions will be signed out; this session stays active.
          </DialogDescription>
        </DialogHeader>
        {success ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Password changed successfully. Your session remains active.
            </p>
            <DialogFooter>
              <Button type="button" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="account-old-password">Current password</Label>
              <Input
                id="account-old-password"
                type="password"
                autoComplete="current-password"
                required
                value={oldPassword}
                onChange={(event) => setOldPassword(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="account-new-password">New password</Label>
              <Input
                id="account-new-password"
                type="password"
                autoComplete="new-password"
                required
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Policy: at least 8 characters, with uppercase, lowercase, and a digit.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="account-confirm-password">Confirm new password</Label>
              <Input
                id="account-confirm-password"
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
              />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <DialogFooter>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Updating…" : "Update password"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DashboardContent({ children }: { children: React.ReactNode }) {
  const { user, loading, error, logout } = useAuth();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Unable to load your session</CardTitle>
            <CardDescription>
              {error ?? "You are not signed in. Sign in to continue."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/login">
              <Button className="w-full">Go to login</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (user.must_change_password) {
    return <ForcedChangePassword />;
  }

  if (pathname.startsWith("/users") && user.grade !== "administrator") {
    return <RedirectTo to="/" />;
  }

  const title = PAGE_TITLES[pathname] ?? "Ziru Admin";
  const accountInitial = (user.email ?? user.grade).charAt(0).toUpperCase();

  return (
    <div className="flex min-h-dvh">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r bg-card md:flex">
        <div className="flex h-14 items-center border-b px-4 font-semibold">Ziru Admin</div>
        <div className="flex-1 overflow-y-auto">
          <SidebarNav grade={user.grade} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col md:pl-60">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Open menu"
            onClick={() => setMobileOpen((open) => !open)}
          >
            <Menu className="h-4 w-4" />
          </Button>
          <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">{title}</h1>
          <Badge variant="outline" className="hidden sm:inline-flex">
            {gradeLabel(user.grade)}
          </Badge>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  className="flex items-center gap-2 px-2"
                  aria-label="Account menu"
                >
                  <Avatar className="size-8">
                    <AvatarFallback className="text-xs">{accountInitial}</AvatarFallback>
                  </Avatar>
                  <span className="hidden max-w-[180px] truncate text-sm text-muted-foreground lg:inline">
                    {user.email}
                  </span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setChangePasswordOpen(true)}>
                  <KeyRound className="h-4 w-4" />
                  Change password
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void logout()}>
                  <LogOut className="h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {mobileOpen ? (
          <div className="border-b bg-card md:hidden">
            <SidebarNav grade={user.grade} onNavigate={() => setMobileOpen(false)} />
          </div>
        ) : null}

        <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>

      <ChangePasswordDialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen} />
    </div>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <DashboardContent>{children}</DashboardContent>
    </AuthProvider>
  );
}
