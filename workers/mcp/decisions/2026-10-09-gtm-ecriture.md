# Décision — serveur MCP : Google Tag Manager, préparer (lot 2)

> **Statut : demandé par Florent le 09/10/2026 (« le lot suivant »), le lendemain du
> déploiement du lot 1 ; livré le même jour, non déployé.** Cadré sur la proposition du
> 08/10/2026 ([2026-10-08-gtm.md](2026-10-08-gtm.md), §6), ajustée à ce que la première
> lecture du conteneur réel a montré. Ce lot CRÉE, dans un espace de travail « [Claude] »,
> des déclencheurs et des balises ; il ne modifie, ne supprime ni ne publie rien.

## 1. Ce que la première lecture a montré (09/10/2026)

- **GTM-KG7VNQL**, version en ligne n° 38 : 53 balises, 29 déclencheurs, 24 variables ; un
  seul espace de travail, « Default Workspace », sans modification en attente.
- `gtm_verifier_conversions` : trois conversions mesurées sur le site ont leur balise ;
  **« Passage - Prise de rendez-vous adéquation »** (n° 7389631354, secondaire, aucune
  conversion sur 30 jours) n'en a aucune. C'est le premier usage de ce lot.
- Les déclencheurs du site ont trois formes : la **vue de page** (`{{Page Path}}` contient …),
  l'**événement personnalisé** (`calendly_rendez_vous_confirme`), et le **clic sur un
  élément**, reconnu par un sélecteur CSS sur un `data-track`. Aucun clic sur un lien, aucun
  envoi de formulaire ; les variables de formulaire ne sont pas activées.
- Un linker de conversion et une balise d'appels depuis le site existent déjà.
- Les balises Google du conteneur portent « aucun consentement supplémentaire »
  (`notNeeded`) : le mode Consentement (modèle `cvt_K8GSG`) règle le reste.
- Deux balises Google envoient vers G-Y21R3X1FY1 avec `send_page_view` (« GA - Init » et
  celle de l'intégration Meta) : les pages vues sont peut-être comptées deux fois dans GA4.
  **Hors de ce lot** : y remédier, c'est modifier une balise Google existante (§5).

## 2. Ce que dit la référence

Tag Manager API v2, document de découverte servi par l'API, révision 20261007 :

- **Créer** un espace de travail, une balise, un déclencheur : `tagmanager.edit.containers`.
- **Créer une version** (`workspaces.create_version`), un aperçu rapide (`quick_preview`),
  modifier ou supprimer une version : `tagmanager.edit.containerversions`. **Publier**
  (`versions.publish`) : `tagmanager.publish`. Supprimer un espace :
  `tagmanager.delete.containers`. Un jeton qui n'a que le premier ne peut rien mettre en
  ligne.
- Toutes les lectures acceptent `edit.containers` comme `readonly`.
- Pas de `validateOnly`. Une balise et un déclencheur ont un champ `notes`.
- Une condition : `arg0` doit être une variable ; `negate` l'inverse. Un événement
  personnalisé se reconnaît par `customEventFilter` sur `{{_event}}`.
- Selon l'aide de Tag Manager, un espace de travail dont on crée une version est fermé. **À
  confirmer à la première publication** ; le code n'en dépend pas : il rouvre l'espace s'il
  manque, et refuse une exécution dont l'espace vu à l'aperçu a disparu.

## 3. Les règles — NORMATIF

### G6 — Rien ne se publie, garanti par Google

Le jeton d'écriture, `GTM_ECRITURE_REFRESH_TOKEN`, n'a que `tagmanager.edit.containers`
(`scripts/jeton-google-ads.mjs gtm-ecriture`). Google refuserait de créer une version comme
de publier. **Le serveur le vérifie à chaque service du jeton** : Google rend ses scopes à
chaque renouvellement, et un scope de Tag Manager autre que `edit.containers` ou `readonly`
— version, publication, suppression, gestion — ferme l'écriture avant tout appel
(`controleEcriture`, [src/gtm.ts](../src/gtm.ts)). Le script refuse déjà un tel jeton.

G1 en sort renforcé : le jeton de lecture est vérifié de même (`controleLecture`) — un
jeton d'écriture posé par erreur dans `GTM_REFRESH_TOKEN` ferme Tag Manager.

Les deux jetons restent à part : absent, celui d'écriture ferme l'écriture et la lecture
continue ; aucun des deux ne sert Google Ads (G3).

### G7 — Un espace « [Claude] », et lui seul

Toute création va dans l'espace de travail nommé « [Claude] » ; s'il n'existe pas,
l'exécution l'ouvre — Tag Manager le crée depuis la dernière version du conteneur. Jamais
dans « Default Workspace », jamais dans un autre. Deux espaces « [Claude] » : refus, on ne
choisit pas. Florent relit l'espace, le prévisualise, le publie — ou supprime ce qui ne
convient pas.

### G8 — Créer, seulement : trois chemins

`creerGtm` fait des POST, avec le jeton d'écriture, sur `…/workspaces` (ouvrir l'espace),
`…/workspaces/{[Claude]}/triggers` et `…/workspaces/{[Claude]}/tags` — rien d'autre
(`cheminEcriturePermis`). L'espace est celui que Tag Manager a rendu : son nom ET un
identifiant en chiffres sont vérifiés au moment d'écrire. Ni PUT, ni DELETE, ni
`:publish`, `:create_version`, `:quick_preview`, `:sync`.

### G9 — Une liste fermée de formes

`formeRefusee`, jouée à l'aperçu et rejouée par `creerGtm` juste avant l'envoi :

- **Balises** : conversion Google Ads (`awct`) et événement GA4 (`gaawe`), chacune avec sa
  liste fermée de paramètres. Jamais de HTML, d'image, de JavaScript ni de modèle
  personnalisés : ce serait du code exécuté sur le site. Ni pause, ni blocage, ni
  séquence, ni planification. Le consentement : `notNeeded`, la convention du conteneur.
  De un à cinq déclencheurs.
- **Déclencheurs** : vue de page, événement personnalisé, clic sur un élément — les trois
  formes que le conteneur emploie. **Toujours au moins une condition** — un événement : son
  nom — : sans elle, la balise partirait à chaque page ou à chaque clic. À gauche, une
  variable ; six conditions au plus ; opérateurs : égale, contient, commence par, finit par,
  expression régulière, sélecteur CSS.
- **Noms** préfixés « [Claude] » ; `notes` : « Préparé par Claude… ». Aucune valeur ne porte
  de `<`.

### G10 — Les identifiants viennent des sources, jamais du modèle

L'identifiant et le libellé d'une conversion sont **lus dans Google Ads** (l'extrait de la
conversion désignée par son numéro) ; l'identifiant de mesure GA4, **dans les balises Google
du conteneur** — un seul, ou refus. Le schéma n'a pas de champ pour les donner. Les
déclencheurs et les variables cités sont vérifiés dans l'espace (ou dans la version en ligne
dont il partira). Ce que l'aperçu a lu voyage dans le jeton, signé : l'exécution ne relit
pas.

### G11 — Une conversion, une balise

Une conversion qui a déjà une balise de conversion ou d'appel portant son couple
`AW-…/libellé` — active ou en pause — n'en reçoit pas une seconde : elle compterait deux
fois. Celle qui existe se corrige dans Tag Manager. Une conversion inactive, détectée sans
code (Google la voit déjà) ou d'appel (balise `awcc`) est refusée.

### G12 — Deux temps, journal, plafond, consentement

Comme ailleurs : sans jeton, un aperçu — ce qui serait créé, paramètre par paramètre, et
dans quel espace — et rien ne part ; avec le jeton, ce contenu exact, une fois, dans les
dix minutes. Le journal `gtm_ecritures` (migration 0003) s'écrit **avant** l'appel ; sans
lui, Tag Manager n'est pas appelé. `GTM_ECRITURES_MAX_JOUR` (20) : son plafond à lui.
`gtm:ecrire` : une case à part sur la page de consentement, « Préparer des balises dans Tag
Manager ». Le jeton d'écriture est exigé dès l'aperçu : on ne montre pas ce qui ne pourrait
pas s'exécuter.

Si l'espace vu à l'aperçu a disparu à l'exécution — publié, supprimé —, refus : les noms et
les déclencheurs vérifiés l'ont été là. Un nom pris entre-temps, Tag Manager le refuse, et
rien n'est créé.

## 4. Les outils

| Outil | Ce qu'il crée | Tag Manager |
| :--- | :--- | :--- |
| `gtm_declencheur_creer` | un déclencheur : vue de page, événement, clic sur un élément, avec ses conditions | aperçu : 1 + 4 listes (ou 1) ; exécution : 1 lecture, 1 ou 2 POST |
| `gtm_conversion_creer` | la balise d'une conversion Google Ads (type WEBPAGE), sur des déclencheurs donnés par numéro ; valeur fixe ou par variable ; conversions améliorées par variable | aperçu : + 1 requête Google Ads |
| `gtm_evenement_ga4_creer` | une balise d'événement GA4, avec ses paramètres (texte ou variable) | comme le premier |

Les numéros de déclencheurs se lisent dans `gtm_lire` ; celui d'une conversion, dans
`gtm_verifier_conversions` — deux ajouts de ce lot à la lecture.

## 5. Ce qui est écarté de la proposition, et pourquoi

- **Linker (`gclidw`) et balise d'appel (`awcc`)** : le conteneur a les siens. Un second
  linker n'apporte rien ; une seconde balise d'appel compterait deux fois.
- **Clic sur un lien, envoi de formulaire** : le site ne s'en sert pas, et les variables de
  formulaire ne sont pas activées. À ouvrir si le site change.
- **Modifier** (PUT, avec l'empreinte `fingerprint`) : mettre en pause une balise, ajouter un
  déclencheur à une balise existante, retirer le second `send_page_view`. C'est le lot 3 de
  Tag Manager, à cadrer : toucher à une balise de Florent n'est pas en créer une marquée.
- **Créer une variable, activer une variable intégrée** : une variable « JavaScript
  personnalisé » est du code ; les autres, à cadrer si le besoin vient.

## 6. Ce que Florent fait

1. Sur le Mac : `node workers/mcp/scripts/jeton-google-ads.mjs gtm-ecriture`, connecté avec
   le compte qui a le droit **Modifier** sur le conteneur. Le script refuse un jeton plus
   large que `edit.containers`, et liste les conteneurs visibles.
2. Depuis la VM : `cd workers/mcp && npx wrangler secret put GTM_ECRITURE_REFRESH_TOKEN`.
3. `./scripts/deploy.sh mcp` : la migration 0003 (le journal) puis le Worker.
4. Dans Claude : **retirer puis rajouter** le connecteur, et cocher « Préparer des balises
   dans Tag Manager » — avec les autres cases voulues : la connexion actuelle n'obtient pas
   le nouveau scope par effet de bord.
5. Dans une **nouvelle** conversation : `gtm_verifier_conversions` donne le numéro de la
   conversion qui manque ; `gtm_lire quoi = declencheurs`, ceux des déclencheurs. Puis les
   outils de création, aperçu d'abord. Enfin, dans Tag Manager : relire l'espace
   « [Claude] », le prévisualiser, publier.

## 7. Les tests

[test/gtm-ecriture.test.ts](../test/gtm-ecriture.test.ts) — un Tag Manager simulé, à état :
sans la case, sans le jeton d'écriture, ou avec un jeton qui pourrait publier, rien
n'appelle Tag Manager ; l'aperçu ne fait que des GET ; la première exécution ouvre
l'espace puis y crée, avec le jeton d'écriture, journalisée avant ; la suivante s'en sert ;
le jeton vaut pour ses arguments, une fois, dix minutes, pour son outil ; l'espace disparu,
les deux espaces, l'espace piégé rendu par Google ; le refus de Tag Manager à l'exécution ;
le plafond ; le journal en panne ; les tables fermées des chemins et des corps, appelées
directement ; l'identifiant et le libellé lus dans Google Ads quel que soit le nom ; une
conversion, une balise ; l'identifiant GA4, unique ou refusé. [test/gtm.test.ts](../test/gtm.test.ts) :
les scopes du jeton de lecture.

Chaque verrou a été vérifié en le cassant : son test échoue. Trois ne cassaient rien au
premier essai — la revérification au moment d'envoyer, le libellé quand un nom est donné,
le refus de choisir entre deux identifiants GA4 — ; leurs tests ont été ajoutés.
