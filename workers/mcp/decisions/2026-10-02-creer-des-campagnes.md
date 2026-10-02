# Cadrage — serveur MCP Google Ads, phase 3 : créer des campagnes

> **Statut : décidé le 02/10/2026 avec Florent.** Complète le cadrage écriture du
> 01/10/2026 (lot 1 en service : négatifs, mises en pause). Ses verrous V1 à V9 restent en
> vigueur. Ce document **rouvre** ce que V5 excluait explicitement — la création de
> campagne — et en fixe les conditions.

## 1. Le principe — inchangé, NORMATIF

**Claude prépare, Florent publie.** Tout ce que Claude crée naît en pause et porte une
marque ; Florent relit, retire la marque et active, à la main, dans l'interface Google Ads.
Les verrous vivent dans le serveur, jamais dans les consignes au modèle.

## 2. Les règles du 02/10/2026 — NORMATIF

### R1 — En pause, tout

Campagnes, groupes d'annonces, annonces, mots-clés, groupes d'éléments (Performance Max) :
tout est créé `PAUSED`, forcé par le serveur. Activer une campagne revient donc à activer
chaque niveau (sélection multiple dans l'interface). Seule exception, décidée le 01/10 :
les mots-clés **négatifs** naissent actifs — ils excluent, ils ne dépensent pas.

### R2 — La marque « [Claude] »

| Ce qui est créé | Marque | Pourquoi |
| :--- | :--- | :--- |
| campagne, groupe d'annonces, groupe d'éléments | préfixe `[Claude] ` dans le nom, ajouté par le serveur | le nom se renomme : Florent retire le préfixe à la validation |
| annonce, mot-clé | libellé `[Claude]` | une annonce responsive du Search n'a pas de nom ; le nom d'une annonce Demand Gen est figé à la création |

Le serveur pose la marque ; il ne la retire jamais, et aucun outil ne renomme. Florent
retire préfixe ou libellé quand il valide.

### R3 — L'argent

| Variable | Valeur | Effet |
| :--- | ---: | :--- |
| `ADS_BUDGET_MAX_JOUR` | 10 € | le budget d'une campagne créée ne peut pas le dépasser |
| `ADS_BUDGET_MAX_TOTAL` | 25 € | **engagement** — budgets des campagnes actives + budgets des campagnes `[Claude]` en pause, nouvelle comprise — ne peut pas le dépasser |
| `ADS_CPC_MAX` | 2 € | Search en « Maximiser les clics » : plafond de CPC obligatoire, au plus cette valeur |

Le budget d'une campagne créée lui est propre (jamais partagé), à livraison standard. Les
montants s'écrivent en euros à l'entrée et dans l'aperçu ; le serveur convertit en micros.
Performance Max et Demand Gen enchérissent sur les conversions, sans plafond de CPC : le
budget y est le seul frein — d'où le plafond par campagne.

### R4 — Le ciblage se recopie, il ne se choisit pas

Langue, zone (lieux, rayon, exclusions) et type de ciblage géographique sont **recopiés**
de la campagne modèle `ADS_CAMPAGNE_MODELE` — aujourd'hui « Psychopraticien - Prospects -
Troubles anxieux » : français, rayon de 30 km, présence réelle. En Search, réseau de
recherche Google seul : ni partenaires, ni Display. Claude ne choisit ni zone, ni langue,
ni audience, ni réseau, ni appareils, ni horaires.

### R5 — Ce que Google génère

- **Search** : AI Max est permis **en « Maximiser les conversions »** — il élargit aux
  recherches proches (`search term matching`), et c'est tout ce que le serveur active. La
  **personnalisation du texte** et l'**extension d'URL finale** restent coupées, toujours :
  sinon Google rédigerait des annonces que le filtre V4 n'a jamais vues. Florent peut les
  activer lui-même dans l'interface, campagne par campagne.
- **Performance Max, Demand Gen** : génération de texte et extension d'URL coupées. Si
  l'API ne permet pas de les couper pour un type, ce type reste hors périmètre.

### R6 — Les types

Search, Performance Max, Demand Gen. Les images et logos de Performance Max et Demand Gen
viennent de la **bibliothèque d'éléments** du compte, déposés par Florent : Claude les
désigne par identifiant, le serveur vérifie qu'ils existent dans le compte.

### R7 — Ce que le serveur déclare seul

`containsEuPoliticalAdvertising: DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING`, exigé par
Google pour toute campagne créée dans l'Union.

## 3. Les verrous du cadrage du 01/10 qui entrent en jeu

- **V4 — textes d'annonce** (titres, descriptions, chemins ; jamais les mots-clés).
  Refus : racines `guéri`, `soign` ; `garanti` ; `100 %` ; `définitivement` ;
  `diagnostic` ; `traitement médical` ; `remplace` avec `médecin` ou `traitement`.
  Avertissement dans l'aperçu : `hypnothérapeute` (`socle/identite.md`) ; une offre non
  active (`Le Seuil`, `atelier`) ; breathwork ou respiration holotropique sans mention du
  questionnaire de santé (`socle/cadre-deontologique.md`). **Plancher, pas relecture.**
- **V6 — URL finales** sur `https://luminose.fr/` ou `https://www.luminose.fr/` ; aucun
  sous-domaine.

## 4. Les lots

| Lot | Outils | Contenu |
| :--- | :--- | :--- |
| 2 | `ads_campagne_creer`, `ads_groupe_creer`, `ads_annonce_creer`, `ads_mots_cles_ajouter` | Search de bout en bout |
| 3 | à définir | Performance Max |
| 4 | à définir | Demand Gen |
| 5 | `ads_budget_modifier` | modifier un budget (l'ancien lot 3) |

Un lot à la fois, chacun déployé et essayé avant le suivant.

## 5. Mécanique

- La campagne part en **une requête atomique** (`googleAds:mutate`) : budget, campagne et
  critères de ciblage, liés par des identifiants temporaires négatifs. Tout ou rien.
- Groupes, annonces, mots-clés : leur service propre (`adGroups`, `adGroupAds`,
  `adGroupCriteria`). Le libellé `[Claude]` des annonces et mots-clés se pose juste après,
  avec les noms de ressource rendus par Google ; s'il échoue, l'entité reste en pause et
  l'outil le dit.
- La **table fermée** s'étend : pour chaque service, les seules formes d'opération
  permises, montants plafonnés compris. Toujours ni `remove`, ni passage à `ENABLED`.

## 6. Tests NORMATIFS ajoutés

- toute création porte sa marque (préfixe ou libellé) et part `PAUSED` ;
- un budget au-dessus de `ADS_BUDGET_MAX_JOUR` est refusé ; un engagement au-dessus de
  `ADS_BUDGET_MAX_TOTAL` aussi ; un budget partagé aussi ; un CPC max au-dessus de
  `ADS_CPC_MAX` aussi ;
- le ciblage envoyé est la copie exacte de la campagne modèle ; le réseau, Google seul ;
- personnalisation du texte et extension d'URL toujours `OPTED_OUT` ; AI Max seulement en
  « Maximiser les conversions » ;
- chaque terme de refus V4 fait échouer un texte d'annonce, aucun un mot-clé ;
- une URL finale hors de `luminose.fr`, ou sur un sous-domaine, est refusée.

## 7. Ce que Florent fait

1. Relire la liste V4 (§3) — elle est dans le code, une ligne par terme.
2. Après déploiement du lot 2 : créer une campagne d'essai par Claude, la relire dans
   l'interface, puis la supprimer ou la valider.

## Addendum du 02/10/2026 — les exceptions de règlement

Premier essai : Google a refusé 14 mots-clés (« hypnose anxiété », « hypnothérapeute »,
« aide pour arrêter de fumer »…) au titre de ses règles santé et tabac, qui admettent une
exception — le bouton « Demander une exception » de l'interface. Décision de Florent :
l'outil la gère, la décision restant la sienne.

- Sans demande explicite, `ads_mots_cles_ajouter` nomme chaque mot-clé arrêté et sa
  règle, et ne demande rien.
- Avec `demander_exceptions: true`, il joint aux seuls mots-clés arrêtés les clés
  d'exception rendues par Google (`exemptPolicyViolationKeys`), jamais des clés fournies
  par le modèle. L'aperçu les liste ; le jeton les couvre.
- Une règle sans exception possible fait refuser.

