# Worker MCP — Google Ads

Claude (claude.ai web, desktop, mobile, et Claude Code) interroge le compte Google Ads de
Luminose — campagnes, coûts, clics, conversions, termes de recherche — et, depuis le
01/10/2026, y **prépare** des modifications. **Claude prépare, Florent publie** : rien ne
s'active par ce serveur, l'activation (donc la dépense) reste dans l'interface Google Ads.
Voir « Écrire », plus bas.

Depuis le 03/10/2026, il lit aussi **le corpus** de Luminose tel que la branche `main` le
porte, et y écrit par commit, dans les mêmes deux temps. Voir « Le corpus », plus bas.

Adresse du connecteur : **`https://mcp.luminose.fr/mcp`** — avec `/mcp`, au caractère près.

```
Claude ──(OAuth, couche A)──▶ workers/mcp ──(refresh token, couche B)──▶ API Google Ads v25
                                          └─(jeton GitHub, couche C)──▶ dépôt luminose-fr/gestion
```

- **Couche A** — Claude vers ce Worker, par
  [`@cloudflare/workers-oauth-provider`](https://github.com/cloudflare/workers-oauth-provider) (1.2).
  Claude se présente par un **Client ID Metadata Document** (CIMD) ; pas d'enregistrement
  dynamique. Florent se connecte avec son compte Google, qui ne livre que `openid email` ;
  le Worker compare l'adresse certifiée à `ALLOWED_EMAIL` et refuse tout le reste. La même
  connexion sert les outils du corpus.
- **Couche B** — ce Worker vers Google Ads. Un refresh token (scope `adwords`) posé en
  secret, obtenu une fois. **Aucun en-tête `developer-token`** : il a été supprimé les
  9-10/09/2026, l'accès est porté par le projet Google Cloud.
- **Couche C** — ce Worker vers GitHub, pour le corpus. Un jeton à grain fin posé en
  secret, **le sien** : pas celui de la console ([src/github.ts](src/github.ts)).

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
livrés **lot par lot**, chacun déployé et essayé avant le suivant. Le lot 4 passe avant le
lot 3, décision de Florent du 07/10/2026.

| Lot | Outils | État |
| :--- | :--- | :--- |
| 1 — réduire la dépense | `ads_negatifs_ajouter`, `ads_mettre_en_pause` | en service |
| 2 — créer, Search | `ads_campagne_creer`, `ads_groupe_creer`, `ads_annonce_creer`, `ads_mots_cles_ajouter` | livré |
| 2 bis — listes de négatifs | `ads_liste_negatifs_creer`, `ads_liste_negatifs_ajouter`, `ads_liste_negatifs_retirer`, `ads_liste_associer`, `ads_liste_dissocier`, `ads_negatifs_retirer` | livré ([decisions/2026-10-03-listes-de-negatifs.md](decisions/2026-10-03-listes-de-negatifs.md)) |
| 2 ter — éléments d'annonce, insertion de mot-clé | `ads_elements_creer`, `ads_elements_associer`, `ads_elements_dissocier` — liens annexes, info-bulles, extraits structurés, prix ; l'insertion dans `ads_annonce_creer`, contrôlée aussi par `ads_mots_cles_ajouter` | livré ([decisions/2026-10-04-elements-et-insertion.md](decisions/2026-10-04-elements-et-insertion.md)) |
| 3 — Performance Max | à définir | **à faire** |
| 4 — Demand Gen | `ads_dg_campagne_creer`, `ads_dg_groupe_creer`, `ads_dg_annonce_creer` — budget total, zone par préréglage, annonce multi-élément | en service depuis le 08/10/2026 ([decisions/2026-10-07-demand-gen.md](decisions/2026-10-07-demand-gen.md)) |
| 5 — le budget | `ads_budget_modifier` | **à faire** |

### À faire

Rien n'est en cours. Dans l'ordre où ils ont été décidés :

1. **Demand Gen — l'annonce vidéo responsive.** Le serveur ne crée que l'annonce
   multi-élément ; la vidéo se crée aujourd'hui dans l'interface, hors de ses verrous.
   Un envoi à blanc confirmera ses limites, absentes de la référence v25, avant tout code
   ([decisions/2026-10-07-demand-gen.md](decisions/2026-10-07-demand-gen.md), §10).
2. **Lot 3 — Performance Max.** À cadrer : rien n'est décidé.
3. **Lot 5 — modifier un budget** (`ads_budget_modifier`), l'ancien lot 3 du cadrage du
   02/10/2026.

**Tout ce qui est créé naît en pause et porte la marque « [Claude] »** : dans le nom pour
une campagne ou un groupe, en libellé pour une annonce ou un mot-clé (une annonce
responsive n'a pas de nom). Florent relit, retire la marque, et active. Un élément
d'annonce n'a ni nom ni libellé visibles : c'est son **association** qui porte la barrière —
en pause derrière une campagne active, active derrière une campagne en pause, dont la pause
suffit (06/10/2026). Une annonce Demand Gen peut porter un nom interne : immuable, il ne
porte pas la marque — son libellé, si.

**Deux temps, toujours.** Sans `jeton`, l'outil envoie la requête avec `validateOnly: true` :
Google vérifie tout, n'applique rien, et l'outil rend un aperçu et un jeton. Avec le jeton,
il exécute — à condition que les opérations soient exactement celles de l'aperçu. Le jeton
est un HMAC de ces opérations, vaut dix minutes, et ne sert qu'une fois.

Ce que l'aperçu a **lu dans le compte** et dont les opérations dépendent — les exceptions de
règlement rendues par Google, les doublons écartés, les critères à retirer — voyage dans le
jeton, signé. L'exécution reconstruit donc les opérations sans relire ce qu'un appel
concurrent a pu changer entre-temps ; le compte relu à l'exécution ne peut plus qu'**écarter**
une opération devenue sans objet (un doublon apparu, une entrée déjà retirée), jamais en
ajouter une. C'est la correction de l'incident du 02/10/2026, plus bas.

### Les verrous, et où ils vivent

Tous dans le serveur, jamais dans les descriptions d'outils : une consigne au modèle n'est
pas un verrou. Chacun a son test NORMATIF ([test/ecriture.test.ts](test/ecriture.test.ts) ;
Demand Gen : [test/demand-gen.test.ts](test/demand-gen.test.ts)), et chacun a été vérifié
en le cassant : son test échoue.

| | Verrou | Où |
| :--- | :--- | :--- |
| V1 | aucune opération ne passe à `ENABLED`, sauf l'association d'un élément d'annonce derrière une campagne en pause, que **le compte confirme** avant chaque envoi ; un `status` en entrée est refusé ; aucun `remove`, sauf le retrait d'une exclusion — négatif de campagne, entrée d'une liste de négatifs, lien d'une telle liste à une campagne — ou du lien d'un élément d'annonce à une campagne ou un groupe (jamais l'élément), que **le compte confirme** avant chaque envoi | table fermée et `verifierRetraits`, [src/google-ads.ts](src/google-ads.ts) |
| V2 | aperçu `validateOnly`, puis exécution du contenu exact de l'aperçu, ou d'une partie quand le compte en a rendu le reste sans objet ; ce que l'aperçu a lu voyage dans le jeton | [src/ecriture.ts](src/ecriture.ts) |
| V5 | une table fermée de services, et pour chacun la seule forme d'opération permise | `OPERATIONS_PERMISES`, [src/google-ads.ts](src/google-ads.ts) |
| V7 | une ligne de journal écrite **avant** l'appel ; sans elle, Google n'est pas appelé | [src/journal.ts](src/journal.ts), base `luminose-mcp` |
| V8 | sans le scope `ads:ecrire`, refus — accordé seulement en cochant la case du consentement | [src/ecriture.ts](src/ecriture.ts), [src/autorisation.ts](src/autorisation.ts) |
| V9 | au-delà de `ADS_ECRITURES_MAX_JOUR` exécutions sur 24 heures, refus (échecs compris) | [src/ecriture.ts](src/ecriture.ts) |
| V3 · R3 | budget d'une campagne créée ≤ `ADS_BUDGET_MAX_JOUR` ; engagement (actives + « [Claude] » en pause, un budget total pour son équivalent quotidien tant que sa fin n'est pas passée) ≤ `ADS_BUDGET_MAX_TOTAL` ; CPC max ≤ `ADS_CPC_MAX` ; budget jamais partagé | outil, puis table fermée qui revérifie ; l'engagement, [src/argent.ts](src/argent.ts) |
| DG1 | Demand Gen : budget total (`CUSTOM_PERIOD`), dates de début et de fin obligatoires, début au plus tôt aujourd'hui ; total ≤ `ADS_BUDGET_MAX_CAMPAGNE` ; équivalent quotidien (total ÷ jours, au centime supérieur) ≤ `ADS_BUDGET_MAX_JOUR`, compté dans l'engagement | outil, puis table fermée |
| DG2 | Demand Gen : Maximiser les clics, sans plafond (Google le refuse en Demand Gen) ; CPC cible ≤ `ADS_CPC_MAX` ; ou Maximiser les conversions, sans CPA ni ROAS cible | outil, puis table fermée |
| DG3 | l'objectif de conversion d'une campagne Demand Gen : une clé de `ADS_OBJECTIFS_CONVERSION` ; l'objectif personnalisé et chacune de ses actions de conversion, actifs dans le compte | outil ; la table n'admet que les objectifs de la liste |
| DG4 · DG5 | zone `france_metropolitaine` ou `locale` (`ADS_ZONE_LOCALE`), jamais un lieu ni un rayon, lieux vérifiés dans le compte ; français ; présence réelle ; canaux posés par le serveur — YouTube, Discover, Gmail, ni Display ni Maps | outil, puis table fermée |
| DG6 | ce que Google génèrerait pour Demand Gen, coupé à chaque annonce ; rien à la campagne, où Google le refuse | table fermée |
| DG7 | annonce multi-élément : images et logos de la bibliothèque, vérifiés — type, ratio à 1 % près, taille minimale ; « Luminose » pour nom d'entreprise ; bouton pris dans une liste fermée ; V4 et V6 | outil, puis table fermée |
| V4 | filtre des textes d'annonce et d'éléments d'annonce : refus et avertissements. Pas sur les mots-clés, sauf quand l'insertion leur fait écrire l'annonce : chaque rendu passe alors au filtre | [src/regles.ts](src/regles.ts), revérifié par la table |
| V6 | URL finales — annonces et liens annexes — sur `https://luminose.fr/` ou `https://www.luminose.fr/`, sans sous-domaine | [src/regles.ts](src/regles.ts), revérifié par la table |
| R1 · R2 | tout naît en pause ; marque « [Claude] » en nom ou en libellé ; l'association d'un élément d'annonce, en pause — ou active derrière une campagne en pause | table fermée et `verifierActivations`, [src/ecriture.ts](src/ecriture.ts) |
| R4 | Search : le ciblage est recopié de `ADS_CAMPAGNE_MODELE` ; réseau Google seul ; rien de cela en entrée | [src/outils-creation.ts](src/outils-creation.ts), table fermée |
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

### Décisions des listes de négatifs (03/10/2026)

Détail : [decisions/2026-10-03-listes-de-negatifs.md](decisions/2026-10-03-listes-de-negatifs.md).

- **Une liste pour ce qui vaut pour plusieurs campagnes**, un négatif de campagne pour ce qui
  est propre à une campagne. Les descriptions d'outils le disent au modèle.
- **Les retraits d'exclusion entrent dans la table**, et eux seuls : négatif de campagne,
  entrée de liste, lien liste–campagne. Le modèle désigne par texte et correspondance ; le
  serveur résout les identifiants, et la table redemande au compte, avant tout envoi, que
  chaque cible soit bien une exclusion — la forme d'un nom de ressource ne distingue pas un
  négatif de la zone d'une campagne. L'aperçu d'un retrait dit qu'il peut rouvrir du trafic,
  et liste ce qu'il retire.
- **Aucune liste ne se supprime** par ce serveur, et rien n'active une campagne.
- **Doublons** — déjà dans la liste, ou déjà exclus au niveau campagne sur toutes les
  campagnes liées : signalés, écartés, jamais une erreur. Un négatif de campagne présent sur
  une partie seulement des campagnes liées s'ajoute, et l'aperçu le dit.
- **Avertissement de blocage**, jamais un refus, quand un négatif exclurait la recherche
  identique à un mot-clé positif actif ou en pause d'une campagne liée — au texte près,
  accents compris : Google n'étend pas les négatifs aux variantes proches.
- **Limites de Google** (aide Google Ads, relevées le 03/10/2026) : 20 listes par compte,
  5 000 mots-clés par liste, vérifiées avant l'aperçu. `LIMITES_LISTES` dans
  [src/google-ads.ts](src/google-ads.ts).

### Décisions des éléments d'annonce et de l'insertion (04/10/2026, 06/10/2026)

Détail : [decisions/2026-10-04-elements-et-insertion.md](decisions/2026-10-04-elements-et-insertion.md).

- **Liens annexes, info-bulles, extraits structurés, prix**, créés et associés à une campagne
  ou à un groupe en une requête atomique. Un élément existant s'associe par son identifiant,
  sans être recréé ; une dissociation ne retire que le lien.
- **Statut à la naissance** (06/10/2026) : une association naît `PAUSED` quand sa campagne est
  active, `ENABLED` quand elle est en pause — la pause de la campagne suffit comme barrière.
  L'aperçu dit lequel s'applique, et pourquoi. Le statut lu à l'aperçu voyage dans le jeton :
  une campagne activée entre-temps fait refuser l'exécution, et `verifierActivations` redemande
  au compte, avant chaque envoi, que toute association active vise une campagne en pause.
- **Info-bulles** (06/10/2026) : le nom des « callouts » dans l'interface française de Google
  Ads. Le paramètre est `info_bulles` ; `accroches`, l'ancien nom, reste accepté pendant la
  transition — l'un ou l'autre, pas les deux.
- **Limites de Google**, en caractères affichés : lien annexe 25, ses descriptions 35 — les
  deux ou aucune —, info-bulle 25, prix 3 à 8 lignes (titre et description 25, prix en euros à
  deux décimales, URL sur luminose.fr), extrait structuré 3 à 10 valeurs de 25 sous un en-tête de la
  liste fermée de Google, en français — plus « Services », que Google accepte (deux extraits
  du compte le portent). `LIMITES_ELEMENTS` et `EN_TETES_EXTRAITS` dans
  [src/google-ads.ts](src/google-ads.ts), revérifiés par la table.
- **L'aperçu dit les niveaux** — compte, campagne, groupe : pour un même type, le plus fin qui
  a des associations actives l'emporte. Il nomme ce qui s'affiche aujourd'hui, ce qui serait
  masqué, et ce qui prendra le relais après une dissociation.
- **Doublons** : un élément au contenu identique déjà dans le compte est écarté, et l'aperçu
  donne l'appel `ads_elements_associer` qui le réutiliserait. Même texte à la casse près, ou
  lien annexe au même texte vers une autre page : signalé, pas écarté.
- **Breathwork** : plus d'avertissement sur le questionnaire de santé depuis le 08/10/2026. Le
  cadre déontologique le veut là où l'on s'engage — page d'offre, d'arrivée, réservation — et en
  dispense ce qui y mène : annonces, liens annexes, lignes de prix.
- **Insertion de mot-clé** dans `ads_annonce_creer` : `{keyword:…}`, `{Keyword:…}`,
  `{KeyWord:…}`, `{KEYWord:…}`, `{KeyWORD:…}`, rien d'autre ; la longueur se compte sur le
  texte par défaut. L'aperçu rend le titre de chaque mot-clé du groupe, casse appliquée — le
  texte par défaut quand le rendu dépasse la limite —, et un rendu interdit fait refuser.
  `ads_mots_cles_ajouter` fait le même contrôle pour chaque mot-clé ajouté à un groupe dont
  une annonce utilise l'insertion. « Hypnothérapeute » dans un rendu avertit, sans refuser.
  [src/insertion.ts](src/insertion.ts), sans dépendance.

### Décisions de Demand Gen (07/10/2026)

Détail : [decisions/2026-10-07-demand-gen.md](decisions/2026-10-07-demand-gen.md), vérifié
contre la référence v25 de l'API.

- **Trois outils, trois requêtes atomiques.** La campagne : budget, campagne, objectif de
  conversion. Le groupe : ses canaux, ses lieux, sa langue. L'annonce, puis son libellé.
  Les outils du Search refusent une campagne Demand Gen, et l'inverse.
- **Budget total, jamais partagé**, sur des dates obligatoires. Son équivalent quotidien
  tient sous le plafond quotidien et compte dans l'engagement — y compris pour le Search :
  avant le 07/10/2026, l'engagement comptait un budget total pour zéro.
- **L'objectif de conversion appartient à la campagne.** Florent crée ses objectifs
  personnalisés dans Google Ads ; le serveur n'en crée aucun, il vérifie celui que désigne
  la clé, et ses actions de conversion, avant de le poser.
- **La zone est un préréglage.** Le ciblage d'une campagne Demand Gen vit au groupe, où un
  rayon n'existe pas : le préréglage `locale` est une liste fermée de lieux, posée par
  Florent dans `ADS_ZONE_LOCALE`.
- **Le multi-élément d'abord.** La vidéo responsive est à faire (« À faire », plus haut) :
  un envoi à blanc confirmera d'abord ses limites, absentes de la référence.
- **Le premier aperçu de campagne (07/10/2026) a tranché deux points** : Google refuse en
  Demand Gen le plafond de CPC et les automatismes réglés à la campagne. Décision de
  Florent : `CLICS` part sans plafond, `CPC_CIBLE` s'ajoute, plafonné par `ADS_CPC_MAX`, et
  les automatismes ne se coupent plus qu'à l'annonce. Détail : §8 de la décision.
- **Confirmé par Google le 08/10/2026**, sur les deux premières campagnes créées par le
  serveur : la présence réelle, l'objectif posé dans la même requête que la campagne, les
  automatismes coupés à l'annonce, le texte du bouton. Ce qui se change ensuite dans
  l'interface échappe aux verrous du serveur (§9 de la décision).

### L'incident du 02/10/2026 — quatre exécutions concurrentes

Quatre `ads_mots_cles_ajouter` lancés ensemble, quatre groupes, quatre jetons : deux refusés,
« Le contenu diffère de celui de l'aperçu » ; rejoués un par un, passés. Diagnostic : à
l'exécution, l'outil **relisait le règlement de Google** pour reconstruire les clés
d'exception, et l'empreinte portait sur ces clés. Or Google, une fois une exception demandée
pour un texte, ne l'arrête plus (documentation « Request exemption for keywords ») : les deux
premières exécutions, en demandant l'exception pour un texte que les quatre groupes
partageaient, ont fait que les deux suivantes reconstruisaient des opérations **sans**
exception — une autre empreinte. Rien dans l'isolat du Worker n'était partagé ; l'état
partagé, c'était le compte. Corrigé en faisant voyager les clés dans le jeton (voir « Deux temps ») ; le test
[test/creation.test.ts](test/creation.test.ts) rejoue l'ordre exact de l'incident, et
échoue sur le code d'avant. Au passage, la création du libellé « [Claude] » au premier
besoin avait la même course : quand deux exécutions le créent ensemble, la seconde relit
désormais celui de la première au lieu de déclarer « libellé NON posé ».

### L'incident du 04/10/2026 — un champ du WHERE hors du SELECT

Premier essai réel d'`ads_elements_creer` et d'`ads_elements_associer` : tous les aperçus
échouaient, avant toute écriture, sur `queryError.EXPECTED_REFERENCED_FIELD_IN_SELECT_CLAUSE`.
La lecture des éléments associés filtrait `campaign_asset` sur `campaign.id` — et
`ad_group_asset` sur `ad_group.campaign` — sans les sélectionner, ce que Google refuse pour
ces ressources. Les tests passaient : leurs simulateurs répondaient aux requêtes sans les
juger.

Règle depuis : **tout champ que WHERE ou ORDER BY référence figure dans le SELECT**, pour
toutes les requêtes du serveur. Google ne l'exige pas partout, mais une règle sans exception
se vérifie. [test/gaql.test.ts](test/gaql.test.ts) relit dans le code source chaque requête
construite, avec ses variantes, et la vérifie ; une requête qu'il ne sait pas relire le fait
échouer. Les simulateurs de l'API ([test/aides.ts](test/aides.ts)) rendent désormais
l'erreur de Google à une requête qui l'enfreint. Sur le code d'avant, le premier relève
20 requêtes fautives sur 35 ; chacune des 20 corrigées a été passée au compte réel.

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

## Le corpus — lire `main`, écrire par commit

Décision du 03/10/2026 : [decisions/2026-10-03-corpus.md](decisions/2026-10-03-corpus.md).

| Outil | Ce qu'il fait | GitHub |
| :--- | :--- | :--- |
| `corpus_index` | les fiches, par bloc : chemin, titre, type, statut, revues | une requête GraphQL |
| `corpus_lire` | le texte exact de 10 fiches au plus, frontmatter compris | une requête GraphQL |
| `corpus_contexte` | un profil composé — `noyau`, `complet`, `strategie` — par le `composer()` de la console | une requête GraphQL |
| `corpus_modifier` | modifie une fiche existante : `remplacements` exacts, ou la fiche entière | lecture, puis `PUT contents` |
| `corpus_decision_ajouter` | ajoute `strategie/decisions/AAAA-MM-slug`, frontmatter écrit par le serveur | lecture, puis `PUT contents` (création) |
| `corpus_deployer` | lance le workflow « Déploiement Cloudflare », cible `api`, sur `main` | lecture, puis `dispatches` |

**La lecture porte sur `main`**, pas sur la photo que la console sert jusqu'à son prochain
déploiement : un commit se voit tout de suite ici, et dans la console seulement après
`corpus_deployer` (ou Corpus → État → Déployer). Tout le corpus se lit en **une** requête
GraphQL — commit et textes dans le même instantané — plutôt qu'une par fiche, qui
épuiserait les cinquante sous-requêtes d'une invocation.

**L'écriture suit les deux temps de Google Ads** : sans jeton, un aperçu — le diff exact,
rien ne part ; avec le jeton de l'aperçu, le commit, journalisé avant l'appel dans
`corpus_ecritures` (migration 0002). Le jeton est celui de ecriture.ts, la clé
`ADS_APERCU_KEY` aussi. GitHub n'ayant pas de `validateOnly`, la vérification à blanc est
la table fermée de [src/github.ts](src/github.ts), jouée à l'aperçu sans rien écrire.

| | Verrou | Où |
| :--- | :--- | :--- |
| C1 | un chemin du corpus, dans un de ses six blocs, slug sans accents ; ni README, ni `voix/regles-de-voix` (elle engendre les prompts : fixtures golden et FLUX-EDITORIAL.md, dans le dépôt) | `ecritureAdmise`, [src/github.ts](src/github.ts) |
| C2 | une création n'est permise que pour une décision ; une décision ne se réécrit jamais | idem |
| C3 | ce que la console refuse de commiter — frontmatter, corps, titre « # », statut connu — le serveur le refuse aussi : une seule garde, `refusDeContenu`, dans `packages/corpus` | [src/github.ts](src/github.ts) |
| C4 | un commit porte l'empreinte du fichier vu à l'aperçu : un commit intervenu entre-temps n'est jamais écrasé | outil, puis GitHub (409) |
| C5 | le déploiement : ce workflow, cible `api`, sur `main` au commit de l'aperçu — ni front, ni ce serveur, ni répétition | [src/github.ts](src/github.ts), outil |
| V8 | le scope `corpus:ecrire`, sa case à part sur la page de consentement : écrire dans Google Ads n'emporte pas le corpus, ni l'inverse | [src/ecriture.ts](src/ecriture.ts) |
| V7 · V9 | journal `corpus_ecritures` écrit avant l'appel ; plafond `CORPUS_ECRITURES_MAX_JOUR`, à part de celui de Google Ads | [src/journal.ts](src/journal.ts) |

Chaque verrou a son test NORMATIF ([test/corpus.test.ts](test/corpus.test.ts)), et chacun a
été vérifié en le cassant : son test échoue.

### Mise en place du corpus — ce que Florent fait

1. **Un jeton GitHub à grain fin** (github.com → Settings → Developer settings → Fine-grained
   tokens) : dépôt `luminose-fr/gestion` seul ; permissions *Contents* et *Actions* en
   lecture-écriture. Un autre que celui de la console.
2. Sur la VM, depuis `workers/mcp` : `npx wrangler secret put GITHUB_TOKEN`.
3. Depuis la racine : `./scripts/deploy.sh mcp` — il applique la migration `0002` avant de
   déployer le Worker.
4. Dans Claude : **retirer puis rajouter** le connecteur, et cocher « Modifier le corpus »
   sur la page de consentement. La lecture du corpus, elle, ne demande aucune case.

Relire le journal du corpus :

```bash
npx wrangler d1 execute luminose-mcp --remote --command "SELECT id, datetime(created_at/1000, 'unixepoch') AS quand, outil, issue, erreur FROM corpus_ecritures ORDER BY id DESC LIMIT 20"
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
| `DB` | binding D1 (`luminose-mcp`) | les journaux des écritures (V7) — Google Ads et corpus —, qui comptent aussi les plafonds V9 |
| `ADS_APERCU_KEY` | secret | signe les jetons d'aperçu (V2). Absent : l'écriture est fermée, la lecture continue |
| `ADS_ECRITURES_MAX_JOUR` | `[vars]` de wrangler.toml | V9 — 30 exécutions sur 24 heures. Absent ou illisible : l'écriture est fermée |
| `ADS_BUDGET_MAX_JOUR`, `ADS_BUDGET_MAX_TOTAL`, `ADS_CPC_MAX` | `[vars]` de wrangler.toml | R3 — 15 €, 45 €, 2 € (relevés le 07/10/2026). `ADS_CPC_MAX` borne le CPC max du Search et le CPC cible de Demand Gen. Absents ou illisibles : la création est fermée |
| `ADS_BUDGET_MAX_CAMPAGNE` | `[vars]` de wrangler.toml | DG1 — le plafond du budget total d'une campagne Demand Gen. Absent ou illisible : la création de campagne Demand Gen est fermée |
| `ADS_OBJECTIFS_CONVERSION` | `[vars]` de wrangler.toml | DG3 — `clé:id,clé:id`, les objectifs personnalisés créés par Florent. Vide ou illisible : la création de campagne Demand Gen est fermée |
| `ADS_ZONE_LOCALE` | `[vars]` de wrangler.toml | DG4 — les lieux du préréglage `locale` (`geoTargetConstants`). Vide : ce préréglage est fermé ; illisible : les groupes Demand Gen le sont |
| `ADS_CAMPAGNE_MODELE` | `[vars]` de wrangler.toml | R4 — la campagne dont le ciblage est recopié |
| `GITHUB_TOKEN` | secret | couche C — jeton à grain fin, dépôt `luminose-fr/gestion`, Contents et Actions en lecture-écriture. Absent : le corpus est fermé, Google Ads continue |
| `CORPUS_ECRITURES_MAX_JOUR` | `[vars]` de wrangler.toml | V9 du corpus — 20 commits et déploiements sur 24 heures. Absent ou illisible : l'écriture du corpus est fermée |
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
- **L'écriture seulement** : supprimer le secret `ADS_APERCU_KEY` (Google Ads et corpus), ou
  mettre `ADS_ECRITURES_MAX_JOUR` ou `CORPUS_ECRITURES_MAX_JOUR` à `"0"`. La lecture continue.
- **Le corpus seulement** : supprimer le secret `GITHUB_TOKEN`, ou révoquer le jeton sur
  GitHub. Google Ads continue.
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
