# Cadrage — serveur MCP Google Ads, lot 4 : Demand Gen

> **Statut : décidé le 07/10/2026 avec Florent**, après vérification de l'API (§2). Le lot 4
> passe avant le lot 3 (Performance Max), décision de Florent. Complète le cadrage du
> 02/10/2026 : R1 à R7, V1 à V9 et la mécanique en deux temps restent en vigueur, et
> s'étendent à Demand Gen sans s'assouplir. Trois trouvailles contredisaient ou laissaient
> ouvertes ses décisions ; §3 dit comment elles ont été tranchées.
>
> **Codé le même jour**, déployé le soir même : B, D, F et H attendaient le premier envoi à
> blanc sur le compte (§7).
>
> **Corrigé le même soir (§8).** Le premier aperçu de campagne a tranché D et F : Google
> refuse le plafond de CPC et les automatismes réglés à la campagne. DG2 et DG6 sont
> réécrits en conséquence, sur décision de Florent.
>
> **En service depuis le 08/10/2026 (§9).** Deux campagnes créées par le serveur, relues et
> activées par Florent ; les derniers points ouverts sont confirmés. **À faire** : l'annonce
> vidéo (§10).

## 1. Le besoin

Que Claude prépare des campagnes Demand Gen — une nationale, une locale — que Florent seul
activera. Les outils du lot 2 restent réservés au Search (`exigerSearch`) : Demand Gen a les
siens, aux schémas stricts.

## 2. Ce que dit la référence v25

**Source.** Le document de découverte REST de l'API v25, servi par l'API elle-même :
`https://googleads.googleapis.com/$discovery/rest?version=v25`, révision `20261005`, relu
le 07/10/2026 — les schémas et leurs descriptions, générés depuis les définitions de l'API.
Les pages de guide de `developers.google.com` étaient inaccessibles depuis l'environnement
de travail : ce qui n'est que dans les guides (limites d'usage, minimums) est marqué
**non documenté dans la référence**. Le compte a été lu en GAQL, en lecture seule, pour
les lieux et l'existant.

### 2.1 Enchères

| Question | Trouvé | Où |
| :--- | :--- | :--- |
| « Maximiser les clics » | `target_spend` (`TargetSpend`). Son `target_spend_micros` est **déprécié** ; il porte un plafond, `cpc_bid_ceiling_micros` | `Campaign.targetSpend`, `Common.TargetSpend` |
| plafond de CPC en Demand Gen | le champ existe ; **la référence ne dit pas** si Demand Gen l'accepte | — |
| « Maximiser les conversions » | `maximize_conversions` (`MaximizeConversions`) ; `target_cpa_micros` facultatif, laissé vide | `Campaign.maximizeConversions` |

### 2.2 Budget total

| Question | Trouvé | Où |
| :--- | :--- | :--- |
| budget total | `CampaignBudget.total_amount_micros`, exclusif de `amount_micros` | `Resources.CampaignBudget` |
| période | `period: CUSTOM_PERIOD` — « can be used with total_amount to specify lifetime budget limit » ; immuable | idem |
| non partagé | `explicitly_shared: false` (vaut `true` par défaut à la création) | idem |
| dates | `Campaign.start_date_time` et `end_date_time`, « yyyy-MM-dd HH:mm:ss » dans le fuseau du compte ; `00:00:00` et `23:59:59` pour une granularité au jour. Sans fin, la campagne court indéfiniment. Les anciens `start_date`/`end_date` n'existent plus | `Resources.Campaign` |
| minimum quotidien implicite | **non documenté dans la référence** | — |

### 2.3 Ciblage

| Question | Trouvé | Où |
| :--- | :--- | :--- |
| niveau | `demand_gen_campaign_settings.upgraded_targeting` (vrai par défaut, fixé à la création) : vrai, lieu et langue se règlent **au groupe** ; faux, à la campagne | `Campaign.DemandGenCampaignSettings` |
| rayon au groupe | **impossible** : `AdGroupCriterion` a `location` et `language`, **pas** `proximity`. Le rayon n'existe que dans `CampaignCriterion.proximity` | `Resources.AdGroupCriterion`, `Resources.CampaignCriterion` |
| rayon à la campagne en Demand Gen | **non documenté dans la référence** | — |
| présence réelle | `Campaign.geo_target_type_setting.positive_geo_target_type: PRESENCE` existe, réglage **de campagne** ; la référence ne dit pas que Demand Gen l'honore (seul `SEARCH_INTEREST` est dit réservé au Search) | `Campaign.GeoTargetTypeSetting` |
| France métropolitaine | `geoTargetConstants/2250` (France). Les régions métropolitaines, Corse comprise, ont 2250 pour parent ; Guadeloupe (2312), Martinique (2474), Guyane (2254), La Réunion (2638), Mayotte (2175) **n'en descendent pas** et ont leur propre code pays : cibler 2250 n'inclut pas les DROM | GAQL `geo_target_constant`, compte réel |
| français | `languageConstants/1002` | campagne modèle |

### 2.4 Canaux

`AdGroup.demand_gen_ad_group_settings.channel_controls` : soit une stratégie
(`ALL_CHANNELS`, `ALL_OWNED_AND_OPERATED_CHANNELS` — tout ce que Google possède, Display
coupé), soit des canaux choisis un à un, `selected_channels` : `youtube_in_feed`,
`youtube_in_stream`, `youtube_shorts`, `discover`, `gmail`, `display`, **`maps`**. Au moins
un à vrai. Réglage **du groupe**, pas de la campagne.

### 2.5 Automatismes

`AssetAutomationType`, statut `OPTED_IN` ou `OPTED_OUT` pour chacun. Ceux que la référence
rattache à Demand Gen, tous `OPTED_IN` par défaut :

| Type | Pour | Ce que Google produirait |
| :--- | :--- | :--- |
| `GENERATE_LANDING_PAGE_TEXT` | vidéo responsive | du texte tiré de la page d'arrivée, dans le panneau d'engagement — **un texte que V4 n'a jamais vu** |
| `GENERATE_VERTICAL_YOUTUBE_VIDEOS` | vidéo responsive | des vidéos recadrées à la verticale |
| `GENERATE_SHORTER_YOUTUBE_VIDEOS` | vidéo responsive | des vidéos raccourcies |
| `GENERATE_DESIGN_VERSIONS_FOR_IMAGES` | multi-élément | des images retouchées, **textes de l'annonce incrustés** |
| `GENERATE_VIDEOS_FROM_OTHER_ASSETS` | multi-élément | des vidéos fabriquées à partir des images et des textes |
| `GENERATE_ANIMATED_IMAGES_FROM_OTHER_ASSETS` | multi-élément | des images animées |

S'y ajoutent `GENERATE_LANDING_PAGE_PREVIEW` (aperçu de la page d'arrivée, avec une clause
sur les droits des images) et `GENERATE_IMAGE_EXTRACTION`, que la référence ne rattache à
aucun type de campagne, et les types du Search et de Performance Max
(`TEXT_ASSET_AUTOMATION`, `FINAL_URL_EXPANSION_TEXT_ASSET_AUTOMATION`, …). Deux niveaux de
réglage : `Campaign.asset_automation_settings` et
`AdGroupAd.ad_group_ad_asset_automation_settings`. La référence n'interdit aucun
`OPTED_OUT`, mais **ne dit pas** lesquels Demand Gen accepte, ni à quel niveau.

### 2.6 Objectif de conversion par campagne

`CustomConversionGoal` (une liste d'actions de conversion rendues enchérissables ; créé par
`customConversionGoals:mutate`), branché sur la campagne par `ConversionGoalCampaignConfig`
(`goal_config_level: CAMPAIGN`, `custom_conversion_goal`), qui ne se crée pas : il existe
avec la campagne et se **met à jour** (`conversionGoalCampaignConfigs:mutate`, nom
`customers/{id}/conversionGoalCampaignConfigs/{campaign_id}`). La référence précise que les
objectifs personnalisés ignorent `primary_for_goal`. `CampaignConversionGoal` n'agit que par
catégorie et origine, pas par action : il ne convient pas. Les deux opérations entrent dans
`googleAds:mutate` (`customConversionGoalOperation`, `conversionGoalCampaignConfigOperation`).

Dans le compte : les deux actions de conversion proposées existent et sont `ENABLED` ;
aucun objectif personnalisé existant ne contient l'une d'elles seule.

### 2.7 Annonces

**`DemandGenMultiAssetAdInfo`** — `business_name` obligatoire (25 de large) ;
`headlines` 1 à 5 (30) ; `descriptions` 1 à 5 (90) ; `logo_images` 1 à 5, 1:1, 128×128 au
moins ; images, 20 au plus en tout : `marketing_images` 1,91:1 (600×314 au moins, requises
sans carrées), `square_marketing_images` 1:1 (300×300, requises sans paysage),
`portrait_marketing_images` 4:5 (480×600), `tall_portrait_marketing_images` 9:16
(600×1067) — ratios à ±1 % ; `call_to_action_text`, **texte libre** dans la référence ;
`classic_display_images` (à exclure, voir D5).

**`DemandGenVideoResponsiveAdInfo`** — `videos` obligatoires (éléments `YOUTUBE_VIDEO`) ;
`logo_images` obligatoire, 1:1, 128×128 ; `business_name` obligatoire (un élément texte) ;
`headlines`, `long_headlines`, `descriptions` ; `call_to_actions` (éléments
`CALL_TO_ACTION`) ; `breadcrumb1`, `breadcrumb2` ; `companion_banners`. **Nombres et
longueurs non documentés dans la référence** pour ce type.

**Nom de l'annonce** — `Ad.name`, immuable, **facultatif** : « only used to be able to
identify the ad ».

**Appel à l'action** — `CallToActionType` : `LEARN_MORE`, `GET_QUOTE`, `APPLY_NOW`,
`SIGN_UP`, `CONTACT_US`, `SUBSCRIBE`, `DOWNLOAD`, `BOOK_NOW`, `SHOP_NOW`, `BUY_NOW`,
`DONATE_NOW`, `ORDER_NOW`, `PLAY_NOW`, `SEE_MORE`, `START_NOW`, `VISIT_SITE`, `WATCH_NOW`.

**Éléments** — `Asset.type` `IMAGE` (dimensions dans `image_asset.full_size`, ce qui permet
de vérifier un ratio), `YOUTUBE_VIDEO`, `CALL_TO_ACTION`.

## 3. Tranché le 07/10/2026

| | Question | Décision |
| :--- | :--- | :--- |
| A | le préréglage `modele` recopiait un rayon, impossible au groupe (§2.3) | **remplacé** par `locale` : une liste fermée de lieux (`geoTargetConstants`), `ADS_ZONE_LOCALE`, posée par Florent dans `wrangler.toml` — ni rayon, ni coordonnées |
| B | présence réelle non documentée pour Demand Gen | envoyée toujours ; si l'envoi à blanc la refuse, rien n'est créé et la question revient à Florent |
| C | canal Maps, absent de D5 | **coupé**, comme le Display |
| D | plafond de CPC non documenté pour Demand Gen | `CLICS` l'envoie toujours ; refusé par l'envoi à blanc, `CLICS` se ferme jusqu'à décision de Florent — pas de repli silencieux sans plafond |
| E | l'objectif personnalisé serait une entité nouvelle | **Florent crée lui-même ses objectifs personnalisés** dans Google Ads ; `ADS_OBJECTIFS_CONVERSION` pointe vers eux. Le serveur n'en crée aucun |
| F | automatismes : niveau et types admis non documentés | tous `OPTED_OUT`, à la campagne et à chaque annonce ; un refus de Google à l'aperçu fait jouer D6 |
| G | limites de l'annonce vidéo absentes de la référence | **le multi-élément d'abord** ; la vidéo responsive ensuite, quand un envoi à blanc aura confirmé ses limites |
| H | appel à l'action : énumération (vidéo), texte libre (multi-élément) | une liste fermée tirée de `CallToActionType` ; facultatif — absent, Google choisit le bouton |

B, D, F et H sont les propositions du cadrage, appliquées sans objection de Florent.

D et F ont été refusés par Google au premier aperçu, le 07/10/2026 au soir ; ce qui les
remplace est au §8.

## 4. Les règles — NORMATIF

### DG1 — Budget total, jamais partagé (D1)

- Budget `CUSTOM_PERIOD`, `total_amount_micros`, `explicitly_shared: false`, livraison
  standard, nom marqué. Dates de début et de fin obligatoires : début au plus tôt
  aujourd'hui (fuseau du compte, Europe/Paris), fin au plus tôt le jour du début.
- `ADS_BUDGET_MAX_CAMPAGNE` : plafond du budget total d'une campagne.
- Équivalent quotidien = total ÷ nombre de jours, bornes comprises, arrondi au centime
  supérieur — au micro, 300,01 € sur trente jours ferait 10,0003 €, refusé sous un plafond
  de 10 € par un message qui afficherait « 10,00 € ». Il respecte
  `ADS_BUDGET_MAX_JOUR` et compte dans l'engagement `ADS_BUDGET_MAX_TOTAL`.
- Plafonds relevés le 07/10/2026 : `ADS_BUDGET_MAX_JOUR` 15 €, `ADS_BUDGET_MAX_TOTAL` 45 €,
  `ADS_BUDGET_MAX_CAMPAGNE` 700 €. `ADS_BUDGET_MAX_JOUR` vaut aussi pour le Search.
- **Correction de l'engagement** (vaut pour le lot 2 aussi). Il lisait `amount_micros` seul
  (`engagement`, `src/outils-creation.ts`) : un budget total, qui n'en a pas, y comptait pour
  zéro. Il lit désormais `period`, `total_amount_micros` et les dates de la campagne : un
  budget `CUSTOM_PERIOD` compte pour son équivalent quotidien, tant que sa fin n'est pas
  passée — et pour son total entier s'il n'a pas de fin, faute de mieux. Le compte n'avait
  aucun budget total : le défaut était latent.

### DG2 — Enchères (D2)

**Réécrit le 07/10/2026 au soir (§8).** Trois choix, fermés. `CLICS` : `target_spend`
**vide** — ni `cpc_bid_ceiling_micros`, que Google refuse en Demand Gen, ni
`target_spend_micros`, déprécié ; le budget total est le seul frein. `CPC_CIBLE` :
`target_cpc` avec `target_cpc_micros` ≤ `ADS_CPC_MAX`, au centime — une moyenne visée, pas
un plafond, et l'aperçu le dit. `CONVERSIONS` : `maximize_conversions` vide — ni CPA ni
ROAS cible. **R3 est corrigé** : « Performance Max et Demand Gen enchérissent sur les
conversions » devient « Demand Gen enchérit en Maximiser les clics, plafonné, ou en
Maximiser les conversions, sans cible ; le budget total est son frein ».

### DG3 — Objectif de conversion propre à la campagne (D3, E)

`ADS_OBJECTIFS_CONVERSION` : liste fermée `clé:identifiant d'objectif personnalisé`
(`custom_conversion_goal.id`), objectifs créés par Florent dans Google Ads. Claude choisit
une clé ; le serveur vérifie que l'objectif existe, est `ENABLED`, et que chacune de ses
actions de conversion existe et est `ENABLED` ; puis il pose
`ConversionGoalCampaignConfig` (`goal_config_level: CAMPAIGN`) dans la requête atomique de
la campagne. Une clé hors liste est refusée ; une liste vide ferme la création Demand Gen.

### DG4 — Zone et langue : deux préréglages (D4, A)

Claude choisit `zone: "france_metropolitaine" | "locale"`, jamais un lieu, un rayon ou une
langue. `france_metropolitaine` : `geoTargetConstants/2250` (§2.3). `locale` : les lieux de
`ADS_ZONE_LOCALE`, tels quels ; vide, ce préréglage est fermé. Le serveur vérifie que chaque
lieu existe et est actif, et l'aperçu les nomme. Langue : français (`1002`). Posés au groupe
(`upgraded_targeting: true`) ; la présence réelle, à la campagne (B).

### DG5 — Canaux forcés (D5, C)

`selected_channels` posé par le serveur : `youtube_in_feed`, `youtube_in_stream`,
`youtube_shorts`, `discover`, `gmail` à vrai ; `display` et `maps` à faux. Claude ne choisit
pas. `classic_display_images` n'est jamais envoyé.

### DG6 — Automatismes coupés (D6, F)

**Réécrit le 07/10/2026 au soir (§8).** À chaque annonce multi-élément : ses trois types,
`OPTED_OUT`. **Rien à la campagne** : Google refuse le champ en Demand Gen, et la table
fermée refuse une campagne qui le porte. `GENERATE_LANDING_PAGE_PREVIEW` n'est donc plus
coupé par le serveur ; `GENERATE_IMAGE_EXTRACTION` suit le réglage « images dynamiques » du
compte (référence v25), à vérifier dans l'interface. La liste vit à un seul endroit du code.

### DG7 — Annonces : le multi-élément (D7, G, H)

- `DemandGenMultiAssetAdInfo` seulement ; la vidéo responsive est à faire (§10).
- Images et logos désignés par identifiant ; le serveur vérifie qu'ils existent, qu'ils
  sont de type `IMAGE`, et le ratio (±1 %) et la taille minimale du champ (§2.7).
- Titres 1 à 5 (30), descriptions 1 à 5 (90) : V4 sur l'ensemble des textes de l'annonce,
  refus et avertissements.
- `business_name` : « Luminose », posé par le serveur.
- Appel à l'action : facultatif, dans la liste fermée de H. Le paramètre s'appelle
  `bouton` : dans ce dépôt, « action » désigne une action IA du catalogue, et un test
  l'interdit dans les schémas des outils.
- URL finale : V6.
- `PAUSED`, libellé `[Claude]` posé après la création (R2) ; `Ad.name` facultatif, jamais
  marqué : il est immuable.

### DG8 — Groupes et campagnes (D8)

`PAUSED`, nom préfixé `[Claude] ` (R1, R2), `contains_eu_political_advertising` déclaré (R7).
La campagne part en une requête atomique : budget, campagne (automatismes coupés, dates,
enchères, présence réelle), configuration d'objectif. Le groupe part avec ses critères de
lieu et de langue et ses canaux, en une requête atomique. Les outils Demand Gen refusent
une campagne Search, et ceux du lot 2 une campagne Demand Gen.

## 5. Mécanique

- Trois outils : `ads_dg_campagne_creer`, `ads_dg_groupe_creer`, `ads_dg_annonce_creer`.
  Deux temps, jeton, journal, plafond V9 : inchangés.
- Table fermée : `creer-campagne-dg` et `creer-groupe-dg` dans `googleAds`,
  `creer-annonce-dg` dans `adGroupAds`. Elle revérifie, indépendamment des outils, budget
  total et équivalent quotidien, dates, enchères et CPC, automatismes, canaux, lieux et
  langue des préréglages, nom d'entreprise, textes (V4) et URL (V6), marque et pause.
  Jamais `remove`, jamais `ENABLED`.
- L'aperçu dit le budget total, les dates, l'équivalent quotidien et l'engagement après
  création, les enchères et l'objectif, la zone et les canaux, les refus et avertissements
  V4.
- Requêtes GAQL : chaque champ du WHERE dans le SELECT (règle du 04/10/2026).

## 6. Tests NORMATIFS ajoutés

Un par verrou, chacun vérifié en le cassant : création toujours `PAUSED` et marquée ;
plafonds DG1, dont l'engagement avec une campagne à budget total déjà dans le compte (pour
le Search comme pour Demand Gen) ; budget partagé refusé ; dates absentes refusées ;
enchères hors DG2 refusées ; objectif hors liste refusé ; zone hors préréglage refusée, et
`locale` égale exactement à `ADS_ZONE_LOCALE` ; Display et Maps toujours coupés ;
automatismes DG6 toujours `OPTED_OUT` ; élément inexistant, de mauvais type ou de mauvais
ratio refusé ; nom d'entreprise imposé ; chaque terme de refus V4 fait échouer un titre et
une description (le titre long n'existe que dans l'annonce vidéo, à faire) ; URL hors de
`luminose.fr` refusée.

[test/demand-gen.test.ts](../test/demand-gen.test.ts). Chaque verrou a été vérifié en le
cassant, dans l'outil et dans la table séparément : son test échoue.

## 7. Ce que Florent fait

1. Créer dans Google Ads un objectif personnalisé par usage, puis renseigner
   `ADS_OBJECTIFS_CONVERSION` (`clé:id,clé:id`) dans `wrangler.toml`.
2. Choisir les lieux de `ADS_ZONE_LOCALE` (`geoTargetConstants`, séparés par des
   virgules) — `ads_requete` sur `geo_target_constant` les retrouve.
3. Déployer (`./scripts/deploy.sh mcp`), puis un aperçu de chaque outil : rien n'est créé,
   mais Google tranche B, D et F. Puis une campagne d'essai par Claude, relue dans
   l'interface.

## 8. Le premier aperçu — 07/10/2026 au soir

**Ce qui a été envoyé.** `ads_dg_campagne_creer`, deux aperçus (campagnes Oracle et
Breathwork, `CLICS` à 1 €), puis un troisième en `CONVERSIONS` pour isoler les causes.
Les trois refusés par Google (`validateOnly`) : rien n'a été créé.

**Ce que Google a refusé** (`contextError.OPERATION_NOT_PERMITTED_FOR_CONTEXT`) :

| Champ | Verdict | Lecture |
| :--- | :--- | :--- |
| `campaign_operation.create.target_spend.cpc_bid_ceiling_micros` | refusé | le plafond de CPC n'existe pas en Demand Gen — D ne tient pas |
| `campaign_operation.create.asset_automation_settings` | refusé, en `CONVERSIONS` aussi | le refus porte sur **le champ**, sans index de type : Demand Gen ne règle pas ses automatismes à la campagne — F ne tient pas |
| `conversion_goal_campaign_config_operation.update.campaign` | `RESOURCE_NOT_FOUND` sur `-2` | conséquence : la campagne refusée n'existe pas pour l'objectif. **Confirmé le 08/10/2026** (§9) : sans les deux premiers refus, l'objectif se pose dans la même requête |

**Ce que dit la référence** (protos v25 de `googleapis/googleapis`, relus le 07/10/2026) :
les types de l'annonce multi-élément (`GENERATE_DESIGN_VERSIONS_FOR_IMAGES`,
`GENERATE_VIDEOS_FROM_OTHER_ASSETS`, `GENERATE_ANIMATED_IMAGES_FROM_OTHER_ASSETS`) sont
décrits « for DemandGenMultiAssetAd », ceux de la vidéo « for
DemandGenVideoResponsiveAdInfo » : des réglages d'annonce. `GENERATE_IMAGE_EXTRACTION`
« defaults to account level Dynamic Image Extension control value ». `Campaign.target_cpc`
(`TargetCpc.target_cpc_micros`, « Average CPC target ») existe ; les notes de version
l'ouvrent à Demand Gen.

**Décidé avec Florent.**

| | Avant | Maintenant |
| :--- | :--- | :--- |
| D | `CLICS` plafonné ; refusé, `CLICS` se ferme | `CLICS` **sans plafond** ; `CPC_CIBLE` **ajouté**, ≤ `ADS_CPC_MAX` — les deux, au choix de chaque campagne |
| F | automatismes coupés à la campagne et à l'annonce | coupés **à l'annonce seulement** ; la table refuse une campagne qui en porte |

Le Search garde `CLICS` plafonné (`ads_campagne_creer`) : Google l'y accepte.

**Tests** : DG2 et DG6 réécrits, la table fermée refuse le plafond de clics, le montant
déprécié, deux enchères à la fois, un CPC cible absent, nul, hors du centime ou au-delà du
plafond, et toute campagne qui porte des automatismes. Chaque verrou nouveau a été cassé
dans l'outil et dans la table : son test échoue.

## 9. En service — 08/10/2026

Deux campagnes Demand Gen créées par le serveur le 07/10/2026 au soir, chacune avec son
groupe et une annonce multi-élément, relues puis activées par Florent dans l'interface.
Ce que le compte montre, relu le 08/10/2026 :

| Point ouvert | Verdict de Google |
| :--- | :--- |
| B — présence réelle | acceptée (`geo_target_type_setting` en `PRESENCE`) |
| Objectif posé dans la même requête que la campagne (§8) | accepté : chaque campagne porte sa configuration `CAMPAIGN` et l'objectif personnalisé choisi |
| H — texte du bouton | accepté (« Book now »), annonce approuvée |
| DG6 — automatismes coupés à l'annonce | acceptés : l'historique du compte montre les trois `OPTED_OUT` à la création |
| DG4, DG5 — lieux, langue, canaux au groupe | acceptés, ni Display ni Maps |

Ce qui se change ensuite dans l'interface ne passe pas par le serveur, et ses verrous ne s'y
appliquent pas. Le 08/10/2026, Florent y a rouvert deux automatismes sur chaque annonce
multi-élément, et ajouté à chaque campagne une annonce vidéo responsive : ni filtre V4, ni
contrôle d'URL, ni table fermée pour celles-là.

## 10. À faire

- **L'annonce vidéo responsive** (`DemandGenVideoResponsiveAdInfo`), décision G : les
  vidéos désignées par identifiant d'élément `YOUTUBE_VIDEO` ; titres, titres longs et
  descriptions passés au filtre V4 ; URL V6. Ses automatismes, que DG6 coupe, sont à revoir
  avec Florent, qui en a rouvert dans l'interface. Ses limites ne sont pas dans la
  référence v25 : un envoi à blanc les confirmera avant tout code. Les deux annonces vidéo
  créées dans l'interface le 08/10/2026 en donnent un exemple accepté par Google.
