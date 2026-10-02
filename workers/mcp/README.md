# Worker MCP — Google Ads

Claude (claude.ai web, desktop, mobile, et Claude Code) interroge le compte Google Ads de
Luminose — campagnes, coûts, clics, conversions, termes de recherche — et, depuis le
01/10/2026, y **prépare** des modifications. **Claude prépare, Florent publie** : rien ne
s'active par ce serveur, l'activation (donc la dépense) reste dans l'interface Google Ads.
Voir « Écrire », plus bas.

Adresse du connecteur : **`https://mcp.luminose.fr/mcp`** — avec `/mcp`, au caractère près.

```
Claude ──(OAuth, couche A)──▶ workers/mcp ──(refresh token, couche B)──▶ API Google Ads v25
```

- **Couche A** — Claude vers ce Worker, par
  [`@cloudflare/workers-oauth-provider`](https://github.com/cloudflare/workers-oauth-provider) (1.2).
  Claude se présente par un **Client ID Metadata Document** (CIMD) ; pas d'enregistrement
  dynamique. Florent se connecte avec son compte Google, qui ne livre que `openid email` ;
  le Worker compare l'adresse certifiée à `ALLOWED_EMAIL` et refuse tout le reste. C'est la
  couche OAuth qui servira aux outils du corpus.
- **Couche B** — ce Worker vers Google Ads. Un refresh token (scope `adwords`) posé en
  secret, obtenu une fois. **Aucun en-tête `developer-token`** : il a été supprimé les
  9-10/09/2026, l'accès est porté par le projet Google Cloud.

### Qui fait quoi dans la couche A

| La bibliothèque | Ce Worker ([src/autorisation.ts](src/autorisation.ts)) |
| :--- | :--- |
| métadonnées RFC 8414 et RFC 9728, lecture et validation des documents CIMD, `/token` (codes, jetons, rotation, révocation), vérification du porteur sur `/mcp`, CORS | `/authorize` : `parseAuthRequest()`, page de consentement (`describeConsent()`), départ chez Google ; `/callback` : adresse certifiée → `ALLOWED_EMAIL` → `completeAuthorization()` |

**Rien n'entre dans KV avant que Google ait certifié l'adresse admise.** La demande validée
voyage dans un cookie signé (`__Host-mcp-connexion`, dix minutes) pendant l'aller-retour
Google ; la première écriture est le grant de `completeAuthorization()`. Un test le vérifie
sur toutes les requêtes non authentifiées.

## Les outils

| Outil | Appel Google Ads | Retour |
| :--- | :--- | :--- |
| `ads_lister_comptes` | `GET customers:listAccessibleCustomers`, puis le nom de chaque compte | identifiant, nom, devise, fuseau, `autorise` |
| `ads_requete` | `POST customers/{id}/googleAds:search` | lignes JSON, 200 lignes et 50 000 caractères au plus — tronqué, et dit |

`ads_requete` refuse ce qui ne commence pas par `SELECT`, et tout compte autre que
`GOOGLE_ADS_CUSTOMER_ID` ou `GOOGLE_ADS_LOGIN_CUSTOMER_ID`. La version de l'API s'écrit à un
seul endroit : `VERSION_API` dans [src/google-ads.ts](src/google-ads.ts).

## Écrire — Claude prépare, Florent publie

Cadrages du 01/10/2026 et du 02/10/2026
([decisions/2026-10-02-creer-des-campagnes.md](decisions/2026-10-02-creer-des-campagnes.md)),
livrés **lot par lot**, chacun déployé et essayé avant le suivant.

| Lot | Outils | État |
| :--- | :--- | :--- |
| 1 — réduire la dépense | `ads_negatifs_ajouter`, `ads_mettre_en_pause` | en service |
| 2 — créer, Search | `ads_campagne_creer`, `ads_groupe_creer`, `ads_annonce_creer`, `ads_mots_cles_ajouter` | livré |
| 3 — Performance Max | à définir | à venir |
| 4 — Demand Gen | à définir | à venir |
| 5 — le budget | `ads_budget_modifier` | à venir |

**Tout ce qui est créé naît en pause et porte la marque « [Claude] »** : dans le nom pour
une campagne ou un groupe, en libellé pour une annonce ou un mot-clé (une annonce
responsive n'a pas de nom). Florent relit, retire la marque, et active.

**Deux temps, toujours.** Sans `jeton`, l'outil envoie la requête avec `validateOnly: true` :
Google vérifie tout, n'applique rien, et l'outil rend un aperçu et un jeton. Avec le jeton,
il exécute — à condition que les opérations soient exactement celles de l'aperçu. Le jeton
est un HMAC de ces opérations, vaut dix minutes, et ne sert qu'une fois.

### Les verrous, et où ils vivent

Tous dans le serveur, jamais dans les descriptions d'outils : une consigne au modèle n'est
pas un verrou. Chacun a son test NORMATIF ([test/ecriture.test.ts](test/ecriture.test.ts)),
et chacun a été vérifié en le cassant : son test échoue.

| | Verrou | Où |
| :--- | :--- | :--- |
| V1 | aucune opération ne passe à `ENABLED`, aucun `remove` ; un `status` en entrée est refusé | table fermée, [src/google-ads.ts](src/google-ads.ts) |
| V2 | aperçu `validateOnly`, puis exécution du contenu exact de l'aperçu | [src/ecriture.ts](src/ecriture.ts) |
| V5 | une table fermée de services, et pour chacun la seule forme d'opération permise | `OPERATIONS_PERMISES`, [src/google-ads.ts](src/google-ads.ts) |
| V7 | une ligne de journal écrite **avant** l'appel ; sans elle, Google n'est pas appelé | [src/journal.ts](src/journal.ts), base `luminose-mcp` |
| V8 | sans le scope `ads:ecrire`, refus — accordé seulement en cochant la case du consentement | [src/ecriture.ts](src/ecriture.ts), [src/autorisation.ts](src/autorisation.ts) |
| V9 | au-delà de `ADS_ECRITURES_MAX_JOUR` exécutions sur 24 heures, refus (échecs compris) | [src/ecriture.ts](src/ecriture.ts) |
| V3 · R3 | budget d'une campagne créée ≤ `ADS_BUDGET_MAX_JOUR` ; engagement (actives + « [Claude] » en pause) ≤ `ADS_BUDGET_MAX_TOTAL` ; CPC max ≤ `ADS_CPC_MAX` ; budget jamais partagé | outil, puis table fermée qui revérifie |
| V4 | filtre des textes d'annonce : refus et avertissements, jamais sur les mots-clés | [src/regles.ts](src/regles.ts), revérifié par la table |
| V6 | URL finales sur `https://luminose.fr/` ou `https://www.luminose.fr/`, sans sous-domaine | [src/regles.ts](src/regles.ts), revérifié par la table |
| R1 · R2 | tout naît en pause ; marque « [Claude] » en nom ou en libellé | table fermée, [src/ecriture.ts](src/ecriture.ts) |
| R4 | le ciblage est recopié de `ADS_CAMPAGNE_MODELE` ; réseau Google seul ; rien de cela en entrée | [src/outils-creation.ts](src/outils-creation.ts), table fermée |
| R5 | personnalisation du texte et extension d'URL toujours coupées ; AI Max seulement en « Maximiser les conversions » | table fermée |

### Décisions du lot 1

- **Les négatifs naissent actifs** (01/10/2026). Un négatif ne dépense rien, il exclut ; en
  pause, il n'exclurait rien. Le forçage `PAUSED` de V1 vaut pour ce qui peut dépenser.
- **Un négatif ne se met pas en pause** : ce serait rouvrir du trafic, donc de la dépense.
- **Le Search seulement** : une campagne Performance Max est refusée.
- **Le compte Luminose seulement** : les outils d'écriture n'ont pas de paramètre `compte`.
- **Une base à part** pour le journal (`luminose-mcp`) : celle de la console porte les clés
  des fournisseurs IA, et ce Worker ne partage avec elle ni secret ni binding (SPEC §1.1).
- **L'usage unique du jeton** tient à l'unicité de `jeton_empreinte` dans le journal — pas
  à KV : rien n'y entre toujours sans identification.
- **Pas de `requiredScopes`** : c'est la page de consentement qui choisit les scopes. Un
  scope demandé par le client au rafraîchissement rétrécirait le grant à celui-là.

### Décisions du lot 2

- **La campagne part en une requête atomique** (`googleAds:mutate`) : budget, campagne et
  ciblage recopié, tout ou rien.
- **Le libellé se pose juste après** la création d'une annonce ou de mots-clés : les noms
  de ressource ne sont connus qu'une fois créés. S'il échoue, l'entité reste en pause, et
  l'outil comme le journal le disent. Le libellé « [Claude] » est créé au premier besoin.
- **Un groupe, une annonce, des mots-clés peuvent aller dans une campagne déjà validée** :
  ils naissent en pause et marqués, comme le reste.
- **Le filtre V4 est un plancher.** Il se relit dans [src/regles.ts](src/regles.ts), une
  ligne par terme ; « soign » y refuse aussi « soigneusement ».
- **Exceptions de règlement Google** (ajout du 02/10/2026, après le premier essai : 14
  mots-clés santé et tabac refusés). `ads_mots_cles_ajouter` vérifie à blanc, nomme chaque
  mot-clé arrêté et sa règle, et **ne demande rien** de lui-même. Avec
  `demander_exceptions: true`, il joint aux seuls mots-clés arrêtés les clés d'exception
  que **Google** vient de rendre — jamais des clés fournies par le modèle — et l'aperçu les
  liste ; elles ne partent qu'avec le jeton, donc après ton accord. Une règle sans
  exception possible fait refuser : reformuler ou retirer.

### Mise en place du lot 1 — ce que Florent fait

Sur la VM, depuis `workers/mcp` :

```bash
npx wrangler d1 create luminose-mcp --location weur   # reporter database_id dans wrangler.toml, commiter
openssl rand -base64 32 | npx wrangler secret put ADS_APERCU_KEY
```

Puis, depuis la racine : `./scripts/deploy.sh mcp` — il applique la migration du journal
avant de déployer le Worker. Ensuite, dans Claude : **retirer puis rajouter** le connecteur,
et **cocher « Préparer des modifications »** sur la page de consentement. La connexion
actuelle continue de lire ; elle n'obtient pas l'écriture par effet de bord. Si les réglages
du connecteur le permettent, régler les outils d'écriture sur « demander une approbation ».

Relire le journal :

```bash
npx wrangler d1 execute luminose-mcp --remote --command "SELECT id, datetime(created_at/1000, 'unixepoch') AS quand, outil, issue, erreur FROM ads_ecritures ORDER BY id DESC LIMIT 20"
```

## Mise en place — ce que Florent fait, dans cet ordre

L'accès à l'API peut prendre du temps : commencer par l'étape 1.

**1. Google Cloud Console**, connecté en `florent@luminose.fr`. Créer un projet **dans
l'organisation `luminose.fr`** (vérifier le sélecteur d'organisation : un projet hors
organisation ne propose pas le type « Interne »). Activer la *Google Ads API*. Demander le
niveau d'accès **Explorer** depuis la page « Google Ads API Overview » du projet.

**2. Écran de consentement** : type **Interne**. Puis un client OAuth **« Application Web »**
avec deux URL de retour :

| URL de retour | Pour |
| :--- | :--- |
| `https://mcp.luminose.fr/callback` | couche A |
| `http://localhost:8976/retour` | le script du refresh token (couche B) |

**3. Le refresh token**, sur le Mac (là où s'ouvre le navigateur). Node seul, rien à
installer :

```bash
cp workers/mcp/.dev.vars.example workers/mcp/.dev.vars   # y mettre l'ID et le secret du client
node workers/mcp/scripts/jeton-google-ads.mjs
```

Le script affiche le jeton et **ne l'écrit nulle part**. Il liste aussi les comptes visibles
directement : si le compte Luminose y figure, pas besoin de `GOOGLE_ADS_LOGIN_CUSTOMER_ID`.

**4. Sur la VM** :

```bash
cd workers/mcp
npx wrangler kv namespace create OAUTH_KV     # reporter l'id dans wrangler.toml, commiter
cd ../.. && ./scripts/deploy.sh mcp           # crée aussi l'entrée DNS mcp.luminose.fr
cd workers/mcp
npx wrangler secret put GOOGLE_OAUTH_CLIENT_ID
npx wrangler secret put GOOGLE_OAUTH_CLIENT_SECRET
npx wrangler secret put GOOGLE_ADS_REFRESH_TOKEN
npx wrangler secret put GOOGLE_ADS_CUSTOMER_ID        # dix chiffres, sans tirets
npx wrangler secret put COOKIE_SIGNING_KEY            # openssl rand -base64 32
# npx wrangler secret put GOOGLE_ADS_LOGIN_CUSTOMER_ID   # seulement derrière un MCC
```

Vérifications :

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://mcp.luminose.fr/mcp            # 401
curl -s https://mcp.luminose.fr/.well-known/oauth-authorization-server | grep -o '"client_id_metadata_document_supported":true'
```

La seconde doit afficher la ligne : sinon le drapeau `global_fetch_strictly_public` n'a pas
pris, et Claude ne pourra pas entrer.

**5. Dans Claude** : Paramètres → Connecteurs → *Ajouter un connecteur personnalisé*, URL
`https://mcp.luminose.fr/mcp`, **paramètres avancés laissés vides** : Claude se présente par
son document CIMD. La connexion ouvre la page de consentement du serveur, puis Google.

Pour Claude Code :

```bash
claude mcp add --transport http google-ads https://mcp.luminose.fr/mcp
```

puis `/mcp` dans Claude Code pour se connecter.

## Repli — si claude.ai ne passe pas par CIMD

Symptôme : la page affiche « Client non vérifiable », ou la connexion échoue avant la page
de consentement. Les journaux du Worker (`npx wrangler tail` depuis la VM) disent pourquoi :
les échecs de document CIMD y sont écrits, et eux seuls avec les pannes.

Le repli est **un client préenregistré, rien d'autre** — l'enregistrement dynamique reste
fermé. Le client est public : aucun secret à transporter.

```bash
node workers/mcp/scripts/client-preenregistre.mjs
```

Le script fabrique l'enregistrement avec `createClient()` de la bibliothèque, sans rien
écrire, et affiche la commande `wrangler kv key put … --remote` à lancer depuis la VM. Puis,
dans Claude, rajouter le connecteur avec l'identifiant affiché en *OAuth Client ID* et le
secret vide. CIMD reste actif à côté : Claude Code continue de passer par là.

## Secrets et configuration

| Nom | Où | Contenu |
| :--- | :--- | :--- |
| `ALLOWED_EMAIL` | `[vars]` de wrangler.toml | la seule adresse admise — `florent@luminose.fr`. Absente : personne |
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` | secrets | le client « Application Web », commun aux deux couches |
| `GOOGLE_ADS_REFRESH_TOKEN` | secret | couche B |
| `GOOGLE_ADS_CUSTOMER_ID` | secret | compte Luminose, dix chiffres |
| `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | secret, facultatif | le compte administrateur, s'il y en a un |
| `COOKIE_SIGNING_KEY` | secret | signe le cookie de connexion (le cadrage l'appelait `COOKIE_ENCRYPTION_KEY` : il signe, il ne chiffre pas) |
| `OAUTH_KV` | binding KV | l'état de la bibliothèque : grants, codes et jetons par empreinte, props chiffrées |
| `DB` | binding D1 (`luminose-mcp`) | le journal des écritures (V7), qui compte aussi le plafond V9 |
| `ADS_APERCU_KEY` | secret | signe les jetons d'aperçu (V2). Absent : l'écriture est fermée, la lecture continue |
| `ADS_ECRITURES_MAX_JOUR` | `[vars]` de wrangler.toml | V9 — 30 exécutions sur 24 heures. Absent ou illisible : l'écriture est fermée |
| `ADS_BUDGET_MAX_JOUR`, `ADS_BUDGET_MAX_TOTAL`, `ADS_CPC_MAX` | `[vars]` de wrangler.toml | R3 — 10 €, 25 €, 2 €. Absents ou illisibles : la création est fermée |
| `ADS_CAMPAGNE_MODELE` | `[vars]` de wrangler.toml | R4 — la campagne dont le ciblage est recopié |
| `global_fetch_strictly_public` | `compatibility_flags` | exigé pour CIMD : les documents des clients ne peuvent pas viser une adresse interne |

Un secret absent ne fait pas tomber le Worker : l'outil ou la page concernée **nomme** le
secret et la commande qui le pose.

## En local

`npm run dev:mcp` (depuis la VM) sert les métadonnées et la page `/`, mais le parcours
OAuth ne va pas au bout : la bibliothèque lie chaque jeton à `https://mcp.luminose.fr/mcp`,
et refuse de le servir ailleurs. Tout ce qui s'y joue est couvert par les tests
([test/autorisation.test.ts](test/autorisation.test.ts)) ; le reste s'essaie en production.
La lecture y est sans risque ; l'écriture commence toujours par un aperçu, que Google
vérifie sans rien appliquer.

## Couper l'accès

- **Tout de suite** : retirer ou changer `ALLOWED_EMAIL`. L'adresse est revérifiée à chaque
  appel de `/mcp` et à chaque rafraîchissement ; le grant est révoqué au suivant.
- **L'écriture seulement** : supprimer le secret `ADS_APERCU_KEY`, ou mettre
  `ADS_ECRITURES_MAX_JOUR` à `"0"`. La lecture continue.
- **L'accès à Google Ads** : révoquer le client sur myaccount.google.com/permissions.

## Écarts avec le cadrage du 30/09/2026

| Cadrage | Fait | Pourquoi |
| :--- | :--- | :--- |
| `/authorize` : `parseAuthRequest` → Google → `ALLOWED_EMAIL` → `completeAuthorization` | Une **page de consentement** entre `parseAuthRequest` et Google | Avec CIMD, n'importe qui peut publier un document de client pointant vers son propre serveur. Sans consentement, un lien piégé vers `/authorize` suffirait : Google ne redemande pas un accord déjà donné, et le code partirait chez le tiers. La spécification MCP l'exige de tout serveur qui relaie un fournisseur d'identité ; la page affiche ce que `describeConsent()` fournit. |
| Consentement par les helpers de la bibliothèque, implicitement | Cookie signé à nous, pas `beginConsent()` ni `beginUpstream()` | Ces deux helpers rangent la demande dans KV dès le premier GET, quel que soit l'auteur de la requête : c'est exactement ce que le test « aucune écriture KV sur une requête non authentifiée » interdit. |
| `COOKIE_ENCRYPTION_KEY` | `COOKIE_SIGNING_KEY` | La clé signe, elle ne chiffre pas. |
| Protocole MCP par le SDK, implicitement | Écrit à la main ([src/mcp.ts](src/mcp.ts)) | La révision **2026-07-28** (sans état, `server/discover` au lieu de `initialize`) est servie, et les révisions 2025 aussi : les clients Claude ne changent pas tous de version le même jour. |
| Comptes « sous MCC s'il y en a un » | Le compte Luminose et le compte administrateur lui-même | Un MCC peut gérer des comptes qui ne sont pas ceux de Luminose. En ajouter un est une ligne dans `comptesAutorises`. |
| DNS à faire à la main (§10, étape 3) | `custom_domain = true` dans wrangler.toml | Le premier déploiement crée l'entrée. |
| Cible `mcp` « à côté de `api` » | À côté, mais hors de « tout » | Une fonctionnalité en plus ne doit jamais pouvoir faire échouer le déploiement des autres. |
| Critères d'acceptation « en local » (étapes 1 à 4) | Tests, puis production | Les jetons sont liés à l'URL de production (voir « En local »). |

## Tranché le 30/09/2026, au premier branchement

1. **Pas de compte administrateur (MCC).** Le compte Luminose, `5272252272`, est visible en
   accès direct : `GOOGLE_ADS_LOGIN_CUSTOMER_ID` est inutile.
2. **`mcp.luminose.fr`** est en service. Changer de nom demanderait de modifier `RESSOURCE`
   dans [src/index.ts](src/index.ts), `routes` dans wrangler.toml, et l'URL de retour du
   client Google.
3. **Claude entre par CIMD.** Vérifié dans KV : le grant porte un `clientId` en
   `https://claude.ai/…`, et aucun client n'est préenregistré. Le repli n'a pas servi ; il
   reste prêt, pour le jour où ça changerait.
