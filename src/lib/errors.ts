/**
 * Expected, user-facing failures. Their messages are safe to show in the UI;
 * any other error is treated as unexpected and replaced with a generic message.
 */
export class AppError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class NotFoundError extends AppError {}

export class ConflictError extends AppError {}

export class ValidationError extends AppError {}

/** Claude could not produce a usable response (timeout, refusal, bad output). */
export class AiGenerationError extends AppError {}
