# learning-assistant: developer commands. Run `make` or `make help` to list them.
# Written for GNU Make 3.81 (the version bundled with macOS).

# Settings from .env.local (if present) apply to these commands too.
-include .env.local
export

DATABASE_PATH ?= ./data/learning-assistant.db
PORT          ?= 3000
BACKUP_DIR    := ./data/backups
MIN_NODE      := 22.12.0

.DEFAULT_GOAL := help
.PHONY: help doctor setup install env dev build start test check lint format \
        db-migrate db-generate db-shell db-backup db-reset clean

help: ## Show this help
	@echo "Usage: make <command>"
	@echo
	@grep -E '^[a-zA-Z_-]+:.*## ' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

# --- Setup -------------------------------------------------------------------

doctor: ## Check prerequisites (Node.js version, Claude Code login)
	@node -e 'const [a,b]=process.versions.node.split(".").map(Number),[x,y]="$(MIN_NODE)".split(".").map(Number); \
		if (a<x||(a===x&&b<y)) { console.error("✗ Node.js $(MIN_NODE)+ required (found "+process.versions.node+")"); process.exit(1) } \
		console.log("✓ Node.js "+process.versions.node)'
	@command -v claude >/dev/null 2>&1 || { echo "✗ Claude Code not found. Install it: https://claude.com/claude-code"; exit 1; }
	@claude auth status 2>/dev/null | grep -q '"loggedIn": true' \
		&& echo "✓ Claude Code is logged in" \
		|| { echo "✗ Claude Code is not logged in. Run 'claude' once and log in."; exit 1; }
	@if [ -n "$$ANTHROPIC_API_KEY" ]; then \
		echo "! ANTHROPIC_API_KEY is set: requests will be billed to that key, not your Claude plan."; fi

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

lint: ## Run ESLint
	npm run lint

format: ## Format all files with Prettier
	npm run format

# --- Database (SQLite file at $(DATABASE_PATH)) ------------------------------

db-migrate: ## Create the database / apply pending migrations
	@mkdir -p "$(dir $(DATABASE_PATH))"
	@npx drizzle-kit migrate >/dev/null && echo "✓ Database ready at $(DATABASE_PATH)"

db-generate: ## Generate a migration after editing src/server/db/schema.ts
	npm run db:generate

db-shell: ## Open an interactive SQL shell on the database
	@command -v sqlite3 >/dev/null 2>&1 || { echo "sqlite3 is not installed."; exit 1; }
	sqlite3 -header -column "$(DATABASE_PATH)"

db-backup: ## Save a consistent copy of the database to data/backups/
	@command -v sqlite3 >/dev/null 2>&1 || { echo "sqlite3 is not installed."; exit 1; }
	@test -f "$(DATABASE_PATH)" || { echo "No database at $(DATABASE_PATH)"; exit 1; }
	@mkdir -p "$(BACKUP_DIR)"
	@file="$(BACKUP_DIR)/learning-assistant-$$(date +%Y%m%d-%H%M%S).db"; \
		sqlite3 "$(DATABASE_PATH)" ".backup '$$file'" && echo "✓ Backup saved to $$file"

db-reset: ## Delete ALL progress and recreate an empty database (asks first)
	@printf "This deletes all topics, quizzes and progress in $(DATABASE_PATH). Type 'yes' to continue: "; \
		read answer; [ "$$answer" = "yes" ] || { echo "Cancelled."; exit 1; }
	@rm -f "$(DATABASE_PATH)" "$(DATABASE_PATH)-wal" "$(DATABASE_PATH)-shm"
	@$(MAKE) --no-print-directory db-migrate

# --- Housekeeping ------------------------------------------------------------

clean: ## Remove build output and caches (keeps your data)
	rm -rf .next coverage *.tsbuildinfo
