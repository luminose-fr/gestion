# @luminose/corpus

La source de vérité de Luminose : identité, offres, voix, décisions, matière réutilisable.

Tout ce qui définit Luminose vit ici, en markdown versionné. Les projets Claude, les GPT
personnalisés, les Gems, les appels d'API et `gestion.luminose.fr` en sont des **lecteurs**,
jamais des sources.

---

## La règle, avant tout le reste

**Rien ne s'édite dans une IA.** Une correction de positionnement écrite dans une
conversation ChatGPT est perdue. Le geste est toujours : la conversation *propose*, on porte
ici, on rejoue le build, les projections redescendent. Sens unique — le même invariant que
les clés de fournisseur (SPEC §5.5, §7), et pour la même raison.

Corollaire côté application : **`gestion.luminose.fr` lit le corpus et n'écrit que
l'inbox.** Deux copies modifiables, c'est le problème qu'on cherche à résoudre réinstallé à
l'intérieur de la solution.

---

## Les six blocs

Chaque bloc existe parce qu'un cas d'usage le charge — et parce qu'un autre ne doit surtout
pas le voir. La seconde moitié compte autant que la première.

| Bloc | Ce qu'il porte | Chargé par | Ne doit PAS être vu par |
| :--- | :--- | :--- | :--- |
| `socle/` | identité, positionnement, audience, offres avec statut, tarifs, cadre déontologique et juridique | tout | — |
| `voix/` | voix, ton, vocabulaire, interdits, direction artistique, exemples validés | rédaction, visuels, site | — |
| `strategie/` | décisions datées, hypothèses, concurrents, ce qui n'a pas marché | stratégie, veille | **un prompt de rédaction** |
| `canaux/` | une fiche par canal : contraintes, ce qui marche, ce qui ne marche pas | réseaux, newsletter, Ads, site | — |
| `repertoire/` | la matière réutilisable — modules, exercices, séquences, avec retour d'expérience | conception d'une offre de groupe | tout le reste |
| `outils/` | inventaire du parc et des process | automatisation | tout le reste |

Quatre cas d'usage ne chargent **rien** d'ici, et c'est délibéré : transcription,
sous-titrage, automatisation des outils, visuels réseaux sociaux. Une absence de besoin est
une information, pas un oubli.

---

## L'état courant et le journal

Deux mécanismes, jamais un seul. Git donne la timeline des modifications — mais **aucun
modèle ne lit `git log`**, il lit les fichiers.

| | Porte | Se réécrit ? |
| :--- | :--- | :--- |
| **Le fichier de contenu** | l'état courant (`statut:` en frontmatter) | oui, librement |
| **`strategie/decisions/*.md`** | le pourquoi, et ce qui réactiverait | **jamais** — supersédé, pas corrigé |

C'est le partage `contents` / `generations` de l'application (SPEC §2.6) : l'état se lit sans
agrégation, le journal porte la trace, et **on ne reconstruit jamais l'état depuis le
journal**.

Une décision annulée n'est pas supprimée : la nouvelle porte `supersedes:` et cite
l'ancienne. La chaîne se lit.

---

## Frontmatter

```yaml
---
type: fact | decision | instruction
statut: actif | suspendu | termine | candidat | volontairement-absent
depuis: 2026-08              # depuis quand le statut courant s'applique
revu: 2026-08                # dernière confirmation du contenu
review_at: 2027-08           # quand se reposer la question (remonte dans la console)
supersedes: 2025-11-...      # décisions uniquement
touche: [offres/le-seuil, strategie/notoriete]
expose: public | prive       # ce qui peut être servi sans authentification
---
```

### Les cinq statuts

| Statut | Sens | Exemple |
| :--- | :--- | :--- |
| `actif` | proposable aujourd'hui | — |
| `suspendu` | pas proposable maintenant, la matière reste vivante. **Ne promet pas un retour à l'identique.** Exclu en rédaction, inclus en stratégie | Le Seuil |
| `termine` | ne se reproposera pas ; la matière part dans `repertoire/` | ateliers archétypes 2025-2026 |
| `candidat` | **n'est pas un fait.** Ne doit jamais sortir dans un contenu | « Le Souffle des Étoiles » |
| `volontairement-absent` | pas de règle ici, et c'est délibéré | style des illustrations réseaux |

Le dernier est le moins évident et le plus utile : sans lui, chaque IA qui lit le corpus
comblera le vide en inventant une règle, et l'incohérence reviendra là où il y avait une
liberté assumée. Il porte toujours une date de `revu:`.

---

## Hiérarchie de résolution des conflits

Quand deux sources se contredisent, l'ordre est celui-ci. Sans lui, le modèle improvise.

1. **Cadre déontologique et juridique** — non négociable
2. **Constitution** (identité, positionnement, ce que Luminose n'est pas)
3. **Décision stratégique active** la plus récente
4. **Règles de voix et interdits**
5. **Contraintes du canal / format**
6. **Persona**
7. **Demande ponctuelle**

---

## Conventions

- **Slugs sans accents.** Le répertoire de travail est partagé entre un Mac et une VM Ubuntu
  (SPEC §10.4), qui ne normalisent pas l'Unicode pareil ; ces chemins seront en plus servis
  en HTTP. `strategie/`, pas `stratégie/`.
- **Pas de préfixes numérotés.** L'ordre n'est pas une information ici, et renommer devient
  pénible.
- **Un fait, un fichier, une fois.** Ce qui vit déjà dans `packages/editorial`
  (`FORMAT_REGISTRY`, `OBJECTIF_REGISTRY`, les personas) n'est pas recopié. À terme,
  `voice.ts` sera **généré depuis** `voix/` — on édite de la prose, pas du TypeScript.
- **Le corpus indexe, il n'avale pas.** Une source qui porte mieux que son résumé est
  référencée, pas recopiée : le document des ateliers, l'image de référence du site.
- **Découpage par exposition.** `expose: public` pour les offres et le positionnement,
  `expose: prive` pour la stratégie, les décisions, les objections d'audience.

---

## Ce qui n'existe pas encore, volontairement

- **Le générateur** (`src/build.ts` → module embarqué par le Worker) : il viendra quand il y
  aura assez de contenu pour qu'il serve. Automatiser avant de connaître la forme, c'est
  refaire le travail deux fois.
- **La table `inbox` en D1** : `content/inbox.md` fait l'affaire tant qu'il fait l'affaire.
- **`socle/`, `voix/`, `canaux/`, `repertoire/`, `outils/`** sont vides : ils se rempliront à
  l'inventaire des quatre surfaces, pas avant.

Le corpus contient aujourd'hui **trois fichiers de contenu réels**. C'est peu, et c'est
honnête.
