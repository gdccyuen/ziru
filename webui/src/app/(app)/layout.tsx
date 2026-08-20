import { AuthProvider } from "@/lib/auth-context";
import { AppShell } from "@/components/app-shell";

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <AuthProvider>
      <AppShell>{children}</AppShell>
    </AuthProvider>
  );
}
