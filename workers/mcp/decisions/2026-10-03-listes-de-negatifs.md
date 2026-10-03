# Cadrage — serveur MCP Google Ads : les listes de mots-clés à exclure

> **Statut : demandé le 03/10/2026 par Florent, livré le même jour.** Complète les cadrages
> du 01/10/2026 (écriture, verrous V1 à V9) et du 02/10/2026 (créer). Ce document **rouvre**
> ce que V1 excluait — tout `remove` — pour une seule famille : le retrait d'une exclusion.

## 1. Le besoin

Le serveur savait écrire des négatifs au niveau campagne (`ads_negatifs_ajouter`), rien sur
les listes partagées. Une exclusion qui vaut pour plusieurs campagnes (gratuit, emploi,
formation…) se tient mieux dans une liste : une entrée, appliquée à toutes les campagnes
associées. Migrer des négatifs de campagne vers une liste exige aussi de pouvoir **retirer**
un négatif de campagne.

## 2. Les outils

| Outil | Service Google | Ce qu'il fait |
| :--- | :--- | :--- |
| `ads_liste_negatifs_creer` | `googleAds:mutate` (`SharedSetOperation`, `SharedCriterionOperation`) | crée une liste `NEGATIVE_KEYWORDS` nommée « [Claude] … », avec ses premiers mots-clés, en une requête atomique |
| `ads_liste_negatifs_ajouter` | `sharedCriteria` | ajoute des mots-clés à une liste (EXACT, PHRASE, BROAD) |
| `ads_liste_negatifs_retirer` | `sharedCriteria` | retire des mots-clés d'une liste, désignés par texte et correspondance |
| `ads_liste_associer` / `ads_liste_dissocier` | `campaignSharedSets` | lie ou délie une liste et une campagne Search |
| `ads_negatifs_retirer` | `campaignCriteria` | retire des négatifs de campagne, désignés par texte et correspondance |

Conventions des autres outils d'écriture, sans exception : aperçu `validateOnly` sans jeton,
exécution avec les mêmes arguments et le jeton (dix minutes, une fois, lié au contenu),
journal, messages en français, 50 éléments au plus par appel.

## 3. Les règles — NORMATIF

### L1 — Un retrait ne lève qu'une exclusion, confirmée par le compte

Les seuls `remove` de la table fermée : un négatif de campagne (`campaignCriteria`), une
entrée d'une liste de négatifs (`sharedCriteria`), le lien d'une telle liste à une campagne
(`campaignSharedSets`). Le modèle ne passe jamais d'identifiant de critère : il désigne par
texte et correspondance, le serveur résout. Et avant chaque envoi — aperçu compris — la table
demande au compte ce que vise chaque nom de ressource (`verifierRetraits`) : un critère de
campagne qui n'est pas un négatif de mot-clé (la zone, la langue, un mot-clé positif), une
entrée ou un lien d'une liste qui n'est pas `NEGATIVE_KEYWORDS`, ne partent pas.

### L2 — Ce que l'aperçu montre

- Pour toute écriture sur une liste : les campagnes associées, avec leur statut — une
  modification de liste les touche toutes.
- Les doublons : entrée déjà dans la liste, ou déjà exclue au niveau campagne sur **toutes**
  les campagnes liées. Signalés, puis écartés à l'exécution, jamais une erreur. Un négatif
  de campagne présent sur une partie seulement des campagnes liées s'ajoute à la liste —
  sinon les autres campagnes ne l'excluraient pas — et l'aperçu le dit.
- Un **avertissement**, pas un refus, quand un négatif bloquerait la recherche identique à
  un mot-clé positif, actif ou en pause, d'une campagne liée. BROAD bloque si tous ses mots
  figurent dans le mot-clé ; PHRASE si l'expression y figure, mots consécutifs et dans
  l'ordre ; EXACT si le texte est le même. Google n'étend pas les négatifs aux variantes
  proches : on compare au texte près, accents compris ; seules la casse et les espaces ne
  comptent pas ([src/negatifs.ts](../src/negatifs.ts)).
- Pour tout retrait : qu'il peut rouvrir du trafic, donc augmenter la dépense, et la liste
  exacte de ce qui est retiré. Pour un négatif de campagne, s'il reste exclu par une liste
  associée à la campagne, ou si ce trafic se rouvre.

### L3 — Les limites de Google

Relevées le 03/10/2026 dans l'aide Google Ads (« About negative keyword lists »,
support.google.com/google-ads/answer/2453983) : **20 listes** de mots-clés à exclure par
compte, **5 000 mots-clés** par liste. Google précise qu'elles peuvent changer. Le serveur
refuse avant l'aperçu ce qui les dépasserait ; elles s'écrivent à un seul endroit,
`LIMITES_LISTES` dans [src/google-ads.ts](../src/google-ads.ts).

### L4 — Hors périmètre

- Aucune suppression de liste entière : elle reste dans l'interface.
- Rien qui active une campagne : associer une liste ne touche à aucun statut.
- Le Search seulement pour les campagnes visées (associer, dissocier, retirer un négatif).
  Une liste déjà associée à une campagne d'un autre type se modifie, et l'aperçu nomme ce
  type à côté de la campagne.

## 4. L'exécution ne dépend plus de ce que les autres appels changent

Correction de l'incident du 02/10/2026 (README, « L'incident du 02/10/2026 »), étendue à
ces outils dès leur naissance : ce que l'aperçu a lu dans le compte et dont dépendent les
opérations (exceptions de règlement, doublons écartés, critères résolus) voyage dans le
jeton, signé. L'empreinte couvre aussi la demande normalisée, pour qu'un mot-clé ajouté aux
arguments entre l'aperçu et l'exécution ne s'y perde pas. Le compte relu à l'exécution ne
peut qu'écarter une opération devenue sans objet — jamais en ajouter une.

## 5. Tests NORMATIFS ajoutés ([test/listes.test.ts](../test/listes.test.ts))

- un aperçu ne modifie rien, pour chacun des six outils ;
- un jeton ne vaut que pour ses arguments exacts, une fois, dix minutes — un retrait
  compris, dont l'empreinte couvre la demande et non les seules entrées trouvées ;
- les doublons sont signalés et écartés, y compris ceux apparus entre l'aperçu et
  l'exécution ; un doublon écarté à l'aperçu n'est jamais envoyé ;
- l'avertissement de blocage se déclenche pour chaque type de correspondance, au texte près ;
- 20 listes par compte, 5 000 mots-clés par liste ;
- un retrait qui vise autre chose qu'une exclusion ne part pas, même construit par le code.

Et dans [test/creation.test.ts](../test/creation.test.ts) : quatre exécutions concurrentes
d'`ads_mots_cles_ajouter`, dans l'ordre de l'incident.
