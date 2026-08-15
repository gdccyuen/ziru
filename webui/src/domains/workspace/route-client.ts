import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
  Ndjson,
} from "@effect/platform"
import type { HttpClientError } from "@effect/platform/HttpClientError"
import type { HttpBodyError } from "@effect/platform/HttpBody"
import { Effect, Stream } from "effect"

type NdjsonClientError =
  | ChatStreamError
  | HttpClientError
  | HttpBodyError
  | Ndjson.NdjsonError

type WorkspaceRouteClientModule = {
  readonly deleteJson: <T>(url: string, body: unknown) => Promise<T>
  readonly deleteJsonWithStatus: <T>(
    url: string,
    body: unknown,
  ) => Promise<JsonRouteResponse<T>>
  readonly getJson: <T>(url: string) => Promise<T>
  readonly postJson: <T>(url: string, body: unknown) => Promise<T>
  readonly postJsonWithStatus: <T>(
    url: string,
    body: unknown,
  ) => Promise<JsonRouteResponse<T>>
  readonly postFormData: <T>(url: string, body: FormData) => Promise<T>
  readonly postFormDataWithStatus: <T>(
    url: string,
    body: FormData,
  ) => Promise<JsonRouteResponse<T>>
  readonly postNdjsonWithProgress: <TDone>(
    url: string,
    body: unknown,
    onProgress: (line: unknown) => void,
  ) => Promise<TDone>
  readonly patchJson: <T>(url: string, body: unknown) => Promise<T>
  readonly patchJsonWithStatus: <T>(
    url: string,
    body: unknown,
  ) => Promise<JsonRouteResponse<T>>
}

type JsonRouteResponse<T> = {
  readonly status: number
  readonly body: T
}

export class ChatStreamError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = "ChatStreamError"
    this.status = status
  }
}

type JsonRequestInput = {
  readonly method: "DELETE" | "GET" | "PATCH" | "POST"
  readonly url: string
  readonly body?: unknown
}

async function deleteJson<T>(url: string, body: unknown): Promise<T> {
  return (await requestJson<T>({ method: "DELETE", url, body })).body
}

async function getJson<T>(url: string): Promise<T> {
  return (await requestJson<T>({ method: "GET", url })).body
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  return (await postJsonWithStatus<T>(url, body)).body
}

function postJsonWithStatus<T>(
  url: string,
  body: unknown,
): Promise<JsonRouteResponse<T>> {
  return requestJson<T>({ method: "POST", url, body })
}

async function postFormData<T>(url: string, body: FormData): Promise<T> {
  return (await postFormDataWithStatus<T>(url, body)).body
}

function postFormDataWithStatus<T>(
  url: string,
  body: FormData,
): Promise<JsonRouteResponse<T>> {
  return Effect.runPromise(
    requestFormDataEffect<T>(url, body).pipe(
      Effect.provide(FetchHttpClient.layer),
    ),
  )
}

function postNdjsonWithProgress<TDone>(
  url: string,
  body: unknown,
  onProgress: (line: unknown) => void,
): Promise<TDone> {
  return Effect.runPromise(
    requestNdjsonEffect<TDone>(url, body, onProgress)
      .pipe(Effect.provide(FetchHttpClient.layer), Effect.either),
  ).then((either) => {
    if (either._tag === "Right") return either.right
    throw either.left
  })
}

function requestNdjsonEffect<TDone>(
  url: string,
  body: unknown,
  onProgress: (line: unknown) => void,
): Effect.Effect<TDone, NdjsonClientError, HttpClient.HttpClient> {
  return Effect.gen(function* () {
    const request = yield* HttpClientRequest.post(
      resolveSameOriginUrl(url),
    ).pipe(HttpClientRequest.bodyJson(body))
    const response = yield* HttpClient.execute(request)

    if (response.status < 200 || response.status >= 300) {
      const message = yield* readJsonErrorMessage(response)
      return yield* Effect.fail(new ChatStreamError(response.status, message))
    }

    const lines = Stream.pipeThroughChannel(
      response.stream,
      Ndjson.unpack({ ignoreEmptyLines: true }),
    )
    const outcome: NdjsonStreamOutcome = { tag: "pending" }

    yield* Stream.runForEach(lines, (line) =>
      Effect.sync(() => handleNdjsonLine(line, outcome, onProgress)),
    )

    if (outcome.tag === "error") {
      return yield* Effect.fail(
        new ChatStreamError(outcome.status ?? 502, outcome.message ?? ""),
      )
    }
    if (outcome.tag === "done") {
      return outcome.body as TDone
    }
    return yield* Effect.fail(
      new ChatStreamError(502, "The assistant could not answer right now."),
    )
  })
}

type NdjsonStreamOutcome = {
  tag: "pending" | "done" | "error"
  body?: unknown
  status?: number
  message?: string
}

function handleNdjsonLine(
  line: unknown,
  outcome: NdjsonStreamOutcome,
  onProgress: (line: unknown) => void,
): void {
  if (typeof line !== "object" || line === null) return
  const record = line as Readonly<Record<string, unknown>>
  if (record["type"] === "done") {
    outcome.tag = "done"
    outcome.body = record["body"]
    return
  }
  if (record["type"] === "error") {
    outcome.tag = "error"
    outcome.status = getLineStatus(record)
    outcome.message = getLineMessage(record)
    return
  }
  onProgress(line)
}

function getLineStatus(record: Readonly<Record<string, unknown>>): number {
  return typeof record["status"] === "number" ? record["status"] : 502
}

function getLineMessage(record: Readonly<Record<string, unknown>>): string {
  const message = record["message"]
  return typeof message === "string" && message.length > 0
    ? message
    : "The assistant could not answer right now."
}

function readJsonErrorMessage(response: {
  readonly status: number
  readonly json: Effect.Effect<unknown, unknown, never>
}): Effect.Effect<string> {
  return Effect.gen(function* () {
    const body: unknown = yield* response.json.pipe(
      Effect.catchAllCause(() => Effect.succeed(null)),
    )
    if (
      typeof body === "object" &&
      body !== null &&
      "message" in body &&
      typeof body.message === "string" &&
      body.message.length > 0
    ) {
      return body.message
    }
    return "The assistant could not answer right now."
  })
}

function requestFormDataEffect<T>(
  url: string,
  body: FormData,
): Effect.Effect<JsonRouteResponse<T>, unknown, HttpClient.HttpClient> {
  return Effect.gen(function* () {
    const request = yield* buildFormDataRequest(url, body)
    const response = yield* HttpClient.execute(request)
    const responseBody: unknown = yield* response.json

    return {
      status: response.status,
      body: responseBody as T,
    }
  })
}

function buildFormDataRequest(url: string, body: FormData) {
  return Effect.succeed(
    HttpClientRequest.post(resolveSameOriginUrl(url)).pipe(
      HttpClientRequest.setHeaders({ Accept: "application/json" }),
      HttpClientRequest.bodyFormData(body),
    ),
  )
}

async function patchJson<T>(url: string, body: unknown): Promise<T> {
  return (await patchJsonWithStatus<T>(url, body)).body
}

function patchJsonWithStatus<T>(
  url: string,
  body: unknown,
): Promise<JsonRouteResponse<T>> {
  return requestJson<T>({ method: "PATCH", url, body })
}

function deleteJsonWithStatus<T>(
  url: string,
  body: unknown,
): Promise<JsonRouteResponse<T>> {
  return requestJson<T>({ method: "DELETE", url, body })
}

function requestJson<T>(
  input: JsonRequestInput,
): Promise<JsonRouteResponse<T>> {
  return Effect.runPromise(
    requestJsonEffect<T>(input).pipe(Effect.provide(FetchHttpClient.layer)),
  )
}

function requestJsonEffect<T>(
  input: JsonRequestInput,
): Effect.Effect<JsonRouteResponse<T>, unknown, HttpClient.HttpClient> {
  return Effect.gen(function* () {
    const request = yield* buildRequest(input)
    const response = yield* HttpClient.execute(request)
    const body: unknown = yield* response.json

    return {
      status: response.status,
      body: body as T,
    }
  })
}

function buildRequest(input: JsonRequestInput) {
  const url = resolveSameOriginUrl(input.url)
  if (input.method === "GET") {
    return Effect.succeed(HttpClientRequest.get(url))
  }
  if (input.method === "DELETE") {
    return HttpClientRequest.del(url).pipe(HttpClientRequest.bodyJson(input.body))
  }
  if (input.method === "PATCH") {
    return HttpClientRequest.patch(url).pipe(
      HttpClientRequest.bodyJson(input.body),
    )
  }
  return HttpClientRequest.post(url).pipe(HttpClientRequest.bodyJson(input.body))
}

function resolveSameOriginUrl(path: string): string {
  const origin = globalThis.location?.origin
  return new URL(path, origin ?? "http://localhost").toString()
}

export const workspaceRouteClient: WorkspaceRouteClientModule = {
  deleteJson,
  deleteJsonWithStatus,
  getJson,
  postJson,
  postJsonWithStatus,
  postFormData,
  postFormDataWithStatus,
  postNdjsonWithProgress,
  patchJson,
  patchJsonWithStatus,
}
