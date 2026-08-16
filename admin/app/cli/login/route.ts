import { type ConsentSurface, handleConsentGet, handleConsentPost } from "@server/oauth-consent";

const CLI_CONSENT_SURFACE: ConsentSurface = {
  loginPath: "/cli/login",
  title: "Authorize Ziru CLI",
  summary: "is requesting access to your Ziru account from the command line.",
};

export async function GET(request: Request): Promise<Response> {
  return handleConsentGet(request, CLI_CONSENT_SURFACE);
}

export async function POST(request: Request): Promise<Response> {
  return handleConsentPost(request, CLI_CONSENT_SURFACE);
}
