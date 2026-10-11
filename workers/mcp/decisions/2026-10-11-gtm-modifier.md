# Décision — serveur MCP : Google Tag Manager, modifier (lot 3)

> **Statut : demandé par Florent le 11/10/2026 (« le lot suivant »), après l'essai des outils
> du lot 2 en aperçu ; cadré et livré le même jour, non déployé.** Cadré sur les trois usages
> que la décision du 09/10/2026 laissait de côté ([2026-10-09-gtm-ecriture.md](2026-10-09-gtm-ecriture.md),
> §5) : mettre une balise en pause, ajouter un déclencheur à une balise existante, retirer le
> second `send_page_view` vers GA4. Ce lot MODIFIE une balise existante, dans l'espace de
> travail « [Claude] », de ces trois façons et d'aucune autre ; il ne supprime, ne rétablit ni
> ne publie rien.

## 1. Ce que la lecture du conteneur a montré (11/10/2026)

- **GTM-KG7VNQL**, version en ligne n° 38 : 53 balises — 27 modèles Mixpanel (`cvt_TNPH4`),
  7 événements GA4, 6 HTML personnalisés, 5 modèles Facebook (`cvt_5RM3Q`), 3 balises Google,
  2 conversions Google Ads, un linker, une balise d'appels, et le mode Consentement — un
  modèle (`cvt_K8GSG`) sur « Consent Initialization ». Un seul espace, « Default Workspace »,
  sans modification en attente ; aucune balise en pause.
- **Le second `send_page_view`** : deux balises Google envoient vers G-Y21R3X1FY1 avec
  `configSettingsTable = [{ send_page_view: true }]` — « GA - Init » (n° 3), sur Consent
  Initialization, et « FB_CONVERSIONS_API-…-Web-Tag-GA4_Config » (n° 55), sur DOM prêt, posée
  par l'intégration Meta. GA4 compte chaque page deux fois.
- **Hors de ce lot, à regarder** : « FB_CONVERSIONS_API-…-Web-Tag-GA4_Event » (n° 56) envoie à
  la même propriété GA4 chaque événement de la couche de données, sous son propre nom
  (`{{Event}}`). Les événements que d'autres balises envoient déjà peuvent y compter deux
  fois. Une balise `gaawe` se met en pause par ce lot, mais l'intégration Meta en dépend
  peut-être : à décider par Florent, pas par défaut.

## 2. Ce que dit la référence

Tag Manager API v2, document de découverte servi par l'API :

- **Modifier une balise** : `tags.update`, un PUT sur le chemin de la balise dans un espace de
  travail, le corps étant la balise **entière**. Le paramètre `fingerprint`, s'il est fourni,
  doit être celui de la balise stockée : sinon Tag Manager refuse. Scope :
  `tagmanager.edit.containers` — celui du lot 2. **G6 tient sans changement** : ce jeton ne
  peut toujours ni créer une version ni publier.
- Le même scope permet aussi de supprimer une balise (`tags.delete`) et d'annuler ses
  modifications (`tags.revert`) : c'est la table des chemins (G13) qui les ferme, pas Google.
- Une balise porte `paused` ; une balise Google porte ses réglages dans `configSettingsTable`,
  des lignes `parameter` / `parameterValue` — `send_page_view` en est une.
- Le statut d'un espace (`workspaces/{id}/status`) liste ses modifications non publiées,
  balise par balise.
- **À confirmer au premier essai réel** : la forme des empreintes (des chiffres, d'après les
  exemples ; le code accepte lettres, chiffres, `_` et `-`) et l'identité, champ pour champ,
  d'une balise de la version en ligne et de sa copie dans un espace qui vient de s'ouvrir.
  Le code n'en dépend pas pour sa sûreté : une copie qui différerait fait refuser
  l'exécution (G14), et l'aperçu suivant, qui lira l'espace, passera.

## 3. Les règles — NORMATIF

### G13 — Modifier : une balise de « [Claude] », avec son empreinte

`modifierBaliseGtm` ([src/gtm.ts](../src/gtm.ts)) fait un PUT, avec le jeton d'écriture, sur
`…/workspaces/{[Claude]}/tags/{n}?fingerprint=…` — rien d'autre (`cheminModificationPermis`).
Ni un déclencheur, ni une variable, ni l'espace de Florent, ni `:revert`, ni DELETE. Avant
d'envoyer, elle **relit elle-même** la balise dans l'espace, avec le jeton de lecture
(`appeler`, chemin ajouté à la table de G2), vérifie le corps contre la balise relue (G14), et
passe à Tag Manager l'empreinte relue : une balise changée entre la relecture et l'envoi, Tag
Manager la refuse. Quel que soit l'appelant.

### G14 — Une table fermée des différences

`modificationRefusee`, jouée à l'aperçu contre la balise lue, et rejouée par
`modifierBaliseGtm` contre la balise relue au moment d'écrire. Le corps est la balise
entière, sans ce que Tag Manager tient à jour lui-même (chemin, identifiants, empreinte,
lien) ; il n'en diffère que :

- du **seul champ** de la modification demandée — `paused`, `firingTriggerId` ou les
  paramètres —, dans le seul sens permis (G15, G16) ;
- d'**une ligne** « [Claude] … » ajoutée aux notes (G17).

Le nom, le type, le dossier, le consentement, les autres paramètres et les autres
déclencheurs partent tels qu'ils sont, comparés indépendamment de l'ordre des clés.

### G15 — Ce qui se met en pause, ce qui reçoit un déclencheur

- **Pause** : des balises de mesure — `awct`, `awcc`, `sp`, `gaawe`, `gaawc`, `ua`, `flc`,
  `fls`. Jamais la balise Google (`googtag`), qui porte la configuration de Google Ads ou de
  GA4 ; ni le linker (`gclidw`) ; ni du HTML, une image ou un modèle personnalisés. Le mode
  Consentement du conteneur est un modèle, et un bandeau de consentement se cache souvent
  dans du HTML : une pause là ferait partir le reste sans consentement réglé, et ce serveur
  ne distingue pas un modèle d'un autre. **Une pause, jamais l'inverse** : `paused` passe de
  faux à vrai, et une balise déjà en pause est refusée. Rétablir se fait dans Tag Manager.
- **Ajouter des déclencheurs** : à une conversion Google Ads (`awct`) ou un événement GA4
  (`gaawe`) — les types que ce serveur crée. Étendre une balise de code, c'est exécuter ce
  code ailleurs. De un à cinq, à la suite de ceux qu'elle a, qui restent dans leur ordre :
  on en ajoute, on n'en retire pas. Refusés : un déclencheur d'initialisation, un
  déclencheur qui bloque la balise, un inconnu. Ceux qu'elle a déjà sont écartés, et dits.

### G16 — Couper `send_page_view`, jamais la dernière

Sur une balise Google qui configure GA4 (`G-…`, constante résolue) : la ligne
`send_page_view` de sa table de configuration passe à `false`, ou s'ajoute à `false` — rien
d'autre ne change, l'ordre non plus (`couperPagesVues`). Jamais l'inverse.

**Refusé si ce serait la dernière** : une autre balise Google active, avec un déclencheur, au
même identifiant, doit envoyer les pages vues avec certitude — `send_page_view` à `true` ou
absent, ni variable ni réglages par variable. **Revérifié à l'exécution**, sur le contenu de
l'espace : deux coupes préparées ensemble, sur les deux balises, ne passent pas toutes les
deux. Il reste une fenêtre de quelques millisecondes entre la relecture et l'envoi, que rien
ne ferme sans verrou chez Tag Manager : Florent verrait les deux coupes dans l'espace avant
de publier.

Une valeur qui passe par une variable ne se lit qu'au chargement de la page : refus, à
régler dans Tag Manager.

### G17 — La marque, et la trace

Toucher à une balise de Florent n'est pas en créer une marquée : son nom ne change pas — c'est
le sien. La marque va dans ses **notes**, lisibles dans Tag Manager à côté de la modification :
une ligne « [Claude] Mise en pause — *raison* », « [Claude] Déclencheur ajouté : n° 25 —
*raison* », « [Claude] send_page_view coupé — *raison* ». Ses notes à lui restent ; la raison
est exigée, en une phrase. Florent retire la ligne s'il le veut.

Le journal `gtm_ecritures` garde, pour chaque modification, la nature, le numéro, la balise
d'**avant** et celle d'après, entières : elle se rétablit à la main, champ pour champ. Pas de
migration : la colonne `contenu` est du JSON.

### G12, étendu — deux temps, et la balise relue

Comme pour une création : sans jeton, un aperçu — la balise telle qu'elle est, ce qui change,
la ligne de notes, les avertissements — et rien ne part ; avec le jeton, ce contenu exact, une
fois, dans les dix minutes. Mais une modification **relit la balise à l'exécution**, puisque
son corps, c'est elle : changée depuis l'aperçu — dans l'espace, ou par une version publiée
—, le corps diffère, l'empreinte du jeton aussi, et rien ne part. C'est la règle C4 du corpus :
ce qui a changé entre-temps n'est jamais écrasé. L'espace vu à l'aperçu et disparu depuis se
dit avant toute relecture.

Même journal, même plafond (`GTM_ECRITURES_MAX_JOUR`), **même case** sur la page de
consentement (`gtm:ecrire`) : tout reste dans l'espace « [Claude] », que Florent relit et
publie. La case dit désormais ce qu'elle couvre ; une connexion existante obtient les trois
outils sans se reconnecter.

### Les avertissements de l'aperçu

Dits, jamais des refus :

- une pause sur la **seule balise active d'une conversion** : publiée, elle l'arrête — les
  campagnes qui l'optimisent enchériront sans elle ;
- un **autre espace** qui modifie la même balise sans l'avoir publiée : au premier des deux
  publiés, Tag Manager fera choisir l'autre (trois espaces lus au plus) ;
- une **conversion sur « All Pages »** : elle compterait chaque page vue — pour un ajout de
  déclencheur, et désormais aussi pour `gtm_conversion_creer`, dont l'aperçu du 09/10/2026
  n'en disait rien ;
- un déclencheur ajouté à une **balise en pause** : il ne la fera pas partir.

## 4. Les outils

| Outil | Ce qu'il modifie | Tag Manager |
| :--- | :--- | :--- |
| `gtm_mettre_en_pause` | met en pause une balise de mesure | aperçu : 1 + 4 listes (ou 1), + 3 statuts au plus ; exécution : 1 lecture, la balise lue puis relue, 0 ou 1 POST, 1 PUT |
| `gtm_declencheurs_ajouter` | ajoute un à cinq déclencheurs à une conversion ou un événement GA4 | comme le premier |
| `gtm_pages_vues_couper` | `send_page_view` à `false` sur une balise Google GA4 | comme le premier, mais le contenu relu en entier à l'exécution (4 listes, ou 1) |

Le numéro d'une balise se lit dans `gtm_lire quoi = balises` ; ce que l'espace publierait,
dans `gtm_lire` ou `gtm_verifier_conversions` avec `espace = …`.

Pour le second `send_page_view` du conteneur réel : `gtm_pages_vues_couper balise = "55"`.
« GA - Init » part plus tôt (Consent Initialization) et reste. **Avant de publier**, Florent
vérifie que l'intégration Meta ne lit pas ses pages vues dans GA4 : le pixel « Facebook - Page
vue » (n° 31) envoie déjà les siennes, mais ce serveur ne voit pas ce que Meta fait du reste.

## 5. Ce qui est écarté, et pourquoi

- **Rétablir** une balise en pause, **retirer** un déclencheur : c'est rouvrir ce qu'une
  décision a fermé, ou faire taire une mesure. Dans Tag Manager, en connaissance de cause.
- **Modifier un déclencheur, une variable, du HTML ou un modèle** : du code, ou ce qui décide
  où il s'exécute.
- **Supprimer** quoi que ce soit, et **annuler** une modification de l'espace (`:revert`) :
  Florent le fait en relisant l'espace.
- **Une case à part** sur la page de consentement : rien de ce lot ne sort de l'espace
  « [Claude] » ; une seconde case n'ajouterait pas de barrière, seulement une reconnexion.

## 6. Ce que Florent fait

Rien de neuf à poser : le jeton d'écriture du lot 2 (`edit.containers`) suffit, et aucune
migration n'est à appliquer.

1. Depuis la VM : `./scripts/deploy.sh mcp`.
2. Dans une **nouvelle** conversation — la liste des outils se charge à l'ouverture — :
   `gtm_lire quoi = balises` pour le numéro, puis l'outil voulu, aperçu d'abord.
3. Dans Tag Manager : relire l'espace « [Claude] » — chaque balise modifiée y figure, avec sa
   ligne de notes —, le prévisualiser, publier.

## 7. Les tests

[test/gtm-modification.test.ts](../test/gtm-modification.test.ts) — un Tag Manager simulé, à
état et à empreintes : sans la case, rien n'appelle Tag Manager ; l'aperçu ne fait que lire ;
la première exécution ouvre l'espace, y relit la balise et la renvoie entière, sans les champs
tenus par Tag Manager, avec l'empreinte relue et le jeton d'écriture ; les notes de Florent
restent ; la suivante relit la nouvelle empreinte ; une balise changée dans l'espace ou par une
version publiée fait refuser ; changée entre la lecture de l'outil et celle de la couche, refus
sans PUT ; changée entre la relecture et l'envoi, Tag Manager refuse, et le jeton a servi ; les
tables des chemins et des différences, appelées directement ; chaque refus et chaque
avertissement des trois outils ; deux coupes de `send_page_view` préparées ensemble.
[test/gtm.test.ts](../test/gtm.test.ts) : la lecture d'une balise seule entre dans la table
de G2, en lecture. [test/gtm-ecriture.test.ts](../test/gtm-ecriture.test.ts) : l'avertissement
« All Pages » de `gtm_conversion_creer`.

Chaque verrou a été vérifié en le cassant : son test échoue. Un seul ne cassait rien au premier
essai — « une pause met `paused` à vrai », que le cas « rétablir » attrapait plus tôt par
« déjà en pause » — ; ses deux cas ont été ajoutés.
