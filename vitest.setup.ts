import { vi } from "vitest";

// `server-only` throws when imported outside a React Server environment.
vi.mock("server-only", () => ({}));
