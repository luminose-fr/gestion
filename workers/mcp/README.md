# Worker MCP — Google Ads, en lecture seule

Claude (claude.ai web, desktop, mobile, et Claude Code) interroge le compte Google Ads de
Luminose : campagnes, coûts, clics, conversions, termes de recherche. **Rien ne s'écrit** :
les modifications restent manuelles, dans l'interface Google Ads.

Adresse du connecteur : **`https://mcp.luminose.fr/mcp`** — avec `/mcp`, au caractère près.

```
Claude ──(OAuth, couche A)──▶ workers/mcp ──(refresh token, couche B)──▶ API Google Ads v25
```

- **Couche A** — Claude vers ce Worker. Florent se connecte avec son compte Google ; le
  Worker compare l'adresse certifiée à `ALLOWED_EMAIL` et refuse tout le reste. Ne demande
  à Google que `openid email`. C'est la couche OAuth qui servira aux outils du corpus.
- **Couche B** — ce Worker vers Google Ads. Un refresh token (scope `adwords`) posé en
  secret, obtenu une fois. **Aucun en-tête `developer-token`** : il a été supprimé les
  9-10/09/2026, l'accès est porté par le projet Google Cloud.

## Les outils

| Outil | Appel Google Ads | Retour |
| :--- | :--- | :--- |
| `ads_lister_comptes` | `GET customers:listAccessibleCustomers`, puis le nom de chaque compte | identifiant, nom, devise, fuseau, `autorise` |
| `ads_requete` | `POST customers/{id}/googleAds:search` | lignes JSON, 200 lignes et 50 000 caractères au plus — tronqué, et dit |

`ads_requete` refuse ce qui ne commence pas par `SELECT`, et tout compte autre que
`GOOGLE_ADS_CUSTOMER_ID` ou `GOOGLE_ADS_LOGIN_CUSTOMER_ID`. La version de l'API s'écrit à un
seul endroit : `VERSION_API` dans [src/google-ads.ts](src/google-ads.ts).

## Mise en place — ce que Florent fait, dans cet ordre

L'accès à l'API peut prendre du temps : commencer par l'étape 1.

**1. Google Cloud Console**, connecté en `florent@luminose.fr`. Créer un projet **dans
l'organisation `luminose.fr`** (vérifier le sélecteur d'organisation : un projet hors
organisation ne propose pas le type « Interne »). Activer la *Google Ads API*. Demander le
niveau d'accès **Explorer** depuis la page « Google Ads API Overview » du projet.

**2. Écran de consentement** : type **Interne**. Puis un client OAuth **« Application Web »**
avec ces trois URL de retour :

| URL de retour | Pour |
| :--- | :--- |
| `https://mcp.luminose.fr/callback` | couche A, production |
| `http://localhost:8788/callback` | couche A, `wrangler dev` |
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
npm install                                   # nouveau workspace ; si le lockfile bouge, le commiter
cd workers/mcp
npx wrangler kv namespace create OAUTH_KV     # reporter l'id dans wrangler.toml, commiter
cd ../.. && ./scripts/deploy.sh mcp           # crée aussi l'entrée DNS mcp.luminose.fr
cd workers/mcp
npx wrangler secret put GOOGLE_OAUTH_CLIENT_ID
npx wrangler secret put GOOGLE_OAUTH_CLIENT_SECRET
npx wrangler secret put GOOGLE_ADS_REFRESH_TOKEN
npx wrangler secret put GOOGLE_ADS_CUSTOMER_ID        # dix chiffres, sans tirets
npx wrangler secret put OAUTH_SIGNING_KEY             # openssl rand -base64 32
# npx wrangler secret put GOOGLE_ADS_LOGIN_CUSTOMER_ID   # seulement derrière un MCC
```

Vérification : `curl -s -o /dev/null -w '%{http_code}\n' -X POST https://mcp.luminose.fr/mcp`
doit répondre `401`.

**5. Dans Claude** : Paramètres → Connecteurs → *Ajouter un connecteur personnalisé*, URL
`https://mcp.luminose.fr/mcp`, identifiant et secret de client **laissés vides** (Claude
s'enregistre seul). La connexion ouvre la page de consentement du serveur, puis Google.

Pour Claude Code :

```bash
claude mcp add --transport http google-ads https://mcp.luminose.fr/mcp
```

puis `/mcp` dans Claude Code pour se connecter.

## Secrets et configuration

| Nom | Où | Contenu |
| :--- | :--- | :--- |
| `ALLOWED_EMAIL` | `[vars]` de wrangler.toml | la seule adresse admise — `florent@luminose.fr`. Absente : personne |
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` | secrets | le client « Application Web », commun aux deux couches |
| `GOOGLE_ADS_REFRESH_TOKEN` | secret | couche B |
| `GOOGLE_ADS_CUSTOMER_ID` | secret | compte Luminose, dix chiffres |
| `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | secret, facultatif | le compte administrateur, s'il y en a un |
| `OAUTH_SIGNING_KEY` | secret | signe les identifiants de client et le cookie de connexion |
| `OAUTH_KV` | binding KV | codes et jetons de la couche A, rangés par empreinte SHA-256 |

Un secret absent ne fait pas tomber le Worker : l'outil ou la page concernée **nomme** le
secret et la commande qui le pose.

## En local

`npm run dev:mcp` lance `wrangler dev` sur le port 8788, depuis la VM. Le navigateur doit
joindre `localhost:8788` — depuis le Mac, par un tunnel :
`ssh -L 8788:localhost:8788 <vm>`. L'inspecteur MCP (`npx @modelcontextprotocol/inspector`,
transport *Streamable HTTP*, URL `http://localhost:8788/mcp`) fait alors le parcours OAuth
complet, Google compris.

Plus simple, et sans risque puisque tout est en lecture : déployer, et essayer directement
depuis Claude.

## Couper l'accès

- **Tout de suite** : retirer `ALLOWED_EMAIL`, ou le changer. L'adresse est revérifiée à
  chaque appel ; les jetons déjà délivrés cessent de servir immédiatement.
- **Les connexions de Claude** : changer `OAUTH_SIGNING_KEY`. Plus aucun rafraîchissement ne
  passe ; les jetons d'accès meurent dans l'heure.
- **L'accès à Google Ads** : révoquer le client sur myaccount.google.com/permissions.

## Écarts avec le cadrage du 30/09/2026

| Cadrage | Fait | Pourquoi |
| :--- | :--- | :--- |
| `workers-oauth-provider` pour la couche A | Serveur d'autorisation écrit ici ([src/oauth.ts](src/oauth.ts)) | Le dépôt interdit à un agent d'installer une dépendance (CLAUDE.md) : la bibliothèque ne pouvait être ni installée ni testée pendant le chantier. Le besoin est étroit — un utilisateur, des clients publics — et tient en un fichier couvert par ses propres tests ([test/oauth.test.ts](test/oauth.test.ts)). Surtout, il permet ce que la bibliothèque ne fait pas : **aucune écriture KV avant que Google ait certifié l'adresse**. L'enregistrement de client est sans état (identifiant signé), la connexion en cours vit dans un cookie signé ; un robot qui martèle `/register` ne peut pas épuiser le quota d'écritures du plan gratuit. Le prix : du code de sécurité à tenir nous-mêmes. Revenir à la bibliothèque ne toucherait que ce fichier. |
| `COOKIE_ENCRYPTION_KEY` | `OAUTH_SIGNING_KEY` | La clé signe, elle ne chiffre pas. Le nom dit ce qu'elle fait. |
| Protocole MCP par le SDK, implicitement | Écrit à la main ([src/mcp.ts](src/mcp.ts)) | Même raison de dépendance. La révision **2026-07-28** (sans état, `server/discover` au lieu de `initialize`) est servie, et les révisions 2025 aussi : les clients Claude ne changent pas tous de version le même jour. |
| — | Une page de consentement avant Google | Exigée par la spécification MCP pour un serveur qui relaie un fournisseur d'identité avec un client unique : sans elle, Google ne redemandant pas un accord déjà donné, un lien piégé vers `/authorize` suffirait. |
| — | URL de retour limitées à `claude.ai/api/mcp/auth_callback` et aux boucles locales | Un client enregistré par un tiers ne peut pas recevoir de code à sa propre adresse. |
| Comptes « sous MCC s'il y en a un » | Le compte Luminose et le compte administrateur lui-même | Un MCC peut gérer des comptes qui ne sont pas ceux de Luminose. En ajouter un est une ligne dans `comptesAutorises`. |
| DNS à faire à la main (§10, étape 3) | `custom_domain = true` dans wrangler.toml | Le premier déploiement crée l'entrée. |
| Cible `mcp` « à côté de `api` » | À côté, mais hors de « tout » | Une fonctionnalité en plus ne doit jamais pouvoir faire échouer le déploiement des autres. |
| Outil `ping` à l'étape 1 | Non conservé | Le protocole a sa propre méthode `ping` ; un outil de plus serait un outil que le modèle essaierait. |

## Questions encore ouvertes

1. **Le compte est-il sous un MCC ?** Le script de l'étape 3 répond : il liste les comptes
   visibles directement.
2. **`mcp.luminose.fr`** est supposé. Autre nom : changer `routes` dans wrangler.toml et
   l'URL de retour du client Google.
