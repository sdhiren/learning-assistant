import type { LlmClient, StructuredRequest } from "@/server/ai/llm-client";

type Responder = (request: StructuredRequest<unknown>) => unknown;

/**
 * Test double for LlmClient. Responses are registered per task and are
 * validated against the request's schema, just like the real client does.
 */
export class FakeLlmClient implements LlmClient {
  readonly requests: StructuredRequest<unknown>[] = [];
  private readonly responders = new Map<string, Responder>();

  respondTo(task: string, response: unknown | Responder): this {
    this.responders.set(
      task,
      typeof response === "function" ? (response as Responder) : () => response,
    );
    return this;
  }

  async generateStructured<T>(request: StructuredRequest<T>): Promise<T> {
    this.requests.push(request as StructuredRequest<unknown>);
    const responder = this.responders.get(request.task);
    if (!responder) throw new Error(`No fake response registered for task "${request.task}"`);
    return request.schema.parse(responder(request as StructuredRequest<unknown>));
  }

  requestsFor(task: string): StructuredRequest<unknown>[] {
    return this.requests.filter((request) => request.task === task);
  }
}
