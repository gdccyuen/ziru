import { handleTokenRequest } from "@server/oauth-token-handlers";

/** Legacy alias for /api/oauth/token. Retained for the deployed MCP client. */
export async function POST(request: Request): Promise<Response> {
  return handleTokenRequest(request);
}
