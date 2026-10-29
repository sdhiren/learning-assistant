import type {
  GenerationHooks,
  LlmClient,
  LlmUsage,
  StructuredRequest,
} from "@/server/ai/llm-client";
import { ProviderError, type ProviderErrorKind } from "@/server/ai/provider-errors";

type Responder = (request: StructuredRequest<unknown>) => unknown;

interface Registered {
  respond: Responder;
  usage?: LlmUsage;
}

/**
 * Test double for LlmClient. Responses are registered per task and are
 * validated against the request's schema, just like the real client does.
 */
export class FakeLlmClient implements LlmClient {
  readonly requests: StructuredRequest<unknown>[] = [];
  private readonly responders = new Map<string, Registered>();

  constructor(readonly providerLabel = "Claude") {}

  /** Registers a response; `usage` is reported through `onUsage` before parsing. */
  respondTo(
    task: string,
    response: unknown | Responder,
    { usage }: { usage?: LlmUsage } = {},
  ): this {
    this.responders.set(task, {
      respond: typeof response === "function" ? (response as Responder) : () => response,
      usage,
    });
    return this;
  }

  /** Makes every call for `task` fail with a ProviderError of `kind`. */
  failWith(task: string, kind: ProviderErrorKind): this {
    return this.respondTo(task, () => {
      throw new ProviderError(kind, `Fake ${kind} failure`);
    });
  }

  async generateStructured<T>(request: StructuredRequest<T>, hooks?: GenerationHooks): Promise<T> {
    this.requests.push(request as StructuredRequest<unknown>);
    const registered = this.responders.get(request.task);
    if (!registered) throw new Error(`No fake response registered for task "${request.task}"`);
    if (registered.usage) hooks?.onUsage?.(registered.usage);
    return request.schema.parse(registered.respond(request as StructuredRequest<unknown>));
  }

  requestsFor(task: string): StructuredRequest<unknown>[] {
    return this.requests.filter((request) => request.task === task);
  }
}
