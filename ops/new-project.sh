#!/usr/bin/env sh
set -eu

usage() {
  cat <<'USAGE'
Usage:
  NEW_REPO=<repo-name> PROJECT_ID=<gcp-project-id> sh ops/new-project.sh

What it does:
  1) Creates a new repository from a template via GitHub CLI
  2) Clones it under DEST_ROOT
  3) Creates Firebase Hosting site and applies hosting target
  4) Writes .firebaserc default project + target mapping
  5) Prepares .env.bootstrap from global/project env files
  6) Runs ops/bootstrap.sh (dry-run by default)
  7) Optional first deploy + health check

Environment:
  NEW_REPO            Required. New repository name.
  PROJECT_ID          Required for bootstrap apply path.
  TEMPLATE_REPO       Optional. default: current repo (nameWithOwner)
  OWNER               Optional. default: current gh login
  VISIBILITY          Optional. private|public. default: private
  DEST_ROOT           Optional. default: $HOME/projects
  GLOBAL_ENV_FILE     Optional. default: $HOME/.tonosama/bootstrap.env
  PROJECT_ENV_FILE    Optional. default: .env.bootstrap
  HOSTING_SITE_ID     Optional. default: NEW_REPO
  HOSTING_TARGET      Optional. default: guest
  DO_FIRST_DEPLOY     Optional. 1|0. default: 1
  DO_HEALTH_CHECK     Optional. 1|0. default: 1
  AUTO_COMMIT         Optional. 1|0. default: 1
  AUTO_PUSH           Optional. 1|0. default: 1
  DRY_RUN             Optional. 1|0 for bootstrap. default: 1
  OPEN_GH             Optional. 1 to open new repo page. default: 0

Examples:
  NEW_REPO=tonosama-cafe PROJECT_ID=apicius-6bcae sh ops/new-project.sh
  NEW_REPO=tonosama-sushi PROJECT_ID=my-proj DRY_RUN=0 sh ops/new-project.sh
  NEW_REPO=tonosama-bar PROJECT_ID=my-proj DO_FIRST_DEPLOY=0 sh ops/new-project.sh
  NEW_REPO=tonosama-bento PROJECT_ID=my-proj AUTO_COMMIT=1 AUTO_PUSH=1 DRY_RUN=0 sh ops/new-project.sh
USAGE
}

fail() {
  printf 'ERROR: %s\n' "$1" >&2
  exit 1
}

log() {
  printf '%s\n' "$1"
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "missing command: $1"
}

run_cmd() {
  if [ "$DRY_RUN" = "1" ]; then
    log "[dry-run] $*"
    return 0
  fi
  "$@"
}

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  usage
  exit 0
fi

require_cmd gh
require_cmd git
require_cmd npm
require_cmd firebase
require_cmd node

gh auth status >/dev/null 2>&1 || fail "gh auth required (run: gh auth login)"

NEW_REPO="${NEW_REPO:-}"
PROJECT_ID="${PROJECT_ID:-}"
[ -n "$NEW_REPO" ] || fail "NEW_REPO is required."
[ -n "$PROJECT_ID" ] || fail "PROJECT_ID is required."

VISIBILITY="${VISIBILITY:-private}"
case "$VISIBILITY" in
  private|public) ;;
  *) fail "VISIBILITY must be private or public." ;;
esac

OWNER="${OWNER:-$(gh api user -q .login)}"
CURRENT_REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
TEMPLATE_REPO="${TEMPLATE_REPO:-$CURRENT_REPO}"
DEST_ROOT="${DEST_ROOT:-$HOME/projects}"
OPEN_GH="${OPEN_GH:-0}"
DRY_RUN="${DRY_RUN:-1}"
GLOBAL_ENV_FILE="${GLOBAL_ENV_FILE:-$HOME/.tonosama/bootstrap.env}"
HOSTING_SITE_ID="${HOSTING_SITE_ID:-$NEW_REPO}"
HOSTING_TARGET="${HOSTING_TARGET:-guest}"
DO_FIRST_DEPLOY="${DO_FIRST_DEPLOY:-1}"
DO_HEALTH_CHECK="${DO_HEALTH_CHECK:-1}"
AUTO_COMMIT="${AUTO_COMMIT:-1}"
AUTO_PUSH="${AUTO_PUSH:-1}"
TARGET="${OWNER}/${NEW_REPO}"
CLONE_DIR="${DEST_ROOT%/}/${NEW_REPO}"

if gh repo view "$TARGET" >/dev/null 2>&1; then
  fail "target repository already exists: ${TARGET}"
fi

mkdir -p "$DEST_ROOT"
if [ -e "$CLONE_DIR" ]; then
  fail "destination already exists: ${CLONE_DIR}"
fi

log "[new-project] create from template ${TEMPLATE_REPO} -> ${TARGET} (${VISIBILITY})"
if [ "$VISIBILITY" = "private" ]; then
  run_cmd gh repo create "$TARGET" --template "$TEMPLATE_REPO" --private --clone --description "TONOSAMA project bootstrap"
else
  run_cmd gh repo create "$TARGET" --template "$TEMPLATE_REPO" --public --clone --description "TONOSAMA project bootstrap"
fi

if [ "$DRY_RUN" = "1" ]; then
  log "[new-project] dry-run stopped before clone/move/bootstrap/deploy"
  log "next: set DRY_RUN=0 to apply"
  exit 0
fi

if [ ! -d "$NEW_REPO/.git" ]; then
  fail "gh clone output not found in current directory. Run from destination parent directory."
fi

mv "$NEW_REPO" "$CLONE_DIR"
cd "$CLONE_DIR"

log "[new-project] ensure firebase hosting site (${HOSTING_SITE_ID})"
if firebase hosting:sites:list --project "$PROJECT_ID" | rg -q "$HOSTING_SITE_ID"; then
  log "[new-project] hosting site already exists"
else
  firebase hosting:sites:create "$HOSTING_SITE_ID" --project "$PROJECT_ID"
fi

log "[new-project] apply firebase hosting target (${HOSTING_TARGET} -> ${HOSTING_SITE_ID})"
firebase target:apply hosting "$HOSTING_TARGET" "$HOSTING_SITE_ID" --project "$PROJECT_ID"

log "[new-project] update .firebaserc default project + target mapping"
PROJECT_ID="$PROJECT_ID" HOSTING_TARGET="$HOSTING_TARGET" HOSTING_SITE_ID="$HOSTING_SITE_ID" node <<'NODE'
const fs = require("node:fs");

const projectId = process.env.PROJECT_ID;
const target = process.env.HOSTING_TARGET;
const siteId = process.env.HOSTING_SITE_ID;

let conf = { projects: {}, targets: {}, etags: {} };
try {
  conf = JSON.parse(fs.readFileSync(".firebaserc", "utf8"));
} catch {
  conf = { projects: {}, targets: {}, etags: {} };
}

conf.projects = conf.projects || {};
conf.projects.default = projectId;
conf.targets = conf.targets || {};
conf.targets[projectId] = conf.targets[projectId] || {};
conf.targets[projectId].hosting = conf.targets[projectId].hosting || {};
conf.targets[projectId].hosting[target] = [siteId];

fs.writeFileSync(".firebaserc", `${JSON.stringify(conf, null, 2)}\n`);
NODE

log "[new-project] prepare env bootstrap"
if [ ! -f .env.bootstrap ] && [ -f "$GLOBAL_ENV_FILE" ]; then
  cp "$GLOBAL_ENV_FILE" .env.bootstrap
  log "[new-project] copied global env: ${GLOBAL_ENV_FILE}"
elif [ ! -f .env.bootstrap ] && [ -f .env.bootstrap.example ]; then
  cp .env.bootstrap.example .env.bootstrap
  log "[new-project] copied local example: .env.bootstrap.example"
fi

if [ -f .env.bootstrap ]; then
  # shellcheck disable=SC1091
  set -a; . ./.env.bootstrap; set +a
fi

BASE_URL="${BASE_URL:-https://${HOSTING_SITE_ID}.web.app}"
STORE_ID="${STORE_ID:-demo-store}"
export PROJECT_ID BASE_URL STORE_ID GLOBAL_ENV_FILE

log "[new-project] run bootstrap (DRY_RUN=${DRY_RUN})"
DRY_RUN="$DRY_RUN" npm run ops:bootstrap

if [ "$DO_FIRST_DEPLOY" = "1" ]; then
  log "[new-project] first deploy (hosting:${HOSTING_TARGET},functions)"
  firebase deploy --project "$PROJECT_ID" --only "hosting:${HOSTING_TARGET},functions" --non-interactive
fi

if [ "$DO_HEALTH_CHECK" = "1" ]; then
  log "[new-project] health check"
  BASE_URL="$BASE_URL" STORE_ID="$STORE_ID" sh ops/health.sh
fi

if [ "$AUTO_COMMIT" = "1" ]; then
  if git status --porcelain | rg -q "."; then
    log "[new-project] auto commit bootstrap artifacts"
    git add .firebaserc README.md package.json .github/workflows/firebase-deploy.yml .github/workflows/ai-stack-ci.yml 2>/dev/null || true
    git add ops .env.example .env.bootstrap.example .gitignore 2>/dev/null || true
    if git diff --cached --quiet; then
      log "[new-project] no staged changes to commit"
    else
      git commit -m "chore(bootstrap): initialize hosting target, secrets automation, and first deploy wiring"
      if [ "$AUTO_PUSH" = "1" ]; then
        log "[new-project] auto push"
        git push -u origin HEAD
      fi
    fi
  else
    log "[new-project] no local changes to commit"
  fi
fi

if [ "$OPEN_GH" = "1" ]; then
  gh repo view "$TARGET" --web
fi

log "[new-project] done"
log "repo=${TARGET}"
log "path=${CLONE_DIR}"
log "next: cd ${CLONE_DIR} && npm run dev:guest"
