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
#   ./scripts/deploy.sh mcp          # seulement le Worker MCP (mcp.luminose.fr)
#   SKIP_TESTS=1 ./scripts/deploy.sh # sans la suite de tests (à éviter)
#   DRY_RUN=1 npm run deploy         # joue les tests, affiche le reste sans l'exécuter
#
#   ./scripts/deploy.sh --env recette        # la RECETTE : api et app (SPEC §14.8)
#   ./scripts/deploy.sh --env recette api    # la recette, Worker seulement
#   ./scripts/deploy.sh --env recette api porte   # gestion, puis la porte (api-recette.luminose.fr)
#   DRY_RUN=1 ./scripts/deploy.sh --env recette
#
# Sans `--env`, c'est la PRODUCTION, et son chemin est celui d'avant la v3.0 :
# mêmes vérifications, mêmes commandes. La recette a le sien, plus bas, qui
# résout et vérifie sa cible AVANT tout effet — compte, bases, Worker, projet
# Pages, domaine — et ne nomme aucune ressource de la production. `--env local`
# n'existe pas : le poste local ne se déploie pas.
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
# Le bucket R2 du montage (`luminose-montage`, SPEC §12.4) est créé par ce
# script s'il manque : rien à faire à la main, si le jeton peut écrire dans R2.
#
# Le Worker MCP a ses propres prérequis : workers/mcp/README.md.
#
# `porte` (workers/porte, SPEC §14.3) n'existe qu'en recette dans la phase S2b,
# et hors de la cible par défaut : elle part quand on la nomme, avec `--env
# recette`. Sans `--env recette`, elle est refusée avant tout effet.
#
# `mcp` N'EST PAS dans la cible par défaut : il part quand on le nomme. Sa mise
# en place (KV, secrets, client OAuth Google) est indépendante, et une
# fonctionnalité en plus ne doit jamais pouvoir faire échouer le déploiement de
# celles d'avant.
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
R2_BUCKET="${R2_BUCKET:-luminose-montage}"

# ─── Environnement et cibles ─────────────────────────────────────────────────
# `--env <nom>` peut se placer n'importe où ; le reste, ce sont les cibles.
ENVIRONNEMENT="production"
TARGETS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --env) ENVIRONNEMENT="${2:-}"; shift; [ $# -gt 0 ] && shift ;;
    --env=*) ENVIRONNEMENT="${1#--env=}"; shift ;;
    *) TARGETS+=("$1"); shift ;;
  esac
done
case "$ENVIRONNEMENT" in
  production|recette) ;;
  *) printf '\033[1;33m⚠ Environnement « %s » inconnu : production (par défaut) ou recette.\033[0m\n' "$ENVIRONNEMENT"; exit 1 ;;
esac
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

# ═════════════════════════════════════════════════════════════════════════════
# LA RECETTE (SPEC §14.8) — gestion-recette.luminose.fr
#
# Un chemin à part, qui s'arrête avant celui de la production : rien de ce qui
# suit ce bloc ne s'exécute pour elle. Il ne crée rien — ni base, ni bucket, ni
# projet Pages : une ressource absente arrête le script, avec la commande qui
# la crée. Ses bases et ses secrets sont les siens ; elle n'a ni R2, ni Workers
# AI, ni déclencheur, ni adresse workers.dev.
# ═════════════════════════════════════════════════════════════════════════════
if [ "$ENVIRONNEMENT" = "recette" ]; then
  for cible in "${TARGETS[@]}"; do
    case "$cible" in
      api|app|porte) ;;
      mcp) warn "La cible « mcp » n'existe pas en recette : le serveur MCP n'a qu'un environnement."; exit 1 ;;
      *) warn "Cible « $cible » inconnue (api, app, porte)."; exit 1 ;;
    esac
  done

  # 1. La cible, lue dans wrangler.toml tel que wrangler le résoudra : nom du
  #    Worker, routes, déclencheurs, bases (workers/api/scripts/configuration.ts).
  #    Aucun appel réseau.
  step "Cible de la recette (wrangler.toml, section [env.recette])"
  ECARTS_FICHIER="$(mktemp)"
  CIBLE_OK=1
  CIBLE_SORTIE="$(node workers/api/scripts/cible.ts recette 2>"$ECARTS_FICHIER")" || CIBLE_OK=0
  eval "$CIBLE_SORTIE"
  printf '   Worker %s\n' "$CIBLE_WORKER"
  printf '   Bases %s (%s) et %s (%s)\n' "$CIBLE_DB_NOM" "$CIBLE_DB_ID" "$CIBLE_CLIENTS_NOM" "$CIBLE_CLIENTS_ID"
  printf '   Pages %s (branche de production %s) · https://%s\n' "$CIBLE_PAGES_PROJET" "$CIBLE_PAGES_BRANCHE" "$CIBLE_DOMAINE"
  if [ "$CIBLE_OK" = 1 ]; then
    ok "Cible conforme"
  else
    while IFS= read -r ecart; do warn "$ecart"; done <"$ECARTS_FICHIER"
    if [ "${DRY_RUN:-0}" = "1" ]; then
      warn "Répétition : la suite s'affiche, mais un vrai déploiement s'arrêterait ici."
    else
      warn "Corriger workers/api/wrangler.toml, section [env.recette]. Rien n'a été lancé."
      rm -f "$ECARTS_FICHIER"
      exit 1
    fi
  fi
  rm -f "$ECARTS_FICHIER"

  # 1 bis. La porte (workers/porte/wrangler.toml), si elle est visée : son nom,
  #    sa route en domaine personnalisé, ni workers.dev ni aperçu, ni base ni
  #    KV, et une liaison vers le gestion DE RECETTE seulement. À part de la
  #    cible de l'api : un écart de la porte n'arrête pas un déploiement qui ne
  #    la vise pas.
  if has porte; then
    step "Cible de la porte (workers/porte/wrangler.toml, section [env.recette])"
    ECARTS_FICHIER="$(mktemp)"
    CIBLE_OK=1
    CIBLE_SORTIE="$(node workers/api/scripts/cible.ts recette porte 2>"$ECARTS_FICHIER")" || CIBLE_OK=0
    eval "$CIBLE_SORTIE"
    printf '   Worker %s · https://%s\n' "$CIBLE_PORTE_WORKER" "$CIBLE_PORTE_DOMAINE"
    printf '   Liaisons %s\n' "$CIBLE_PORTE_SERVICES"
    if [ "$CIBLE_OK" = 1 ]; then
      ok "Cible conforme"
    else
      while IFS= read -r ecart; do warn "$ecart"; done <"$ECARTS_FICHIER"
      if [ "${DRY_RUN:-0}" = "1" ]; then
        warn "Répétition : la suite s'affiche, mais un vrai déploiement s'arrêterait ici."
      else
        warn "Corriger workers/porte/wrangler.toml, section [env.recette]. Rien n'a été lancé."
        rm -f "$ECARTS_FICHIER"
        exit 1
      fi
    fi
    rm -f "$ECARTS_FICHIER"
  fi

  # 2. Le compte : les DEUX bases de la recette doivent y être visibles, chacune
  #    sous son nom — c'est aussi ce qui prouve qu'on n'est pas sur un autre
  #    compte. 3. Le projet Pages et son domaine : `pages deploy` créerait le
  #    projet s'il manquait, et le domaine se rattache à la main.
  step "Compte Cloudflare, bases et projet Pages de la recette"
  if [ "${DRY_RUN:-0}" = "1" ]; then
    printf '   \033[2m$ npx wrangler d1 list --json   # %s = %s, %s = %s\033[0m\n' "$CIBLE_DB_ID" "$CIBLE_DB_NOM" "$CIBLE_CLIENTS_ID" "$CIBLE_CLIENTS_NOM"
    printf '   \033[2m$ npx wrangler pages project list | grep %s | grep %s\033[0m\n' "$CIBLE_PAGES_PROJET" "$CIBLE_DOMAINE"
  else
    BASES="$( cd workers/api && npx wrangler d1 list --json 2>/dev/null )" || BASES=""
    for paire in "$CIBLE_DB_ID:$CIBLE_DB_NOM" "$CIBLE_CLIENTS_ID:$CIBLE_CLIENTS_NOM"; do
      id="${paire%%:*}"; nom="${paire#*:}"
      # L'identifiant et le nom sur la MÊME entrée : un identifiant recopié
      # d'une autre base ne passe pas.
      if ! printf '%s' "$BASES" | node -e '
        const [id, nom] = process.argv.slice(1);
        let bases = [];
        try { bases = JSON.parse(require("node:fs").readFileSync(0, "utf8")); } catch {}
        process.exit(bases.some((b) => b.uuid === id && b.name === nom) ? 0 : 1);' "$id" "$nom"; then
        warn "Base ${nom} (${id}) introuvable sur ce compte."
        ( cd workers/api && npx wrangler whoami 2>/dev/null | grep -E 'associated with|[0-9a-f]{32}' ) || true
        warn "  Sur la VM : source ~/.cf-luminose, puis npx wrangler d1 list"
        warn "Arrêt avant toute écriture : rien n'a changé."
        exit 1
      fi
    done
    ok "Compte de Luminose : ${CIBLE_DB_NOM} et ${CIBLE_CLIENTS_NOM} visibles"
    # `grep` sans `-q`, pour la raison donnée au bucket R2 de la production.
    if ! ( cd apps/manager && npx wrangler pages project list 2>/dev/null ) | grep -w "$CIBLE_PAGES_PROJET" | grep -F "$CIBLE_DOMAINE" >/dev/null; then
      warn "Projet Pages ${CIBLE_PAGES_PROJET} absent, ou sans le domaine ${CIBLE_DOMAINE}."
      warn "  npx wrangler pages project create ${CIBLE_PAGES_PROJET} --production-branch ${CIBLE_PAGES_BRANCHE}"
      warn "  puis, dans le tableau de bord : ${CIBLE_PAGES_PROJET} → Domaines personnalisés → ${CIBLE_DOMAINE}"
      warn "Arrêt avant toute écriture : rien n'a changé."
      exit 1
    fi
    ok "Projet Pages ${CIBLE_PAGES_PROJET}, domaine ${CIBLE_DOMAINE}"
  fi

  if [ -n "$(git status --porcelain)" ]; then
    warn "Arbre de travail non propre — on déploie du code non commité."
  fi

  if [ "${SKIP_TESTS:-0}" != "1" ]; then
    step "Tests et typecheck (bloquants)"
    npm test
    npm run typecheck
    ok "Suite verte"
  else
    warn "SKIP_TESTS=1 : suite de tests ignorée"
  fi

  if has api; then
    step "Corpus -> module embarqué"
    run npm run embarquer
    ok "Corpus à jour dans le bundle du Worker"

    # Les deux bases, AVANT le Worker : un Worker neuf qui lit une table absente échoue.
    step "Migrations D1 distantes de la recette (${CIBLE_DB_NOM}, ${CIBLE_CLIENTS_NOM})"
    (
      cd workers/api
      run npx wrangler d1 migrations apply DB --env recette --remote
      run npx wrangler d1 migrations apply CLIENTS --env recette --remote
    )
    ok "Bases de recette à jour"

    step "Worker ${CIBLE_WORKER}"
    ( cd workers/api && run npx wrangler deploy --env recette )
    ok "Worker déployé (routes ${CIBLE_DOMAINE}/api/* et /auth/*)"
  fi

  if has app; then
    # Sur la branche de PRODUCTION du projet de recette, quelle que soit la
    # branche git d'où l'on déploie : c'est elle que sert le domaine. Une autre
    # branche ne publierait qu'un aperçu, que personne n'ouvre.
    step "Front → Pages ${CIBLE_PAGES_PROJET} (production : ${CIBLE_PAGES_BRANCHE})"
    (
      cd apps/manager
      run npm run build
      run npx wrangler pages deploy dist --project-name "$CIBLE_PAGES_PROJET" --branch "$CIBLE_PAGES_BRANCHE"
    )
    ok "Front en ligne : https://${CIBLE_DOMAINE}"
  fi

  # APRÈS gestion : la porte lie une entrée nommée de gestion, qui doit exister
  # quand on la lie (SPEC §14.3). Ni base, ni secret, ni migration.
  if has porte; then
    step "Porte ${CIBLE_PORTE_WORKER} (https://${CIBLE_PORTE_DOMAINE})"
    ( cd workers/porte && run npx wrangler deploy --env recette )
    ok "Porte déployée"
  fi

  step "Vérifications suggérées"
  if has porte; then
    printf '  - curl -s -X POST https://%s/v1/essai   # attendu : {"ok":true,"base":true}\n' "$CIBLE_PORTE_DOMAINE"
    printf '  - curl -s -o /dev/null -w "%%{http_code}\\n" https://%s/   # attendu : 404\n' "$CIBLE_PORTE_DOMAINE"
  fi
  printf '  - curl -s -o /dev/null -w "%%{http_code}\\n" https://%s/api/contents   # attendu : 401\n' "$CIBLE_DOMAINE"
  printf '  - Se connecter avec les identifiants de RECETTE : le bandeau « Recette » s’affiche\n'
  printf '  - Réglages : « Base des clients : reliée — données fictives »\n'
  printf '  - Jeu d’essai : npm run essai -w workers/api -- --recette\n'
  printf '  - Contraintes : npm run essai:contraintes -w workers/api\n'
  ok "Recette : terminé"
  exit 0
fi

# ─── La porte n'a pas de production dans cette phase ─────────────────────────
# Sans la base des clients en production, toute commande y serait une panne, et
# api.luminose.fr n'existe pas (SPEC §14.11, S2b). Refusée avant tout effet.
if has porte; then
  warn "La cible « porte » ne se déploie qu'en recette dans cette phase : ./scripts/deploy.sh --env recette porte"
  exit 1
fi

# ─── Le Worker MCP est-il prêt à partir ? ────────────────────────────────────
# Vérifié AVANT les tests. Le 01/10/2026, l'avertissement tombait après deux
# écrans de sortie de tests, et le déploiement semblait « planter » sur eux.
# On nomme l'identifiant qui manque et la commande qui le donne.
MCP_PRET=1
if has mcp && [ -f workers/mcp/wrangler.toml ]; then
  if grep -q '^id = "A_REMPLACER"' workers/mcp/wrangler.toml; then
    MCP_PRET=0
    warn "workers/mcp/wrangler.toml : l'id du namespace OAUTH_KV vaut encore A_REMPLACER."
    warn "  cd workers/mcp && npx wrangler kv namespace create OAUTH_KV"
  fi
  if grep -q '^database_id = "A_REMPLACER"' workers/mcp/wrangler.toml; then
    MCP_PRET=0
    warn "workers/mcp/wrangler.toml : database_id (base du journal luminose-mcp) vaut encore A_REMPLACER."
    warn "  cd workers/mcp && npx wrangler d1 create luminose-mcp --location weur"
    warn "  (déjà créée ? npx wrangler d1 list donne son identifiant)"
  fi
  if [ "$MCP_PRET" = 0 ]; then
    warn "Reporter l'identifiant dans workers/mcp/wrangler.toml, commiter, relancer."
    if [ ${#TARGETS[@]} -eq 1 ]; then
      warn "Rien d'autre à déployer : arrêt avant les tests."
      exit 1
    fi
    warn "La cible « mcp » sera ignorée ; les autres partent."
  fi
fi

# ─── Garde-fous ──────────────────────────────────────────────────────────────
if [ -n "$(git status --porcelain)" ]; then
  warn "Arbre de travail non propre — on déploie du code non commité."
fi

# Le bon compte Cloudflare, AVANT les tests et surtout avant le bucket R2. Le
# 03/11/2026, lancé sans `~/.cf-luminose`, wrangler a pris la connexion par
# défaut de la VM, celle d'un autre projet : le script y a créé le bucket du
# montage, puis s'est arrêté aux migrations faute d'y trouver la base. La base D1 de wrangler.toml sert de témoin ; absente, rien
# ne part — pas même `pages deploy`, qui créerait le projet dans ce compte-là.
# En répétition, rien n'est appelé : la CI la joue sans secrets.
D1_ID="$(sed -n 's/^database_id = "\(.*\)"$/\1/p' workers/api/wrangler.toml | head -n 1)"
step "Compte Cloudflare"
if [ "${DRY_RUN:-0}" = "1" ]; then
  printf '   \033[2m$ npx wrangler d1 list --json | grep %s\033[0m\n' "$D1_ID"
# `grep` sans `-q`, pour la même raison qu'au bucket R2 plus bas.
elif [ -n "$D1_ID" ] && ( cd workers/api && npx wrangler d1 list --json 2>/dev/null ) | grep -F "$D1_ID" >/dev/null; then
  ok "Compte de Luminose (base ${D1_ID} visible)"
else
  warn "Base D1 ${D1_ID:-?} introuvable : wrangler n'est pas connecté au compte Cloudflare de Luminose."
  ( cd workers/api && npx wrangler whoami 2>/dev/null | grep -E 'associated with|[0-9a-f]{32}' ) || true
  # Pas de `wrangler logout` : la connexion par défaut de la VM sert à un autre projet.
  warn "  Sur la VM : source ~/.cf-luminose && npm run deploy (jeton et compte de Luminose)"
  warn "  En CI : les secrets CLOUDFLARE_ACCOUNT_ID et CLOUDFLARE_API_TOKEN"
  warn "Arrêt avant toute écriture : rien n'a changé, ni chez Luminose ni ailleurs."
  exit 1
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
  # AVANT les migrations : un Worker déployé avec une liaison vers un bucket
  # absent échouerait, et une migration appliquée sans le Worker qui va avec
  # laisserait la base en avance. Si le bucket ne peut pas être créé, on
  # s'arrête ici — la production reste telle qu'elle était.
  step "Bucket R2 du montage (${R2_BUCKET})"
  if [ "${DRY_RUN:-0}" = "1" ]; then
    printf '   \033[2m$ npx wrangler r2 bucket list | grep %s || npx wrangler r2 bucket create %s --location weur\033[0m\n' "$R2_BUCKET" "$R2_BUCKET"
  # `grep` lit tout, sans `-q` : sous `pipefail`, un grep qui s'arrête au premier
  # trouvé coupe la sortie de wrangler, et le bucket présent passerait pour absent.
  elif ( cd workers/api && npx wrangler r2 bucket list 2>/dev/null | grep -w "$R2_BUCKET" >/dev/null ); then
    ok "Bucket présent"
  elif ( cd workers/api && npx wrangler r2 bucket create "$R2_BUCKET" --location weur ); then
    ok "Bucket créé"
  else
    warn "Le bucket ${R2_BUCKET} n'existe pas et n'a pas pu être créé (le jeton a-t-il le droit d'écrire dans R2 ?)."
    warn "  cd workers/api && npx wrangler r2 bucket create ${R2_BUCKET} --location weur"
    warn "Arrêt avant les migrations : rien n'a changé en production."
    exit 1
  fi

  step "Migrations D1 distantes"
  (
    cd workers/api
    # Idempotent : wrangler ne rejoue que les migrations non appliquées.
    run npx wrangler d1 migrations apply "$D1_BINDING" --remote
    # La base des clients (SPEC §14.4) : seulement le jour où la racine déclare
    # sa liaison — après la phase S4. Jusque-là, la production n'en a pas, et
    # ce chemin reste celui d'avant. Les sections [env.*] ne comptent pas.
    if awk '/^\[/ { section = $0 } section !~ /^\[\[?env\./ && /^binding = "CLIENTS"/ { trouve = 1 } END { exit !trouve }' wrangler.toml; then
      run npx wrangler d1 migrations apply CLIENTS --remote
    fi
  )
  ok "Base à jour"

  step "Worker API"
  ( cd workers/api && run npx wrangler deploy )
  ok "Worker déployé (routes /api/* et /auth/* de wrangler.toml)"
fi

# ─── Worker MCP ──────────────────────────────────────────────────────────────
MCP_PARTI=0
if has mcp && need_dir workers/mcp mcp; then
  if [ "$MCP_PRET" = 0 ]; then
    warn "Worker MCP ignoré : identifiant manquant dans wrangler.toml (voir tout en haut)."
  else
    step "Migrations D1 du Worker MCP (journal des écritures)"
    # Avant le Worker, comme pour l'API : un Worker neuf qui écrit dans une
    # table absente échoue — et une écriture sans journal n'appelle pas Google.
    ( cd workers/mcp && run npx wrangler d1 migrations apply DB --remote )
    step "Worker MCP"
    ( cd workers/mcp && run npx wrangler deploy )
    ok "Worker MCP déployé (https://mcp.luminose.fr/mcp)"
    MCP_PARTI=1
  fi
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
if [ "$MCP_PARTI" = 1 ]; then
  cat <<EOF
  - curl -s -o /dev/null -w '%{http_code}\n' -X POST https://mcp.luminose.fr/mcp   # attendu : 401
  - curl -s https://mcp.luminose.fr/.well-known/oauth-protected-resource          # resource = …/mcp
  - Dans Claude : « quel a été le coût par conversion le mois dernier ? »
EOF
fi
# Une cible demandée et ignorée ne se solde pas par « terminé » : le code de
# sortie le dit, après que le reste est parti.
fin() {
  if has mcp && [ "$MCP_PARTI" = 0 ]; then warn "Le Worker MCP n'est PAS parti (voir plus haut)."; exit 1; fi
  ok "Déploiement terminé"
}
if ! has api && ! has app; then fin; exit 0; fi
cat <<EOF
  - curl -s -o /dev/null -w '%{http_code}\n' ${APP_URL}/api/contents   # attendu : 401
  - curl -s -o /dev/null -w '%{http_code}\n' -X POST ${APP_URL}/auth/login \\
      -H 'Content-Type: application/json' -d '{}'                       # attendu : 401
      (405 = la route /auth/* n'a pas pris, c'est Pages qui répond)
  - Se connecter, vérifier que la liste des contenus s'affiche
  - Ouvrir Réglages → Modèles IA, lancer un test de modèle
  - Ouvrir un contenu, lancer une action IA de bout en bout
EOF
fin
