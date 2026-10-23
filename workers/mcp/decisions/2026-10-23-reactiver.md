# Décision — serveur MCP : annuler une pause (`ads_reactiver`)

> **Statut : demandé par Florent le 23/10/2026, livré et déployé le même jour ; RE2 révisée
> le soir même, après le premier usage (§7), non déployée.** Complète
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
  `GOOGLE_ADS_WEB_CLIENT` pour l'interface.
- **`old_resource` et `new_resource`** gardent, pour une mise à jour, l'ancienne et la
  nouvelle valeur des champs changés : la pause d'un mot-clé par ce serveur se lit
  `ENABLED` → `PAUSED`. Une création n'a pas d'`old_resource` ; son `new_resource` donne le
  statut de naissance.
- **`change_event` se filtre aussi sur `ad_group`** — y compris pour un groupe lui-même — et
  sur `campaign` pour une association de campagne : l'identifiant est le premier nombre du
  nom de ressource, rien n'est à relire pour borner l'historique.
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

**RE2 — On ne rend que ce qui tournait.** L'élément était `ENABLED` au moment de sa pause :
Florent l'avait activé, donc relu. Ce qui est né en pause et n'a jamais été activé reste
refusé, marqué `[Claude]` ou non ; la marque, elle, ne compte pas (§7). L'état d'avant se lit :
1. **au journal** : `ads_mettre_en_pause` garde le statut qu'elle remplace (`avant`), relu
   dans le compte au moment d'exécuter ;
2. sinon — pause d'avant que le journal le garde — **dans l'historique de Google** :
   l'`old_resource` du changement qui a fait la pause ; si le dernier changement de statut
   est la création, le statut de naissance, qui n'a pas bougé depuis ;
3. sinon, **refus**, qui dit que rien ne permet de l'établir.

Le journal fait foi quand les deux divergent : il dit ce que le serveur a lu juste avant
d'écrire, et le doute se tranche du côté du refus.

**RE3 — Jamais une campagne.** L'outil n'en connaît pas, la table fermée n'admet pas
`reactiver` sur `campaigns`.

**RE4 — Rien de ce que Google a refusé.** Une annonce ou un mot-clé `DISAPPROVED` ne se
réactive pas : il ne diffuserait pas.

**La table fermée revérifie RE1 et RE2 (journal et historique), et RE4 (compte)** avant
chaque envoi, aperçu compris, quel que soit l'outil qui a préparé l'opération :
`verifierReactivations`, qui appelle `examinerPause` comme l'outil,
[src/google-ads.ts](../src/google-ads.ts). La forme `reactiver` n'admet que le statut, à
`ENABLED`, d'un groupe, d'une annonce, d'un mot-clé ou d'une association d'un type géré.

## 4. Ce que l'aperçu montre

- l'élément, son groupe, sa campagne et leur état — « la campagne est en pause : réactiver
  ne dépense rien tant qu'elle le reste », ou « l'élément diffusera dès l'exécution » ;
- la date et l'heure de la pause, son numéro au journal, et d'où l'on sait que l'élément
  était actif — le journal, ou l'historique de Google ;
- ce que l'élément a fait sur les 30 jours précédant le jour de la pause : impressions,
  clics, coût, conversions ;
- pour un mot-clé, son niveau de qualité et ses composantes : l'actuel si Google le donne,
  sinon celui des 30 jours d'avant la pause, sinon il le dit.

## 5. Ce qui change ailleurs

- **`ads_mettre_en_pause` garde au journal le statut qu'elle remplace** (`avant`, à côté des
  opérations, hors empreinte : il est lu dans le compte, jamais pris aux arguments).
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
statuts et leur historique : la pause est faite par le serveur lui-même, puis annulée. Le
parcours et tout ce que l'aperçu dit ; un aperçu n'écrit ni chez Google ni au journal ; le
jeton ne vaut que pour ses arguments, son outil, et une fois. Accepté : un élément marqué
`[Claude]`, en libellé ou dans son nom, actif à la pause ; une pause d'avant que le journal
garde l'état, que l'historique dit faite sur un élément actif ; le journal seul, quand
l'historique ne montre plus rien. Refus : pause hors journal (même quand le serveur a mis en
pause un autre élément), pause dont l'exécution a échoué, pause déjà annulée, changement de
statut dans l'interface après la pause, élément né en pause et jamais activé (d'après le
journal, puis d'après l'historique), journal et historique en désaccord, rien pour établir
l'état d'avant, campagne, refus de Google, entrées hostiles. La table, seule : sa forme, et
ses refus au journal, à l'historique et au compte.

Chaque verrou a été vérifié en le cassant — dans l'outil, dans la table, dans le journal :
son test échoue.

## 7. Révision de RE2, le 23/10/2026 au soir

RE2 disait d'abord : « jamais ce qui porte la marque `[Claude]` ». Au premier usage, elle a
refusé les mots-clés d'une campagne que Florent avait relus et activés le 06/10/2026, et qui
tournaient depuis : il active sans toujours retirer le libellé. La marque dit qu'un élément
est né par Claude, pas qu'il n'a pas été relu. Ce qui le dit, c'est l'activation : un élément
actif au moment de la pause avait été activé — seul Florent active.

Les pauses déjà faites ne gardaient pas l'état d'avant au journal. Pour elles, l'historique
de Google le garde trente jours ; vérifié sur ces mots-clés : créés en pause le 02/10 par
l'API, activés le 06/10 dans l'interface, mis en pause le 23/10 par l'API — `old_resource`
`ENABLED`. Au-delà de trente jours, rien ne l'établit : refus.

Une association d'élément d'annonce peut naître active derrière une campagne en pause
(06/10/2026). Mise en pause par le serveur, elle était donc `ENABLED` sans que Florent l'ait
activée elle-même ; il l'a activée avec la campagne, s'il l'a fait. L'aperçu dit l'état de la
campagne : réactiver derrière une campagne en pause ne dépense rien.

Chaque verrou de la révision a été vérifié en le cassant : 29 mutations, toutes vues.
