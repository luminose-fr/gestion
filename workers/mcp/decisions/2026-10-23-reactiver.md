# Décision — serveur MCP : annuler une pause (`ads_reactiver`)

> **Statut : demandé par Florent le 23/10/2026, livré le même jour, non déployé.** Complète
> le lot 1 (cadrage du 01/10/2026). V1 disait « rien ne s'active par ce serveur » ; il garde
> ce sens : `ads_reactiver` n'active rien, il **annule une mise en pause que le serveur a
> lui-même faite**. Tout le reste — ce qui est né en pause, ce qui a été mis en pause dans
> l'interface, une campagne — se réactive dans l'interface Google Ads.

## 1. Le besoin

Mettre en pause par Claude est sûr : ce qui est en pause ne dépense plus. Revenir sur une
pause l'était moins, faute d'outil : il fallait retrouver l'élément dans l'interface. Un
outil qui réactive « n'importe quoi » rouvrirait la porte que V1 ferme ; un outil qui
n'annule que ce que le serveur a fait, et qui le prouve, la laisse fermée.

## 2. Ce que dit le compte (vérifié le 23/10/2026)

- **`change_event`** ne se filtre pas sur `change_resource_name`
  (`PROHIBITED_FIELD_IN_WHERE_CLAUSE`) ; il se filtre sur `change_resource_type` et
  `campaign`, sur 30 jours au plus. L'outil lit donc l'historique de la campagne pour ce
  type de ressource, et y cherche l'élément.
- **`client_type`** dit qui a changé un statut : `GOOGLE_ADS_API` pour ce serveur,
  `GOOGLE_ADS_WEB_CLIENT` pour l'interface. Sur le compte, un mot-clé en pause l'a été dans
  l'interface le 06/10/2026 : `ads_reactiver` le refuse.
- **Un mot-clé en pause n'a pas de `quality_info`.** Le niveau de qualité se lit alors dans
  `metrics.historical_quality_score` et ses composantes, sur une période — à condition de
  ne pas sélectionner `segments.date`, qui découpe par jour et fait taire ces métriques.
- `ad_group_ad.policy_summary.approval_status`, `ad_group_criterion.approval_status`, les
  libellés, et les métriques de `campaign_asset` et `ad_group_asset` sur une période :
  lus sans difficulté.

## 3. Les règles — NORMATIF

**RE1 — On n'annule que la pause du serveur.** La dernière écriture de statut de cette
ressource au journal (`ads_ecritures`, issue `ok`) est une mise en pause par
`ads_mettre_en_pause`. Absente : refus — la pause a été faite ailleurs, elle se lève
ailleurs. Déjà annulée par `ads_reactiver` : refus — la pause actuelle n'est plus la sienne.
Et si l'historique de Google (30 jours) montre un changement de statut plus récent qui ne
vient pas de l'API : refus, en nommant d'où il vient.

**RE2 — Jamais ce qui porte la marque `[Claude]`.** Le nom d'un groupe, le libellé d'une
annonce ou d'un mot-clé : ce qui la porte encore n'a pas été relu.

**RE3 — Jamais une campagne.** L'outil n'en connaît pas, la table fermée n'admet pas
`reactiver` sur `campaigns`.

**RE4 — Rien de ce que Google a refusé.** Une annonce ou un mot-clé `DISAPPROVED` ne se
réactive pas : il ne diffuserait pas.

**La table fermée revérifie RE1 (journal), RE2 et RE4 (compte)** avant chaque envoi, aperçu
compris, quel que soit l'outil qui a préparé l'opération : `verifierReactivations`,
[src/google-ads.ts](../src/google-ads.ts). La forme `reactiver` n'admet que le statut, à
`ENABLED`, d'un groupe, d'une annonce, d'un mot-clé ou d'une association d'un type géré.

## 4. Ce que l'aperçu montre

- l'élément, son groupe, sa campagne et leur état — « la campagne est en pause : réactiver
  ne dépense rien tant qu'elle le reste », ou « l'élément diffusera dès l'exécution » ;
- la date et l'heure de la pause, et son numéro au journal ;
- ce que l'élément a fait sur les 30 jours précédant le jour de la pause : impressions,
  clics, coût, conversions ;
- pour un mot-clé, son niveau de qualité et ses composantes : l'actuel si Google le donne,
  sinon celui des 30 jours d'avant la pause, sinon il le dit.

## 5. Ce qui change ailleurs

- **`ads_mettre_en_pause` met aussi en pause une association d'élément d'annonce**
  (`association_campagne`, `association_groupe`). Sans cela, aucune association ne
  pourrait figurer au journal, et RE1 les refuserait toutes. La table admet
  `mettre-en-pause` sur `campaignAssets` et `adGroupAssets`.
- **La règle GAQL a une exception, `segments.date`** ([test/gaql.ts](../test/gaql.ts)) :
  filtrer une période sans la sélectionner, comme Google le documente. Sélectionner
  `segments.date` n'est pas gratuit : il découpe le résultat par jour et fait taire le
  niveau de qualité historique.

## 6. Les tests

[test/reactiver.test.ts](../test/reactiver.test.ts) — un compte simulé qui garde ses
statuts : la pause est faite par le serveur lui-même, puis annulée. Le parcours et tout ce
que l'aperçu dit ; un aperçu n'écrit ni chez Google ni au journal ; le jeton ne vaut que
pour ses arguments, son outil, et une fois. Refus : pause hors journal (même quand le
serveur a mis en pause un autre élément), pause dont l'exécution a échoué, pause déjà
annulée, changement de statut dans l'interface après la pause, marque `[Claude]` en libellé
ou dans le nom, campagne, refus de Google, entrées hostiles. La table, seule : sa forme, et
ses refus au journal et au compte.

Chaque verrou a été vérifié en le cassant — dans l'outil, dans la table, dans le journal :
son test échoue.
