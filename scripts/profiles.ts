/**
 * Profile data tooling for the Makefile.
 *
 *   migrate          Migrate the registry, register the legacy database as `sdhiren`
 *                    if needed, then migrate every profile database.
 *   path <username>  Print one profile's database path (exit 1 if unknown).
 *   paths            Print "<username> <path>" for every profile, one per line.
 *   password <user>  Reset a profile's password (prompts without echo). Saved
 *                    secrets can't be recovered without the old password, so
 *                    they are deleted, and every session is signed out.
 *
 * Run with: npx tsx --conditions=react-server --tsconfig tsconfig.json scripts/profiles.ts <command>
 */
import { password as passwordSchema } from "@/domain/input-schemas";
import { getEnv } from "@/server/config/env";
import { createRegistryDatabase } from "@/server/db/app-client";
import { createDatabase } from "@/server/db/client";
import { ProfileRepository } from "@/server/repositories/profile-repository";
import { ensureLegacyProfile } from "@/server/registry-bootstrap";
import { AuthService } from "@/server/services/auth-service";

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

/** Reads a line from the terminal without echoing it. */
function promptHidden(question: string): Promise<string> {
  const { stdin, stdout } = process;
  if (!stdin.isTTY) fail("Run this from a terminal, so the password isn't echoed.");
  stdout.write(question);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");

  return new Promise((resolve) => {
    let value = "";
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === "\u0003") {
          stdout.write("\n");
          process.exit(130);
        } else if (char === "\r" || char === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          stdout.write("\n");
          resolve(value);
          return;
        } else if (char === "\u007f" || char === "\b") {
          value = value.slice(0, -1);
        } else {
          value += char;
        }
      }
    };
    stdin.on("data", onData);
  });
}

async function resetPassword(auth: AuthService, username: string): Promise<void> {
  const password = await promptHidden(`New password for ${username}: `);
  const parsed = passwordSchema.safeParse(password);
  if (!parsed.success) fail(parsed.error.issues[0]?.message ?? "Invalid password.");
  if ((await promptHidden("Confirm new password: ")) !== password) {
    fail("The passwords don't match. Nothing changed.");
  }

  const profile = await auth.resetPassword(username, password);
  console.log(`✓ Password of ${profile.username} reset. Every session was signed out.`);
  console.log(
    "! Saved API keys and tokens of this profile (if any) were deleted: they can't be " +
      "decrypted without the old password. Add them again on the profile page.",
  );
}

async function main(): Promise<void> {
  const env = getEnv();
  const [command, argument] = process.argv.slice(2);
  const registry = createRegistryDatabase(env.REGISTRY_PATH);
  const repository = new ProfileRepository(registry);

  switch (command) {
    case "migrate": {
      console.log(`✓ Registry ready at ${env.REGISTRY_PATH}`);
      if (ensureLegacyProfile(registry, env.DATABASE_PATH)) {
        console.log(`✓ Registered ${env.DATABASE_PATH} as profile sdhiren (not moved)`);
      }
      for (const profile of repository.list()) {
        createDatabase(profile.dbPath).$client.close();
        console.log(`✓ Profile ${profile.username} ready at ${profile.dbPath}`);
      }
      return;
    }
    case "path": {
      if (!argument) fail("Usage: profiles.ts path <username>");
      const profile = repository.findByUsername(argument);
      if (!profile) fail(`No profile named ${argument}`);
      console.log(profile.dbPath);
      return;
    }
    case "paths":
      for (const profile of repository.list()) console.log(`${profile.username} ${profile.dbPath}`);
      return;
    case "password": {
      if (!argument) fail("Usage: profiles.ts password <username>");
      if (!repository.findByUsername(argument)) fail(`No profile named ${argument}`);
      const auth = new AuthService(registry, {
        profilesDir: env.PROFILES_DIR,
        initDatabase: (filePath) => createDatabase(filePath).$client.close(),
      });
      await resetPassword(auth, argument);
      return;
    }
    default:
      fail("Usage: profiles.ts migrate | path <username> | paths | password <username>");
  }
}

void main();
