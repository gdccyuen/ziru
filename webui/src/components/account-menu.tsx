"use client";

import { useState } from "react";
import Link from "next/link";
import { KeyRound, LogOut, Settings } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth-context";
import { gradeLabel } from "@/lib/format";
import { ChangePasswordDialog } from "@/components/change-password-dialog";

export function AccountMenu() {
  const { user, logout } = useAuth();
  const [passwordOpen, setPasswordOpen] = useState(false);

  if (!user) return null;

  const initials = user.email
    .split(/[@._-]+/)[0]
    .slice(0, 2)
    .toUpperCase();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Account menu"
            className="flex items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25"
          >
            <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
              {initials}
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel>
            <div className="grid gap-1">
              <span className="text-sm font-semibold">{user.email}</span>
              <span className="flex items-center gap-1.5">
                <Badge variant="secondary" className="text-[10px]">
                  {gradeLabel(user.grade)}
                </Badge>
                {user.must_change_password ? (
                  <Badge variant="destructive" className="text-[10px]">
                    Password change required
                  </Badge>
                ) : null}
              </span>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/settings">
              <Settings className="size-4" />
              Settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setPasswordOpen(true)}>
            <KeyRound className="size-4" />
            Change password
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void logout()}>
            <LogOut className="size-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ChangePasswordDialog
        open={passwordOpen}
        onOpenChange={setPasswordOpen}
      />
    </>
  );
}
