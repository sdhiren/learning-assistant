import { describe, expect, it } from "vitest";

import { AI_PROVIDER_CHOICES, aiSettingsInput, SECRET_KIND_CHOICES } from "@/domain/input-schemas";
import { buildAgentEnv } from "@/server/ai/claude-agent-client";
import { MissingKeyLlmClient } from "@/server/ai/missing-key-llm-client";
import { claudeConfigDirFor, resolveProfileAiConfig } from "@/server/ai/profile-ai-config";
import { ProviderError } from "@/server/ai/provider-errors";
import { PROVIDER_IDS } from "@/server/ai/providers";
import { parseEnv } from "@/server/config/env";
import { generateDataKey } from "@/server/crypto/secret-box";
import { createRegistryDatabase } from "@/server/db/app-client";
import { profiles } from "@/server/db/app-schema";
import { SECRET_KINDS, SecretService } from "@/server/services/secret-service";

const env = parseEnv({ AI_PROVIDER: "claude-code", ANTHROPIC_API_KEY: "sk-ant-env" });
const profile = (overrides: Partial<Parameters<typeof resolveProfileAiConfig>[0]> = {}) => ({
  id: "p1",
  aiProvider: null,
  aiModel: null,
  claudeSignedInAt: null,
  ...overrides,
});

describe("resolveProfileAiConfig", () => {
  it("uses the env defaults when the profile has no choice (sdhiren, existing setups)", () => {
    const config = resolveProfileAiConfig(profile(), env, {});
    expect(config).toMatchObject({ provider: "claude-code", model: "claude-opus-5-5" });
    expect(config.claudeConfigDir).toBeUndefined();
    expect(config.oauthToken).toBeUndefined();
  });

  it("prefers the profile's Claude login, then a pasted token, then the machine login", () => {
    const signedIn = profile({ aiProvider: "claude-code", claudeSignedInAt: new Date() });
    const token = { claude_oauth_token: "sk-ant-oat-pasted" };
    expect(resolveProfileAiConfig(signedIn, env, token)).toMatchObject({
      claudeConfigDir: claudeConfigDirFor(env.PROFILES_DIR, "p1"),
    });
    expect(resolveProfileAiConfig(signedIn, env, token).oauthToken).toBeUndefined();
    expect(resolveProfileAiConfig(profile(), env, token).oauthToken).toBe("sk-ant-oat-pasted");
  });

  it("prefers a saved key over the env key, and applies the profile's model", () => {
    const chosen = profile({ aiProvider: "anthropic", aiModel: "claude-sonnet-5-5" });
    expect(resolveProfileAiConfig(chosen, env, {})).toMatchObject({
      apiKey: "sk-ant-env",
      model: "claude-sonnet-5-5",
    });
    expect(resolveProfileAiConfig(chosen, env, { "api_key:anthropic": "sk-ant-own" }).apiKey).toBe(
      "sk-ant-own",
    );
  });

  it("leaves the key empty when neither the profile nor the env has one", () => {
    const config = resolveProfileAiConfig(profile({ aiProvider: "gemini" }), env, {});
    expect(config.apiKey).toBeUndefined();
  });
});

describe("MissingKeyLlmClient", () => {
  it("tells the user to add a key, as an auth failure", async () => {
    const error: unknown = await new MissingKeyLlmClient("openai")
      .generateStructured()
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ProviderError);
    expect(error).toMatchObject({
      kind: "invalid_key",
      message: "Add your OpenAI API key in Profile → AI settings.",
    });
  });
});

describe("buildAgentEnv", () => {
  const source = {
    PATH: "/bin",
    ANTHROPIC_API_KEY: "sk-ant-x",
    CLAUDE_CODE_OAUTH_TOKEN: "inherited",
  };

  it("keeps the machine login when the profile has none", () => {
    const built = buildAgentEnv(source);
    expect(built.ANTHROPIC_API_KEY).toBeUndefined();
    expect(built.CLAUDE_CODE_OAUTH_TOKEN).toBe("inherited");
    expect(built.CLAUDE_CONFIG_DIR).toBeUndefined();
  });

  it("uses the profile's config dir and strips an inherited token", () => {
    const built = buildAgentEnv(source, { configDir: "/data/profiles/p1/claude" });
    expect(built.CLAUDE_CONFIG_DIR).toBe("/data/profiles/p1/claude");
    expect(built.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined();
  });

  it("uses a pasted token instead of an inherited one", () => {
    expect(buildAgentEnv(source, { oauthToken: "pasted" }).CLAUDE_CODE_OAUTH_TOKEN).toBe("pasted");
  });
});

describe("SecretService", () => {
  const setup = () => {
    const registry = createRegistryDatabase(":memory:");
    for (const id of ["a", "b"]) {
      registry
        .insert(profiles)
        .values({
          id,
          username: id + "-user",
          usernameKey: id + "-user",
          firstName: "F",
          lastName: "L",
          dbPath: `/tmp/${id}.db`,
          createdAt: new Date(),
        })
        .run();
    }
    return { registry, secrets: new SecretService(registry) };
  };

  it("stores only ciphertext and a hint, and decrypts with the profile's key", () => {
    const { registry, secrets } = setup();
    const dek = generateDataKey();
    expect(secrets.set("a", dek, "api_key:openai", "sk-SENTINEL-1234").hint).toBe("1234");

    const raw = JSON.stringify(registry.$client.prepare("SELECT * FROM profile_secrets").all());
    expect(raw).not.toContain("SENTINEL");
    expect(secrets.hints("a")["api_key:openai"]?.hint).toBe("1234");
    expect(secrets.loadDecrypted("a", dek)).toEqual({ "api_key:openai": "sk-SENTINEL-1234" });
  });

  it("can't be opened with another profile's key or under another profile", () => {
    const { registry, secrets } = setup();
    const dek = generateDataKey();
    secrets.set("a", dek, "api_key:openai", "sk-SENTINEL-1234");
    expect(secrets.loadDecrypted("a", generateDataKey())).toEqual({});

    registry.$client.prepare("UPDATE profile_secrets SET profile_id = 'b'").run();
    expect(secrets.loadDecrypted("b", dek)).toEqual({});
  });

  it("removeAll deletes every secret of one profile only", () => {
    const { secrets } = setup();
    const dek = generateDataKey();
    secrets.set("a", dek, "api_key:openai", "sk-1");
    secrets.set("a", dek, "claude_oauth_token", "tok-2");
    secrets.set("b", dek, "api_key:gemini", "g-3");
    expect(secrets.removeAll("a")).toBe(2);
    expect(Object.keys(secrets.hints("b"))).toEqual(["api_key:gemini"]);
  });
});

describe("AI settings schemas", () => {
  it("mirror the server's provider ids and secret kinds", () => {
    expect([...AI_PROVIDER_CHOICES]).toEqual([...PROVIDER_IDS]);
    expect([...SECRET_KIND_CHOICES]).toEqual([...SECRET_KINDS]);
  });

  it("reject keys with whitespace without echoing them", () => {
    const parsed = aiSettingsInput.safeParse({ provider: "openai", apiKey: "sk SENTINEL" });
    expect(parsed.success).toBe(false);
    expect(JSON.stringify(parsed.error?.issues)).not.toContain("SENTINEL");
  });
});
