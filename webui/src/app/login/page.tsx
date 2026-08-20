import { Suspense } from "react";
import { WebUILogoMark } from "@/components/webui-logo-mark";
import { Card, CardContent } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <Suspense>
      <div className="flex min-h-screen w-full items-center justify-center bg-background p-4">
        <Card className="m-auto w-full max-w-md rounded-2xl border-border/70 shadow-none">
          <CardContent className="flex flex-col items-center p-8 text-center">
            <div className="mb-6 flex size-12 items-center justify-center">
              <WebUILogoMark width={28} />
            </div>
            <h1 className="mb-1 text-2xl font-bold tracking-tight">Ziru WebUI</h1>
            <p className="mb-8 text-xs text-muted-foreground">
              Sign in with your core Ziru account.
            </p>
            <div className="w-full text-left">
              <LoginForm />
            </div>
          </CardContent>
        </Card>
      </div>
    </Suspense>
  );
}
