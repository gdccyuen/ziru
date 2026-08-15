import { handleRevokeRequest } from "@server/oauth-token-handlers";

/** Legacy alias for /api/oauth/revoke. Retained for the deployed MCP client. */
export async function POST(request: Request): Promise<Response> {
  return handleRevokeRequest(request);
}
