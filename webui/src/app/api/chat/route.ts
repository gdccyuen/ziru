import { chatAnswerRouteService } from "@/domains/chat/route-answer"
import { logger } from "@/lib/logger"
import { routeResult } from "@/lib/route-result"

type ChatRouteEvent =
  | { readonly type: "done"; readonly body: unknown }
  | { readonly type: "error"; readonly status: number; readonly message: string }

export async function POST(request: Request): Promise<Response> {
  const body = await routeResult.readJsonOrNull(request)
  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const writeLine = (event: object): void => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
      }

      try {
        const result = await chatAnswerRouteService.answerChat({
          body,
          onProgress: (event) => writeLine(event),
        })

        if (result.status < 200 || result.status >= 300) {
          const message =
            typeof result.body === "object" &&
            result.body !== null &&
            "message" in result.body &&
            typeof result.body.message === "string"
              ? result.body.message
              : "The assistant could not answer right now."
          writeLine({ type: "error", status: result.status, message })
          return
        }

        writeLine({ type: "done", body: result.body })
      } catch (error) {
        logger.error("chat: stream failed", {
          error: error instanceof Error ? error.message : String(error),
        })
        writeLine({
          type: "error",
          status: 502,
          message: "The assistant could not answer right now.",
        })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  })
}

export type { ChatRouteEvent }
