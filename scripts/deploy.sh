#!/usr/bin/env bash
#
# Le script utilise des tableaux et `pipefail`, absents de dash. Lancé par
# `sh scripts/deploy.sh` — réflexe courant — il échouerait sur des erreurs de
# syntaxe obscures. On se relance donc sous bash plutôt que de le laisser
# planter.
# shellcheck disable=SC2128
if [ -z "${BASH_VERSION:-}" ]; then exec bash "$0" "$@"; fi
#
# Déploiement Cloudflare — Worker API (+ migrations D1) et front Pages.
#
#   npm run deploy                   # LE chemin normal
#   ./scripts/deploy.sh              # tout : tests → migrations → api → app
#   ./scripts/deploy.sh api          # seulement le Worker (et ses migrations)
#   ./scripts/deploy.sh app          # seulement le front
#   SKIP_TESTS=1 ./scripts/deploy.sh # sans la suite de tests (à éviter)
#   DRY_RUN=1 npm run deploy         # joue les tests, affiche le reste sans l'exécuter
#
# Prérequis, une seule fois par machine :
#   npx wrangler login
#   npx wrangler d1 create luminose-gestion --location weur
#   → reporter le database_id dans workers/api/wrangler.toml
#   npx wrangler secret put SESSION_SECRET   # openssl rand -base64 32
#   npx wrangler secret put ONE_MIN_API_KEY
#   npx wrangler secret put AUTH_USERNAME
#   npx wrangler secret put AUTH_PASSWORD
#
# ORDRE : le Worker est déployé AVANT le front. L'API est rétro-compatible le
# temps d'un déploiement ; l'inverse n'est pas vrai — un front neuf appelant une
# API ancienne échoue. (C'est l'inverse de l'ère Notion, où le jeton de session
# imposait de pousser le front d'abord : la contrainte a changé avec §1.2.)
#
# ⚠️ `git push` NE DÉPLOIE PAS LE FRONT. Le projet Pages est en dépôt direct :
# seul `wrangler pages deploy` publie une nouvelle version. Le workflow GitHub
# Actions est désactivé depuis le passage à l'origine unique. Utiliser ce
# script, ou la commande de la section « Front » ci-dessous.

set -euo pipefail
cd "$(dirname "$0")/.."

# ─── Configuration (surchargeable : VAR=… ./scripts/deploy.sh) ───────────────
APP_URL="${APP_URL:-https://gestion.luminose.fr}"
PAGES_PROJECT="${PAGES_PROJECT:-luminose-gestion}"
PAGES_BRANCH="${PAGES_BRANCH:-main}"   # branche de PRODUCTION du projet Pages
D1_BINDING="${D1_BINDING:-DB}"

# ─── Cibles ──────────────────────────────────────────────────────────────────
TARGETS=("$@")
[ ${#TARGETS[@]} -eq 0 ] && TARGETS=(api app)
has() { printf '%s\n' "${TARGETS[@]}" | grep -qx "$1"; }

step() { printf '\n\033[1;36m▸ %s\033[0m\n' "$1"; }
ok()   { printf '\033[1;32m✓ %s\033[0m\n' "$1"; }
warn() { printf '\033[1;33m⚠ %s\033[0m\n' "$1"; }

run() {
  if [ "${DRY_RUN:-0}" = "1" ]; then printf '   \033[2m$ %s\033[0m\n' "$*"; else "$@"; fi
}

# Pendant les phases 1 à 5 (SPEC §11), tout n'existe pas encore : on le dit
# clairement plutôt que de laisser échouer un `cd`.
need_dir() {
  if [ ! -d "$1" ]; then
    warn "$1 n'existe pas encore — cible « $2 » ignorée (voir SPEC §11)"
    return 1
  fi
}

# ─── Garde-fous ──────────────────────────────────────────────────────────────
if [ -n "$(git status --porcelain)" ]; then
  warn "Arbre de travail non propre — on déploie du code non commité."
fi

if [ "${SKIP_TESTS:-0}" != "1" ]; then
  step "Tests et typecheck (bloquants)"
  # Exécutés même en DRY_RUN : ils ne modifient rien, et un dry-run qui se
  # contenterait de les afficher ne vérifierait pas la seule barrière du script.
  npm test
  npm run typecheck
  ok "Suite verte"
else
  warn "SKIP_TESTS=1 : suite de tests ignorée"
fi

# ─── Corpus embarqué ─────────────────────────────────────────────────────────
# Le Worker sert le corpus depuis une constante de son bundle : le déploiement
# EST la synchronisation. Régénéré ici même quand SKIP_TESTS=1 a sauté les
# hooks pre* — déployer un corpus périmé serait la panne la plus discrète
# possible, puisque tout continuerait de fonctionner.
if has api; then
  step "Corpus -> module embarqué"
  run npm run embarquer
  ok "Corpus à jour dans le bundle du Worker"
fi

# ─── Worker API ──────────────────────────────────────────────────────────────
if has api && need_dir workers/api api; then
  step "Migrations D1 distantes"
  (
    cd workers/api
    # Idempotent : wrangler ne rejoue que les migrations non appliquées.
    run npx wrangler d1 migrations apply "$D1_BINDING" --remote
  )
  ok "Base à jour"

  step "Worker API"
  ( cd workers/api && run npx wrangler deploy )
  ok "Worker déployé (routes /api/* et /auth/* de wrangler.toml)"
fi

# ─── Front ───────────────────────────────────────────────────────────────────
if has app && need_dir apps/manager app; then
  step "Front → Pages ${PAGES_PROJECT} (production : ${PAGES_BRANCH})"
  (
    cd apps/manager
    # Aucune origine d'API injectée au build : le front appelle /api/* en
    # RELATIF, sur la même origine (SPEC §1.2). C'est ce qui supprime CORS et,
    # accessoirement, ce qui empêche de figer une URL de développement dans un
    # bundle de production.
    run npm run build
    run npx wrangler pages deploy dist --project-name "$PAGES_PROJECT" --branch "$PAGES_BRANCH"
  )
  ok "Front en ligne : ${APP_URL}"
fi

# ─── Vérifications ───────────────────────────────────────────────────────────
step "Vérifications suggérées"
cat <<EOF
  - curl -s -o /dev/null -w '%{http_code}\n' ${APP_URL}/api/contents   # attendu : 401
  - curl -s -o /dev/null -w '%{http_code}\n' -X POST ${APP_URL}/auth/login \\
      -H 'Content-Type: application/json' -d '{}'                       # attendu : 401
      (405 = la route /auth/* n'a pas pris, c'est Pages qui répond)
  - Se connecter, vérifier que la liste des contenus s'affiche
  - Ouvrir Réglages → Modèles IA, lancer un test de modèle
  - Ouvrir un contenu, lancer une action IA de bout en bout
EOF
ok "Déploiement terminé"
