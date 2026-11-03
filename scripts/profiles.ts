/**
 * Profile data tooling for the Makefile.
 *
 *   migrate          Migrate the registry, register the legacy database as `sdhiren`
 *                    if needed, then migrate every profile database.
 *   path <username>  Print one profile's database path (exit 1 if unknown).
 *   paths            Print "<username> <path>" for every profile, one per line.
 *
 * Run with: npx tsx --conditions=react-server --tsconfig tsconfig.json scripts/profiles.ts <command>
 */
import { getEnv } from "@/server/config/env";
import { createRegistryDatabase } from "@/server/db/app-client";
import { createDatabase } from "@/server/db/client";
import { ProfileRepository } from "@/server/repositories/profile-repository";
import { ensureLegacyProfile } from "@/server/registry-bootstrap";

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function main(): void {
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
    default:
      fail("Usage: profiles.ts migrate | path <username> | paths");
  }
}

main();
