# learning-assistant: developer commands. Run `make` or `make help` to list them.
# Written for GNU Make 3.81 (the version bundled with macOS).

# Settings from .env.local (if present) apply to these commands too.
-include .env.local
export

DATABASE_PATH ?= ./data/learning-assistant.db
REGISTRY_PATH ?= ./data/app.db
PORT          ?= 3000
BACKUP_DIR    := ./data/backups
MIN_NODE      := 22.12.0
PROFILES      := npx tsx --conditions=react-server --tsconfig tsconfig.json scripts/profiles.ts

.DEFAULT_GOAL := help
.PHONY: help doctor setup install env dev build start test check smoke-provider lint format \
        db-migrate db-generate db-shell db-backup db-reset profile-password clean

help: ## Show this help
	@echo "Usage: make <command>"
	@echo
	@grep -E '^[a-zA-Z_-]+:.*## ' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

# --- Setup -------------------------------------------------------------------

doctor: ## Check prerequisites (Node.js version, AI provider login or API key)
	@node -e 'const [a,b]=process.versions.node.split(".").map(Number),[x,y]="$(MIN_NODE)".split(".").map(Number); \
		if (a<x||(a===x&&b<y)) { console.error("✗ Node.js $(MIN_NODE)+ required (found "+process.versions.node+")"); process.exit(1) } \
		console.log("✓ Node.js "+process.versions.node)'
	@# Settings come from the shell first, then .env.local (as Next.js loads them).
	@setting() { v=$$(printenv "$$1"); [ -n "$$v" ] || v=$$(grep -s "^$$1=" .env.local | tail -1 | cut -d= -f2-); echo "$$v"; }; \
	provider=$$(setting AI_PROVIDER); provider=$${provider:-claude-code}; \
	echo "✓ AI provider: $$provider"; \
	case "$$provider" in \
	anthropic) \
		[ -n "$$(setting ANTHROPIC_API_KEY)" ] && echo "✓ ANTHROPIC_API_KEY is set" \
			|| { echo "✗ AI_PROVIDER=anthropic needs ANTHROPIC_API_KEY (set it in .env.local)"; exit 1; } ;; \
	claude-code) \
		command -v claude >/dev/null 2>&1 || { echo "✗ Claude Code not found. Install it: https://claude.com/claude-code"; exit 1; }; \
		claude auth status 2>/dev/null | grep -q '"loggedIn": true' \
			&& echo "✓ Claude Code is logged in" \
			|| { echo "✗ Claude Code is not logged in. Run 'claude' once and log in."; exit 1; }; \
		if [ -n "$$(setting ANTHROPIC_API_KEY)" ]; then \
			echo "! ANTHROPIC_API_KEY is set but ignored in claude-code mode (set AI_PROVIDER=anthropic to use it)."; fi ;; \
	openai) \
		[ -n "$$(setting OPENAI_API_KEY)" ] && echo "✓ OPENAI_API_KEY is set" \
			|| { echo "✗ AI_PROVIDER=openai needs OPENAI_API_KEY (set it in .env.local)"; exit 1; } ;; \
	gemini) \
		[ -n "$$(setting GEMINI_API_KEY)" ] && echo "✓ GEMINI_API_KEY is set" \
			|| { echo "✗ AI_PROVIDER=gemini needs GEMINI_API_KEY (set it in .env.local)"; exit 1; } ;; \
	*) echo "✗ Unknown AI_PROVIDER=$$provider. Use claude-code, anthropic, openai or gemini."; exit 1 ;; \
	esac

setup: doctor install env db-migrate ## First-time setup: check, install, create config and database
	@echo
	@echo "Setup complete. Start the app with: make dev"

install: ## Install npm dependencies (exact versions from package-lock.json)
	npm ci

env: ## Create .env.local from .env.example (never overwrites)
	@if [ -f .env.local ]; then echo "✓ .env.local already exists"; \
	else cp .env.example .env.local && echo "✓ Created .env.local"; fi

# --- Run ---------------------------------------------------------------------

dev: db-migrate ## Start the app in development mode (http://127.0.0.1:3000)
	npx next dev --hostname 127.0.0.1 --port $(PORT)

build: ## Create a production build
	npm run build

start: build db-migrate ## Build and run in production mode (faster)
	npx next start --hostname 127.0.0.1 --port $(PORT)

# --- Quality -----------------------------------------------------------------

test: ## Run the test suite
	npm test

check: ## Lint, typecheck, format check and tests (run before committing)
	npm run check

smoke-provider: ## Real AI calls through PROVIDER=<id> (TASKS=all for every schema)
	@npx tsx --conditions=react-server --tsconfig tsconfig.json scripts/smoke-provider.ts

lint: ## Run ESLint
	npm run lint

format: ## Format all files with Prettier
	npm run format

# --- Databases (registry at $(REGISTRY_PATH), one SQLite file per profile) ----

db-migrate: ## Migrate the registry and every profile database (registers existing data as sdhiren)
	@$(PROFILES) migrate

db-generate: ## Generate migrations after editing src/server/db/schema.ts or app-schema.ts
	npm run db:generate

db-shell: ## SQL shell on a profile's database (PROFILE=<username>), or the registry without it
	@command -v sqlite3 >/dev/null 2>&1 || { echo "sqlite3 is not installed."; exit 1; }
	@if [ -n "$(PROFILE)" ]; then file=$$($(PROFILES) path "$(PROFILE)") || exit 1; \
		else file="$(REGISTRY_PATH)"; fi; \
		sqlite3 -header -column "$$file"

db-backup: ## Save consistent copies of the registry and every profile database to data/backups/
	@command -v sqlite3 >/dev/null 2>&1 || { echo "sqlite3 is not installed."; exit 1; }
	@test -f "$(REGISTRY_PATH)" || { echo "No registry at $(REGISTRY_PATH). Run: make db-migrate"; exit 1; }
	@dir="$(BACKUP_DIR)/$$(date +%Y%m%d-%H%M%S)"; mkdir -p "$$dir"; \
		sqlite3 "$(REGISTRY_PATH)" ".backup '$$dir/app.db'" || exit 1; \
		$(PROFILES) paths | while read -r name file; do \
			sqlite3 "$$file" ".backup '$$dir/$$name.db'" || exit 1; done && \
		echo "✓ Backup saved to $$dir"

db-reset: ## Delete ALL progress of one profile and recreate it empty (PROFILE=<username>, asks first)
	@[ -n "$(PROFILE)" ] || { echo "Choose a profile: make db-reset PROFILE=<username>"; exit 1; }
	@file=$$($(PROFILES) path "$(PROFILE)") || exit 1; \
		printf "This deletes all topics, quizzes and progress of profile $(PROFILE) in $$file. Type 'yes' to continue: "; \
		read answer; [ "$$answer" = "yes" ] || { echo "Cancelled."; exit 1; }; \
		rm -f "$$file" "$$file-wal" "$$file-shm"
	@$(MAKE) --no-print-directory db-migrate

profile-password: ## Reset a profile's password from the terminal (USER=<username>; deletes its saved keys)
	@[ "$(origin USER)" = "command line" ] || { echo "Choose a profile: make profile-password USER=<username>"; exit 1; }
	@$(PROFILES) password "$(USER)"

# --- Housekeeping ------------------------------------------------------------

clean: ## Remove build output and caches (keeps your data)
	rm -rf .next coverage *.tsbuildinfo
