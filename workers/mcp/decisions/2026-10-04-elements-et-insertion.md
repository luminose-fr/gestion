# Cadrage — serveur MCP Google Ads : éléments d'annonce et insertion de mot-clé

> **Statut : demandé le 04/10/2026 par Florent, livré le même jour.** Complète les cadrages
> du 01/10/2026 (écriture, verrous V1 à V9), du 02/10/2026 (créer) et du 03/10/2026 (listes
> de négatifs). Ce document ouvre un second `remove` : celui du lien d'un élément d'annonce,
> jamais de l'élément.

## 1. Le besoin

Le serveur créait des annonces, des mots-clés et des négatifs, mais aucun élément
d'annonce : ni lien annexe, ni accroche, ni extrait structuré. Et `ads_annonce_creer`
n'acceptait pas l'insertion de mot-clé (`{KeyWord:texte par défaut}`), alors que le filtre
déontologique ne portait que sur le texte écrit : avec l'insertion, c'est le mot-clé qui
écrit le titre.

## 2. Les outils

| Outil | Service Google | Ce qu'il fait |
| :--- | :--- | :--- |
| `ads_elements_creer` | `googleAds:mutate` (`AssetOperation`, puis `CampaignAssetOperation` ou `AdGroupAssetOperation`) | crée des éléments et les associe, en pause, à une campagne OU à un groupe, en une requête atomique |
| `ads_elements_associer` | `campaignAssets` ou `adGroupAssets` | associe, en pause, un élément qui existe déjà (par `asset.id`), sans le recréer |
| `ads_elements_dissocier` | `campaignAssets` ou `adGroupAssets` | retire l'association ; l'élément reste dans le compte |
| `ads_annonce_creer` | `adGroupAds` | accepte désormais l'insertion de mot-clé dans les titres et les descriptions |
| `ads_mots_cles_ajouter` | `adGroupCriteria` | contrôle désormais le rendu de chaque mot-clé dans les annonces à insertion du groupe |

Conventions des autres outils d'écriture, sans exception : aperçu `validateOnly` sans jeton,
exécution avec les mêmes arguments et le jeton (dix minutes, une fois, lié au contenu),
journal, messages en français.

## 3. Les éléments — NORMATIF

### E1 — Rien ne naît actif

Chaque association (`CampaignAsset`, `AdGroupAsset`) part avec `status: PAUSED` : l'API
l'accepte à la création. Florent active dans l'interface. Un élément de texte n'a ni nom ni
libellé visibles : la pause est sa marque, à la place de « [Claude] ». La table fermée
refuse une association sans ce statut, ou avec un autre.

### E2 — Les limites de Google, comptées en caractères affichés

| Type | Règle |
| :--- | :--- |
| Lien annexe (`SITELINK`) | texte ≤ 25 ; deux descriptions ≤ 35, les deux ou aucune ; une URL finale sur `https://www.luminose.fr/` ou `https://luminose.fr/` (V6) |
| Accroche (`CALLOUT`) | ≤ 25 |
| Extrait structuré (`STRUCTURED_SNIPPET`) | un en-tête de la liste fermée de Google, en français ; 3 à 10 valeurs ≤ 25, distinctes |

En-têtes admis (« Structured Snippet Header Translations », relue le 04/10/2026) :
Équipements, Marques, Cours, Programmes d'études, Destinations, Sélection d'hôtels,
Couverture d'assurance, Modèles, Quartiers, Catalogue de services, Émissions, Styles, Types.
S'y ajoute **Services**, absent de cette page mais accepté par Google : deux extraits du
compte le portent (310681056350, 321446714719), relevés le 04/10/2026.

Les outils disent toutes les fautes d'un coup, avant tout appel ; la table fermée
(`refusElement`, `verifierCreationElements`) les revérifie quel que soit l'outil. Pas
d'accolades dans un élément : l'insertion de mot-clé n'existe que dans les annonces.

### E3 — Le filtre

Chaque texte d'élément passe le filtre des annonces (V4) : un terme interdit fait refuser,
un terme d'avertissement (« hypnothérapeute », « Le Seuil », « atelier ») avertit. Un
élément existant qu'on associe y passe aussi : `ads_elements_associer` refuse un élément au
texte interdit, ou un lien annexe hors de luminose.fr.

Un lien annexe dont l'URL contient `respiration-holotropique` ou `breathwork` avertit : le
cadre déontologique (socle/cadre-deontologique.md) exige que toute promotion du breathwork
mentionne le questionnaire de santé préalable.

### E4 — Ce que l'aperçu montre

- **Les niveaux.** Pour un même type d'élément, Google n'affiche que le niveau le plus fin
  qui en a d'actifs : groupe, sinon campagne, sinon compte. L'aperçu liste les éléments du
  même type déjà associés à la cible, avec le statut de l'association ; nomme le niveau
  au-dessus qui s'affiche aujourd'hui pour la cible et qui serait masqué dès qu'un élément
  de la cible serait actif ; ceux qui sont déjà masqués ; et, pour une campagne, les groupes
  qui ont leurs propres éléments et ne verront pas les nouveaux. Une association en pause ne
  masque rien.
- **Les doublons.** Un élément au contenu affiché identique existe déjà dans le compte : il
  est écarté de la création, et l'aperçu donne l'appel `ads_elements_associer` qui le
  réutiliserait. Rien que des doublons : refus, avec ces appels. La casse compte — « séance
  en cabinet » n'est pas « Séance en cabinet » — mais un texte égal à la casse près, ou un
  lien annexe au même texte vers une autre page, est **signalé** comme presque un doublon.
- **Le retrait.** `ads_elements_dissocier` dit que l'élément reste dans le compte, ce qui
  reste d'actif à ce niveau, ou le niveau au-dessus qui prendra le relais — ou que la cible
  n'affichera plus rien de ce type. Une association en pause : l'affichage ne change pas.

Les doublons écartés à l'aperçu voyagent dans le jeton (`fige`), et la demande entière —
doublons compris — entre dans l'empreinte : l'exécution ne relit pas le compte pour en
décider, et remplacer un doublon par un autre texte invalide le jeton.

### E5 — Un retrait ne vise que l'association, et le compte le confirme

Les seuls nouveaux `remove` de la table : `campaignAssets/{campagne}~{élément}~{type}` et
`adGroupAssets/{groupe}~{élément}~{type}`, pour les trois types gérés. Le service `assets`
n'est pas dans la table : un élément ne se supprime pas par ce serveur. Avant chaque envoi,
`verifierRetraits` demande au compte que l'association existe encore et soit d'un type
géré — c'est le compte, pas la forme du nom, qui décide.

## 4. L'insertion de mot-clé — NORMATIF

### I1 — La syntaxe de Google, et elle seule

`{keyword:…}`, `{Keyword:…}`, `{KeyWord:…}`, `{KEYWord:…}`, `{KeyWORD:…}`, dans les titres
et les descriptions, avec un texte par défaut non vide. Une autre casse (`{KEYWORD:…}`), une
autre syntaxe (`{LOCATION(City)}`, `{=COUNTDOWN(…)}`), une accolade orpheline ou imbriquée,
une insertion dans un chemin d'affichage : refus. Le module est pur et sans dépendance
([src/insertion.ts](../src/insertion.ts)).

### I2 — La longueur se compte comme Google la compte

Sur le texte par défaut seul, pas sur la syntaxe : `{KeyWord:Psychopraticien à Lyon}` fait
22 caractères, pas 32. Titre 30, description 90.

### I3 — Chaque rendu passe au filtre

L'aperçu de `ads_annonce_creer` liste, pour chaque mot-clé positif du groupe (actif ou en
pause), le texte tel qu'il s'afficherait, casse appliquée mot par mot. Un rendu qui
dépasserait la limite est remplacé par le texte par défaut — c'est ce que Google affiche, et
c'est donc ce que le filtre lit. Si un seul rendu produirait un texte interdit, l'annonce
est refusée, en nommant le mot-clé. Le filtre lit chaque rendu avec les autres textes de
l'annonce : les refus par combinaison portent sur ce que Google affiche ensemble.

Même contrôle dans `ads_mots_cles_ajouter` : un mot-clé ajouté à un groupe dont une annonce
responsive utilise l'insertion montre, dans l'aperçu, le texte qu'il produirait, et passe
au filtre ; un rendu interdit fait refuser les mots-clés. Sans annonce à insertion dans le
groupe, rien ne change : on enchérit sur ce que les gens tapent, ce n'est pas une promesse.

### I4 — L'identité

Un rendu qui présenterait Florent comme « hypnothérapeute » avertit, sans refuser :
l'hypnose est un outil, pas un titre (socle/identite.md).

## 5. L'incident du premier essai (04/10/2026)

Tous les aperçus d'`ads_elements_creer` et d'`ads_elements_associer` échouaient avant toute
écriture : `queryError.EXPECTED_REFERENCED_FIELD_IN_SELECT_CLAUSE` — « The following field
must be present in SELECT clause: 'campaign.id' ». La lecture des associations filtrait
`campaign_asset` sur `campaign.id`, et `ad_group_asset` sur `ad_group.campaign`, sans les
sélectionner ; Google l'exige pour ces ressources. Corrigé, et la règle étendue à toutes les
requêtes du serveur, avec un test qui les relit dans le code source (README, « L'incident du
04/10/2026 »).

## 6. Les tests

[test/elements.test.ts](../test/elements.test.ts) — un compte simulé à état, avec des
éléments aux trois niveaux : un aperçu ne modifie rien ; un jeton ne vaut que pour ses
arguments exacts, doublons écartés compris, une fois, dix minutes ; les limites de chaque
type ; le filtre et l'avertissement breathwork ; doublon écarté et réutilisation proposée ;
ce que l'aperçu dit des niveaux ; associations en pause ; retrait de l'association seule,
confirmé par le compte ; la table.

[test/insertion.test.ts](../test/insertion.test.ts) — la syntaxe et les casses ; la
longueur sur le texte par défaut ; le rendu par mot-clé et le repli ; refus quand un
mot-clé du groupe produirait un titre interdit, à la création de l'annonce comme à l'ajout
du mot-clé ; l'avertissement d'identité.

Chaque verrou a été vérifié en le cassant : son test échoue.
