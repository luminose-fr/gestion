# Inventaire des quatre surfaces — 25/08/2026

Dépouillement de ce qui définit Luminose aujourd'hui, source par source, classé
**conservé / obsolète / contradictoire / à trancher**. C'est l'étape 00 : on ne conçoit pas
le rangement d'un savoir dont on n'a pas regardé les contradictions.

**Sources croisées :** export ChatGPT (27 sections) · export Gemini (3 Gems : *Blog*,
*Le Seuil — aide générale*, *Stratégie de contenus*) · projet Claude « Luminose » ·
`FLUX-EDITORIAL.md` + `packages/editorial/`.

---

## Le constat qui commande tout le reste

**Sur les quatre sources, une seule ne diverge jamais : la voix.**

`VOICE_RULES` vit dans `packages/editorial/src/voice.ts`, elle est reproduite mot pour mot
dans `FLUX-EDITORIAL.md` §4, et un test compare les deux — la cinquième règle du `CLAUDE.md`.
C'est le seul endroit de tout l'écosystème où la cohérence est **mécaniquement garantie**, et
c'est le seul endroit où cet inventaire ne trouve rien à signaler.

Tout le reste — identité, offres, tarifs, formations, cadre juridique — n'a aucun garde-fou.
C'est là que sont les neuf contradictions ci-dessous.

Autrement dit : le mécanisme est déjà démontré sur un bloc. Le corpus l'étend aux cinq autres.

---

## 1. Contradictions — à trancher

### Gravité haute — juridique, argent, crédibilité

**1.1 · Organisme de médiation à la consommation : CM2C ou CNPM ?**

| Source | Dit |
| :--- | :--- |
| CGV / mentions légales (projet Claude) | **CM2C** |
| Gem *Le Seuil — aide générale* | **CNPM Médiation Consommation** (Saint-Étienne) |

Mention légale obligatoire. Une seule adhésion est réelle — il suffit de regarder laquelle
est en cours. À corriger partout où l'autre figure.

**1.2 · Tarif du Seuil : trois chiffres**

| Source | Dit |
| :--- | :--- |
| ChatGPT | **1 480 € TTC**, non affiché publiquement |
| ChatGPT (conversion Google Ads) | **1 470 €** — ChatGPT signale lui-même l'écart |
| Gem *Aide générale* | questionnaire d'adéquation : **« > 2 000 € »** |
| Gem *Stratégie* | « sur devis, communiqué après l'entretien de clarté » |

L'écart 1 480 / 1 470 est une erreur de configuration Ads. L'écart avec « > 2 000 € » est
autre chose : soit le tarif a monté, soit le questionnaire filtre plus haut que le prix réel.
Le Seuil étant suspendu (§2), ce n'est pas urgent — mais la valeur de conversion Ads, elle,
tourne peut-être encore.

**1.3 · Formation hypnose : 50 jours ou 40 jours ?**

| Source | Dit |
| :--- | :--- |
| Gem *Blog* | ECH Paris, **2019**, **50 jours** en présentiel, dont 8 jours de psychopathologie EEPSSA |
| Gem *Aide générale* | ECH, **2019-2020**, **40 jours** sur 1 an |

Fait vérifiable, affiché publiquement, et qui touche la crédibilité professionnelle. Le
diplôme tranche.

*(La formation Respiration Holotropique, elle, est cohérente entre les sources : Grof Legacy
Training au CESHUM, 30 jours étalés sur 2 ans, 2023-2024.)*

### Gravité structurante — identité et offre

**1.4 · Le titre : « et hypnothérapeute », ou pas ?**

| Source | Dit |
| :--- | :--- |
| ChatGPT | consigne **explicite** : « tu ne souhaites plus que l'intitulé principal soit *Hypnothérapeute* » → Psychopraticien Transpersonnel |
| Gem *Blog* | « Psychopraticien transpersonnel **et hypnothérapeute** » |
| Gem *Stratégie* | « Cœur de métier : Psychopraticien transpersonnel **et Hypnothérapeute** » |

Contradiction frontale : ChatGPT porte une décision que les deux Gems ignorent. C'est
l'exemple parfait du problème — une décision prise dans une surface qui n'a jamais atteint
les autres.

L'arbitrage n'est pas binaire : ChatGPT note lui-même le risque SEO à faire disparaître
brutalement « hypnose » si ces termes génèrent encore du trafic. La position tenable est
probablement : **l'hypnose reste un outil identifiable et une porte d'entrée, elle ne définit
plus l'identité.** Mais ça se décide, et ça s'écrit une fois.

**1.5 · Les 7 étapes du Seuil : deux architectures incompatibles**

Les deux Gems Gemini appellent « les 7 étapes » deux choses différentes.

| Gem *Aide générale* — thérapeutique et symbolique | Gem *Stratégie* — commercial et processuel |
| :--- | :--- |
| 1. L'Ouverture | 1. L'Entretien de Clarté (gratuit, 1 h) |
| 2. Libération | 2. L'Appel |
| 3. L'Ombre accueillie | 3. Décision et Engagement |
| 4. Expansion & souveraineté | 4. La Grande Traversée |
| 5. Traversée | 5. L'Intégration |
| 6. Unification | 6. Le Retour |
| 7. Stabilité | 7. Clôture |
| *structuré en 3 phases (van Gennep) : Séparation / Passage / Enracinement* | *inclut l'entretien de vente comme étape 1* |

Ce ne sont ni les mêmes étapes ni la même logique. La première est le parcours vécu ; la
seconde mélange le tunnel de vente et le parcours. **Il faut décider laquelle est
« les 7 étapes »** — et l'autre, si elle survit, doit porter un autre nom.

**1.6 · Durée d'une séance individuelle — contradiction interne au même Gem**

Le Gem *Stratégie* écrit, à deux lignes d'intervalle : « séance type d'environ **1 h 45 à
2 h 15** (1 h 45 de travail + 30 min d'échange) », puis « cycle recommandé d'au moins
5 séances de **1 h 30** chacune ». Tarif : 140 €.

### Gravité mineure

**1.7 · Nom du produit** — « Oracle de mes ressources » (ChatGPT, 31 € port inclus) vs
« L'Oracle des Ressources » (Gem *Stratégie*).

**1.8 · Encaissement** — ChatGPT dit **Stripe Elements** + Make + webhooks ; le contexte
Claude dit **Stancer** + Calendly + Notion + Make. L'un des deux est périmé.

**1.9 · Adresse** — le cabinet est au **Moulin de Barrelles, 2 Avenue de Verdun, 31290
Villefranche-de-Lauragais**. Le bâtiment de **Beauteville (3 rue d'Aquilon)** est le futur
centre, pas le cabinet. Pas contradictoire, mais aucune source ne fait la distinction : à
écrire explicitement, sinon elle se perdra.

---

## Une contradiction que l'inventaire résout

ChatGPT signale ne pas savoir si « 7 étapes dont 4 séances longues de 1 h 30-1 h 45 » et
« 4 cérémonies en présence de 3 h » sont deux versions ou une structure cumulée — 8 éléments
pour 7 étapes.

**Le Gem *Aide générale* donne la réponse : 4 cérémonies présentielles de 3 h + 3 séances
individuelles en visio de 45 min = 7.** Le croisement suffit. Reste que « séances longues de
1 h 30-1 h 45 » chez ChatGPT décrit alors autre chose — probablement les séances
individuelles standard, mémorisées au mauvais endroit.

---

## 2. Obsolète — établi dans la session du 25/08/2026

| Élément | Les 4 sources disent | Réalité |
| :--- | :--- | :--- |
| **Le Seuil** | offre premium **active**, avec site dédié `passage.luminose.fr`, entretien Calendly, tarif | **suspendu** depuis août 2026 (voir `strategie/decisions/`) |
| **Ateliers MJC** | « 2 h un dimanche par mois », programmation régulière | **terminés** — facturation MJC déséquilibrée |
| **« Voyage au cœur des archétypes »** | thématique annuelle en cours | **année 2025-2026 close** |
| Journée breathwork 18/10/2025, 160 €, code `FACEBOOK0825` | présenté comme actuel | historique |
| « Prochain événement : 31/01/2026 » | à venir | passé |
| Google Ads : 15 €/j, CPC ~7 €, peu de conversions après 1 mois ½ | situation courante | historique |
| Newsletter décembre : 42,66 % ouverture, 5,07 % clic | — | historique, mais **bon point de référence** — à garder comme tel |

**C'est la divergence la plus coûteuse de tout l'inventaire :** trois surfaces sur quatre
proposeraient aujourd'hui, activement et avec un tarif, une offre qui n'est plus commercialisée.

---

## 3. Conservé — la matière à porter, par destination

### → `socle/identite.md`

- **Le mantra** : « Je ne change personne. J'offre un espace où chacun peut se rencontrer et
  se transformer. »
- **La posture** : « Vous avez les clés ! » — le praticien aide à trouver et utiliser ses
  propres clés.
- **La métaphore fondatrice, issue de l'UX** : plutôt que d'adapter toutes les poignées de
  porte du monde, modifier son rapport intérieur à l'environnement. *Matériau de marque de
  premier ordre — c'est ce qui relie les deux moitiés du parcours de Florent.*
- **Rôle symbolique** : « Gardien du seuil » — garant du cadre et de la sécurité, **non-gourou**,
  travail en co-création.
- **Les 3 prérequis** de la thérapie : motivation, engagement, relation de qualité.
- **Les 4 piliers** : durée et progressivité · collaboration active · approche transpersonnelle
  (psychologique, émotionnelle, corporelle, spirituelle) · cadre sécurisé et confidentiel.
- Parcours : travail thérapeutique personnel initié vers 2013, reconversion depuis la
  recherche en design et expérience utilisateur.
- Supervision régulière : Bernadette Blin, Brigitte Chavas, Gérald Vasselle.
- Cabinet : Le Moulin de Barrelles, 2 Avenue de Verdun, 31290 Villefranche-de-Lauragais.
  Secteur : Toulouse, Revel, Pamiers, Castelnaudary.

### → `socle/cadre-deontologique.md` — **priorité 1 dans la hiérarchie de résolution**

- **Limite légale** : ni médecin, ni psychiatre, ni psychologue. Aucun diagnostic, aucun acte
  médical, aucune prescription.
- **Contre-indications strictes** (breathwork) : troubles psychotiques ; bipolarité non
  stabilisée ; épilepsie ou antécédents convulsifs ; pathologies cardiaques ou respiratoires
  graves non stabilisées ; hypertension sévère ; glaucome, décollement de rétine, chirurgie
  oculaire récente ; traumatisme crânien ; fracture non consolidée ; traitement psychotrope
  lourd ; sevrage en cours ; traumatisme psychique aigu (< 6 semaines) ; grossesse et
  post-partum (< 3 mois).
- Questionnaire de santé **obligatoire** avant tout accès au breathwork.
- Médiation à la consommation — **§1.1, à trancher**.

### → `socle/audiences.md`

- Profils accueillis : rupture majeure (séparation, deuil, burn-out, reconversion, naissance) ·
  schémas répétitifs · mal-être diffus · quête d'une dimension sacrée absente des thérapies
  classiques · crise du milieu de vie.
- Pôles d'expertise : **neurodiversité** (HPI, hypersensibles — apaisement de l'arborescence
  mentale) · **traumatismes et dissociation** (reconnexion corporelle sans retraumatisation) ·
  **santé et comportements** (tabac, insomnie, stress, soutien dans la dépression) ·
  **couple et évolution intérieure** (pardon, modèle de Sternberg, langages de l'amour).

### → `voix/direction-artistique.md`

- Palette Luminose : `#613F7F` · `#6163A5` · `#60407F` · fond `#F9F5FF` · bordure `#E8DEF6`.
- Typographies : **Futura Book**, **Abril Display Italic**.
- **Refus explicites** : Fraunces, Satoshi. À noter comme interdiction, pas comme préférence.
- Palette Le Seuil : dégradé de fond `linear-gradient(180deg,#E5C7CD,#E8C6BD,#F8D2B6,#FCDFB9,#FFDDAA)`,
  accentuation `linear-gradient(135deg,#86285A,#660037)`, texte `#660037`, violet profond `#38154B`.
  *À conserver malgré la suspension : c'est de la matière, pas une offre.*
- Symboles pertinents : l'arche · le seuil · le passage · l'ouroboros · la nature · les cycles ·
  la lumière et l'ombre · les espaces de transition.
- **Interdits visuels** : lotus · chakras · couleurs arc-en-ciel des chakras · esthétique yoga
  générique · accumulation de symboles ésotériques · new age standardisé.
- Le registre : profond sans emphase · symbolique sans kitsch · transpersonnel sans cliché
  ésotérique · thérapeutique sans froideur médicale · premium sans ostentation · chaleureux
  mais sobre.

### → `canaux/`

| Fichier | Matière disponible |
| :--- | :--- |
| `blog.md` | 5 à 7 articles/an. FrontMatter Jekyll : `layout` (colonne/default), `title`, `image_name`, `section: blog`, `category`, `tag`, `description`, `summary` — guillemets si deux-points. Balisage : `summary-container` (résumé 2 colonnes + image), `div.light-bg` (étapes), `div.highlight` + `h2.subtitle` + `{% bouton_rendez_vous is-white %}` (CTA final). Images 1:1 dans l'article, recadrées ~16:9 au listing, `srcset` avec `@2x`. Includes obligatoires en pied : `liens-partage.html`, `bandeaux/bandeau-auteur.html`, `bandeaux/bandeau-plus-loin-hypnose.html`. |
| `newsletter.md` | ~6 envois/an. Référence : 42,66 % d'ouverture, 5,07 % de clic (décembre). |
| `facebook.md` | Page `hypnose.villefranche.de.lauragais`. Axée local et événements ; recherche de régularité. |
| `linkedin.md` | Page `company/luminose`. Positionnement professionnel et articles de fond. |
| `instagram.md` | Compte récent, en démarrage. |
| `google-ads.md` | Campagnes régulières + Facebook Ads ponctuelles. Flyers distribués localement. |
| *transverse* | Outil de programmation : **Publer**. Rythme : pics d'activation avant les journées de breathwork. |

### → `repertoire/references.md`

Les références théoriques mobilisées, par domaine — matière de fond réutilisable :

| Domaine | Références |
| :--- | :--- |
| Transitions, rites de passage, liminalité | van Gennep · Victor Turner · Mircea Eliade · Louise Carus Mahdi · Bill Plotkin |
| Couple | Gary Chapman (langages de l'amour) · Erich Fromm |
| Dynamiques amoureuses | Robert Sternberg (triangle intimité / passion / engagement) |
| Attachement | John Bowlby · Allan Schore · Chris Fraley · Levine & Heller |
| Pardon, guérison émotionnelle | Olivier Clerc · Fred Luskin |
| Efficacité thérapeutique | Bruce Wampold (centralité de la relation) |

Métaphores éprouvées, citées comme fonctionnant : le jardinage pour la vie amoureuse ·
l'orchestre et les instruments pour l'attachement · la chenille et le cocon pour la
liminalité · les poignées de porte pour le changement intérieur.

### → `outils/`

Publer · Calendly · Google Analytics · Google Tag Manager · Make · encaissement (§1.8) ·
préférence technique : attributs `data-track` plutôt que des sélecteurs CSS fragiles pour les
déclencheurs GTM. Écartés : Matomo. Explorés sans suite : AddingWell, GTM server-side,
Fly.io, AWS, Umami, Mixpanel.

---

## 4. À vérifier — signalé par les sources elles-mêmes

L'export ChatGPT marque lui-même une quinzaine de points comme non fiables. Ceux qui restent
ouverts après croisement :

- **`reliance.luminose.fr`** — site associé à un accompagnement d'expatriés. Actif ou mort ?
  Aucune autre source ne le mentionne. Une propriété numérique orpheline.
- **`passage.luminose.fr`** — le site du Seuil. Que devient-il maintenant que l'offre est
  suspendue ? Il tourne peut-être encore, avec un Calendly ouvert.
- **La valeur de conversion Google Ads (1 470 €)** — si des campagnes tournent encore, elles
  optimisent vers une offre qui n'existe plus.
- Prix de l'Oracle (31 €, port inclus ?) · nombre maximum de participants aux ateliers (8) ·
  architecture d'encaissement réellement en production.

---

## 5. Ce qui n'entre PAS dans le corpus

Déjà encodé, testé, et documenté ailleurs. Le corpus **référence**, il ne recopie pas — sinon
on recrée le problème à l'intérieur de la solution.

| Quoi | Où ça vit | Garde-fou existant |
| :--- | :--- | :--- |
| `VOICE_RULES` | `packages/editorial/src/voice.ts` | fixture golden + test de concordance avec `FLUX-EDITORIAL.md` §4 |
| Les 7 personas | `packages/editorial/src/prompts/` | fixtures golden |
| `FORMAT_REGISTRY` | `packages/editorial/src/formats.ts` | autorité unique du routage par format |
| `OBJECTIF_REGISTRY` et les CTA | `packages/editorial/src/objectives.ts` | `FLUX-EDITORIAL.md` §7 |
| Les 9 actions, les 4 familles | `packages/editorial/src/actions.ts` | `FLUX-EDITORIAL.md` §2 |

À terme, `voice.ts` sera **généré depuis** `voix/` — on édite de la prose, pas du TypeScript,
et la fixture continue de garder le prompt composé.

---

## Bilan

| | |
| :--- | :--- |
| Contradictions à trancher | **9** |
| Éléments obsolètes | **7** |
| Blocs de matière à porter | **6** destinations identifiées |
| Points laissés ouverts par les sources | **6** |
| Blocs sans aucune divergence | **1** — la voix, le seul qui a un garde-fou |
