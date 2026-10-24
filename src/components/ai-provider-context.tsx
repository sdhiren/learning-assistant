"use client";

import { createContext, useContext, type ReactNode } from "react";

/** Display data for the active AI provider. Only these two fields ever reach the browser. */
export interface AiProviderDisplay {
  /** e.g. "Claude", "GPT". */
  label: string;
  /** Footer text, e.g. "Runs locally with your Claude subscription." */
  usageNote: string;
}

const AiProviderContext = createContext<AiProviderDisplay | null>(null);

export function AiProviderProvider({
  label,
  usageNote,
  children,
}: AiProviderDisplay & { children: ReactNode }) {
  return <AiProviderContext value={{ label, usageNote }}>{children}</AiProviderContext>;
}

/** The active provider's label and usage note, filled in by the root layout. */
export function useAiProvider(): AiProviderDisplay {
  const value = useContext(AiProviderContext);
  if (!value) throw new Error("useAiProvider must be used inside AiProviderProvider");
  return value;
}
