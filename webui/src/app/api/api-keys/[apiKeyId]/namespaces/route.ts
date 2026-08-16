import type { NextResponse } from "next/server"

import { withApiErrorResponse } from "@/lib/api-error-response"
import { getCurrentUser } from "@/infrastructure/auth"
import { databaseRuntime } from "@/domains/workspace/database-runtime"
import { ziruApiKeysRepository } from "@/infrastructure/auth/ziru-api-keys-repository"
import { listZiruNamespaces } from "@/integrations/ziru"
import { nextRouteResponse } from "@/lib/next-route-response"
import { routeResult } from "@/lib/route-result"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ apiKeyId: string }> },
): Promise<NextResponse> {
  return withApiErrorResponse(
    "api-keys:namespaces",
    async () => {
      const { apiKeyId } = await params
      const user = await getCurrentUser()
      if (!user) {
        return nextRouteResponse.toNextResponse(
          routeResult.badRequest("Not authenticated."),
        )
      }

      const key = await databaseRuntime.runPromise(
        ziruApiKeysRepository.findByIdAndUserEffect(apiKeyId, user.id),
      )
      if (!key) {
        return nextRouteResponse.toNextResponse(
          routeResult.error(404, "API key not found."),
        )
      }

      const apiKey = await databaseRuntime.runPromise(
        ziruApiKeysRepository.decryptStoredEffect(key),
      )
      const namespaces = await listZiruNamespaces(apiKey)
      return nextRouteResponse.toNextResponse(routeResult.ok({ namespaces }))
    },
    "Could not list namespaces for this key.",
  )
}
