# SPEC v3.1 — gestion.luminose.fr

> **Cible** : migration complète Notion → Cloudflare D1, restructuration en monorepo,
> abstraction du fournisseur IA, et ajout des Séries / Déclinaisons.
>
> **Statut** : document de conception, écrit le 17/08/2026 avant toute implémentation.
> **v2.1 (21/08/2026)** : les clés des fournisseurs peuvent être posées depuis
> l'administration (§5.5). L'invariant du §7 est précisé, pas levé : une clé entre,
> elle ne ressort jamais. L'explorateur de catalogue arrive en §5.6.
> **v2.2 (23/08/2026)** : une série est une PROGRESSION, pas un ensemble (§2.9).
> L'Éclateur produit la matière de chaque publication et fait office d'Analyste pour
> sa série (§6.2) ; l'anti-répétition irrigue tout l'atelier, plus seulement la
> rédaction (§6.4).
> **v2.3 (23/08/2026)** : l'explorateur croise une seconde source, qui juge de la PROSE
> et non du raisonnement, et il s'ouvre sur une courte liste de vingt modèles
> délibérément différents (§5.6). Le coût, la qualité de rédaction et les forces
> d'un modèle sont désormais déduits des mesures, plus saisis de mémoire (§5.6).
> L'atelier du Coach cesse d'être un aller sans retour : rouvrir et
> réinitialiser (§2.7). Les appels IA sont visibles tant qu'ils durent et ne
> détruisent plus ce qui les précède, et tout échec s'annonce de la même façon
> (§3.5.1) ; un tour vide ne part plus chez un fournisseur (§3.5) ; les
> adaptateurs reprennent une fois sur un échec passager (§5.2) ; la relecture à
> froid se relit depuis le journal, datée et signée (§2.6) ; le format d'une
> publication est résolu et non comparé, et exigé avant création (§6.2) ; les
> publications d'une série naissent en Brouillon (§6.3).
> **v2.4 (02/10/2026)** : la vidéo. Un huitième format, le **Reel expliqué**, alterne
> la face caméra et des scènes animées écrites par le Rédacteur (§12). Le montage se
> termine dans l'application, rendu dans le navigateur (§12.4).
> **v2.5 (03/10/2026)** : le serveur MCP lit et écrit le corpus (`workers/mcp`,
> decisions/2026-10-03-corpus.md). Il dépend désormais de `packages/corpus` (§1.1) —
> le seul paquet du dépôt qu'il importe, pur et sans secret — et garde son propre jeton
> GitHub. La garde d'écriture du corpus quitte `workers/api` pour `packages/corpus` :
> la console et le serveur refusent la même chose.
> **v2.6 (04/10/2026)** : les scènes s'animent, se montent et s'exportent depuis l'onglet,
> les visuels se déposent sur leurs cartes, et le minutage ne dépend que d'une horloge
> que la prise viendra remplacer (§12.4.1).
> **v2.7 (04/10/2026)** : la prise se dépose, son son est transcrit par Whisper sur
> Workers AI, le script s'y cale mot à mot et les repères se corrigent à la main (§12.5) ;
> la vidéo finale sort de l'onglet, en 9:16 ou 4:5, organique ou publicitaire (§12.5.1).
> **v2.8 (04/10/2026)** : le montage est rangé chez Cloudflare — prises et visuels dans
> R2, transcription et repères dans D1 (§12.4.2). Il survit à des données de site
> vidées et se reprend depuis un autre poste ; le navigateur n'en garde qu'un cache.
> Les numéros 2.5 à 2.7 ont été remis dans l'ordre des dates le même jour : deux
> sessions avaient chacune écrit une « v2.5 ».
> **v2.9 (04/10/2026)** : rester dans le gratuit. L'écran des quotas suit R2 et Workers AI
> (§0.4), et le montage refuse un dépôt qui ferait dépasser les 10 Go gratuits de R2,
> seul service qui facture au-delà (§12.4.2).
> **v2.10 (04/10/2026)** : le montage a une porte. L'espace Vidéos s'ouvre sur un onglet
> **Montage** qui liste les Reels expliqués et dit où chacun en est ; le montage se tient
> aussi sur un contenu Prêt ou Publié, et chaque export réussi est noté (§12.4.3).
> **v2.11 (25/10/2026)** : la prise se dérushe dans l'outil. Silences trop longs et
> phrases reprises se coupent d'office, l'improvisation se propose ; chaque coupe se
> rétablit, et le cadre alterne à chaque raccord (§12.5.2). Final Cut n'est plus une
> étape du Reel expliqué.
> **v2.12 (25/10/2026)** : le sous-titre suit la voix mot à mot — le mot qui se dit
> s'éclaire en rose brumeux (§12.5). Le « pas de karaoké » de la v2.4 est levé.
> **v2.13 (25/10/2026)** : le rythme. Le cadre de la prise change aux phrases d'un long
> passage face caméra, le Rédacteur peut écrire deux « coups de poing » plein écran, et le
> montage signale tout moment figé plus de cinq secondes (§12.5.3). Correction : Remotion
> envoie bien un signal à chaque export ; la §12.4.1 disait le contraire.
> **v2.14 (25/10/2026)** : le son corrige Whisper. Une vraie prise de Florent a montré
> que Whisper étire le premier mot d'une reprise sur le silence qui la précède : les mots
> sont désormais recalés sur l'enveloppe sonore, les coupes tombent dans les silences, un
> micro-fondu adoucit chaque raccord, et le sous-titre devance la voix d'un dixième (§12.5.4).
> **v2.15 (25/10/2026)** : les prises se choisissent phrase par phrase — la dernière bonne
> version de chaque phrase, d'un seul tenant — et le montage se fait par le texte : la
> transcription se lit, le barré est coupé, tout passage se coupe ou se rétablit, et une
> phrase se reprend dans la version qu'on préfère (§12.5.5).
> **v2.16 (25/10/2026)** : un second moteur de transcription, Deepgram Nova-3, à comparer
> à Whisper sur une vraie prise (§12.5.6).
> **v2.17 (26/10/2026)** : les réglages d'une prise — rotation de l'image et
> synchronisation du son —, et un message qui dit quoi faire d'un ProRes (§12.5.7).
> **v2.18 (26/10/2026)** : la vidéo directe. Un Script Reel se monte face caméra de bout en
> bout, et une vidéo sans script se crée depuis Vidéos → Montage : sa transcription sert de
> texte. Les hésitations se coupent d'office. L'espace Montage distingue « directe » et
> « avec animations » (§12.7).
> **v2.19 (27/10/2026)** : Contenus, « le fil ». Les espaces Contenus et Vidéos fusionnent
> en un seul, à trois entrées ; un contenu ouvert est une conversation avec ses rôles IA
> à côté de ce qu'elle produit. Les statuts restent en base mais ne s'affichent plus :
> l'écran montre une **étape calculée**, la même partout (§13). Les gestes de Florent
> sont datés (`gestes`, migration 0012).
> **v2.20 (27/10/2026)** : rétablir hors du script. Un passage gardé à la main avant la
> première phrase ou après la dernière revient dans la vidéo ; chaque passage barré porte
> son bouton « Rétablir », la sélection se fait en glissant, et le dernier geste l'emporte
> — recouper ce qu'on vient de rétablir le recoupe (§12.5.5).
> **v2.21 (27/10/2026)** : le montage par le texte tel que la passation l'a dessiné. Il se
> lit séquence par séquence, en passages : un clic choisit un passage, « Barrer » le
> coupe, un clic sur un passage barré le rétablit (§12.5.5). Correction : l'export
> chargeait ses polices par un chemin qui n'existait qu'en développement, et échouait
> toujours en ligne.
> **v2.22 (27/10/2026)** : l'export dans Safari. Son encodeur H.264 ne rend aucune image
> dans le mode que Remotion impose, et l'export restait à 0 % ; une sonde le repère au
> premier export, et l'encodage passe alors en temps réel (§12.4.1). « Annuler » rend la
> main même à un rendu figé, et un rendu sans image depuis une minute s'arrête en le disant.
> **v2.23 (28/10/2026)** : l'étape d'une vidéo se met à jour dès qu'un export, un dépôt ou une
> transcription aboutit, et non plus au rechargement de la page (§13.6). Les fichiers
> exportés portent le titre du contenu (§12.4.1).
> **v2.24 (28/10/2026)** : la carte de la métaphore. Le Coach pose la métaphore en tableau
> — dans l'image, ce que c'est en vrai —, le brief la recopie, elle fait loi pour le
> Rédacteur, et le Lecteur froid en dresse une à l'aveugle que le fil met en face
> (§13.14). Le brief se déplie dans le fil, un « Go » rappelle les questions du Coach
> restées sans réponse, et un atelier replié se relit par « Lire la trame » (§13.10). Les
> règles de voix précisent qu'un terme clinique se dit en clair, hors de l'image.
> **v2.25 (28/10/2026)** : ce qu'a montré la première vidéo exportée. Une élision que
> Whisper rend en deux mots se recolle dans les sous-titres, qui suivent aussi la
> ponctuation du script (§12.5) ; deux sous-titres ne se superposent plus d'une image
> (§12.5.1) ; la vidéo ne montre jamais la description d'un visuel absent (§12.4.1) ;
> les réglages d'une prise ne se reprennent que d'une prise au même format, et une prise
> horizontale le dit (§12.5.7).
> **v2.26 (28/10/2026)** : un écran à la fois. Une scène ne s'empile plus : chaque écran
> remplace le précédent, un visuel en grand et un à quatre mots, sur le fond de son ton ;
> plus de titre ; des scènes de six secondes, le visage revenant entre deux (§12.3,
> §12.4.1). Les visuels ne se produisent plus carte par carte : l'outil dessine et anime
> cinq schémas, et la métaphore a son illustration, décrite une fois pour tout le Reel,
> que chaque écran montre au cadrage voulu (§12.2, §12.3).
> **v2.27 (28/10/2026)** : la signature. La vidéo nomme Florent sur l'accroche et finit sur
> un carton — nom, titre, luminose.fr —, posés par le code comme la slide de signature
> d'un carrousel (§12.5.1).
> **v2.28 (29/10/2026)** : l'illustration de la métaphore se génère, dans le style des pages
> du site — l'étalon joint —, par OpenRouter : Nano Banana Pro par défaut, Nano Banana 2
> ou GPT Image 2 au choix. Florent la voit avant de la garder (§12.3).
> **v2.29 (30/10/2026)** : ce qu'a montré la prise du 30/10, exportée deux fois. Quand la fin
> du script n'a pas été dite, la dernière tentative improvisée la remplace ; une version
> reformulée commence avec sa phrase ; un passage rétabli loin du script ne ramène plus ce
> qui l'en sépare (§12.5.5). Ne se sous-titre que ce que la vidéo fait entendre (§12.5.1),
> et un sous-titre n'enjambe plus un début de phrase du script ni l'arrivée d'une scène
> (§12.5).
> **v2.30 (30/10/2026)** : le calme, et la prise fait foi. Devant la vidéo, Florent : « Le
> rythme est un peu trop rapide. Ça fait beaucoup de trucs qui s'animent à l'écran et c'est
> confus à suivre. » Plus d'air aux fins de phrase (§12.5.2) ; pas de visage éclair entre
> deux scènes, plus de recadrage aux phrases, coup de poing tenu 1,5 s, alerte à 8 s
> (§12.5.3) ; entrées sans rebond, lignes de liste posées ensemble (§12.4.1) ; fonds en
> deux temps, sombre puis clair (§12.3). Et : « il y aura forcément des différences » entre
> le script et la parole — la prise fait foi : une improvisation redite se coupe (§12.5.2),
> un mot s'écrit comme dit, et l'alerte porte sur les écrans dont les mots n'ont pas été
> dits, plus sur l'écart au texte (§12.5).
> **v2.31 (30/10/2026)** : les écrans en Brume. Devant trois pistes — Brume, Affiche, Arche —,
> Florent : « La piste brume est très bien ! » Les scènes, les coups de poing et le carton
> final prennent l'atmosphère des illustrations du site : ciel en dégradé, halo, collines,
> grain. L'eau du niveau monte dans le paysage, la liste perd ses pastilles, le mot-clé
> grandit en Abril (§12.3, §12.4.1, §12.5.3).
> **v2.32 (30/10/2026)** : le studio sans onglets. Florent : « toute l'interface de montage
> (Texte, Scènes, Rythme, Prise) n'est vraiment pas au niveau pro. C'est hyper confus à
> utiliser. Les "+ -" sur les Repères… je ne comprends même pas à quoi ça sert. » Une
> première maquette — chronologie, étiquettes qu'on glisse, inspecteur — lui a paru
> « démesurément complexe » : une prise comme celle du 30/10 n'appelle que quelques
> retouches. Il reste un écran : l'aperçu et l'export à gauche, comme avant ; à droite, ce
> qui reste à faire avant d'exporter, puis le texte tel qu'il sera entendu. Le texte coupé
> se replie sous un ✂ ; une phrase se clique pour l'écouter, la couper ou choisir sa
> version ; un écran se déplace en cliquant son étiquette, puis un mot. La prise passe dans
> un tiroir. Une improvisation se range là où la vidéo la montre (§12.5, §12.5.5, §13.11).
> **v2.33 (03/11/2026)** : Claude en direct. Un quatrième adaptateur, `anthropic`, appelle
> l'API Messages d'Anthropic : les crédits API mensuels de l'offre Max ne servent qu'aux
> appels faits avec une clé de l'organisation Console liée, et OpenRouter les laissait
> dormir. Il ne déclare aucun prix, et le produit n'en recalcule pas (§2.6, §5.3).
> **v2.34 (03/11/2026)** : le serveur MCP dans les contenus. Florent : « que le MCP permette à
> Claude d'agir sur les contenus — lire, ajouter, modifier », et « regrouper plusieurs idées en
> une même série ». Il passe par l'API, avec un jeton dont la console ne garde que
> l'empreinte, et qui n'ouvre que les contenus et les séries (§1.1, §7) ; il n'y écrit que la
> fiche, le brouillon par le journal, et le regroupement. Un brouillon retouché à la main est
> versé au journal avant d'être remplacé. Nouvelle route, ouverte aussi à la console :
> regrouper des idées en série (§3.3). En chemin : un PATCH des plateformes les perdait.
> **v2.35 (03/11/2026)** : les modèles, plus simples à régler et à suivre. Florent : « j'ai du
> mal à effectuer ces paramétrages ». Un modèle par FAMILLE — Juger, Recopier, Synthétiser,
> Porter la voix, Illustrer — au lieu de neuf réglages par action ; une action garde le droit
> de suivre son propre réglage, replié (§3.4). Les modèles d'image entrent au catalogue,
> distingués par leur sortie, et l'illustration du Reel expliqué les y lit (§5.3, §12.3).
> L'explorateur liste aussi ce que proposent Anthropic et 1min.ai, avec le code que chaque
> adaptateur attend (§5.6). Une veille quotidienne signale les versions plus récentes des
> modèles utilisés (§5.7). Réglages → Affichage disparaît : ses options ne pilotaient plus
> rien depuis le fil (§13).
> **v2.36 (07/11/2026)** : déplacer et réordonner. Une fois un contenu dans une série, rien ne
> permettait de l'en sortir, de le changer de série ni de remettre une série en ordre ; il le
> fallait pour fusionner deux séries qui se recouvrent. Trois gestes, dans la console et par le
> serveur MCP : déplacer un contenu — vers une autre série, à un autre rang de la sienne, ou
> hors de toute série —, et réordonner une série (§3.3). Les rangs restent continus, 1 à n
> (§2.9) ; un contenu publié ne se déplace pas ; le déplacement laisse un geste daté dans le
> fil (§13.6, migration 0016). Le `PATCH` d'un contenu n'écrit plus ni sa série ni son rang :
> un éditeur resté ouvert les réécrivait (§3.2). En chemin, deux trous dans la numérotation se
> referment : allonger une série depuis son plan repartait du n° 1 (§6.3), supprimer une
> publication laissait un trou (§3.2) ; la migration 0017 remet en ordre les séries existantes.
> **v2.37 (16/11/2026)** : le prompt d'image ne nomme plus d'outil. Florent a quitté Dzine : il
> génère ses visuels dans ChatGPT, ou dans la console avec un modèle d'Illustrer. Le champ
> `prompt_dzine` du Post Texte et des slides devient `prompt_image`, l'action « Prompts
> d'image » devient `ADJUST_IMAGE_PROMPTS` (migration 0018), et chaque prompt se suffit à
> lui-même. Les brouillons d'avant se relisent (§2.5). Illustrer part directement du prompt :
> celui d'un Post Texte à la Publication, celui de chaque slide illustrée, envoyé tel quel,
> sans étalon, aux proportions que le registre donne au format (§3.4, §12.3, §13.9).
> **v3.0 (27/11/2026)** : les clients, les séances et la réservation (§14). Florent, les 25 et
> 26/11/2026 : la base des clients quitte Notion, la réservation quitte Calendly, et les deux
> arrivent ici. Gestion devient aussi le registre des personnes accompagnées et l'agenda où l'on
> réserve ; le « ni un agenda, ni un CRM » du §3.8 est levé. La moitié éditoriale ne change pas :
> les deux moitiés partagent une console et une session, jamais une base ni du code métier. Une
> seconde base, `luminose-clients`, créée en juridiction européenne et reliée par une liaison
> facultative (`CLIENTS`) ; un paquet pur, `packages/pratique` ; un environnement de recette
> durable (§14.8). Phase S1 du socle : le chapitre, le schéma (Annexe C), les deux décisions qui
> ne se prennent qu'une fois, la recette et son jeu d'essai — la production reste sans liaison.
> **v3.1 (27/11/2026)** : la phase S2 est coupée en deux (§14.11). **S2a** — ce que gestion fait
> d'une commande une fois reçue : le contrat en schémas (`packages/contrat`), les commandes
> rejouables, les ordres vers Make et leurs confirmations, les jetons des liens, les bornes,
> l'interrupteur, et le premier parcours, recevoir un questionnaire ; aucun Worker ni aucune
> adresse nouvelle. **S2b** — l'essai à blanc, `workers/porte`, les entrées nommées et la recette.
> Quatre tables (`0003_portes.sql`, Annexe C), et les précisions que la phase apporte au contrat
> (§14.6.1), à faire confirmer par Florent.
> Les sections marquées **NORMATIF** font foi : toute divergence du code est un bug du
> code, pas de la spec. Les modifier exige un bump de version de ce document.
>
> L'état du système *avant* migration est décrit en §0.3 ; il reste la référence
> jusqu'à la fin de la phase 5 (§11).

---

## 0. Contexte

### 0.1 Le produit

Application mono-utilisateur (Florent Jaouali, psychopraticien transpersonnel) qui gère le
cycle de vie de ses contenus éditoriaux — de l'idée brute au post prêt à publier — avec
l'IA comme copilote à chaque étape.

**Ce qui fait la valeur du produit n'est pas le CRUD : c'est la méthode éditoriale
encodée dans les prompts.** Sept personas, des règles de voix transverses, une grille de
production par format, sept objectifs qui dictent le CTA. Toute décision d'architecture
qui met cette méthode en danger est une mauvaise décision, quelle que soit son élégance.

Depuis la v3.0, le produit a deux moitiés : les contenus, et les personnes accompagnées —
clients, séances, réservation, évènements. Elles partagent la console, jamais une base ni du
code métier (§14).

### 0.2 Pourquoi cette migration

Notion a été un excellent point de départ : zéro infrastructure, édition immédiate.
Le coût est devenu structurel. `services/notionService.ts` fait 1040 lignes, dont
l'essentiel n'existe que pour survivre à l'API :

| Mécanisme | Raison d'être | Devient en D1 |
| :--- | :--- | :--- |
| `getDataSourceId` | double appel imposé par l'API 2025-09-03 | néant |
| `normalizePropName`, `getDataSourceProperties`, `buildPropertyValue` | les colonnes sont identifiées par leur nom affiché | une migration SQL |
| `markdownToNotion` / `notionToMarkdown` | Notion stocke des segments annotés, pas du texte | `TEXT` |
| `rawTextToNotion` | contournement du précédent pour le JSON | néant |
| `enforceRichTextLimit` | découpe à 2000 caractères | `TEXT` (2 Mo par ligne) |
| `fetchLiveContentIds` | une page archivée disparaît des résultats | `deleted_at` |
| `fetchWithRetry` | limite de débit ~3 req/s | néant |

S'y ajoute que la fonctionnalité demandée — les Séries — exige des relations Notion, que
le service ne sait pas écrire. En SQL, c'est une clé étrangère.

**Vérifié avant décision** : l'application couvre déjà l'intégralité du modèle en édition
(titre, statut, plateformes, notes, format, objectif, profondeur, verdict, angle,
métaphore, justification, body, session Coach, slides, post court, date de publication).
Notion n'est plus une surface d'édition nécessaire.

### 0.3 État de départ

SPA React 19 + Vite 7 sur GitHub Pages, Cloudflare Worker en proxy Notion + 1min.ai,
IndexedDB en cache local, 73 tests vitest, jeton de session signé HMAC-SHA256.
Deux bases Notion : « Contenu » et « Modèles IA ».

### 0.4 Quotas Cloudflare (plan gratuit)

| Ressource | Limite gratuite | Besoin estimé |
| :--- | :--- | :--- |
| Stockage D1 | 5 Go (500 Mo/base) | < 50 Mo |
| Lignes lues / jour | 5 000 000 | < 10 000 |
| Lignes écrites / jour | 100 000 | < 500 |
| **Requêtes par invocation Worker** | **50** | **contrainte de conception, §3.6** |
| Time Travel | 7 jours | complété par l'export, §9.4 |
| Stockage R2 (montage, §12.4.2) | 10 Go | quelques prises vidéo de 100 à 500 Mo |
| Opérations R2 classe A / B, **par mois** | 1 000 000 / 10 000 000 | quelques centaines |
| Neurones Workers AI / jour (transcription, §12.5) | 10 000 | ≈ 47 par minute de son avec Whisper, ≈ 470 avec Nova-3 (§12.5.6) |

Le quota n'est pas un facteur limitant. La limite des 50 requêtes par invocation, si.

**Sauf R2, qui FACTURE au-delà de son gratuit** — les autres refusent. Florent veut rester
dans le gratuit (04/10/2026) : l'écran Réglages → Quotas suit R2 (stockage, opérations
de classe A et B au mois) et Workers AI (neurones du jour), et le montage **refuse** un dépôt
qui ferait passer ce qu'il range au-delà de 10 Go (§12.4.2).

---

## 1. Architecture cible — NORMATIF

Monorepo npm workspaces. Des moteurs purs — `editorial` pour les contenus, `pratique` pour
les clients (§14) —, deux Workers aujourd'hui et un troisième, la porte, en phase S2b (§14.3),
un front.

```
gestion.luminose.fr/
├── apps/
│   └── manager/            SPA React (Vite) → Cloudflare Pages
├── packages/
│   ├── shared/             types + schémas zod partagés front/worker
│   ├── editorial/          LE MOTEUR : personas, voix, formats, objectifs,
│   │                       parsing des réponses IA. Zéro dépendance.
│   ├── ai/                 abstraction fournisseur (port + adaptateurs)
│   ├── subtitles/          .srt → .fcpxml
│   ├── psychedelics/       calcul de doses
│   ├── pratique/           LES RÈGLES DE LA PRATIQUE : la clé d'un client, les
│   │                       créneaux, la liste d'attente. Zéro dépendance (§14.3).
│   └── contrat/            le contrat /v1 en schémas zod (phase S2a, §14.3)
├── workers/
│   ├── api/                Hono + D1 + auth
│   │   ├── migrations/     NNNN_description.sql — la base `luminose-gestion`
│   │   ├── migrations-clients/  NNNN_description.sql — la base `luminose-clients` (§14.4)
│   │   └── src/
│   │       ├── routes/
│   │       └── clients/    l'accès à la base des clients, et lui seul (§14.2)
│   ├── porte/              la porte publique et la porte de service,
│   │                       api.luminose.fr (phase S2b, §14.5)
│   └── mcp/                serveur MCP pour Claude, mcp.luminose.fr —
│       │                   OAuth + Google Ads : lire, et préparer en pause ;
│       │                   le corpus : lire main, écrire par commit ;
│       │                   Tag Manager : lire, et préparer dans « [Claude] » ;
│       │                   les contenus : par l'API de la console
│       └── migrations/     journaux des écritures, base `luminose-mcp`
└── scripts/
    └── deploy.sh
```

### 1.1 Règles de dépendance (NORMATIF)

```
apps/manager  ──▶ packages/{shared, editorial, subtitles, psychedelics}
workers/api   ──▶ packages/{shared, editorial, ai}
workers/mcp   ──▶ packages/corpus
packages/ai   ──▶ packages/shared
packages/editorial ──▶ (rien)
packages/{subtitles, psychedelics} ──▶ (rien)
workers/api    ──▶ packages/{pratique, contrat}      (v3.0, §14.3)
workers/porte  ──▶ packages/contrat
packages/contrat  ──▶ zod, et rien d'autre
packages/pratique ──▶ (rien)
```

Depuis la v3.0 : `workers/porte` n'a ni base ni secret, et n'importe rien de `workers/api` ;
dans `workers/api`, aucun module éditorial n'importe `src/clients/` (§14.2, règle 1).

- `packages/editorial`, `subtitles`, `psychedelics` : **zéro dépendance runtime**, zéro
  React, zéro `fetch`, zéro API Workers. Fonctions pures, testables sans réseau ni DOM.
- `packages/ai` : dépend de `shared` uniquement. Ne connaît ni D1 ni Hono.
- Le front n'importe **jamais** `packages/ai` : les clés d'API vivent dans le Worker.
- `workers/mcp` ne partage avec `workers/api` ni code, ni secret, ni binding. Son
  authentification n'est pas celle de la console (OAuth pour Claude), et une erreur de
  configuration de l'un ne doit pas pouvoir exposer l'autre. Sa base D1 est la sienne
  (`luminose-mcp`, les journaux des écritures Google Ads, corpus et Tag Manager) : celle de la console
  porte les clés des fournisseurs IA (§5.5), et il n'a pas à les voir. Son jeton GitHub est
  le sien, pas celui de la console. Dépendances runtime : `zod`,
  `@cloudflare/workers-oauth-provider` et, depuis le 03/10/2026, `@luminose/corpus` — pur,
  sans secret ni accès disque dans ce qu'il exporte, pour composer les profils du corpus
  avec le même `composer()` que la console et refuser ce qu'elle refuse d'écrire
  (`refusDeContenu`). Mise en place et écarts avec le cadrage : `workers/mcp/README.md`.
- **Les contenus, le serveur MCP les joint par l'API — jamais par la base (v2.34).** Il y
  présente un jeton à lui, dont la console ne garde que l'empreinte, et qui n'ouvre qu'une
  liste fermée de routes (§7). Ce n'est ni un binding, ni un secret partagé, ni du code
  commun : l'API reste la seule à appliquer les règles des contenus, et les clés de sa base
  restent hors d'atteinte.

### 1.2 Une seule origine

`gestion.luminose.fr` est servi par Cloudflare Pages. Le Worker capte `/api/*` sur **cette
même origine** via une route.

Conséquence directe : **plus de CORS du tout**. Plus de `ALLOWED_ORIGINS` à maintenir,
plus de préflight, plus d'origine de développement à déclarer. C'est une simplification,
pas un détail de configuration.

`mcp.luminose.fr` est hors de ce périmètre : aucun front ne l'appelle. Il ouvre CORS sur
ses seuls points d'entrée OAuth et `/mcp`, pour l'inspecteur MCP qui tourne dans un
navigateur. Sans cookie, et derrière un jeton porteur, c'est sans conséquence.

La console garde son origine unique en v3.0. La porte publique (`api.luminose.fr`, §14.5)
est une autre origine, pour un autre public — les pages du site —, avec sa propre politique
CORS ; elle n'ouvre rien de la console.

---

## 2. Modèle de données (D1) — NORMATIF

Schéma complet en Annexe A. Le modèle Notion actuel est le produit d'évolutions
successives sous contrainte non relationnelle ; il est ici repris à zéro. Les écarts
volontaires avec l'existant sont justifiés en §2.7.

### 2.1 Suppression logique

Toute table métier porte `deleted_at INTEGER` (epoch ms, `NULL` = vivant).

Une suppression est un `UPDATE … SET deleted_at = ?`. La synchronisation incrémentale
renvoie **aussi** les lignes supprimées depuis `since`, ce qui permet au client de purger
son cache. Le balayage d'identifiants de l'ère Notion disparaît : le problème n'existe plus.

### 2.2 Horodatage

`created_at` et `updated_at` en **epoch millisecondes** (`INTEGER`), jamais en texte ISO.
`updated_at` est la clé de la synchronisation incrémentale et n'est écrit que par le
Worker, jamais par le client.

### 2.3 Charges JSON

`contents.draft`, `contents.slides` et les `generations.payload` restent du **JSON
sérialisé en TEXT**. La base ne les interprète pas, ne les indexe pas, ne les valide pas.

Raison : leur forme varie par format (`accroche`/`corps` pour un post court,
`sections[]` pour un script, `slides[]` pour un carrousel, `objet`/`baffe` pour une
newsletter) et suit l'évolution des prompts. Les normaliser condamnerait chaque évolution
de format à une migration SQL. Leur schéma appartient à `packages/editorial`.

### 2.4 Identifiants

- Contenus migrés : **l'identifiant de page Notion est conservé**. La migration est ainsi
  ré-exécutable sans doublon.
- Nouvelles lignes : UUID v4 généré par le Worker.

### 2.5 Un seul brouillon

`contents.draft` porte le brouillon, **quel que soit le format**.

L'existant a deux colonnes — `body` et `scriptVideo` — pour la même chose : le résultat de
la rédaction. Elles ne diffèrent que par le format, et `getStorageField()` n'existe que
pour choisir entre elles. Aucun contenu ne remplit les deux.

Une seule colonne, et la notion de `storageField` disparaît du produit.

`contents.slides` est conservée à part : ce n'est **pas** une dérivation du brouillon mais
un enrichissement (les `prompt_image` de l'Artiste), ajustable indépendamment.

Le prompt d'image — des slides comme du Post Texte — s'appelait `prompt_dzine` avant la
v2.37, du nom de l'outil d'alors. Un brouillon qui porte encore l'ancien nom se lit
(`lirePromptImage`, `packages/editorial/src/promptImage.ts`), et le nom se corrige quand le
JSON repart vers un modèle ou vers la base. Pas de migration des données : le journal ne se
réécrit pas (§2.6), et restaurer une version d'avant ramènerait l'ancien nom.

### 2.6 Les productions IA sont un journal — NORMATIF

Chaque production de l'IA est une ligne de `generations` : analyse, rédaction, slides,
relecture à froid, ajustement, brief verrouillé, plan de série.

`contents` porte l'état **courant** (lecture immédiate, aucune agrégation) ;
`generations` porte la **trace**. Ce n'est pas de l'event sourcing : on ne reconstruit
jamais l'état depuis le journal.

Ce que ça règle, et qui n'est pas décoratif :

1. **La provenance sort de la charge utile.** Aujourd'hui la signature
   `_Généré par : <modèle> - le <date>_` est concaténée **après le JSON**, dans le champ
   lui-même. Résultat : onze `lastIndexOf('}')` dispersés dans sept fichiers, parce que
   chaque lecteur doit savoir qu'un contenu JSON n'est pas du JSON. La colonne redevient
   du JSON pur ; la provenance vit dans sa propre ligne.
2. **L'annulation devient réelle.** Aujourd'hui : un seul niveau, en mémoire, perdu à la
   fermeture de l'éditeur. Demain : revenir à n'importe quelle génération antérieure.
3. **La comparaison devient possible** — deux rédactions du même contenu, côte à côte.

`model_label` est figé à l'écriture : si le modèle est supprimé du catalogue, la
provenance survit.

**Le journal est le seul domicile de la relecture à froid — NORMATIF.** Toutes les
autres productions atterrissent dans une colonne de `contents` : la rédaction dans
`draft`, les slides dans `slides`, le brief dans `coach_brief`, l'analyse dans
`verdict`/`strategic_angle`. La relecture à froid ne vise AUCUNE colonne — c'est un
jugement porté sur le texte, pas une version du texte.

Elle était donc journalisée sans être jamais relue, et le code affirmait même
« éphémère, non persisté » là où elle l'était depuis le début. Fermer le panneau, ou le
voir disparaître sur un échec, revenait à perdre un rapport qui dormait en base.

L'éditeur reprend donc la dernière ligne `cold_read` à l'ouverture, en UNE requête
(`?kind=cold_read&limit=1`), et affiche **quand** et **par quel modèle** — un rapport
d'hier ne doit pas se faire passer pour un jugement du texte d'aujourd'hui. Un échec
d'écriture du journal se voit à l'écran : sans cette ligne, le rapport ne survivra pas à
la fermeture, et c'est précisément ce qu'on répare.

`GET /contents/:id/generations` accepte `limit` (défaut 50, plafond 200). Sans borne, la
route rendait tout : un `payload` est un brouillon entier, trente lignes font des
centaines de kilo-octets pour une question qui n'en demandait qu'une.

Volume : quelques kilo-octets par génération, quelques générations par contenu. Non
significatif à cette échelle ; si cela changeait, une purge au-delà des N dernières par
couple (contenu, nature) suffirait.

**Chaque ligne porte ce que l'appel a coûté — NORMATIF.** `prompt_tokens`,
`completion_tokens`, `cost_usd`. Le journal disait qui a produit quoi ; il ne disait pas
ce que ça valait, et « ce contenu revient-il cher ? » se répondait à l'intuition.

**Les trois colonnes sont nullables, et le resteront.** `null` veut dire « le fournisseur
n'a rien déclaré » — **jamais « zéro »**. 1min.ai ne rend aucun décompte ; une API OpenAI
rend des jetons sans prix ; OpenRouter rend les deux, à condition de le demander
(`usage: {include: true}`, propre à lui — envoyé à une API OpenAI stricte, ce champ
inconnu ferait refuser la requête). Confondre inconnu et gratuit ferait passer une
facture non mesurée pour une facture nulle.

Le prix n'est **jamais recalculé** à partir des jetons et du catalogue : chez OpenRouter
il dépend du fournisseur réellement routé au moment de l'appel, et une estimation maison
divergerait sans que rien ne le signale. On stocke ce que le fournisseur facture, ou rien.

`GET /contents/:id` rend l'agrégat en **une** requête (`SUM`, pas la lecture du journal —
additionner trois nombres ne justifie pas de transporter des charges de plusieurs
kilo-octets). Il compte aussi les appels **sans prix déclaré** : sans ce chiffre, un total
partiel se lirait comme un total. L'écran affiche « ≥ » dans ce cas, et n'affiche rien
plutôt que « 0,00 $ » quand aucun appel n'est chiffré.

**Un appel groupé partage son coût.** L'analyse en lot produit N lignes de journal pour un
seul appel : sa facture se divise entre les idées. Sans ça, chacune porterait le coût du
lot entier et le total serait faux d'un facteur N.

Une reprise (`revert`) recopie une charge déjà produite : elle ne consomme rien, et ses
colonnes de coût restent nulles.

### 2.7 La conversation Coach est une suite de messages — NORMATIF

`coach_messages` : une ligne par message. L'état de session (statut, brief verrouillé,
format calibré, date de validation) reste sur `contents`.

Aujourd'hui la session entière est un blob réécrit **à chaque tour** : dix échanges = dix
réécritures de la conversation complète. Un échec au mauvais moment, et des messages
disparaissent. En lignes, l'écriture est un `INSERT` : un message écrit ne se perd plus.

**L'API masque ce détail.** `GET /api/contents/:id` renvoie une `coachSession` assemblée
`{ status, brief, messages[] }`, et `POST /api/contents/:id/coach/messages` ajoute un
message. Le client garde son modèle mental ; seul le stockage change.

**L'atelier a deux sorties — NORMATIF.** Une session validée n'est pas un état
terminal. Sans retour possible, une rédaction qui échoue derrière la validation laisse
la publication **intouchable** : le chat est en lecture seule, « Go Éditeur » a disparu,
et rien ne peut plus être tenté. C'est arrivé le 23/08/2026, sur une réponse de Coach
rendue en JSON illisible.

| Sortie | Effet | Réversible |
| :--- | :--- | :--- |
| **Rouvrir** | `coach_status` repasse à `in_progress`, `coach_validated_at` s'efface | rien n'est perdu |
| **Réinitialiser** | messages marqués `deleted_at`, statut / brief / format cible remis à zéro | en base, oui |

`DELETE /api/contents/:id/coach` porte la réinitialisation, en deux requêtes. Les
messages sont **marqués, pas détruits** : on jette une session parce qu'elle s'est mal
passée, c'est-à-dire au moment précis où l'on voudra peut-être relire ce qui a été dit.
La lecture filtre `deleted_at IS NULL` ; l'append-only tient toujours.

**Le brouillon n'est jamais touché** par l'une ni l'autre : on jette l'atelier, pas ce
qui en est sorti.

### 2.8 Écarts volontaires avec l'existant

| Existant | Cible | Raison |
| :--- | :--- | :--- |
| `body` + `scriptVideo` | `draft` | même rôle ; `getStorageField()` disparaît (§2.5) |
| `postCourt` (colonne) | **supprimée** | dérivation pure de `body` via `buildPostCourtText()`. Elle est écrite en cache par l'onglet Copie et **recalculée en l'ignorant** par l'aperçu : deux vérités pour un même fait, qui peuvent déjà diverger. Calculée à la lecture. |
| `analyzed` (booléen) | `analyzed_at` (ms) | strictement plus informatif, et une seule source de vérité |
| signature markdown dans le champ | `generations` | §2.6 |
| `coachSession` (blob) | `coach_messages` + colonnes d'état | §2.7 |
| `interviewAnswers`, `interviewQuestions` | `legacy_json` | flow remplacé par le Coach, **aucun déclencheur dans l'interface**. Décision révisée après l'export : 15 contenus portent des questions et 8 des réponses, jusqu'à 8 900 caractères. Une colonne nullable ne coûte rien ; jeter la matière qui a produit ces brouillons, si. |
| `Cible Offre` | déjà remplacé par `objectif` | fait en amont |

`platforms` reste un tableau JSON plutôt qu'une table de jointure : le filtrage est
côté client sur un volume faible, et SQLite sait interroger du JSON le jour où il faudra.

### 2.9 Les Séries

```
series 1 ──── N contents          (contents.serie_id)
series 0..1 ── 1 contents         (series.source_content_id — le contenu pilier)
```

- **Série sans source** : plusieurs contenus autour d'un thème. Chacun construit sa
  matière via le Coach.
- **Série avec source** : un contenu existant (l'article) est le pilier ; les autres en
  sont des déclinaisons.

C'est **le même objet**. La seule différence est d'où vient la matière. `contents.angle`
porte l'angle propre de ce contenu au sein de sa série.

**Une série est une progression — NORMATIF.** `contents.serie_position` porte le rang
(1, 2, 3…). Ce n'est pas un confort d'affichage : la première publication ouvre le sujet
pour un inconnu, les suivantes s'appuient sur ce qui précède sans le réinstaller, la
dernière peut proposer quelque chose. Sans rang, une série n'est qu'un ensemble, et
chaque contenu réécrit l'introduction des autres.

**Les rangs sont continus — NORMATIF (v2.36).** 1 à n, sans trou ni doublon. Déplacer un
contenu et réordonner une série (§3.3) renumérotent chaque série qu'ils touchent, dans
l'ordre où l'écran la montre (`rangs.ts`, `ORDRE_DANS_LA_SERIE`) : par rang, un contenu
sans rang en fin, puis par date de création. Supprimer une publication resserre sa série
(§3.2) ; allonger une série depuis son plan numérote à la suite (§6.3). La migration 0017 a
remis en ordre, dans ce même ordre, les séries d'avant la v2.36 : trous, doublons et rangs
`NULL` d'un contenu rattaché à la main.

## 3. API (Worker, Hono) — NORMATIF

### 3.1 Conventions

- Base : `/api`. Toutes les routes exigent un jeton de session valide (§7), sauf
  `POST /api/auth/login`.
- Entrées validées par **zod** à la frontière. Une entrée invalide → `400` avec le détail.
- Sorties en `camelCase` ; la base est en `snake_case`. La conversion a **un point d'entrée
  par base** (v3.0, §14.4) : `workers/api/src/db.ts` pour l'éditoriale,
  `workers/api/src/clients/db.ts` pour celle des clients — et nulle part ailleurs.
- Erreurs : `{ error: string, detail?: unknown }`, statut HTTP signifiant.

### 3.2 Contenus

```
GET    /api/contents?since=<ms>     liste ; inclut les lignes supprimées si `since`
GET    /api/contents/:id            contenu + coachSession assemblée (§2.7)
POST   /api/contents                création
PATCH  /api/contents/:id            mise à jour partielle
DELETE /api/contents/:id            suppression logique
POST   /api/contents/batch          création en lot (plan de série, §6.3)
```

La liste ne porte **pas** les messages Coach ni le journal des générations : ils ne sont
lus qu'à l'ouverture d'un contenu. C'est ce qui garde la liste à une seule requête (§3.6).

`postCourt` n'existe plus en base : il est calculé à la lecture depuis `draft` (§2.8).
Le Worker ne le renvoie pas — c'est `packages/editorial` qui le produit, côté client.

**Le `PATCH` ne déplace pas — NORMATIF (v2.36).** `serieId` et `seriePosition` y sont
ignorés en silence ; seul `POST /api/contents/:id/deplacer` les écrit (§3.3). La console
renvoie le contenu ENTIER à chaque enregistrement — une frappe, le rattrapage d'un échec, la
fermeture de l'éditeur : un éditeur resté ouvert pendant un déplacement réécrivait l'ancienne
série et l'ancien rang, et la série y gagnait un trou et un doublon. En silence, parce que la
console les envoie toujours ; le serveur MCP, lui, reste refusé (§7). La création — un plan
de série, `POST /api/contents/batch` — les pose toujours.

**Supprimer un contenu resserre sa série (v2.36).** La suppression et la renumérotation de
ce qui reste partent dans le même batch, en 2 écritures : supprimer le n° 2 laissait un trou
entre le 1 et le 3.

### 3.2.1 Conversation Coach (§2.7)

```
POST   /api/contents/:id/coach/messages    ajoute un message (append-only)
PATCH  /api/contents/:id/coach             statut, brief verrouillé, validation
DELETE /api/contents/:id/coach             réinitialise la session (§2.7)
```

### 3.2.2 Journal des productions (§2.6)

```
GET    /api/contents/:id/generations?kind=&limit=  historique, du plus récent au plus ancien
POST   /api/contents/:id/generations/:genId/revert réécrit la colonne cible
```

`limit` vaut 50 par défaut et plafonne à 200. La borne n'est pas cosmétique : un
`payload` est un brouillon entier.

Une génération n'est jamais modifiée ni supprimée par l'application : elle est un fait
daté. `revert` **ajoute** une ligne dont la charge reprend celle visée, plutôt que de
rembobiner le journal — l'annulation d'une annulation reste ainsi possible.

### 3.3 Séries

```
GET    /api/series?since=<ms>
GET    /api/series/:id              série + ses contenus (une seule requête, jointure)
POST   /api/series
PATCH  /api/series/:id
DELETE /api/series/:id?contenus=detacher|supprimer
POST   /api/series/regrouper        des idées existantes en une série (v2.34)
POST   /api/series/:id/reordonner   l'ordre complet d'une série (v2.36)
POST   /api/contents/:id/deplacer   un contenu vers une autre série, un autre rang, ou hors série (v2.36)
```

**Regrouper des idées — NORMATIF (v2.34).** Une série sans source, dont les publications
existent déjà : des idées éparses, rangées dans l'ordre donné, qui EST la progression (§2.9),
avec un angle chacune s'il est donné. Seulement des idées — statut `Idée` — et seulement des
idées libres : une publication engagée a été pensée seule, une idée déjà rangée appartient à
une autre progression, et l'en sortir se décide dans la console. Elles restent des idées :
leur format, leur objectif, leur angle restent à décider. Deux à vingt idées ; la série et
ses idées sont créées dans un batch, ensemble ou pas du tout. 5 requêtes.

**Déplacer un contenu — NORMATIF (v2.36).** `{ serieId | null, position?, angle? }` : vers
une autre série, à la position donnée — en dernier par défaut —, à un autre rang de la
sienne — il y reste à sa place par défaut —, ou hors de toute série (`null`). Seuls changent
sa série, son rang, et son angle s'il est donné : l'angle est relatif à la série ; absent, il
reste tel quel ; `null` l'efface. La fiche, les notes, le brouillon, l'analyse, l'atelier,
les relectures et le fil restent ceux du contenu.

- Un contenu **publié** ne se déplace pas (409) : sa série fait partie de l'historique de
  publication. Dans sa série, son rang suit les autres : les rangs restent continus.
- La série quittée et celle d'arrivée se renumérotent dans le **même batch** que le
  déplacement et que son geste (§13.6) : tout passe, ou rien. Une série vidée reste.
- Série introuvable (404), position hors de 1 à n + 1 (400, avec la plage) ; rien ne change
  — ni place, ni angle — : rien n'est écrit (`inchange`). Seul l'angle change : il s'écrit,
  sans geste.
- La réponse rend le contenu, la phrase du geste, et les deux séries telles qu'elles sont
  après. Au plus 10 requêtes, quel que soit le nombre de publications.

**Réordonner une série — NORMATIF (v2.36).** `{ ids }` : l'ordre COMPLET de ses contenus.
Une liste qui en oublie, en ajoute ou en double est refusée (409) avec la liste attendue,
numérotée, identifiants compris. Aucun geste : aucun contenu ne change de série. 4 requêtes ;
le nouvel ordre s'écrit en une (`json_each` : un seul paramètre, quelle que soit la longueur
de la liste).

Dans la console, la fiche — l'Ouverture — porte le choix de la série, de la position et de
l'angle ; le plan d'une série monte et descend chaque publication par des flèches, qui se
prennent au clavier et au lecteur d'écran.

**Supprimer une série pose une question, et le défaut est le geste sûr — NORMATIF.**

`contenus=detacher` (le DÉFAUT, appliqué quand le paramètre est absent) laisse les
publications vivre : elles perdent leur rattachement **et leur rang**, rien d'autre. Un
rang qui désigne une place dans une progression disparue n'en est pas un. Leur `angle`
reste : c'est de la matière éditoriale, pas de la structure.

`contenus=supprimer` les emporte avec la série. C'est le cas où la série entière était
une fausse piste ; sans ce mode, il fallait supprimer les publications une par une avant
de pouvoir atteindre la série.

**Le contenu pilier n'est JAMAIS emporté.** Il n'a pas de `serie_id` — il préexiste à la
série qu'il a fait naître (§6.3). Une déclinaison ratée ne détruit pas l'article dont
elle est partie, et l'écran le dit avant de demander confirmation.

Les deux modes tiennent en **2 requêtes**, dans un batch : la série et ses publications
tombent ensemble ou pas du tout. La réponse compte les deux séparément
(`detachedContents`, `deletedContents`), l'un des deux valant toujours zéro.

### 3.4 Modèles IA

```
GET    /api/models
POST   /api/models
PATCH  /api/models/:id
DELETE /api/models/:id

GET    /api/models/catalogue              l'explorateur, liste OpenRouter (§5.6)
GET    /api/models/catalogue/anthropic    la liste du compte Anthropic (§5.6, v2.35)
GET    /api/models/catalogue/onemin       la liste de 1min.ai, au mieux (§5.6, v2.35)
GET    /api/models/veille                 les nouvelles versions trouvées (§5.7, v2.35)
POST   /api/models/veille/lancer          « Vérifier maintenant »
POST   /api/models/veille/ignorer         { id }

GET    /api/settings/actions              → { actions, familles }
PUT    /api/settings/familles/:famille    { modelId | null }   (v2.35)
PUT    /api/settings/actions/:action      { modelId | null }
```

**Quel modèle sert une action — NORMATIF (v2.35).** Dans cet ordre : le réglage propre
de l'action (`action_model:<ACTION>`), sinon celui de sa **famille d'attendu**
(`famille_model:<famille>`), sinon le modèle choisi en haut de l'application. Neuf
réglages par action demandaient de connaître neuf actions pour en régler une ; les quatre
familles du flux — `juger`, `recopie`, `synthèse`, `voix` — disent ce qu'on demande
vraiment au modèle, et c'est là que se décide où mettre l'argent. Réglages → Modèles par
famille montre les familles d'abord ; le réglage d'une action à part reste possible,
replié, et une action qui s'écarte de sa famille se dit sous elle, avec de quoi la
ramener.

Une cinquième famille, `illustrer`, ne porte aucune action du flux : elle désigne le
modèle d'image par défaut de l'illustration d'un Reel (§12.3), et du visuel d'un post ou
d'une slide depuis son prompt d'image (v2.37, §13.9). **Un réglage de texte ne désigne
qu'un modèle de texte, celui d'Illustrer qu'un modèle d'image** — le Worker refuse le
reste en 409, et le menu ne le propose pas.

### 3.5 IA

```
POST   /api/ai/chat                 { modelId, system?, messages[], json? } → { text, modelLabel }
POST   /api/ai/test                 { apiCode, provider } → sonde un code, §5.4
```

Le Worker résout `modelId` en ligne de la table `ai_models`, choisit l'adaptateur d'après
`provider`, et appelle le fournisseur. **Le front ne connaît aucun fournisseur.**

**Au moins un message doit porter du CONTENU — NORMATIF.** Pas seulement exister. Une
conversation d'un unique tour vide passait la frontière et arrivait chez le fournisseur,
qui l'écartait et se retrouvait avec zéro message : « messages: at least one message is
required », renvoyé de trois couches plus loin et en anglais.

Trois actions étaient dans ce cas — Ajustement du texte, Slides du carrousel, Prompts
d'image — parce que toute leur matière tient dans le prompt système. 1min.ai ne l'avait
jamais signalé : il aplatit la conversation en un prompt unique, où un tour vide ne se
voit pas. Le défaut n'est apparu qu'en changeant de fournisseur.

Ces actions envoient donc un tour qui NOMME LA TÂCHE — « Applique l'ajustement
demandé. » — sans porter de consigne, comme le « Relis ce contenu. » du Lecteur froid le
faisait déjà. Et le schéma refuse le reste ici, en français, plutôt que de laisser un
tiers le diagnostiquer.

### 3.5.1 Ce que l'écran montre d'un appel IA — NORMATIF

Un aller-retour avec le fournisseur est **visible tant qu'il dure**, dans un bandeau qui
nomme l'action, le persona, le modèle et le temps écoulé. Sans lui, un appel devient
invisible dès que le bouton qui l'a déclenché disparaît — c'est exactement ce qui se
passe au « Go Éditeur » : la validation retire le bouton, la rédaction part, et l'écran
ne montre plus rien. « Il ne s'est rien passé » était une lecture correcte de l'écran.

Le modèle y figure parce qu'on change de fournisseur et qu'on doute de son choix :
savoir qu'« il se passe quelque chose » ne répond pas à la question posée.

**Le témoin se pose dans `aiService.generateContent`, pas chez l'appelant.** Il vivait
dans `callAI`, passage unique des appels **de l'éditeur** — ce qui laissait muets
l'Analyste, l'Éclateur et le découpage de sous-titres, qui ne passent pas par là. Le
raisonnement du signalement d'échec vaut mot pour mot ici : sept appelants qui doivent
chacun penser à afficher, c'est sept occasions d'oublier. `callAI` ne sert plus qu'à
traduire l'identifiant d'action en libellé.

**Le bandeau vit dans la coque de l'application**, sous l'en-tête, et non dans l'écran qui
déclenche. Un appel lancé depuis l'atelier reste donc visible quand on revient à la
liste — et il l'est aussi depuis Réglages ou Sous-titres, d'où partent des appels que
l'éditeur n'a jamais vus.

**Ce qui attend porte une barre — NORMATIF.** Aucun aller-retour ne se signale par un
rond qui tourne seul : chaque témoin d'attente porte une barre de progression, et chaque
bouton qui travaille NOMME son travail (« Rédaction… »), jamais « ... ». Trois formes
distinctes suffisent, définies une fois dans `components/Feedback.tsx` — `Barre`,
`EnCours` (dans un bouton), `Patience` (un panneau entier) — et le registre
`services/activityService.ts` dit ce qui tourne.

La barre **remplit quand on sait, balaie quand on ne sait pas**. Un appel IA ne se compte
pas : son échéance est estimée d'après la médiane des appels comparables déjà mesurés
(même action, même modèle), gardés en local. Sous deux mesures, il n'y a pas d'habitude
et la barre balaie. La progression estimée s'approche de 100 % **sans jamais l'atteindre**
— une barre pleine avant la réponse est un mensonge qu'on ne peut plus rattraper. Passé
deux fois et demie l'échéance attendue, le bandeau le dit : c'est le seul moment où
l'écran sait distinguer « ça travaille » de « c'est bloqué ».

**La synchronisation ne bloque plus l'écran.** Elle posait un voile sur toute la fenêtre,
y compris celle qui part seule au démarrage : elle ne réclame rien, donc elle n'interdit
rien. Elle se nomme dans le bandeau, comme le reste. Seule la première lecture du cache
occupe encore l'écran, faute d'avoir quoi que ce soit à montrer derrière.

**Aucun résultat d'IA n'est écarté avant de savoir si la suite a abouti.** Le rapport du
Lecteur froid partait dès le clic sur « Appliquer les corrections », sans attendre : un
échec côté fournisseur laissait une erreur à l'écran et plus rien pour réessayer — les
problèmes relevés et les corrections proposées étaient perdus, et c'était la seule copie
sous les yeux. Ce qui déclenche une action IA doit donc en recevoir le verdict.

**Tout échec d'appel IA s'annonce, et de la même façon — NORMATIF.** Le signalement vit
dans `aiService.generateContent`, par où passent les sept appelants de l'application ;
l'application s'y abonne et rend un message unique : « Échec — {action} », suivi du texte
du fournisseur, mot pour mot.

Pourquoi là et pas chez les appelants : le 24/08/2026, une « Lecture froide » a échoué
faute de crédits et **rien** ne s'est affiché — l'appelant avalait l'erreur pour ne pas
bloquer la rédaction, ce qui était un bon réflexe pour la rédaction et un mauvais pour
Florent. Sept appelants qui doivent chacun penser à afficher, c'est sept occasions
d'oublier ; un seul passage obligé, c'est zéro.

L'erreur est **marquée** au passage. Un appelant sait donc qu'elle est déjà annoncée et
n'en fait pas une seconde présentation ; ce qu'il montre encore lui-même, c'est ce qui a
cassé APRÈS la réponse — un parsing, une écriture. Une exception assumée : l'atelier du
Coach garde en plus sa trace dans la conversation, parce qu'une fois le message refermé,
un tour sans réponse ressemblerait à un tour qui charge encore.

### 3.5.2 La relecture à froid ne tourne pas en rond — NORMATIF

Le Lecteur froid est **sans mémoire du contenu**, et ça ne change pas : il doit lire avec
les yeux d'un inconnu, sinon il ne sert à rien. Mais sans mémoire **de ses propres
demandes**, il condamne à la passe N+1 la phrase qu'il a dictée à la passe N.

Ce n'est pas une hypothèse. Le 24/08/2026, le carrousel « Le masque qu'on recoud » a été
relu quatre fois sans jamais sortir de « À retoucher » :

| passe | ce qu'il dicte / ce qu'il condamne |
|---|---|
| 2 | dicte slide 5 : « on ne saute pas la salle pour aller au balcon » |
| 3 | condamne : « géographie incohérente sur 4 lieux » ; dicte : « on ne passe pas la scène par-dessus pour filer aux coulisses » |
| 4 | condamne : « la métaphore tourne à vide, je relis deux fois et je ne sais toujours pas ce que ça veut dire » |

Une phrase écrite par un critique pour cocher une case est rarement une bonne phrase en
contexte : il la relit à froid, elle ne passe pas, il en dicte une autre. Rien n'arrête
ça. **Quatre règles y mettent fin.**

**1. La relecture connaît ses passes précédentes.** Les corrections qu'elle a dictées ET
qui ont été appliquées lui reviennent, dans l'ordre, avec la règle qui va avec : une
phrase qu'elle a elle-même écrite ne se rejette que si elle peut dire **en quoi elle est
pire que ce qu'elle remplaçait**. Un point déjà obtenu ne se rouvre pas sous un autre nom.

L'historique s'arrête à la **dernière rédaction complète** : au-delà, les corrections
parlent d'un texte qui n'existe plus, et les annoncer comme présentes serait faux. Il se
reconstruit depuis le journal (§2.6) ; l'en-tête `COLD_READ_APPLY_PREFIX` est ce qui rend
une ligne d'ajustement reconnaissable, d'où la constante partagée plutôt que deux chaînes
recopiées.

**2. « Rien à signaler » est une réponse valide.** Le persona demandait d'être dur et « un
problème signalé = une correction proposée » ; le schéma exigeait `problemes` et
`controles` ; et le verdict était défini **en négatif sur ce champ-là** — « Publiable si
aucun problème Bloquant ou Important ». On demandait à un critique de produire des
reproches, puis on conditionnait la sortie à ce qu'il n'en produise pas. Une liste vide
est désormais explicitement attendue quand le contenu tient.

**3. La retouche reçoit la grille qui a produit le contenu.** `formatTemplate` et
`objectifCta` n'arrivaient que dans `DRAFT_CONTENT` : le Rédacteur retouchait donc sans
les limites qui avaient gouverné sa propre production, et sans les règles CTA que la
relecture, elle, vérifiait. Deux mètres pour la même règle, et une slide repassée
au-dessus de la limite à chaque retouche.

**4. Ce qui se compte se compte dans le code, pas dans le prompt.** Le garde-fou
déterministe des longueurs ne tournait qu'après une rédaction complète. Une retouche
pouvait donc repasser une slide au-dessus de la limite sans que rien ne le voie — c'est
arrivé à un caractère près (« slide 6 = 141 caractères »), sur une correction que le
Lecteur froid avait lui-même annoncée à « 137 car. ». Il tourne aussi après un ajustement,
et la relecture n'annonce plus aucun décompte pour les corrections qu'elle propose : un
décompte faux rend le vrai inutile.

**La légende d'un carrousel est arbitrée.** « La légende ne répète pas les slides » était
KO aux quatre passes, sans jamais être réparable : la grille demande une légende qui
prolonge le propos dans la voix de Florent, donc elle reprend la métaphore. Les deux
côtés disent maintenant la même chose — la légende porte ce que les slides ne peuvent pas
porter (un exemple anonymisé, ce que ça change), reprendre la métaphore centrale n'est pas
un doublon, et seule une phrase entière recopiée qui n'ajoute rien se signale.

### 3.6 Budget de requêtes (contrainte du plan gratuit)

Maximum **50 requêtes D1 par invocation**. Conséquences normatives :

- Interdiction du N+1. Une série et ses contenus se lisent par **une** jointure.
- `POST /api/contents/batch` utilise `db.batch()` — un aller-retour, pas N.
- Toute route nouvelle doit pouvoir énoncer son nombre de requêtes, borné et indépendant
  du volume de données.

### 3.8 Prise de rendez-vous Calendly — NORMATIF

> **v3.0** : la réservation arrive dans gestion (§14). Cet écran reste en service, tel quel,
> jusqu'à la bascule ; il disparaît alors, avec `CALENDLY_TOKEN`. Le « ni un agenda, ni un
> CRM » ci-dessous valait pour lui : il ne vaut plus pour gestion.

`GET /api/rdv/types` · `GET|PUT /api/rdv/selection` · `GET /api/rdv/creneaux` · `POST
/api/rdv`. **Une requête D1, et seulement sur `/selection`** : le reste ne parle qu'à
Calendly.

**Pourquoi elle existe, et pourquoi elle n'existe que pour ça.** Depuis le milieu de
l'année 2026, Calendly demande à l'invité de confirmer son numéro par SMS avant de lui
envoyer le moindre rappel. Quand l'invité réserve lui-même, il confirme ; quand le
rendez-vous est posé pour lui — au téléphone, en fin de séance — personne n'est là pour
répondre, et **aucun rappel ne part**. La Scheduling API accepte, elle, un numéro fourni
par le compte (`text_reminder_number`) : le titulaire du compte atteste du consentement,
comme le fait déjà le panneau « Réserver une réunion » de l'administration Calendly.

Ce n'est donc pas un agenda, ni un CRM. C'est un raccourci qui remplace quatre écrans de
l'administration Calendly, et **le numéro est sa seule raison d'être**.

- Le jeton vit dans `CALENDLY_TOKEN`, secret du Worker, portée
  `scheduled_events:write`. **Facultatif** : absent, l'écran se tait en disant ce qui
  lui manque (`Refus` 409), et rien d'autre dans l'application ne bouge.
- Un refus de Calendly revient avec **son** message (`Refus`, 4xx) : « ce créneau n'est
  plus disponible » se corrige, « Erreur interne » ne se corrige pas.
- Le numéro est normalisé en E.164 avant l'appel ; un numéro incompréhensible est refusé
  **avant** d'appeler Calendly.
- L'écran rend le numéro **retenu par Calendly**, pas celui qui a été envoyé : sur la
  seule promesse de la fonctionnalité, « envoyé » ne vaut pas « accepté ».
- **Le lieu se transmet en entier.** Un 400 en production l'a appris :
  `location.location is required when location.kind is 'outbound_call', 'ask_invitee',
  'physical' or 'custom'`. Le `kind` voyage donc avec le TEXTE du lieu, pré-rempli
  depuis le type d'événement et corrigeable à l'écran ; pour un appel sortant, le numéro
  de l'invité sert de repli. Un type qui déclare plusieurs lieux — visio ou appel
  sortant — les propose tous, puisque c'est l'invité qui trancherait d'ordinaire.
- **Le formulaire d'invité se remplit ici.** Second 400 : « Required Questions and
  Answers cannot be blank ». Les questions du type sont donc remontées avec lui et
  posées à l'écran ; une question à choix unique qui n'a qu'une réponse possible — les
  conditions d'annulation — se coche d'elle-même. `position` voyage avec chaque réponse :
  c'est elle, et non l'intitulé, qui rattache une réponse à sa question. Une réponse
  vide n'est jamais envoyée : elle ferait refuser la liste entière.
- **Le lieu final est relu sur l'événement créé.** La réponse de création ne porte pas
  l'URL de visioconférence ; un appel de plus la rapporte, et l'écran affiche le lien
  Google Meet — ou son absence, qui est l'information utile quand la séance est à
  distance. Cette relecture ne peut pas faire échouer une réservation déjà acquise.

#### Deux façons de lister les créneaux, et pourquoi la seconde existe

Le mode normal interroge `event_type_available_times`, donc **ce que Calendly publie** :
délai minimum et horizon de réservation compris. Relevé sur « Séance » au 22/09/2026 :
48 h de délai, horizon glissant de 21 jours.

Ces deux garde-fous protègent la page publique. Ils n'ont aucun sens quand c'est le
praticien qui pose le rendez-vous, au téléphone, pour demain ou pour dans deux mois. Le
mode `libre=1` recompose donc les créneaux à partir de deux sources publiques — le
planning de disponibilité et les plages occupées — et **ignore les deux**. Calendly
lui-même offre l'équivalent dans son administration (« Remplacer les heures de
disponibilité »).

Ce que ce mode ne sait pas faire, et qui doit rester écrit : c'est le planning **par
défaut** qui sert, l'API v2 ne disant pas quel planning suit un type d'événement ; les
tampons avant et après ne sont pas appliqués ; le pas vaut la durée de l'événement. Il
**propose**, il ne garantit pas — Calendly reste seul juge au moment de créer, et son
refus s'affiche tel quel.

Les deux modes couvrent **trois mois**, découpés en tranches de sept jours (le plafond
de Calendly, disponibilités comme occupations) et envoyés par paquets de quatre : treize
requêtes d'un coup sont une limite de débit assurée.

#### Ce que l'écran affiche

Les types retenus vivent dans `app_settings` sous `rdv:types` et s'affichent en boutons
radio, tous visibles. **Une sélection vide veut dire « tous »** : c'est l'état d'un
déploiement neuf, et un écran qui ne proposerait rien s'y lirait comme une panne.

#### Dépendance externe, hors du code

Le numéro enregistré ne sert qu'à ce que Calendly décide d'envoyer. Deux familles de
réglages s'en chargent, et elles s'ajoutent : les **notifications du type d'événement**
(Notifications et annulation) et les **workflows**.

Relevé le 22/09/2026 sur « Séance » : le rappel SMS à l'invité est **actif**, un jour
avant, avec un corps personnalisé ; le rappel e-mail l'est aussi, trois jours avant ; un
workflow ajoute un e-mail à sept jours. Attention à la lecture : ces réglages vivent
dans les notifications **personnalisées** du type, et les gabarits par défaut
apparaissent alors désactivés — les confondre fait conclure à l'inverse de la réalité.

### 3.9 Transcription d'une prise

`POST /api/transcription` — le son d'une prise vidéo, en WAV base64, rend ses mots
horodatés. Workers AI, 0 requête D1. Voir §12.5.

### 3.10 Montage d'un Reel expliqué

```
GET    /api/montage                                  le résumé de tous les montages (1 batch)
GET    /api/montage/:id                              prises, visuels, espace occupé (1 batch)
POST   /api/montage/:id/prises/:role                 déclare une prise, ouvre son envoi (5)
PUT    /api/montage/:id/prises/:role/parties/:n      une partie, 50 Mo au plus (1)
POST   /api/montage/:id/prises/:role/terminer        ferme l'envoi (2)
DELETE /api/montage/:id/prises/:role/envoi           abandonne un envoi raté (2)
GET    /api/montage/:id/prises/:role/fichier         le fichier, en flux (1)
PATCH  /api/montage/:id/prises/:role                 transcription, repères, choix, réglages (2)
DELETE /api/montage/:id/prises/:role                 retire la prise et son fichier (2)
PUT    /api/montage/:id/visuels/:seq/:el             l'image d'une carte, 15 Mo au plus (4)
GET    /api/montage/:id/visuels/:seq/:el             (1)
DELETE /api/montage/:id/visuels/:seq/:el             (2)
POST   /api/montage/:id/exports                      note un export réussi (2)
```

`:role` vaut `principale` ou `accroche`. Entre parenthèses, le nombre de requêtes D1.
Voir §12.4.2 et §12.4.3.

### 3.7 Ce qu'une liste retient — NORMATIF

> **Depuis la v2.19 (§13.8), aucun écran ne s'en sert.** Les listes de Contenus ne sont
> plus des tableaux triables : Conversations range par série puis par avancement, Idées
> par date, Publiés par date de publication. Les routes `/api/settings/vues` restent, et
> ce qui suit décrit leur contrat ; le jour où une liste retrouvera un tri, c'est ici
> qu'il se retiendra.

**Le tri et le filtre d'une liste vivent sur le compte, pas dans le navigateur.**
`app_settings`, sous `vue:<liste>` — la même table que les clés et les modèles par
action, une ligne par liste, sa valeur en JSON `{tri, sens, filtre}`.

Deux routes, une requête chacune : `GET /api/settings/vues` rend toutes les listes d'un
coup, `PUT /api/settings/vues/:vue` en pose une. Une liste absente n'a jamais été triée.

Pourquoi pas `localStorage` : un tri qu'il faut refaire à chaque poste n'est pas un
réglage, c'est une corvée qui revient. Et il ne tenait même pas d'un onglet à l'autre —
l'état vivait dans `ContentTable`, donc il repartait à zéro à chaque montage.

**La colonne n'est PAS validée contre une énumération côté Worker.** Les colonnes
appartiennent à l'écran et bougent avec lui ; un réglage qui en désigne une disparue doit
retomber sur le tri par défaut, pas faire échouer l'écriture suivante. Le Worker garde la
forme (`sens` vaut `asc` ou `desc`, les chaînes sont bornées), le front valide `tri`
contre ses propres colonnes. Une valeur illisible en base est ignorée **sans emporter les
autres listes**.

**L'écran suit tout de suite, la base rattrape après.** Un échec d'écriture ne s'affiche
pas : le tri reste appliqué pour la session, seule sa mémoire est perdue. C'est la seule
exception assumée à « un échec se voit » — un bandeau pour un clic sur un en-tête
coûterait plus d'attention que le réglage n'en vaut.

**Le tri est piloté, jamais local.** `ContentTable` et `SeriesView` reçoivent `tri` et
`onTri` ; le clic ne décide de rien, il demande. La règle du clic — même colonne, on
inverse ; autre colonne, on repart en croissant — et l'en-tête cliquable vivent dans
`components/TriTableau.tsx`, seule autorité. Elles étaient enfermées dans `ContentTable`,
où les Séries ne pouvaient pas les atteindre : leur tableau n'avait donc aucun tri.

Cinq listes en retiennent un : `ideas`, `drafts`, `ready`, `archive`, `series`. Le filtre
n'existe aujourd'hui que sur la boîte à idées ; le réglage le porte pour toutes, prêt pour
celles qui en auront un.

---

## 4. `packages/editorial` — NORMATIF

Le cœur du produit. **Zéro dépendance.** Contient, repris tel quel de l'existant :

| Module | Rôle |
| :--- | :--- |
| `prompts/` | les personas (Analyste, Interviewer, Coach, Verrouilleur, Rédacteur, Lecteur froid, Artiste, Éclateur) et `buildSystemPrompt()` |
| `voice.ts` | `VOICE_RULES` — règles de voix transverses. **Engendré** depuis `packages/corpus/content/voix/regles-de-voix.md` par `npm run embarquer` ; gitignoré. |
| `formats.ts` | `FORMAT_REGISTRY` — source unique de vérité du routage par format |
| `objectives.ts` | `OBJECTIF_REGISTRY` — guidance Analyste + règles CTA |
| `actions.ts` | composition des instructions système par action |
| `executors.ts` | parsing défensif des réponses IA |
| `reelExplique.ts` | la forme du Reel expliqué et ses contrôles déterministes (§12.3) |

### 4.1 Invariants

1. **Aucun appel réseau.** Ce package compose des chaînes et parse des chaînes.
2. **`FORMAT_REGISTRY` est la seule autorité** sur : où stocker le résultat
   (`storageField`), où atterrir après rédaction (`editorTab`), qui a droit à la relecture
   à froid (`supportsColdRead`). Aucun test de format en dur ailleurs.
3. **Toute modification d'un prompt exige une fixture golden** mise à jour (§10.2).
4. Le format cible d'un contenu est **choisi par l'humain** et n'est jamais écrasé par l'IA.

---

## 5. `packages/ai` — abstraction fournisseur — NORMATIF

### 5.1 Le problème

`oneMinService.ts` est taillé pour 1min.ai, dont l'API n'est pas standard : conversations
créées séparément, historique aplati à la main dans un prompt unique
(`buildConversationPrompt`). Changer de fournisseur demanderait aujourd'hui de réécrire
tous les points d'appel.

### 5.2 Le port

```ts
export interface ChatMessage { role: 'user' | 'assistant'; content: string }

export interface ChatRequest {
  model: string;              // identifiant opaque, propre au fournisseur
  system?: string;
  messages: ChatMessage[];
  json?: boolean;             // exiger une sortie JSON stricte quand le fournisseur sait le faire
}

export interface ChatResult { text: string; raw?: unknown }

export interface AIProvider {
  readonly id: string;                                   // 'onemin' | 'openai' | 'anthropic'
  chat(req: ChatRequest): Promise<ChatResult>;
  test(model: string): Promise<{ ok: boolean; detail?: string }>;
}
```

Le port est **volontairement étroit** : pas de streaming, pas d'outils, pas de multimodal.
Le produit n'en a pas besoin, et chaque capacité ajoutée est une capacité à réimplémenter
pour chaque fournisseur.

**Une reprise, et une seule — NORMATIF.** Les adaptateurs rejouent un appel qui a
échoué de façon PASSAGÈRE : 408, 409, 425, 429, 5xx, ou un transport qui lâche sans
réponse. Tout le reste — 401, 402, 404, 422, et les refus métier rendus dans un 200,
comme le manque de crédits chez 1min.ai — est un refus **motivé** : le rejouer ne
changerait rien et retarderait un message déjà clair.

Une seule reprise, parce qu'un appel de rédaction dure déjà des dizaines de secondes et
qu'une génération peut avoir abouti côté fournisseur avant que sa réponse se perde —
chaque tentative supplémentaire est facturée. Deux essais couvrent le hoquet ; au-delà,
c'est une panne, et mieux vaut le dire.

Elle est née d'un fait : le 23/08/2026, un « Go Éditeur » a échoué puis fonctionné à
l'identique la fois suivante. Aucune reprise n'existait nulle part.

### 5.3 Deux notions distinctes de « fournisseur »

Aujourd'hui la colonne `provider` sert à grouper l'affichage (« OpenAI », « Anthropic »).
Dans le modèle cible, deux colonnes :

| Colonne | Rôle | Exemple |
| :--- | :--- | :--- |
| `provider` | **quel adaptateur appeler** | `onemin` |
| `vendor` | qui a fabriqué le modèle, pour l'affichage | `OpenAI` |

Un même modèle peut ainsi être joignable via 1min.ai aujourd'hui et en direct demain :
on change une valeur dans la table, pas une ligne de code.

**La sortie d'un modèle (v2.35, migration 0014).** `ai_models.sortie` vaut `texte` ou
`image`. Les trois modèles d'image de l'illustration (§12.3) étaient écrits en dur dans
`packages/editorial` : ni visibles dans Réglages, ni modifiables, et l'on ne savait pas par
où ils passaient. Ils sont devenus des lignes du catalogue, amorcées par la migration.
Les deux sorties ne se croisent jamais : `/api/ai/chat` refuse un modèle d'image,
`/api/ai/image` un modèle de texte — et un modèle d'image dont l'adaptateur n'est pas
`openrouter`, le seul qui sache rendre une image.

Adaptateurs disponibles : `onemin`, `openai`, `openrouter`, `anthropic`. Le
troisième n'est qu'une URL de base posée sur le second — OpenRouter expose l'API
`/chat/completions` d'OpenAI. C'est la démonstration que le port tient : un
fournisseur de plus n'a obligé à réimplémenter personne.

`anthropic` (v2.33) appelle l'API Messages d'Anthropic en direct, avec une clé de la
Console (`ANTHROPIC_API_KEY`, ou Réglages → Fournisseurs). Raison d'être : les crédits
API mensuels de l'offre Max ne se dépensent qu'avec une clé de l'organisation Console
liée à l'abonnement. Ce qui le distingue, et que l'appelant ne voit pas :

- **un plafond de réponse obligatoire**, 32 000 jetons réflexion comprise. Une réponse
  qui l'atteint, ou que Claude décline (`stop_reason: refusal`), est une erreur
  motivée — jamais un texte tronqué rendu pour entier, jamais une reprise ;
- **aucun prix déclaré** : `cost_usd` reste nul, les jetons sont comptés (§2.6) ;
- **`json` s'en remet au prompt** : la sortie JSON stricte d'Anthropic exige un
  schéma, que le port ne porte pas ;
- **un tour vide est écarté** dans l'adaptateur : l'API le refuse, le schéma de
  l'application l'admet pourvu qu'un autre tour porte du contenu (§3.5) ;
- **529** (`overloaded_error`) est un échec passager, comme tout 5xx (§5.2).

### 5.4 Le testeur

`POST /api/ai/test` avec `{ apiCode, provider }` appelle `provider.test(apiCode)`.

Il porte sur un **code**, pas sur un modèle du catalogue : au moment du test, le modèle
n'existe pas encore — c'est précisément ce qu'on cherche à valider. Le test est devenu
générique, c'est l'adaptateur qui sait comment sonder son API au coût le plus bas.

### 5.5 Où vivent les clés — NORMATIF

Une clé de fournisseur peut être posée de deux façons :

| Origine | Pose | Priorité |
| :--- | :--- | :--- |
| `app_settings`, sous `provider_key:<adaptateur>` | Réglages → Clés | **l'emporte** |
| Variable d'environnement (`ONE_MIN_API_KEY`…) | `wrangler secret put` | repli |

**L'invariant reste le même, et c'est lui qui compte : une clé n'a aucun chemin
de retour vers le navigateur.** Elle entre par `PUT /api/settings/providers/:id`,
sert aux appels, s'efface par `DELETE` — mais aucune route ne la relit. La liste
ne rend qu'une empreinte de quatre caractères et l'origine de la clé : assez pour
reconnaître laquelle est posée, trop peu pour s'en servir.

Deux conséquences non négociables :

1. **L'export (§9.4) exclut ces lignes.** Une sauvegarde se range dans un
   dossier, s'envoie par mail, se pose sur un disque externe. Y glisser des
   identifiants d'API en ferait un secret de plus à protéger.
2. **Le repli sur l'environnement est conservé.** Un déploiement qui pose ses
   secrets avec `wrangler secret put` continue de fonctionner sans que personne
   touche à l'interface.

Ce que ce choix coûte, dit franchement : une clé en base est lisible par qui
peut interroger la base, là où un secret Cloudflare ne l'est par personne, pas
même par l'application. Le gain est l'autonomie — changer de fournisseur ne
demande plus la ligne de commande ni un redéploiement.

### 5.6 L'explorateur de catalogue

`GET /api/models/catalogue` croise **trois** appels sortants. Cache d'une heure,
clé de cache versionnée : les quotas d'OpenRouter sont de 30 requêtes/minute et
500/jour, et un déploiement qui change la forme de la réponse ne doit pas servir
l'ancienne une heure de plus. Ce croisement est la **référence** de l'explorateur :
les deux autres listes (ci-dessous) y prennent leurs prix et leurs notes.

| Source | Clé | Ce qu'elle apporte |
| :--- | :--- | :--- |
| OpenRouter `/models` | non | prix, contexte, code exact |
| OpenRouter `/benchmarks` | oui | indices d'Artificial Analysis |
| EQ-Bench *Creative Writing* | non | Elo, note d'écriture, tournures d'IA, profil par critère |

**Ce que les indices d'Artificial Analysis ne mesurent pas.** Les `task_type`
publiés sont `coding`, `intelligence`, `agentic`, `search`. Aucune tâche du flux
éditorial n'est là-dedans : ni juger avec constance, ni recopier un JSON sans
l'abîmer, ni écrire du français incarné sous contrainte de voix. Ils restent
utiles à la famille *Synthétiser*, et à rien d'autre.

**Pourquoi EQ-Bench.** Il juge de la prose, et trois de ses quinze critères
redisent mot pour mot les règles de voix du §3 : *Show-Don't-Tell*, *Avoids
Purple Prose*, *Avoids Positivity Bias*. Son `slop_score` — la densité de
formules toutes faites — est l'exact anti-pattern que les personas combattent,
et c'est la mesure la plus discriminante du jeu (de 6 à 63).

**Ses limites, à dire à l'écran.** Ce n'est pas une API publiée : ce sont les
fichiers que sa page de classement charge, et leur forme peut changer sans
préavis. Il juge de la fiction, en anglais : c'est un **indice** de la voix de
Florent, pas une mesure. La route l'entoure donc en conséquence — son absence
vide les colonnes d'écriture, bascule l'écran sur le catalogue entier, en dit la
raison, et n'emporte rien d'autre.

**La clé OpenRouter ne part qu'à OpenRouter — NORMATIF.** EQ-Bench est une
source tierce ajoutée après coup ; aucun appel sortant vers un autre hôte ne
porte d'en-tête d'autorisation. Le §7 s'applique ici sans exception — et à chaque
clé : celle d'Anthropic ne part qu'à Anthropic, celle de 1min.ai qu'à 1min.ai.

#### Une liste par adaptateur (v2.35)

L'explorateur a un onglet par adaptateur qui sait lister ses modèles. Le code affiché
est celui que CET adaptateur attend, et « Ajouter » pose l'adaptateur de l'onglet : un
code d'Anthropic enregistré sur OpenRouter partirait chez un fournisseur qui ne le
connaît pas. Les listes vivent dans `workers/api/src/sources-modeles.ts`, que la veille
(§5.7) lit aussi.

| Onglet | Source | Clé |
| :--- | :--- | :--- |
| OpenRouter | `/api/v1/models` — texte **et image** | non |
| Anthropic | `GET /v1/models`, toutes les pages (cinq au plus) | **oui** : la liste est celle du compte |
| 1min.ai | `GET /models?feature=UNIFY_CHAT_WITH_AI` | envoyée si posée |

- **Anthropic sans clé, ou clé refusée** : un refus (409) qui dit où la poser, sans
  appel sortant dans le premier cas.
- **1min.ai ne documente aucune liste.** Celle-ci est l'adresse que son propre site
  interroge : lue au mieux, comme EQ-Bench. Une forme inattendue se dit à l'écran (502,
  sans trace aux journaux) et n'emporte rien d'autre.
- **Prix et notes viennent de la référence**, par le même nom normalisé que
  l'appariement d'EQ-Bench : `claude-fable-5-20261015` retrouve
  `anthropic/claude-fable-5`. Ils sont donc **indicatifs** hors OpenRouter — 1min.ai
  facture en crédits, Anthropic sur sa propre facture — et l'écran le dit. Un modèle
  sans correspondant reste listé, sans prix ni note ; une référence muette laisse la
  liste entière, sans colonnes.
- **« Déjà là » se juge par adaptateur.** Le même modèle chez 1min.ai n'empêche pas de
  l'ajouter en direct ; « Actualiser » réécrit les mesures de chaque entrée qui le porte,
  quel que soit son adaptateur, et le coût de la seule entrée OpenRouter (règle du prix,
  plus bas).
- **Un modèle d'image** (sortie `image` chez OpenRouter) est ajoutable comme un autre ;
  il arrive au catalogue avec la sortie Image, et n'entre jamais dans la courte liste,
  faute de note d'écriture.

#### La courte liste — NORMATIF

Quatre cents modèles au catalogue, sept utilisés au plus. L'explorateur s'ouvre
donc sur **vingt modèles délibérément différents**, le catalogue entier restant
à un clic. La doctrine vit dans `packages/editorial/src/shortlist.ts`, pas dans
l'écran ni dans la route :

1. **Deux planchers.** Elo ≥ 1400 et slop < 30 : un quota de palier ne justifie
   pas de recommander ce qu'on ne recommanderait pas. Un palier pauvre reste
   incomplet, et ses places sont redistribuées.
2. **L'accès le moins cher d'un même modèle.** Un modèle est publié sous
   plusieurs codes — `:free`, `:batch`, variante datée, déclinaison de taille.
   On n'en garde qu'un, le moins cher ; à prix égal, le meilleur Elo tranche.
   Sans cette étape la liste proposait Inkling à 4,05 $ alors qu'il est gratuit.
3. **Six paliers de prix**, resserrés en bas — entre 0,08 $ et 1 $ l'arbitrage
   est réel, entre 25 $ et 50 $ il ne l'est plus guère.
4. **Trois modèles par fabricant au plus**, et **une seule lignée par ligne** :
   `v4-flash-latest` et `v4-flash-0731` sont le même modèle, `kimi-k2.6` et
   `kimi-k3` ne le sont pas.
5. **Les dominés tombent** — moins bon sur les trois axes sans être moins cher.
   La comparaison est bornée **au palier ET au fabricant**, et ces deux bornes
   portent tout le sens de la règle :
   - le **palier**, parce qu'un modèle gratuit bat sur le papier n'importe quel
     modèle à 0,08 $ tout en étant plafonné en débit — il ne le remplace pas ;
   - le **fabricant**, parce que ces notes mesurent de la fiction en anglais. Un
     écart de deux dixièmes n'y dit rien du français de Florent, et laisser ce
     bruit effacer la maison d'en face coûterait ce qui a le plus de valeur :
     une porte de sortie quand l'une tombe, sature, ou déplaît à la lecture.

   Ce que la règle sait donc dire, et rien de plus : *un fabricant remplace son
   propre modèle*. Opus 5 efface Fable 5 — même maison, moitié prix, meilleur
   sur les trois axes ; il n'efface pas Kimi K3.

Le classement interne pèse l'Elo à 45 %, la note d'écriture à 25 %, l'absence de
tournures d'IA à 30 %.

Au 23/08/2026, ces règles rendent **20 modèles de 11 fabricants**, répartis sur
les six paliers.

L'explorateur sert à **réduire le champ** — jamais à décider. L'écran le dit,
parce qu'un chiffre affiché sans cette phrase se lit comme un verdict.

#### Le profil d'un modèle

« Coût / Crédits », « Qualité rédaction » et « Forces & cas d'usage » se
remplissaient de mémoire, à partir de ce qu'on croyait savoir d'un modèle. Les
mesures existent : elles écrivent ces trois champs, à l'ajout depuis le
catalogue comme au clic sur **Actualiser** pour un modèle déjà posé.

- **Coût** — les mêmes paliers que la courte liste, le gratuit et le micro fondus.
- **Qualité rédaction** — cinq crans sur l'Elo, moins un cran au-delà de 30 de
  slop : un modèle bien classé qui empile les formules toutes faites ne portera
  pas cette voix-là, quoi qu'en dise son rang.
- **Forces** — les forces relatives, les trois mesures, les familles du flux
  auxquelles il convient avec les actions nommées, et **la date du relevé** :
  ces chiffres vieillissent, et un champ rempli sans date se lit comme une
  vérité intemporelle.

**Le prix appartient au fournisseur, l'écriture au modèle — NORMATIF.** Le même
Claude coûte des crédits chez 1min.ai et des dollars par million de jetons chez
OpenRouter. Actualiser un modèle appelé par un AUTRE adaptateur écrit donc la
qualité et les forces, **jamais le coût**, et le texte dit que les tarifs du
fournisseur n'y sont pas repris. La correspondance passe par la même
normalisation que l'appariement des sources : sans elle, `claude-fable-5` et
`anthropic/claude-fable-5` seraient deux modèles étrangers.

### 5.7 La veille des modèles (v2.35)

Florent : « un CRON qui une fois par jour regarde si des nouvelles versions des modèles
que j'utilise sont disponibles ». Un déclencheur planifié (`[triggers]` de
`workers/api/wrangler.toml`, 05:17 UTC) lance `lancerVeille` (`workers/api/src/veille.ts`)
; « Vérifier maintenant » lance le même passage.

**Ce qui est suivi** : les modèles du catalogue, adaptateur par adaptateur. Un adaptateur
qui n'en porte aucun n'est pas lu ; Anthropic sans clé est noté « aucune clé posée ».
`openai` n'a pas de liste.

**Ce qu'est une version plus récente — NORMATIF.** La règle vit dans
`packages/editorial/src/veille.ts`, testée à part. Un code se décompose en un
**squelette** (le code sans ses numéros, préfixe de fabricant compris) et une **version**
(les numéros dans l'ordre : `claude-opus-4-5` → `claude-opus-#`, `[4, 5]`). Tombent
d'abord la date d'un instantané, les suffixes d'instabilité (`-preview`, `-latest`…), la
taille (`70b`, `a22b`) et le palier d'OpenRouter (`:free`). Est proposée, par lignée, la
version publiée la plus haute qui dépasse la plus haute du catalogue. **Une variante
n'est jamais une mise à jour** : `-mini`, `-flash`, `-fast` changent le squelette, et un
« Pro » ne se voit jamais proposer sa déclinaison bon marché.

**Ce qui s'écrit** : `veille_modeles` (migration 0015), une ligne par `provider:api_code`.

- **« Ignorer »** pose `ignore_le` : la proposition ne revient pas le lendemain ; une
  version plus récente encore, si.
- **« Mettre à jour »** ouvre la fiche de la version d'avant, avec le nom et le code de
  la nouvelle. Enregistrée, elle la remplace partout où elle servait : les familles, les
  actions et le défaut désignent un identifiant, pas un code. Une fiche neuve, elle, ne
  servait nulle part tant qu'on n'allait pas la choisir partout. L'historique ne passe
  pas sous la nouvelle version : les mesures regroupent par le nom figé à l'appel (§2.6).
  Une source qui ne publie que des codes (1min.ai) reçoit le nom de la version d'avant,
  son numéro remplacé : « GPT-5.2 Pro » devient « GPT-5.5 Pro » ; sans ce numéro écrit
  tel quel dans le nom, le code reste le nom.
- **« Ajouter au catalogue »**, quand la version d'avant a quitté le catalogue : l'éditeur
  s'ouvre sur une fiche neuve, sur l'adaptateur de la proposition, avec ce qui tient à
  l'usage de l'ancienne — fabricant, coût, qualité, cas d'usage — mais pas ses forces,
  mesurées sur elle.
- Rien n'est effacé : une proposition dont le modèle est au catalogue sur son adaptateur
  cesse de s'afficher, et le passage suivant la retire.
- **Une source muette ne fait taire qu'elle-même** : ses propositions d'hier restent,
  l'état du passage dit pourquoi elle n'a pas été lue, et l'écran le montre. Seule une
  source LUE retire ses propositions dépassées.

**L'écran.** Le rail porte le nombre de propositions sur Réglages, le panneau sur
Modèles IA ; la section les liste en tête du catalogue. Sans proposition, une ligne dit
quand la veille a regardé — une veille muette ressemble à une veille qui n'a rien trouvé.

**Bornes.** 2 lectures, au plus 2 clés et 1 lot d'écriture par passage ; un appel
sortant par source, cinq au plus pour Anthropic. `GET /api/models/veille` : 2 requêtes.

---

## 6. Séries et déclinaisons

### 6.1 Le modèle

Voir §2.5. Une série porte un titre (le sujet), une intention, un statut, et
éventuellement un contenu source.

### 6.2 L'Éclateur (persona)

Action `PLAN_SERIES`. Reçoit soit le thème et l'intention, soit le texte du contenu
source, et renvoie un plan de publication :

```json
[{ "titre": "…", "angle": "…", "format": "Post Texte (Court)",
   "objectif": "Recadrage de croyance", "justification": "…", "notes": "…" }]
```

L'ordre du tableau EST la progression (§2.9) : la création en lot y lit le rang.

`notes` porte **la matière** de la publication — ce qu'elle doit contenir, prélevé du
pilier ou du thème. Elle alimente `contents.notes`, celle-là même que Florent écrirait à
la main. Sans elle, une publication de série naît avec un titre et rien d'autre, et tout
est à reconstruire.

**Le format est RÉSOLU, jamais comparé à l'identique — NORMATIF.** `resoudreFormat`
ramène la désignation à une forme comparable (minuscules, sans accents ni ponctuation),
accepte les clés courtes du registre, et rattrape un mot décisif isolé — « Reel »,
« Carrousel », « Newsletter ».

La comparaison était une égalité stricte de chaîne, accents et parenthèses compris. Le
24/08/2026, un plan est arrivé avec des publications sans format alors que l'Éclateur en
avait clairement désigné un : son intention était jetée en silence. Le prompt y contribue
— deux lignes après avoir exigé « la valeur EXACTE », il abrège lui-même en « Post
Texte », « Carrousel », « Script Vidéo ».

La résolution s'arrête où commence la devinette : « Vidéo » seul ne départage pas le Reel
du Youtube, et rend `null`. Choisir à la place de Florent sans le lui dire serait pire que
de ne pas choisir.

**Une ligne de plan ne devient un contenu qu'avec un format — NORMATIF.** Deux notions
distinctes, et la distinction n'est pas cosmétique :

| Règle | Exige | Sert à |
| :--- | :--- | :--- |
| `isPlanEntryUsable` | un titre | garder la ligne au tableau — c'est ce filtre qui s'applique à la réponse de l'Éclateur |
| `isPlanEntryCreatable` | un titre **et** un format | autoriser la création du contenu |

Les confondre ferait DISPARAÎTRE du plan les lignes sans format au lieu de demander à
Florent de les compléter. Une ligne non créée reste au tableau, et l'écran dit ce qui lui
manque : un bouton grisé sans explication est une énigme.

Même exigence à l'ajout rapide d'une idée. Le motif est le même dans les deux cas : le
format ne se modifie que tant que le statut vaut `Idée`, et « Travailler cette idée »
referme cette porte. Un contenu créé sans format traverse le flux amputé de son Brouillon,
de sa Copie et de ses Slides, sans que rien ne le dise.

**L'Éclateur est l'Analyste de sa série — NORMATIF.** Angle, format et objectif sont
décidés ici, en voyant l'ensemble, et ne sont pas repassés à l'Analyste publication par
publication : celui-ci ne voit qu'une idée isolée et casserait l'équilibre éditorial que
l'Éclateur vient de construire. Les contenus créés arrivent donc **analysés**
(`analyzed_at` posé), hors du lot « À analyser ».

Il reçoit `OBJECTIF_REGISTRY` en contexte, y compris la règle d'équilibre éditorial
(« sur 10 publications, viser ~2 Notoriété, 3 Recadrage… »). Aujourd'hui cette règle ne
guide qu'une idée isolée ; **une série est le premier endroit où elle devient
actionnable**.

### 6.3 Le plan de série

Un seul écran, deux portes d'entrée : « Décliner » depuis un contenu Prêt ou Publié,
« Nouvelle série » depuis l'onglet Séries. Tableau éditable, puis création en lot via
`POST /api/contents/batch`.

**Atomicité** : le lot est créé dans une transaction D1. Six contenus créés ou zéro,
jamais une série à moitié peuplée.

**Les publications naissent en `Brouillon`, pas en `Idée` — NORMATIF.** L'étape Idée sert
à décider ce qu'on fait d'une intuition : son format, son angle, son objectif, et
faut-il l'analyser. Pour une publication de série, tout cela est déjà tranché — par
l'Éclateur, en voyant l'ensemble (§6.2), et le format est exigé avant création. Il ne
reste rien à faire à cette étape : c'était un passage obligé sans travail à l'intérieur.

Elles arrivent donc dans « En cours », prêtes pour l'Atelier, avec `analyzed_at` posé.

**Allonger une série numérote à la suite (v2.36).** Les nouvelles publications prennent les
rangs qui suivent celles de la série (`premierRangLibre`, `series.ts`). Le plan numérotait ses
lignes à partir de 1 : « Générer une publication de plus » donnait un second n° 1.

### 6.4 L'anti-répétition — NORMATIF

C'est la raison d'être de la fonctionnalité. Un contenu appartenant à une série est
travaillé avec, en plus :

1. le thème et l'intention de la série ;
2. le texte du contenu source, **si et seulement si** la série en a un ;
3. **les angles des contenus frères** — leurs `titre` et `angle`, **jamais leur texte
   complet**, avec la consigne explicite de ne pas empiéter ;
4. **sa place dans la progression** — la liste est rendue dans l'ordre, le contenu
   courant à son rang : ce qui précède est déjà dit, ce qui suit viendra.

La restriction du point 3 n'est pas une optimisation : sans elle, le prompt croît avec la
série et finit par noyer la consigne.

**Ce bloc irrigue TOUT l'atelier, pas seulement la rédaction.** Le Coach le reçoit dans
son brief d'ouverture, le Verrouilleur dans sa charge utile, le Rédacteur dans son prompt
système. Le donner au seul Rédacteur revenait à laisser l'atelier — l'endroit où la
direction se décide — choisir une direction qu'il faudrait corriger ensuite.

---

## 7. Authentification et sécurité

Depuis la correction d’audit du 31/10/2026, le jeton HMAC-SHA256 existant voyage
dans un cookie `__Host-luminose-session`, `HttpOnly`, `Secure`, `SameSite=Strict`,
valable au plus 24 heures. En développement HTTP, le cookie porte un autre nom
et omet `Secure`. Le front vérifie sa session par `GET /auth/session`.

Le jeton auparavant en localStorage est converti en cookie, puis retiré du stockage
JavaScript. L’en-tête `X-Session-Token` reste accepté pour les clients existants ;
la déconnexion (`POST /auth/logout`) révoque son empreinte en D1 jusqu’à son expiration,
et retire le cookie. Chaque route protégée ajoute une lecture de révocation à son
budget. Les empreintes et compteurs d’accès ne font pas partie de l’export métier.

Les écritures vérifient l’origine et refusent `Sec-Fetch-Site: cross-site`.
La connexion compare des condensats de longueur fixe et limite chaque adresse hachée
à 20 tentatives par fenêtre de 15 minutes. Les identifiants absents ferment l’accès.
Les réponses privées portent `Cache-Control: no-store` ; Pages sert la CSP
de `apps/manager/public/_headers`. Aucun CORS n’est ajouté.

**Les routes de la base des clients (v3.0, chapitres 14 et 15).** `/api/clients`, `/api/seances`,
`/api/evenements`, `/api/inscriptions`, `/api/professionnels` et `/api/reservation` exigent la
session de la console ; le serveur MCP y reçoit 403, liaison `CLIENTS` présente ou non ; sans
liaison, 409. Une recherche de personne part dans le corps d'un `POST`, jamais dans une adresse
(§15.2, règle 3). Un refus de validation ne nomme que des champs connus du schéma ; une panne ne
journalise qu'un code d'incident fixe, jamais l'exception (§14.2, règle 7).

**Le serveur MCP, appelant de l'API — NORMATIF (v2.34).** Il présente son propre jeton en
`Authorization: Bearer` ; le Worker n'en garde que l'empreinte SHA-256
(`MCP_JETON_EMPREINTE`), comparée en temps constant. Facultative : absente, un porteur est
refusé (401) et la console fonctionne à l'identique. Le jeton n'ouvre qu'une liste fermée —
contenus et séries en lecture, création d'un contenu, modification de sa fiche, brouillon par
le journal des générations, regroupement d'idées, et depuis la v2.36 déplacement d'un contenu
et remise en ordre d'une série (§3.3) — et rien d'autre (403) : ni
suppression, ni réglages, IA, export, corpus, montage, atelier, ni retour à une génération.
Sur ces routes, les règles se resserrent pour lui seul (`workers/api/src/acces-mcp.ts`) :

- création et modification n'acceptent que la **fiche** — titre, notes, statut, format,
  objectif, plateformes, date prévue, angle ;
- un **brouillon** passe par `POST /contents/:id/generations` : vérifié comme une rédaction
  de l'IA (`parseDraftResponse`), au format du contenu, avec une raison ; signé
  « Claude (MCP) » par le Worker — jamais par la requête —, sans coût, annulable comme toute
  génération (§2.6). Le brouillon en place, s'il n'est pas la dernière production
  journalisée — une retouche à la main —, y est versé d'abord : il ne se perd pas ;
- la lecture d'un contenu joint le gabarit de son format, que le Rédacteur reçoit.

Décision : `workers/mcp/decisions/2026-11-03-contenus.md`.

**La base des clients (v3.0)** a ses propres portes et ses propres règles d'accès (§14.5). La
liste fermée du serveur MCP ne change pas : aucune route des clients n'y entre, et son refus
(403) tombe avant tout examen de la liaison `CLIENTS`.

**Invariant** : aucune clé de fournisseur (Notion, 1min.ai, OpenAI, OpenRouter…)
ne quitte le Worker. Elles peuvent désormais y ENTRER depuis l'administration et
être stockées en base (§5.5) — la direction est à sens unique, et c'est elle que
l'invariant protège.

---

## 8. Cache local et synchronisation

IndexedDB conserve son rôle : affichage immédiat au démarrage, puis synchronisation en
fond. Le protocole se simplifie radicalement.

```
GET /api/contents?since=<updated_at max connu>
   → lignes modifiées ET lignes supprimées depuis
   → le client applique : upsert des vivantes, purge des supprimées
```

Plus de synchronisation complète périodique, plus de balayage d'identifiants, plus de
fusion par `mergeById` avec cas particuliers.

**Conservé de l'existant** : la protection contre l'écrasement du travail non enregistré.
Un contenu dont l'écriture a échoué reste protégé de la synchronisation et signalé
par un bandeau. Les écritures en attente sont conservées séparément du cache, dès
la frappe, et restaurées après rechargement. Quitter l’éditeur avant la seconde de
délai déclenche l’écriture restante. Les sauvegardes d’un même contenu sont sérialisées ;
une réponse ancienne ne peut acquitter une édition plus récente. La synchronisation
préserve aussi les éditions faites pendant sa lecture, et son curseur précède la lecture.

Une génération déjà lancée continue d’être journalisée et enregistrée si l’on quitte
l’éditeur pendant l’attente : le démontage interdit les mises à jour de l’écran, pas
la persistance du résultat. Le champ produit est fusionné avec les dernières éditions
locales. Les fournisseurs ont un délai maximal de 12 minutes par tentative ; un délai
dépassé n’est pas automatiquement rejoué pour éviter une double facturation.


---

## 9. Migration des données

> **Exécutée, et ses outils retirés le 20/09/2026.** Ce chapitre reste comme **record** de la
> façon dont les données sont arrivées dans D1 — utile le jour où une valeur paraîtra louche.
> Les commandes ci-dessous ne s'exécutent plus telles quelles : `tools/import-notion` et
> `tools/export-notion` ont quitté le dépôt un mois après la bascule.
>
> Ils restent dans l'histoire, intacts et vérifiés :
> `git show f7f7e9f:tools/import-notion/import.mjs` (14 824 octets) ·
> `git show f7f7e9f:tools/import-notion/verify.mjs` (11 050 octets) ·
> `git show 84c08ee:fixtures/notion-export-2026-08-19-19-24-09.json` (1 716 190 octets).
>
> Partent avec eux les 13 tests de `splitSignature` — l'analyse des signatures « Généré par :
> … » collées aux brouillons Notion. Logique de migration uniquement : rien de vivant ne
> l'importait, et D1 porte `model_label` en colonne plutôt qu'en suffixe de texte.

### 9.1 Principe

`tools/import-notion` lit les deux bases Notion et **produit un fichier `import.sql`**
d'instructions `INSERT OR REPLACE`, avec des identifiants dérivés des pages Notion. Le
fichier est donc **ré-exécutable sans doublon**, ce qui autorise autant de répétitions
que nécessaire.

```bash
NOTION_API_KEY=… npm start -w tools/import-notion
cd workers/api && npx wrangler d1 execute DB --remote --file=../../tools/import-notion/import.sql
```

### 9.2 Correspondance des champs

Table complète en Annexe B. Points d'attention :

- `Contenu` / `Slides` / `Script vidéo` / `Post Court` : lus en **texte brut**, jamais
  réinterprétés en markdown.
- `Plateforme` (multi-select) → JSON array en TEXT.
- Dates Notion (ISO) → epoch ms.
- `Réponses interview` / `Questions interview` : migrés dans une colonne `legacy_json`.
  Champs morts, mais on ne détruit pas de données pendant une migration.

### 9.3 Vérification — NORMATIF

La migration n'est pas terminée quand le SQL passe. Elle est terminée quand un script de
vérification a comparé, **pour chaque ligne et chaque champ**, la valeur Notion et la
valeur D1, et affiché zéro écart. Ce script fait partie du livrable de la phase 4.

### 9.4 Filet

- **Avant tout** : export JSON complet des deux bases Notion, versionné dans le dépôt.
  C'est la phase 0. Produit le 19/08/2026 par un outil `tools/export-notion` retiré depuis,
  il portait pour chaque base le `schema` de la data source — le **type réel** de chaque colonne, qu'aucune page ne
  porte à elle seule et sans lequel l'import interprète mal les valeurs.
  **Retiré du dépôt le 20/09/2026**, un mois après la bascule (voir la ligne suivante). Il
  reste dans l'histoire, intact — 1 716 190 octets :
  `git show 84c08ee:fixtures/notion-export-2026-08-19-19-24-09.json`
  (`84c08ee` est le dernier commit qui le portait ; la commande a été vérifiée avant d'être
  écrite ici). Un filet qu'on décroche ne se jette pas — on note où il est accroché.
- **Après bascule** : Notion reste intact, en lecture seule, pendant au moins un mois.
- **En régime** : une route d'export (`GET /api/export`) produit un JSON complet
  téléchargeable, lignes supprimées comprises. Time Travel (7 jours en gratuit) ne
  suffit pas comme unique filet. Les captures de l’Inbox et les mesures IA sont incluses.
  Les fichiers binaires R2 restent exclus et l’écran le précise. **Les clés des fournisseurs en sont exclues** (§5.5).
  **L'export général ne porte aucune table de la base des clients** (v3.0, §14.2) : il ne lit
  que `DB`. Celle des clients se sauvegarde et s'exporte seule, chiffrée (phase S4, §14.11).

---

## 10. Tests et garde-fous

### 10.1 Ce qui est couvert aujourd'hui (73 tests, à conserver)

Jetons forgés du Worker, écriture Notion selon le type réel des colonnes, intégrité du
JSON, parsing défensif des réponses IA, complétude du registre de formats, montage de
chaque écran.

### 10.2 Ce qui s'ajoute

| Cible | Nature |
| :--- | :--- |
| `packages/editorial` | **golden fixtures** — un prompt composé attendu par action et par format. Toute évolution d'un persona met à jour la fixture, et la revue de la fixture est la revue du changement. |
| `workers/api` | une suite par route : validation zod, codes de statut, suppression logique, budget de requêtes |
| Migration | comparaison Notion ↔ D1 champ par champ (§9.3) |
| `packages/{subtitles, psychedelics}` | tests de calcul purs |
| La base des clients (v3.0) | le tableau du §14.10 : `packages/pratique`, migrations, décisions, règles 1 à 8, serveur MCP, export |

### 10.3 Règle de montage

Tout composant ayant un retour anticipé est monté dans `screens.test.tsx` **dans les deux
états**. Cette règle est née d'une page blanche en production : un `useEffect` placé après
un `if (!isOpen) return null;`, invisible au typecheck comme au build.

---

## 10.4 Contrainte d'environnement — dépôt partagé entre deux architectures

Le répertoire de travail est partagé entre le Mac (arm64) et une VM Ubuntu (arm64), et
`node_modules` ne peut servir qu'une plateforme à la fois : le dernier `npm install`
gagne, et la machine d'en face échoue sur les binaires natifs — `workerd` pour wrangler,
`rollup` et `esbuild` pour le build.

Le correctif est d'installer le binaire manquant sans toucher au manifeste :

```bash
npm install --no-save @cloudflare/workerd-darwin-arm64      # depuis le Mac
npm install --no-save @cloudflare/workerd-linux-arm64       # depuis la VM
```

Les deux jeux cohabitent sans conflit ; c'est le `npm install` suivant qui élague. À
refaire au changement de machine, tant que le répertoire reste partagé.

---

## 11. Phasage et critères de sortie — NORMATIF

Une phase par lot de travail. **Aucune phase ne laisse l'application cassée.**

| # | Phase | Critère de sortie |
| :--- | :--- | :--- |
| **0** | **Filet** — export JSON complet des bases Notion, versionné | Le fichier existe, il contient N contenus et M modèles, relus |
| **1** | **Monorepo** — workspaces, déplacement du front dans `apps/manager` | `npm test` et `npm run typecheck` verts, application identique |
| **2** | **Moteurs purs** — extraction de `editorial`, `subtitles`, `psychedelics` | Zéro dépendance runtime, golden fixtures en place |
| **3** | **Worker API + D1** — schéma, migrations, routes, auth | Suite de tests API verte, Notion encore en place et intact |
| **4** | **Import** — `tools/import-notion` + vérification | Script de comparaison à zéro écart |
| **5** | **Bascule** — le front lit et écrit l'API | Notion en lecture seule ; parcours complet rejoué de bout en bout |
| **6** | **Abstraction IA** — `packages/ai`, `/api/ai/chat` | Un second adaptateur écrit, même s'il n'est pas activé |
| **7** | **Séries** — table, onglet, écran de plan, création en lot | Une série créée à la main de bout en bout |
| **8** | **L'Éclateur** — `PLAN_SERIES` + anti-répétition | Un plan généré sur un vrai sujet, jugé pertinent |

Phases 0 à 5 : migration, aucune fonctionnalité nouvelle. Phases 6 à 8 : la valeur.

### 11.1 Ce que le modèle révisé déplace

Le journal des générations (§2.6) et la conversation en lignes (§2.7) sont décidés en
**phase 3**, pas ajoutés après coup : la phase 4 doit déjà savoir où déposer l'historique
extrait des signatures Notion. Deux conséquences pour le phasage :

- l'annulation d'une génération, aujourd'hui limitée à un niveau et perdue à la fermeture
  de l'éditeur, devient durable dès la bascule (phase 5) — sans travail supplémentaire ;
- `packages/editorial` perd les onze `lastIndexOf('}')` en phase 2, mais ses fonctions
  doivent rester tolérantes en lecture tant que Notion est la source (phases 2 à 4).

### 11.2 Ce qui peut mal tourner

- **La bascule (phase 5)** est le moment à risque. Elle est réversible tant que Notion
  reste intact : c'est la raison de la règle du mois de lecture seule.
- **L'écriture en lot (phase 7)** doit être transactionnelle, sinon une série à moitié
  créée laisse un état incohérent.
- **Les golden fixtures (phase 2)** vont figer les prompts actuels. Si un prompt est déjà
  imparfait, la fixture fige l'imperfection : les relire à ce moment-là, pas plus tard.

---

## 12. La vidéo — le Reel expliqué

### 12.1 Ce qu'on cherche à produire

La référence est un Short de NerdyKings (`youtube.com/shorts/jzpSgUNvD0w`, 102 s),
décortiqué image par image le 02/10/2026 :

- une **seule prise** face caméra. La voix ne s'arrête jamais : c'est l'image qui
  change ;
- environ **80 % du temps recouvert de scènes** : un titre de deux lignes avec un mot
  surligné, puis des cartes qui apparaissent **une à une, au mot prononcé**, des « vs »,
  des pastilles, des flèches, un compteur qui défile ;
- un retour face caméra pour ouvrir, pour fermer, et une fois au milieu ;
- des sous-titres discrets sur la caméra **seulement**. Sur les scènes, l'écran ne
  transcrit pas : il retient le mot-clé, le chiffre, le contraste.

Une proposition antérieure (Gemini) décrivait autre chose — des images fixes animées par
un zoom lent, une piste de voix off séparée, des sous-titres karaoké, un rendu sur AWS
Lambda. Elle a été écartée sur pièces : ce qui fait l'efficacité de la référence, ce sont
des **scènes écrites**, et ce qu'on écrit se produit ici.

Usage : publications Facebook et Instagram, et à l'occasion des publicités Google Ads et
Meta. Une vidéo publicitaire Google doit être hébergée sur YouTube (non répertoriée
suffit).

### 12.2 Les décisions de Florent (02/10/2026) — NORMATIF

| Question | Décision | Conséquence |
| :--- | :--- | :--- |
| Où se termine le montage ? | **Dans l'application.** L'application pose les scènes et les sous-titres et rend le fichier final. Révisé le 24/10/2026 : elle nettoie aussi la prise — ratés, silences —, qui ne passe plus par Final Cut (§12.5.2). | Les variantes (4:5, seconde accroche) sortent sans refaire de montage. |
| Que retenir de la seconde référence (24/10/2026) ? | **Le dérushage, les sous-titres mot à mot, le rythme.** Le mode « voix seule » et une bibliothèque de visuels réutilisables, proposés aussi, restent en réserve. | §12.5.2, §12.5, §12.5.3. |
| Quelle identité pour les scènes ? | **L'habillage Luminose** : la mécanique de la référence, habillée de la gamme de `voix/direction-artistique.md` (ivoire, prune, violet nuit), en Futura. | Un gabarit, pas deux. |
| Que porte une carte ? | **Du texte, et quand l'image dit mieux que le mot, une illustration ou un schéma** — surtout en pédagogie, et aussi pour l'humour. Les cartes n'ont pas toutes la même taille. Révisé le jour même : « Faut de la souplesse. » | Le Rédacteur **décrit** le visuel ; Florent le produit (ChatGPT Images, Sketch) et le dépose sur la carte. |
| Que montre une scène ? (28/10/2026, devant la première vidéo exportée : « beaucoup trop d'infos et donc pas percutant ») | **Une chose à la fois.** Chaque écran remplace le précédent : un visuel en grand et un à quatre mots ; plus de titre ; des scènes de six secondes au plus, le visage revenant entre deux. | §12.3, §12.4.1. Les cartes empilées, leurs tailles et leurs liaisons ne s'écrivent plus. |
| Qui produit les visuels ? (28/10/2026 : « éviter au max d'avoir besoin d'ajouter des photos ») | **L'outil, autant que possible.** Cinq schémas dessinés et animés par le code ; pour la métaphore, **une** illustration par Reel — deux au plus quand elle se transforme —, réutilisée d'un écran à l'autre au cadrage voulu, générée par l'outil (v2.28) ou déposée. | Plus aucun visuel à produire écran par écran. |
| Dans quel style ? (29/10/2026 : « essayons de rester dans le style du site ; si c'est trop contraignant et trop monotone, on fera évoluer ça ») | **Celui des illustrations des pages**, l'étalon joint — alors que `direction-artistique.md` §4 laisse les réseaux sans charte : c'est un choix pour le Reel, révisable, pas une charte des réseaux. | §12.3, « L'illustration générée ». |
| Quelle allure pour les écrans ? (30/10/2026 : « Les illustrations (non photo) sont très peu qualitatives aussi. Il faut monter d'un cran ! », puis, devant trois pistes : « La piste brume est très bien ! ») | **Brume** : l'atmosphère des illustrations des pages du site, dans leur gamme. | §12.3, §12.4.1. Les pistes Affiche (la typographie à plat) et Arche (papier découpé dans une arche) ont été écartées. |
| Le script et la parole (30/10/2026 : « il y aura forcément des différences, car j'ajuste pour que ça colle à moi et mon style parlé ») | **La prise fait foi** ; le script donne la structure — séquences, écrans, repères. | Rien ne doit supposer un texte lu mot pour mot : fin improvisée, reformulations, redites (§12.5.2, §12.5.5), alerte sur les écrans plutôt que sur l'écart (§12.5). |
| Quel rythme ? (30/10/2026 : « Le rythme est un peu trop rapide. Ça fait beaucoup de trucs qui s'animent à l'écran et c'est confus à suivre ») | **Plus calme** : plus d'air dans la voix, pas de visage éclair, moins de mouvements, deux fonds au lieu de quatre. Les scripts ne changent pas. | §12.3, §12.4.1, §12.5.2, §12.5.3. Révise en partie la décision du 24/10 (§12.5.3). |
| Où vivent prises et visuels ? | **Chez Cloudflare** (04/10/2026) : prises et visuels dans R2, transcription et repères dans D1. La première version les gardait dans le navigateur. | Un montage survit à des données de site vidées et se reprend depuis un autre poste ; une prise met une à deux minutes à partir, et l'espace gratuit (10 Go) se surveille. |

La première réponse à la troisième question était « la typographie seule », par crainte
du cliché — une icône de « honte » ou de « peur ». Florent l'a corrigée : un mécanisme se
montre mieux qu'il ne se dit, et une scène décalée fait rire là où une phrase n'y
arrive pas. Le cliché est donc écarté autrement : pas d'icônes ni d'emojis, des visuels
**décrits un par un** pour ce qu'ils doivent montrer, et les interdits de la direction
artistique (pas d'imagerie littérale de la détresse, pas de symbolisme ésotérique
appuyé).

### 12.3 Le format — NORMATIF

`TargetFormat.REEL_EXPLIQUE` (« Reel expliqué (scènes animées) », clé courte
« Reel expliqué »). Atterrit sur l'onglet `script`, ouvert à la relecture à froid : court,
écrit d'un jet, comme le Reel et le carrousel. Le **Script Reel** existant reste, pour une
vidéo face caméra de bout en bout.

Le brouillon reste dans `contents.draft` (§2.5). Sa forme, depuis la v2.26 :

```json
{
  "format": "Reel expliqué",
  "illustrations": [
    { "id": "digue", "description": "La scène de la métaphore : ce qu'on y voit, et OÙ." },
    { "id": "vanne", "depuis": "digue", "description": "La même scène, transformée." }
  ],
  "sequences": [
    { "plan": "camera", "role": "Accroche", "voix": "…", "intention": "…" },
    { "plan": "camera", "role": "Bascule", "voix": "…", "intention": "…",
      "coup": { "texte": "Pas un [défaut]", "apparait_sur": "mots exacts de la voix" } },
    { "plan": "scene", "role": "Mécanique", "registre": "pedagogie", "voix": "seize mots au plus", "intention": "…",
      "elements": [
        { "texte": null, "ton": "neutre", "visuel": { "illustration": "digue", "cadrage": "ensemble" },
          "apparait_sur": "premiers mots de la voix" },
        { "texte": "L'eau [s'accumule]", "ton": "ombre", "visuel": { "schema": "niveau", "de": 35, "a": 80 },
          "apparait_sur": "mots exacts de la voix" }
      ] }
  ],
  "accroche_pub": { "voix": "…", "intention": "…" },
  "legende": { "texte": "…", "cta": "…", "hashtags": ["…"] }
}
```

- **`voix` porte TOUT ce qui se dit**, scène comprise. Concaténées dans l'ordre, les voix
  sont le texte à lire au tournage, et rien d'autre.
- **`apparait_sur` est un repère, pas une durée.** Ce sont des mots recopiés de la voix de
  la même séquence ; l'écran apparaît quand ils sont prononcés. Aucun minutage n'est
  écrit par le modèle : il ne sait pas à quel débit Florent parle, la prise le saura
  (§12.5).
- **Une scène montre un écran à la fois** (v2.26). Chaque écran remplace le précédent :
  rien ne s'empile, et une scène n'a plus de titre. Un écran porte un visuel en grand, ou
  de un à quatre mots — souvent les deux. Le premier arrive avec la scène ; les suivants,
  au mot de leur repère.
- **Une scène a un registre** : `pedagogie` (on montre comment ça marche) ou `humour`
  (on montre l'absurde). Jusqu'à la v2.29, l'entrée de chaque écran suivait le registre ;
  depuis, tous se posent de même (§12.4.1).
- **Le ton dit où tombe la bascule** : `ombre` (ce qui coince), `lumiere` (ce qui s'ouvre),
  `neutre` (ce qui informe). Il faisait le fond de chaque écran ; depuis la v2.30, les fonds
  vont **en deux temps** (`enDeuxTemps`, décision de Florent du 30/10/2026) : violet nuit
  jusqu'au premier écran de lumière, ivoire ensuite — une seule inversion dans la vidéo, là
  où les scènes alternaient quatre couleurs (ivoire, violet nuit, ivoire rosé, et le prune
  des coups de poing). Sans écran de lumière, ivoire de bout en bout. Les coups de poing
  suivent (`tempsDeLaSequence`). Depuis la v2.31, chaque temps est un **fond Brume**
  (`fondBrume`) : l'atmosphère des illustrations des pages du site — un ciel en dégradé,
  un halo, deux lignes de collines au bas du cadre, un grain léger —, le soir avant la
  bascule (du violet nuit au prune), le matin après (de l'ivoire au rose brumeux). Il
  remplace le fond uni et ses pointillés.
- **Les schémas, l'outil les dessine et les anime** (`visuel.schema`) : `niveau` (l'eau
  qui monte ou descend dans le paysage, `de` → `a` en %), `compteur` (un nombre qui
  défile, `valeur`, `unite`), `opposition` (`gauche` dans l'ombre, `droite` dans la
  lumière), `enchainement` (`de` → `vers`), `liste` (deux ou trois `items`, posés ensemble ;
  `barres` les raye). Libellés de trois mots au plus. Rien à produire, rien à déposer.
- **L'illustration de la métaphore se décrit une fois** (`illustrations`, deux au plus) :
  une scène figurative, qui dit OÙ se trouve chaque élément — en haut, en bas, à gauche, à
  droite, au centre. Une seconde, `depuis` la première, est la même scène transformée. Un
  écran la montre par `{ "illustration": id, "cadrage": … }` : `ensemble`, ou une zone, sur
  laquelle l'image zoome (1,5 fois, ancrée au bord de la zone) en s'avançant lentement.
- **`coup` est un coup de poing** (v2.13) : sur un passage face caméra du milieu, quelques
  mots qui envahissent l'écran le temps de les dire (§12.5.3). Facultatif, deux au plus,
  ni sur l'accroche ni sur l'appel à l'action ; sans raison de rompre, il vaut `null`.
- **`accroche_pub`** est une seconde ouverture, à tourner dans la foulée, pour la
  publicité. Meta refuse un texte qui présume de l'état de santé de celui qui regarde
  (« Vous souffrez d'anxiété ? »), et le cadre déontologique interdit toute promesse de
  résultat. L'accroche organique a le droit de dire au lecteur ce qu'il vit ; celle-ci
  nomme la situation sans le désigner. Les variantes publicitaires testent l'accroche,
  et c'est exactement ce qu'un second plan permet.

**L'illustration générée** (v2.28). En tête du studio, chaque illustration se
**génère** : le navigateur compose le prompt (`promptIllustration`,
`packages/editorial/src/illustration.ts`, photographié dans les fixtures golden) sur la
formule des illustrations des pages (`_ai_helpers/prompts-images-luminose.md` §7, dépôt du
site) et joint l'étalon — `apps/manager/images/etalon-illustrations.jpg`, réduit à
1 200 pixels depuis `_ai_helpers/etalon.jpg`. L'autre état d'une scène (`depuis`) joint en
plus la première illustration, déjà gardée : sans elle, le lieu et le personnage ne
seraient plus les mêmes, et le bouton attend. `POST /api/ai/image`
(`IllustrationRequestSchema`) résout `modelId` dans le catalogue — un modèle de sortie
`image`, joint par OpenRouter, sans quoi un refus (v2.35, §5.3) —, prend la clé
OpenRouter — absente, un refus dit où la poser —, demande une image au format vertical
3:4 (`image_config.aspect_ratio`), et rend l'image en URL de données avec son coût ; une
mesure part dans `mesures_ia` (action `ILLUSTRATION`), comme pour le texte. L'image se
montre avec le modèle et le coût : **Garder** la range comme une image déposée (séquence
−1), **Refaire** en demande une autre, **Laisser** l'écarte — rien n'est rangé d'un essai
écarté. Les modèles sont ceux du catalogue de sortie Image (v2.35) : le menu du studio les
propose, et le réglage de la famille Illustrer (§3.4) désigne celui qui sert par défaut.
La migration 0014 a amorcé les trois d'avant, tous joints par OpenRouter (une seule clé) :

| Modèle | Code | |
| :--- | :--- | :--- |
| Nano Banana Pro | `google/gemini-3-pro-image` | réglé sur Illustrer à l'amorçage, à la demande de Florent |
| Nano Banana 2 | `google/gemini-3.1-flash-image` | moitié moins cher |
| GPT Image 2 | `openai/gpt-image-2` | pour comparer |

Le prix est au jeton : 120 $ le million de jetons d'image produits pour Nano Banana Pro,
60 $ pour Nano Banana 2, 30 $ pour GPT Image 2 (catalogue OpenRouter, 29/10/2026), soit de
l'ordre de 0,05 à 0,25 $ l'image. Le coût exact de chaque appel s'affiche à côté de l'image.

**Depuis le prompt d'un brouillon** (v2.37). La même route dessine le visuel d'un Post Texte
ou d'une slide de carrousel, depuis son `prompt_image`. Le prompt part **tel quel** : c'est
celui que Florent colle dans ChatGPT, et deux chemins qui ne reçoivent pas le même prompt ne
rendraient pas la même image. **Sans référence** : les réseaux n'ont pas de charte
(`direction-artistique.md` §4), et l'étalon reste un choix fait pour le Reel. Aux
**proportions du format**, que porte le registre (`FormatDefinition.image` : 1:1 ou 4:5 pour
le Post Texte, 1:1 pour le carrousel). `IllustrationRequestSchema` rend donc `references`
facultatif et ajoute `proportions` et `format` — ce dernier pour la mesure seulement ;
absents, la demande est celle du Reel, à l'identique. L'image se montre avec le modèle et
le coût, se **télécharge** — un post se publie hors de l'application —, se refait ou se
laisse : rien n'est rangé.

**Les brouillons d'avant la v2.26 se lisent encore.** Leurs scènes avaient un titre et des
cartes empilées — `type` (carte, pastille, liaison), `taille`, `detail`, et un visuel
décrit carte par carte (`{ nature, description }`) que Florent déposait. Ils s'affichent
désormais un écran à la fois, sans titre ; un visuel décrit se dépose comme avant. Rien de
tout cela ne s'écrit plus.

**Ce qui se compte se compte dans le code — NORMATIF** (même règle que §3.5.2, point 4).
`verifierReelExplique` (`packages/editorial/src/reelExplique.ts`) contrôle, sans appel
réseau :

| Contrôle | Pourquoi |
| :--- | :--- |
| ouvre et ferme face caméra | la confiance et l'appel à l'action passent par un visage |
| 3 à 7 scènes, de 16 mots de voix au plus ; 1 à 3 écrans par scène | une scène de six secondes montre une chose ; le visage revient entre deux |
| un écran porte un texte ou un visuel ; texte de 4 mots et 28 caractères au plus | l'œil a deux secondes ; le cadre a 1 080 pixels de large |
| le premier repère dans les 3 premiers mots de la scène ; 4 mots au moins entre deux repères | le premier écran arrive avec la scène ; un écran doit avoir le temps d'être lu |
| chaque `apparait_sur` se retrouve dans la voix de sa séquence, dans l'ordre | sans ça, l'écran n'a pas de moment où apparaître |
| un schéma connu, aux nombres et libellés valides (3 mots au plus, 2 ou 3 lignes de liste) | l'outil le dessine : il doit savoir quoi |
| deux illustrations au plus, chacune montrée par un écran au moins ; une illustration ou un cadrage cités existent ; `depuis` désigne l'autre | une image se produit pour être vue |
| durée estimée entre 45 et 90 s, à 150 mots par minute | le débit réel corrigera ; l'ordre de grandeur, lui, se vérifie avant de tourner |
| deux coups de poing au plus, face caméra, ni en ouverture ni en clôture, ≤ 24 caractères, repère retrouvé dans la voix | au-delà de deux, la rupture devient le rythme ; la vidéo s'ouvre et se ferme sur le visage |

Un écart déclenche **une** passe d'ajustement automatique après rédaction ou retouche,
comme les longueurs du carrousel. Ce qui subsiste s'affiche au-dessus du storyboard : on
ne tourne pas un script dont l'écran sait déjà qu'il ne tiendra pas.

**Le contrôle est porté par le registre** (`FormatDefinition.controler`). L'éditeur
demande « ce format a-t-il des contrôles ? », jamais « est-ce un Reel expliqué ? ».

### 12.4 Le montage — rendu dans le navigateur — NORMATIF

Rendu par **Remotion** : `@remotion/player` pour l'aperçu, `@remotion/web-renderer`
(WebCodecs, stable depuis 4.0.491) pour le fichier. Licence gratuite pour un indépendant
ou une structure de trois salariés au plus.

**Le rendu se fait dans l'onglet**, jamais sur le Worker : un Worker n'exécute ni Chrome
ni FFmpeg. Il demande **WebCodecs** — Chrome 94, Firefox 130, Safari 26 et suivants,
selon Remotion ; vérifié dans Chrome seulement — sur une page **sécurisée** (https ou
localhost), et il occupe l'onglet le temps de l'encodage, à peu près la durée de la
vidéo. `@remotion/lambda` est écarté : il ajouterait AWS, déjà « exploré sans suite » au
parc d'outils, un compte, des clés et une facture. Un rendu côté Cloudflare demanderait
Containers, donc le plan payant ; rien ne le justifie tant que l'onglet suffit.

Le **stockage**, lui, est chez Cloudflare depuis la v2.8 (§12.4.2).

Sorties : **9:16 1080 × 1920, 30 i/s, H.264/AAC** ; variante **4:5** (fil Meta) en
recomposant les scènes, pas en recadrant. Le 16:9 n'est pas prévu : une face caméra
verticale recadrée en paysage perd le visage.

Les scènes restent dans la **zone sûre** : l'interface des Reels et des Shorts recouvre le
bas et le bord droit de l'image. La référence garde ses cartes dans les deux tiers du
haut.

### 12.4.1 Les scènes animées (V2 ; un écran à la fois depuis la v2.26) — NORMATIF

**Une horloge, un calcul.** `minuterReel(data, horloge)` (`reelExplique.ts`) place
chaque séquence et chaque élément à partir du RANG des mots dans la voix entière.
L'horloge dit quand un rang est prononcé : `horlogeEstimee(débit)` avant le tournage,
celle de la prise après (V3). Rien d'autre ne change entre les deux — c'est ce qui
garantit que l'aperçu d'aujourd'hui et le montage de demain parlent de la même chose.

**Le débit se règle** (110 à 200 mots par minute, 150 par défaut). Florent lit son
script, chronomètre, et retrouve sa durée : les scènes exportées tombent alors au
rythme de sa voix, et se posent telles quelles dans Final Cut en attendant le calage
(V3). Le réglage n'est pas retenu : la prise le rendra inutile.

**La scène reste un seul composant.** `SceneLuminose` ne connaît pas Remotion : le
storyboard l'affiche à l'arrêt, la composition (`ReelComposition`) la pilote image par
image et lui prête son composant d'image. Remotion n'est chargé qu'à l'ouverture d'un
storyboard (`React.lazy`), jamais dans le paquet principal.

**Un écran à la fois** (v2.26). `debutsDesEcrans` dit quand chaque écran prend la place du
précédent : le premier avec la scène, les suivants au mot de leur repère ; un repère
introuvable se place à égale distance de ses voisins. Chaque écran se pose — ressort
amorti, un tiers de seconde —, quel que soit le registre depuis la v2.30 : l'humour
arrivait de travers et rebondissait, un mouvement de plus dans une vidéo que Florent
trouvait confuse. Le fond, lui, change sec : c'est une rupture, pas une transition. Un
écran trop haut pour la zone sûre — en 4:5 surtout — se réduit d'un bloc.

**Les schémas sont des blocs, du texte et des images** : le rendu dans le navigateur ne
peint pas un SVG posé dans la page, mais il peint une image, SVG comprise. Ils s'animent
sur le temps de l'écran — un niveau monte en 1,6 s, un compteur défile en 1,2 s.

**En Brume** (v2.31) : un écran de texte est centré, en Futura, le passage entre crochets
en Abril italique 1,4 fois plus grand — sans barre de surlignage. Le **niveau** ne pose plus
de jauge au centre : l'eau monte dans le paysage, sur toute la largeur du cadre, du bas vers
le texte, qui se tient alors en haut de la zone sûre ; un trait pointillé garde le niveau
d'où elle part. Sa crête est une image, son corps un dégradé CSS : seule leur position
change d'une image à l'autre. La **liste** perd ses pastilles : par ligne, une étiquette en
capitales espacées et le mot en Abril (« Colère : un [détail] » se lit « COLÈRE », puis
« un détail »), un filet court entre deux ; sans deux-points, la ligne entière est le mot. Les lignes d'une liste arrivent **ensemble**, avec
leur écran (`arriveesDeLaListe`, v2.30) : elles arrivaient une à une, de 0,4 à 1,5 s
d'écart, et chacune comptait comme un changement. Le storyboard montre chaque écran dans
son état final.

**Les visuels à fournir** se listent en tête du studio, dans l'encadré « Avant
d'exporter » (`AvantDExporter`, `VisuelsAFournir`, v2.32) : les illustrations du Reel,
chacune avec les écrans qui la montrent, puis les images décrites écran par écran. Elles
se rangent parmi les visuels du montage à la séquence −1 (`SEQUENCE_DES_ILLUSTRATIONS`),
leur rang pour élément. Jusqu'à la v2.31, l'onglet Scènes les montrait dans des cartes de
scène, chaque scène en autant de miniatures que d'écrans : l'aperçu montre déjà chaque
écran à sa place, et il ne restait de ces cartes qu'une chose à faire, fournir les
images.

**Ce que le moteur de rendu sait dessiner borne la scène.** Ni `radial-gradient`, ni
`visibility`, ni `z-index`, ni filtre CSS : le fond Brume est une image SVG, qui porte
elle-même son dégradé radial et son grain (une tuile de 256 px, répétée). À vérifier au
premier export : le temps de rendu d'un fond à grain. Les polices de la
marque sont chargées par `@remotion/fonts`, depuis les mêmes fichiers que `index.css`,
avant la première image.

**L'export est par scène**, en MP4 1080 × 1920 H.264, **sans son** : une scène se pose sur
la voix de la prise. **Les fichiers portent le titre du contenu** (v2.23, demande de
Florent) : `vingt-minutes-pour-verifier-que-je-vaux-le-coup-9x16.mp4`, `-pub` pour la
version publicitaire, `…-scene-2-mecanique.mp4` pour une scène — le titre sans accent ni
ponctuation, coupé entre deux mots au-delà de soixante caractères (`noms.ts`). Sans titre,
`reel-9x16.mp4` et `scene-2-mecanique.mp4`, comme avant. Un bouton par scène plutôt qu'un lot : un navigateur demande une
autorisation pour plusieurs téléchargements d'un coup, et une scène se refait seule.
L'export s'annonce dans le bandeau d'activité, avec sa progression réelle, et s'annule.

**Un signal part à chaque export — corrigé le 25/10/2026.** Il était écrit ici « aucune
télémétrie » : c'était faux. `renderMediaOnWeb` (Remotion 4.0.532) envoie à
`www.remotion.pro/api/track/register-usage-point`, à chaque export réussi ou échoué,
l'origine de la page, le succès, et une clé de licence — nulle ici, avec ou sans
`licenseKey`. Constaté en interceptant les requêtes d'un export. **Rien de la vidéo ne
part** : ni image, ni son, ni texte. Le bloquer, ou déclarer la licence gratuite
(`licenseKey: "free-license"`, qui ne fait que taire un avertissement), reste à décider
par Florent ; d'ici là, le comportement est celui de la bibliothèque.

**Safari encode en temps réel — constaté le 27/10/2026.** Dans Safari 27.0.1, un
`VideoEncoder` H.264 en profil Main ou High, en mode `latencyMode: 'quality'`, ne rend
aucune image : ni sortie, ni erreur, et `flush()` ne se résout jamais. Remotion impose ce
mode, Mediabunny choisit le profil High : l'export s'arrêtait à la huitième image, et
affichait 0 % sans un mot. Le mode `'realtime'` rend toutes les images (641 sur 641 à
l'essai, d'une prise H.264 comme d'une prise HEVC). D'où `encodage.ts` : au premier
export de la page, cinq images d'essai en mode qualité. Si elles ne sortent pas en trois
secondes, un encodeur H.264 enregistré auprès de Mediabunny (`registerEncoder`) prend la
main et encode en temps réel. La sonde vise le défaut et non le navigateur : Chrome, qui
rend ses cinq images en une centaine de millisecondes, garde le chemin de Mediabunny, et
un Safari corrigé le retrouvera de lui-même. Le réglage par quantificateur, que Safari ne
connaît pas, passe son tour.

**Un rendu figé rend la main** (`veille.ts`). Remotion ne regarde le signal d'annulation
qu'entre deux étapes : figé DANS l'encodeur, il ne le voyait jamais, et « Annuler » restait
sans effet. L'annulation rend désormais la main tout de suite, et un rendu qui n'a pas
avancé d'une image depuis **une minute** s'arrête sur « il ne progresse plus depuis une
minute. Rechargez la page pour le relancer » — Remotion abandonne de lui-même, au bout de
trente secondes, une image qui tarde à se charger. Rien n'interrompt de l'extérieur un
rendu figé, et Remotion n'en mène qu'un à la fois : le suivant attendrait derrière lui,
d'où le rechargement.

**Les visuels déposés sont rangés chez Cloudflare** (§12.4.2), une ligne par (contenu,
séquence, élément), avec la description à laquelle l'image répondait. Le storyboard
signale une image déposée pour une carte dont la description a changé depuis, et se tait
— sans proposer de dépôt — quand R2 n'est pas lié au Worker.

**La vidéo ne montre jamais la description d'un visuel absent** (v2.25). Le storyboard
la montre dans un cadre pointillé : c'est la commande, à sa place. La composition animée
— aperçu comme export — la tait : la carte garde son texte, et une carte d'image seule
disparaît avec son image. Le 28/10/2026, trois descriptions de quarante-cinq mots sont
sorties telles quelles dans une vidéo exportée. Sous le bouton d'export, une ligne dit
combien d'images manquent, et qu'un écran qui n'avait qu'elle restera vide.

**Les images sont décodées avant chaque export**, et un export qui bute sur une attente de
chargement (`delayRender`) se relance **une fois**. Le 04/10/2026, un export complet a
échoué une fois sur une image restée « en chargement » 28 secondes, puis a réussi à
l'identique : un hoquet du chargement d'images de Remotion, pas un défaut de la scène.

### 12.4.2 Le montage rangé chez Cloudflare (v2.8) — NORMATIF

Décision de Florent, le 04/10/2026 : **tout chez Cloudflare**. La première version gardait
prises et visuels dans le navigateur ; un montage se perdait avec les données du site, et
ne se reprenait pas d'un autre poste.

| Quoi | Où | Pourquoi là |
| :--- | :--- | :--- |
| Fichiers des prises et des visuels | **R2**, bucket `luminose-montage`, liaison `MONTAGE` | objets volumineux ; 10 Go gratuits, sortie gratuite |
| Leur description, la transcription, les repères corrigés | **D1**, `montage_prises` et `montage_visuels` (migration 0007) | quelques kilo-octets, lus en une requête avec le reste |
| Les prises déjà téléchargées | **cache du navigateur**, base `LuminoseMontageCache` | ne pas retélécharger des centaines de mégaoctets à chaque ouverture |

**Routes** (§3.10). Une prise dépasse souvent les **100 Mo** qu'accepte une requête au
Worker : elle s'envoie en **parties de 50 Mo**, par l'envoi en plusieurs parties de R2
(`createMultipartUpload`), chacune passant par le Worker — même origine, même jeton de
session, aucune clé R2 à créer ni CORS à régler. Une partie qui échoue se rejoue une fois ;
un envoi qui échoue s'abandonne, et rien n'est gardé d'une prise à moitié envoyée.

**Remplacer une prise** retire l'ancienne et son fichier — c'est ce qui rend la place — et
reprend ses repères corrigés : on remplace souvent une prise par sa version mieux
nettoyée. Sa transcription, elle, se refait : le fichier a changé.

**Le cache local est un cache.** Sa clé est l'objet R2, neuf à chaque dépôt : un fichier
en cache sous la bonne clé est la bonne version, sans rien comparer. Une version par
place ; le vider ne perd rien.

**L'espace se surveille, et ne se dépasse pas** : le panneau affiche ce qu'occupent tous
les contenus, sur les 10 Go gratuits, et l'écran des quotas lit la taille réelle des
buckets du compte. **Un dépôt qui ferait passer le montage au-delà est refusé** (409),
avant que le moindre octet parte, en disant quoi retirer — R2 facture le surplus, et
Florent veut rester dans le gratuit (v2.9). Ce que le dépôt remplace est déduit : on peut
toujours remplacer une prise par une autre aussi lourde. Le compte se fait sur les lignes
vivantes ; un objet orphelin dans R2 lui échappe, l'écran des quotas non. Une prise
retirée rend sa place. Rien ne purge seul : effacer une vidéo qu'on a peut-être encore à
remonter n'est pas une décision à prendre à la place de Florent.

**La liaison R2 est FACULTATIVE**, comme celle de Workers AI : absente, l'état du montage
se lit quand même, et tout dépôt se refuse en 409 en disant quoi ajouter. Le bucket est
créé par `scripts/deploy.sh` s'il manque, **avant les migrations** ; s'il ne peut pas
l'être — un jeton sans droit sur R2 —, le script s'arrête là, et la production reste telle
qu'elle était.

L'export de la base (§9.4) emporte les descriptions — transcriptions, repères,
descriptions des visuels —, **pas les fichiers** : plusieurs gigaoctets de vidéo ne se
téléchargent pas d'un clic.

### 12.4.3 Où se trouve le montage (v2.10) — NORMATIF

> **Remplacé par §13 (v2.19).** L'espace Vidéos n'existe plus : une vidéo est un contenu
> de la liste Conversations, son montage est l'étape Montage, et le résumé des montages
> se lit avec les listes. Ce qui suit reste l'histoire de la décision.

Question de Florent, le 04/10/2026 : « ça se trouve où dans mon interface ? ». Le
montage vivait dans l'onglet Script d'un contenu en Brouillon, et nulle part ailleurs ;
l'espace Vidéos, où on le cherchait, ne contenait que l'outil Sous-titres. Décision :
**les deux portes**.

**L'espace Vidéos s'ouvre sur l'onglet Montage** (`#videos`, ou `#videos/montage`) ;
Sous-titres reste à côté (`#videos/sous-titres`). Montage liste les contenus dont le
format se monte — le registre le dit (`montable`, `estMontable`), l'écran ne nomme aucun
format — et dit de chacun **l'étape suivante**, pas seulement l'état :

| Ce que le montage contient | Ce que la ligne dit |
| :--- | :--- |
| pas de script lisible | « Pas encore de script — il s'écrit dans l'Atelier. » |
| un script, aucune prise | « Script prêt — à tourner. », ou le nombre de points que les contrôles (§12.3) demandent de corriger |
| une prise dont l'envoi n'a pas abouti | « Envoi de la prise interrompu — à redéposer. » |
| une prise non transcrite | « Prise déposée — transcription à faire. » |
| une prise transcrite | « Prise calée — prête à exporter. », et combien de visuels sont posés sur ceux qu'il faut |
| un export noté | « Exportée le …, en 9:16 » — le plus récent, « (publicité) » s'il l'était |

Les lignes se rangent dans l'ordre où l'on travaille : Brouillon, Prêt, Idée, Publié,
puis le plus récent d'abord. **« Ouvrir » mène au montage du contenu** : l'onglet Script
d'un Brouillon, l'aperçu d'un Prêt ou d'un Publié. Une liste vide dit où commence un
Reel expliqué et mène à la boîte à idées. Sous la liste, l'espace occupé dans R2 sur les
10 Go gratuits.

**Le montage se tient aussi sur un contenu Prêt ou Publié.** On tourne souvent après
avoir validé le script, et une vidéo publiée doit pouvoir se réexporter — en 4:5, en
version publicité. L'aperçu d'un script court y ouvre le même panneau que l'onglet
Script.

**Le résumé coûte une requête, pas une par contenu** : `GET /api/montage` lit en un
batch les prises vivantes, le nombre de visuels par contenu, le dernier export de chacun
et l'espace occupé — quatre lectures, quel que soit le nombre de Reels (§3.6).

**Chaque export réussi est noté** (`POST /api/montage/:id/exports`, migration 0008,
table `montage_exports`) : format, version, durée, date. L'export part en
téléchargement ; sans cette ligne, rien ne dirait qu'une prise a fait son office et peut
rendre sa place dans R2. C'est un journal et non une colonne : un même Reel s'exporte en
plusieurs formats et versions. Une note qui échoue ne se signale pas — le fichier, lui,
est déjà téléchargé. L'export de la base (§9.4) emporte ce journal.

### 12.5 Le calage sur la prise (V3) — NORMATIF

**La prise se dépose dans le storyboard**, telle que tournée — H.264 de préférence. Ses
silences et ses phrases reprises se coupent ici, une fois le son transcrit (§12.5.2) :
jusqu'au 25/10/2026, Florent la nettoyait d'abord dans Final Cut. Le navigateur la lit avec Mediabunny,
par morceaux : une prise de plusieurs centaines de mégaoctets ne se charge jamais en
entier, et un .mov se lit comme un .mp4. Une prise que ce navigateur ne sait pas
décoder est refusée **au dépôt**, pas à l'export : c'est ici que se fera le rendu.

**Le son part pour être transcrit.** Extrait en WAV mono 16 kHz — environ deux mégaoctets la minute —,
il va à `POST /api/transcription`, qui le passe à Whisper sur Workers AI
(`@cf/openai/whisper-large-v3-turbo`, langue `fr`) et rend les mots horodatés
(`segments[].words[]`). Pas de clé : une liaison `AI` du Worker (wrangler.toml).
**Facultative**, comme les jetons : absente, la route répond 409 en disant quoi ajouter,
et rien d'autre ne bouge. Un échec de Workers AI revient en 502 avec **son** message
(un quota épuisé se corrige). Le corps est borné à dix minutes de son : une vidéo
envoyée par erreur est refusée à la frontière. 0 requête D1.

Depuis la v2.16, Nova-3 peut remplacer Whisper à la demande (§12.5.6).

Un segment rendu sans ses mots voit son texte réparti sur sa durée, au prorata des
lettres : une approximation, mais qui laisse le calage retrouver ses repères plutôt
que de perdre tout un passage.

**Le calage est un calcul pur** (`packages/editorial/src/calage.ts`), à côté de la
découpe en mots qu'il partage avec le contrôle (§12.3) — un repère que le storyboard
trouve, le calage le trouve aussi :

1. Le script et les mots dits sont découpés pareil ; un mot de Whisper qui donne
   deux jetons (« l'envoyer ») partage sa durée au prorata des lettres.
2. Alignement global (Needleman–Wunsch) : un mot dit tel quel compte plein, un mot
   **proche** compte presque — Whisper écrit « luminoz » ce qu'il a bien entendu. Est
   proche un mot de cinq lettres ou plus, même initiale, à une lettre près (deux dès
   sept lettres). « tout » et « bout » ne le sont pas.
3. Chaque mot du script reçoit l'instant où il est dit ; un mot omis prend sa place
   entre ses voisins, au prorata des rangs. L'horloge qui en sort remplace l'horloge
   estimée dans `minuterReel` (§12.4.1) — rien d'autre ne change.
4. La **couverture** — part des mots du script retrouvés — s'affiche. Elle n'alerte plus
   qu'au-dessous de 50 % : est-ce bien la prise de ce script ? (v2.30). Jusque-là, sous
   80 %, l'écran demandait de vérifier les repères ; Florent adaptant le script à sa façon
   de parler, la prise du 30/10 n'en retrouvait que 78 %, sans qu'aucune carte tombe à
   côté. L'alerte porte désormais sur les **écrans dont aucun mot du repère n'a été dit**
   (`ecransEstimes`) : ceux-là tombent à une place estimée, et c'est eux qu'il faut
   vérifier.

**Le calage ne se stocke pas, il se déduit** de la transcription et du script : une
nouvelle rédaction recale la même prise sans rien retranscrire.

**Les repères se corrigent à la main**, élément par élément. Depuis la v2.32, chaque
écran est une étiquette posée dans le montage par le texte (§12.5.5), devant le mot où
il apparaît ; on la clique, puis le mot où l'écran doit apparaître, et le repère prend
l'instant où ce mot commence dans la prise. « Revenir au calage » rend un repère déplacé.
Jusque-là, une liste les corrigeait au dixième de seconde, par « + » et « − », en temps
de la prise : Florent ne voyait ni ce que valait 42,6 s, ni ce que changeait un clic. La
correction l'emporte sur le calage, se garde avec la prise, et survit à une nouvelle
transcription comme au remplacement de la prise par une version mieux nettoyée. Un coup
de poing suit ses mots : son étiquette se voit, elle ne se déplace pas.

**Les prises sont rangées chez Cloudflare** (§12.4.2) : le fichier dans R2, sa
description, sa transcription et ses repères dans D1 — corriger un repère ne réécrit pas
des centaines de mégaoctets.

**Les sous-titres** des passages caméra sortent des mots dits, groupés par quatre au
plus, coupés à une fin de phrase ou à un silence de plus de 0,6 s. Un mot dit qui
répond au script s'écrit **comme dans le script** (« luminose.fr », pas « luminoz ») ;
un mot improvisé, comme Whisper l'a entendu. Sauf une flexion (v2.30) : dit « les
vannes » là où le script écrit « la vanne », le mot s'écrit « vannes » — c'est ce qui a
été dit, pas une faute d'oreille. Un « ? » rendu seul rejoint son mot. Rien
sur les scènes : leurs cartes portent déjà le texte.

**Une élision se recolle** (v2.25). Whisper rend « c'est » en deux mots, « c » puis
« 'est », et détache le trait d'union (« voulez », « -vous ») : le sous-titre écrivait
« c est », et coupait parfois le bloc entre les deux — « Le jour où c / est trop lourd
c / est là que je », qui se lit comme un sous-titre en retard. Un mot se soude au
précédent quand le script les écrit sans blanc entre eux, ou, hors du script, quand
Whisper le fait commencer par l'apostrophe ou le trait d'union. Le texte de référence
d'une vidéo directe (§12.7) se recolle de même.

**La ponctuation du script guide la coupe** (v2.25), sans s'afficher : un bloc de deux
mots ou plus se ferme sur une virgule, et un groupe de cinq mots se coupe en trois et
deux plutôt qu'en quatre et un (« C'est savoir ouvrir la / vanne »). Hors du script,
c'est la ponctuation de Whisper qui compte.

**Un début de phrase du script ferme le bloc d'avant** (v2.29), ponctué ou non. Le
30/10/2026, « s'il vous plaît », improvisé et rendu sans point, s'affichait « s'il vous
plaît En », et « …tous les trous » laissait « trous » seul avant « C'est apprendre à ». Le
mot qui répond au premier mot d'une phrase — ou d'une séquence — du script ouvre un
nouveau bloc, et celui qui le précède compte comme une fin de phrase pour la coupe en
trois et deux. Un mot seul dit d'un souffle avec lui l'amorce, et reste dans son bloc :
« et Ce n'est plus », pas « et » seul à l'écran.

**Un sous-titre s'arrête où la scène commence** (v2.29) : rogné aux passages caméra, il
l'est aussi en mots, chacun au passage où il commence d'être dit. « Et donc Au lieu »
s'affichait sur le visage, avant que la scène qui commence à « Au lieu » ne le montre.

**Le mot qui se dit s'éclaire** (v2.12, décision du 24/10/2026) : chaque bloc garde ses
mots à leur instant, et le mot en cours passe en rose brumeux (`#E9B9BB`) jusqu'au
suivant. La plupart des vidéos courtes se regardent sans le son ; suivre la voix mot à
mot retient l'œil quand l'oreille est coupée. Seule la couleur change — une autre police
ou une autre taille ferait danser la ligne à chaque mot. La première référence n'en
avait pas, la seconde en a : c'est elle qui a tranché.

### 12.5.1 Le rendu final (V4) — NORMATIF

`planDeMontage` (même fichier) dit ce que la vidéo montre et quand :

- **Organique** : la prise principale, débarrassée de ses silences de tête et de queue —
  0,3 s gardées avant le premier mot, 0,6 s après le dernier — et de ce que le dérushage
  coupe (§12.5.2) : elle se monte alors en plusieurs morceaux, bout à bout.
- **Publicité** : la seconde accroche, tournée à part et calée sur son propre texte,
  puis la prise principale **reprise juste avant le premier mot de la séquence 2**. Les
  scènes gardent leurs mots ; seule l'ouverture change, et c'est elle que la publicité
  teste.

La composition (`CompositionFinale`) pose la prise en fond (`<Video>` de
`@remotion/media`, `objectFit: cover`), chaque scène par-dessus à son heure, et les
sous-titres sur les seuls passages caméra. **La voix vient de la prise et ne
s'interrompt jamais** : une scène couvre l'image, pas le son.

**Ne se sous-titre que ce que la vidéo fait entendre** (v2.29) : un mot dont le milieu ne
tombe dans aucun morceau monté ne s'affiche pas. Jusque-là, seuls les mots pris dans une
coupe étaient retirés ; ceux d'avant la tête ou d'après la queue, dans aucune coupe,
tombaient au premier ou au dernier raccord. Les deux vidéos du 30/10/2026 montraient
ainsi sur leurs trois dernières images, avant le carton, « revenir merci » et
« travaillant au cabinet. », dits deux minutes après leur fin.

**Les morceaux montés se comptent zone par zone** (v2.29) : le script de sa tête à sa
queue, chaque passage rétabli hors du script, la fin improvisée (§12.5.5) — chacun
débarrassé de ses coupes. Jamais l'étendue qui va du premier au dernier : rétablir une
phrase dite deux minutes après la fin du script ramenait tout ce qui les sépare. Un
morceau sans aucun mot dit — l'air laissé entre une coupe et le bord d'une zone — part,
quelle que soit sa longueur.

Les sous-titres reprennent l'outil Sous-titres — Futura gras, blanc, ombre `#60407F` à
315°, 430 points sous le centre du cadre vertical —, en 64 pixels du cadre. L'ombre est
une seconde couche de texte peinte avant le blanc : le moteur de rendu ne dessine pas
`text-shadow` et peint dans l'ordre du document.

**La signature** (v2.27, décision de Florent du 28/10/2026). La première vidéo exportée
ne disait ni qui parlait ni où le retrouver : elle finissait sur « je travaille au
cabinet », sans luminose.fr, que Florent n'avait pas dit et que rien ne rattrapait.
Comme la slide de signature d'un carrousel (§3.5.2), la signature est **posée par le
code, jamais par le modèle**, depuis `NOM`, `TITRE` et `SITE_URL` (`config.ts`) :

- **le bandeau**, en haut de l'accroche — le bas du cadre appartient aux sous-titres et à
  l'interface des Reels : le nom, le titre. Il entre 0,3 s après le début et s'en va
  avant la séquence suivante, trois secondes au plus ; sur une accroche où il tiendrait
  moins de 1,2 s, il ne vient pas (`bandeauDeSignature`) ;
- **le carton final**, ajouté après le dernier mot pour 2,2 s (`CARTON_FINAL`) : le nom, le
  titre, et « luminose.fr » en grand, sur le fond Brume du matin (v2.31). La vidéo s'arrête
  dessus ; il n'a pas de son.

Elle est là par défaut ; « Signature : Sans », à côté du format et de la version, la
retire pour une vidéo qui en porte déjà une.

**Une durée se compte entre deux bornes arrondies** (v2.25) : `enImages(fin) −
enImages(début)`, jamais `enImages(fin − début)`. Arrondie elle-même, la durée d'un
sous-titre empiétait d'une image sur le suivant, et deux blocs s'affichaient l'un sur
l'autre.

**Deux formats, deux versions**, au choix, et l'aperçu suit le choix : 9:16
(1080 × 1920) et 4:5 (1080 × 1350, fil Meta), organique et publicité. En 4:5, la prise
est rognée au centre et les scènes sont **recomposées** dans le cadre plus court, avec
leur propre zone sûre. Sortie MP4, H.264 et AAC.

**Ce qui n'est pas fait, et pourquoi** : pas de musique (§12.1 : optionnelle, et la
référence n'en a pas), pas de normalisation du volume (depuis
le dérushage, la prise ne passe plus par Final Cut : un son trop faible se règle au
tournage, et c'est un manque connu), pas de 16:9 (§12.4).

**Ce qui reste à vérifier sur une vraie prise.** Le parcours entier a été vérifié dans
le navigateur le 04/10/2026, avec une prise synthétique (voix de macOS) : lecture,
extraction du son, calage à 99 % malgré un mot omis et un nom mal écrit, aperçu, export
9:16 organique et 4:5 publicitaire, son et image contrôlés. **La transcription y était
simulée** : Whisper sur Workers AI n'est joignable qu'une fois le Worker déployé avec
sa liaison `AI`. Ce que rend Whisper sur la voix de Florent — présence des mots
horodatés, précision des instants — est la première chose à regarder.

Le rangement chez Cloudflare (§12.4.2) a été vérifié de la même façon, contre une
**émulation** de l'API du montage : envoi en trois parties, transcription rangée, autre
poste simulé (cache vidé, prise retéléchargée une fois puis servie par le cache), visuel
et repère retrouvés, exports 9:16 et 4:5. Le Worker et ses routes sont couverts par des
tests contre un R2 en mémoire ; **le passage du flux d'une partie à R2 (`uploadPart` sur
le corps de la requête) ne se vérifie qu'une fois déployé.**

### 12.5.2 Le dérushage (V5) — NORMATIF

Décision de Florent, le 24/10/2026, après une seconde référence
(`youtube.com/shorts/umbNtdVqQsM`) dont la voix avait été débarrassée de ses silences et
de ses erreurs sans logiciel de montage : **la prise arrive telle que tournée**, et
l'outil la nettoie. Final Cut n'est plus une étape.

**Les coupes se déduisent, comme le calage** (`packages/editorial/src/derushage.ts`) : le
calage sait quel mot dit répond à quel mot du script. Seuls se stockent les choix de
Florent qui s'écartent du défaut (`montage_prises.coupes`, migration 0010).

| Motif | Ce que c'est | Par défaut |
| :--- | :--- | :--- |
| **Silence** | plus de 0,7 s entre deux mots | **coupé** : il en reste 0,35 s, et 0,6 s entre deux phrases (v2.30) |
| **Reprise** | des mots dits hors du script qui reprennent ceux qui les entourent — on recommence une phrase ratée, ou on la répète | **coupée** : l'alignement retient la dernière version, la bonne |
| **Hors script** | trois mots ou plus dits hors du script, qui ne reprennent rien | **gardé**, et proposé : une improvisation peut être ce que la prise a de meilleur |
| **Redite** (v2.30) | un essai d'improvisation que la suite redit, autrement : 60 % de ses mots pleins (trois lettres et plus) retrouvés, dans l'ordre, dans les 25 s qui suivent | **coupée**, comme une reprise : c'est un premier jet |

Un ou deux mots improvisés (« vraiment », « et donc ») restent, sans même être proposés :
les couper ferait sauter l'image au milieu d'une phrase. On ne regarde qu'entre le premier
et le dernier mot du script — **une phrase ratée en ouverture tombe avec la tête**, que le
plan de montage retire déjà.

**L'air autour d'une coupe** : 0,2 s gardées après le dernier mot, 0,15 s avant le
suivant. Whisper place les bords d'un mot à quelques centièmes près ; couper au ras
amputerait une syllabe. Une coupe de moins de 0,25 s ne vaut pas le saut d'image qu'elle
crée, et n'est pas proposée.

**Plus d'air entre deux phrases** (v2.30, décision de Florent du 30/10/2026) : après un mot
qui finit une phrase — du script, ou ponctuée par la transcription hors de lui
(`Prononce.finDePhrase`) —, 0,35 s gardées après lui et 0,25 s avant le suivant, soit
0,6 s en tout. La vidéo du 30/10 ne gardait aucun blanc de plus de 0,6 s, et Florent la
trouvait trop rapide ; un silence plus long se coupe toujours.

**La redite** (v2.30). Florent adapte le script à sa façon de parler : refaite autrement,
une phrase ne ressemble plus assez au script pour être reconnue comme une de ses versions
(§12.5.5), et ses deux formulations restaient. Une improvisation se lit donc par **essais**,
séparés par un blanc de 0,6 s ou une fin de phrase ; un essai que la suite redit — même
règle qu'une vidéo sans script (§12.7), sur les mots pleins — se coupe d'office, le reste
se propose comme avant.

**Chaque coupe se rétablit**, et une improvisation se coupe d'un clic. Un choix porte le
motif et le début de sa coupe au dixième (`s12.4`, `r33.0`, `h41.7`) ; une nouvelle
transcription qui en décale le bord le retrouve à trois dixièmes près. Il ne passe pas à
la prise qui en remplace une autre : il désigne un instant de CE fichier. Depuis la v2.15,
tout se tranche dans le montage par le texte (§12.5.5).

**Le plan de montage monte les morceaux bout à bout** (`planDeMontage`, option `coupes`) :
chaque séquence, chaque apparition et chaque sous-titre passe du temps de la prise au
temps de la vidéo. **Un repère pris dans une coupe tombe au raccord** ; un mot coupé
quitte les sous-titres. La seconde accroche se dérushe de la même façon.

**Le cadre alterne à chaque raccord** : plan large, puis serré (zoom de 12 %, centré au
tiers haut, où est le visage), puis large. Deux morceaux de la même prise au même cadre
font sauter le visage ; à deux cadres, c'est un changement de plan.

### 12.5.3 Le rythme (V7) — NORMATIF

Décision du 24/10/2026, après la seconde référence, où quelque chose change à l'écran
toutes les deux à trois secondes. Nos passages face caméra pouvaient rester fixes dix à
quinze secondes : c'est le moment où le pouce reprend le défilement.

**Révisé le 30/10/2026 (v2.30)** : devant la vidéo de la prise du 30/10, Florent : « Le
rythme est un peu trop rapide. Ça fait beaucoup de trucs qui s'animent à l'écran et c'est
confus à suivre. » On y comptait un changement d'image franc toutes les trois secondes,
sans les lignes de liste, la jauge, le mot surligné ni le bandeau. Ses choix : plus d'air
dans la voix (§12.5.2), pas de visage éclair, moins de mouvements, des fonds en deux temps
(§12.3). Ce qui suit en tient compte.

**Le cadre ne change plus aux phrases** (v2.30), seulement aux raccords (§12.5.2). Il
alternait aussi au début d'une phrase dite face caméra, si le plan en cours avait duré au
moins 2,5 s et qu'aucun raccord n'arrivait dans la seconde ; `cadrer` sait encore le faire
(`phrases`), le plan de montage ne le lui demande plus.

**Pas de visage éclair** (`sansVisageEclair`, v2.30) : un passage face caméra de moins de
2,5 s (`VISAGE_MIN`) entre deux scènes, sans coup de poing, laisse la scène d'avant à
l'écran — elle le recouvre comme elle recouvre sa propre voix, et ses mots ne se
sous-titrent pas. La vidéo du 30/10 revenait 1,5 s sur le visage pour « la boule au ventre
le dimanche soir », entre deux scènes. Vaut pour la vidéo comme pour l'aperçu au débit
estimé.

**Le coup de poing** (`coup`, §12.3) : quelques mots plein cadre, sur le fond Brume de son
temps (v2.31) — les mots ordinaires en une ligne de capitales espacées, le passage entre
crochets en Abril italique, aussi grand que la largeur le permet. Il se pose
en un cinquième de seconde et repart sec : c'est une rupture, pas une transition. Il frappe
au premier mot de son repère et tient le temps de le dire plus 0,4 s, jamais moins de
1,5 s — 0,9 s jusqu'à la v2.29 : tenu une seconde, il passait comme un éclair — ni plus de
2,5 s. Il couvre tout, sous-titres compris ; une coupe qui en mange la fin lui laisse ses
1,5 s. Son fond suit les deux temps (§12.3) : le soir avant la bascule, le matin après — il
était prune. Le montage par le texte le montre par une étiquette devant ses mots (v2.32).

**L'image figée se signale** (`momentsFiges`) : tout intervalle de plus de **8 s** (5 s
jusqu'à la v2.29 : l'alerte poussait à rajouter du mouvement à un montage qui en avait
trop) sans
changement à l'écran — début de séquence, apparition d'un écran, ligne de liste qui arrive
(v2.26), coup de poing qui frappe ou s'en va, recadrage face caméra. Un recadrage sous une scène ne compte pas : il ne se
voit pas ; les sous-titres non plus : c'est l'image qu'on regarde. Avant le tournage,
l'alerte se calcule au débit estimé — c'est alors une
affaire d'écriture : une carte de plus, un coup de poing, une phrase coupée en deux. Sur la
prise calée, elle porte sur la vidéo qui sortira. Chaque moment s'annonce dans l'encadré
« Avant d'exporter » du studio (§13.11, v2.32 ; l'onglet Rythme jusque-là), et « Voir » mène
l'aperçu à son début.

### 12.5.4 Le son corrige Whisper (V8) — NORMATIF

Constaté le 25/10/2026 sur une vraie prise de Florent (3 min 25, plusieurs versions de
plusieurs phrases) : **quand il reprend la parole après une pause, Whisper fait commencer
le premier mot dès la fin du mot précédent**. « en » durait 4,4 s, « et » 3,7 s : le
silence était avalé par le mot. Trois défauts en découlaient — les silences
n'existaient pas pour le dérushage (une coupe en laissait 3,6 s), les coupes tombaient à
côté de la voix, et sous-titres et cartes arrivaient jusqu'à quatre secondes trop tôt.
En fin de fichier, Whisper avait aussi inventé « donc ok ok ok Merci. » sur un son à
−55 dB.

**Whisper reste l'autorité sur ce qui est dit ; le son, sur quand on parle.**

**L'enveloppe** (`packages/editorial/src/enveloppe.ts`) : le volume du son, en décibels
entiers, toutes les 10 ms, mesuré dans le navigateur sur le WAV extrait pour la
transcription (`enveloppeDuWav`, qui lit l'en-tête plutôt que de supposer le format), et
rangé avec la transcription (`transcription.enveloppe`, un caractère par mesure : 20 ko
pour 3 min 30). Une prise transcrite avant le 25/10 la reçoit à sa première ouverture,
sans rappeler Whisper.

**Où l'on parle** (`regionsDeParole`) : au-dessus d'un seuil placé à 35 % du chemin entre
le fond de la pièce (10ᵉ centile) et la voix (95ᵉ) — un seuil fixe ne vaudrait que pour un
micro et une pièce ; les trous de moins de 0,15 s sont comblés, les éclats de moins de
0,08 s ignorés. Sans contraste (moins de 6 dB), tout est parole : on ne coupe pas à
l'aveugle.

**Les mots recalés** (`recalerSurLeSon`), avant tout calage :

| Le mot de Whisper… | …devient |
| :--- | :--- |
| contient un silence de plus de 0,3 s | commence après ce silence |
| commence dans un silence | commence à la reprise de la voix |
| finit dans un silence | finit quand la voix s'arrête |
| est posé à plus de 0,15 s de toute voix | retiré : Whisper l'a imaginé |
| a ses deux bords dans la voix | inchangé : au milieu d'une phrase, le son n'en sait pas plus |

Tout ce qui suit en hérite : instants des cartes, sous-titres, silences du dérushage.

**Les bords de coupe tombent dans un silence** : poussés au bout de la voix qu'on garde,
ou ramenés au début de celle qu'on coupe, à 0,25 s près ; au-delà, au creux sonore le plus
proche. **Un morceau de moins de 0,4 s** entre deux coupes, sans un mot du script, part
avec elles : c'est un reste qui saute à l'image sans rien dire.

**Les bouts de la prise** se bornent sur un mot du script retrouvé tel quel ou presque,
jamais sur une substitution : quand la fin du script n'a pas été dite, l'alignement
l'accrochait au premier bruit venu, et la vidéo s'étirait jusqu'à lui.

**Un micro-fondu** de deux images (≈ 70 ms) adoucit le son de part et d'autre de chaque
raccord, pour qu'il ne claque pas. **Le sous-titre devance la voix d'un dixième de
seconde** : l'œil lit plus lentement que l'oreille n'entend, et un texte pile sur le son
paraît en retard.

**Le garde-fou est une vraie prise** : `packages/editorial/test/prises/digue.json` (les
mots de Whisper, l'enveloppe, le script), rejouée par `prise-reelle.test.ts`.

### 12.5.5 Le choix des prises et le montage par le texte (V9) — NORMATIF

Constaté le 25/10/2026 sur la même prise réelle : aligné mot à mot sur toute la vidéo, le
script prenait le début d'une phrase dans une version et sa fin dans une autre —
« apprenez-moi à ne » (1ʳᵉ), puis « ne plus être submergé » (2ᵉ). Et la liste des coupes
ne laissait trancher que ce qu'elle proposait.

**Les phrases** (`phrasesDuScript`, `packages/editorial/src/selection.ts`) : la voix
entière coupée aux `.`, `?`, `!` suivis d'un blanc et aux changements de séquence — pas aux
points de suspension, qui marquent une pause dans la phrase. Une phrase de moins de trois
mots (« Bon. », « Sparadrap. ») rejoint sa voisine : seule, on la trouverait partout.

**Les versions d'une phrase** (`versionsDePhrase`) : alignement « ajusté » de la phrase
entière contre la prise, répété en masquant chaque version trouvée. Une marque est glissée
par seconde de silence : une version paie chaque seconde qu'elle enjambe comme un mot
sauté, et ne va pas chercher un mot isolé dans une autre tentative. Une version retrouve
au moins 40 % de la phrase, et ne s'étale pas sur plus de deux fois sa longueur et six
mots.

**La version retenue** (`choisirLesPrises`) : une seule par phrase, d'un seul tenant, les
phrases dans l'ordre — programmation dynamique sur toute la prise. Une version est
**bonne** si elle retrouve au moins 60 % des mots, et pas plus de 15 points de moins que
la meilleure. D'abord le plus de phrases bien dites ; entre deux bonnes versions, **la
plus récente** — quand on refait une phrase, c'est d'ordinaire que la première ne
convenait pas (sur la prise du 25/10, la 1ʳᵉ disait « une fatigue qui ne dépasse pas »).
L'alignement de chaque phrase se fait dans sa version retenue : les cartes tombent sur
les mots de cette version-là.

**Une version écartée est coupée comme une reprise**, quels que soient ses mots — si
c'en est vraiment une : 60 % de la phrase et trois mots retrouvés au moins. Plus maigre,
c'est une coïncidence (« c'est » trouvé dans « c'est un bassin »), et couper sur elle
amputait une phrase bien dite.

**Le début et la fin de la vidéo** ne mordent pas sur un mot dit juste avant la première
phrase ou juste après la dernière : « s'il vous plaît | apprenez-moi » s'enchaînent sans
pause.

**Le montage par le texte** (`MontageTexte`) remplace la liste des coupes. La
transcription se lit comme un texte, **séquence par séquence** depuis la v2.21 : un bloc
par séquence du script, son repère (« 2 · Constat ») et l'instant où elle commence dans la
vidéo à gauche, ses mots à droite. En tête du studio, ce qui reste — « 1:23 gardées sur
5:53 de prise » — et « Revenir au montage proposé », qui oublie tous les choix.

**Le texte coupé se replie** (v2.32) : ce que la vidéo ne montre pas — coupes, tête et
queue comprises — ne se lit plus barré, il noyait la lecture (deux lignes barrées sur trois
dans l'accroche du 30/10). Un ✂ en marque la place ; un clic ouvre, sous la séquence, ce
qui a été coupé, tentative par tentative, chacune avec « Écouter » et « Rétablir » — ou
« Prendre cette version » quand elle est une version écartée, pour ne pas garder la phrase
deux fois.

Chaque mot dit va à une séquence (`sequenceDeChaqueJeton`) : celle de son rang s'il
répond au script ; celle de sa phrase s'il appartient à une version écartée, pour qu'une
reprise se lise à côté de celle qu'on a gardée ; sinon, par bouts d'un seul tenant, celle
du mot du script le plus proche dans le temps — une hésitation colle à la phrase qu'elle
précède, une improvisation à celle qu'elle prolonge. **Une improvisation gardée se range
là où la vidéo la montre** (v2.32) quand cette proximité l'en éloigne de plus d'une
séquence : le 30/10, l'appel à l'action redit en fin de prise se lisait sous « 10 ·
Bascule », cinq séquences avant l'endroit où il passe. À une séquence près, la proximité
l'emporte : un « Et donc » improvisé juste avant une phrase du script reste avec elle.

Le texte se tranche **par passages** : des mots qui se suivent dans le même état, coupés
à chaque version et à chaque pause de plus de 1,2 s, et, s'ils sont gardés, à chaque fin
de phrase. **Un clic sur un passage le choisit**, y mène l'aperçu, et ouvre sous la
séquence « Écouter » (l'aperçu joue à partir de là) et « Couper ». Glisser sur des mots,
ou Maj + clic, choisit un détail, qui se coupe ou se rétablit. Le silence proposé devant
un passage s'y règle : « La garder entière », ou « La raccourcir ». Quand une phrase a
plusieurs vraies versions, la retenue porte la pastille « dite 2 fois » ; elle ouvre les
versions, dans l'ordre de la prise, chacune à **écouter dans la prise brute** — une
version écartée n'est pas dans la vidéo, un lecteur hors de la page la joue du début à la
fin — puis à choisir. Elle remplace la puce « version 2 sur 2 », qui passait à la
suivante sans les montrer.

**Les écrans sont des étiquettes dans le texte** (v2.32), devant le mot où ils
apparaissent, d'un point sombre ou clair selon leur temps (§12.3) ; en orange, pointillée
quand leur image manque, pleine quand leurs mots n'ont pas été dits. Une étiquette se
clique, puis un mot : l'écran y apparaîtra (§12.5). Un coup de poing a la sienne, éclair
en tête, qui ne se déplace pas.

**Les choix se rangent avec la prise**, dans le même objet que ceux du dérushage :

| Clé | Valeur | Ce qu'elle dit |
| :--- | :--- | :--- |
| `s12.4`, `r33.0`, `h41.7` | oui / non | une coupe proposée, coupée ou gardée |
| `m12.30-14.85` | oui / non | un passage tranché à la main, coupé ou gardé — la main a le dernier mot |
| `p9` | un nombre | la phrase 9 se prend dans la version qui commence à cet instant (à 1,5 s près : l'enveloppe peut recaler son premier mot après coup) |

Un passage tranché à la main qui recouvre une coupe proposée tranche cette coupe-là.
**Ailleurs, le dernier geste l'emporte** (`trancherUnPassage`, v2.20) : le passage remplace
les choix à la main qu'il contient, et rogne ceux qu'il chevauche dans l'autre sens — un
bout de moins de 0,3 s disparaît. Avant, un passage gardé soustrayait toujours ses
secondes aux coupes : recouper ce qu'on venait de rétablir ne coupait rien.

**Rétablir vaut aussi hors du script** (v2.20). Un passage gardé à la main avant la
première phrase ou après la dernière étend ce qui est monté (`planDeMontage`, options
`retablis` et `retablisAccroche`) : sans cela, la fin improvisée d'une prise ne pouvait
jamais revenir. (Les boutons « Rétablir la fin · 2,4 s » et la barre de sélection de la
v2.20 ont cédé la place, en v2.21, au clic sur le passage barré.) Depuis la v2.29, il
étend ce qui est monté de lui-même seulement, pas de tout ce qui le sépare du script
(§12.5.1).

**La fin improvisée** (v2.29). Le 30/10/2026, l'appel à l'action n'a jamais été dit tel
qu'écrit : Florent l'a improvisé cinq fois, de 214 à 345 s d'une prise de 5 min 53, et rien
n'y répondait au script. Les deux vidéos exportées s'arrêtaient net sur la phrase d'avant,
« c'est apprendre à ouvrir les vannes ». Désormais, **quand la dernière phrase du script
n'a pas été dite**, la dernière tentative dite après le dernier mot du script la remplace
(`Calage.finImprovisee`) : la dernière suite d'au moins cinq jetons que ne sépare aucune
pause de plus de 1,2 s. Les essais d'avant restent barrés — quand on refait, c'est que
l'essai d'avant ne convenait pas — et chacun se rétablit d'un clic ; la fin improvisée se
barre comme tout passage. Elle se dérushe comme le reste (silences), appartient à la
dernière séquence, et son cadre change à ses phrases et à ses respirations (0,25 s), faute
de phrases du script. Quand la fin du script a été dite, rien ne s'ajoute : une
improvisation d'après reste barrée, comme avant.

**Une reformulation commence avec sa phrase** (v2.29). La même prise ouvrait sur deux
accroches formulées autrement : « Je veux mieux gérer mes émotions, s'il vous plaît », puis
« Bonjour, moi ce que je voudrais, c'est mieux gérer mes émotions ». La seconde retenue, sa
version commençait à « je », premier mot qui répond au script, et la vidéo s'ouvrait sur
« je voudrais, c'est mieux gérer… ». Une version retenue qui retrouve moins de 80 % de sa
phrase est une **reformulation** : les mots dits juste avant elle, depuis la dernière
respiration (0,5 s) et sur six jetons au plus, en font partie (`Prononce.amorce`). Ils
ouvrent la vidéo quand elle l'ouvre, et ne partent pas avec la reprise qui la précède.
Rien sans respiration — « …plus forte en rebouchant tous les trous, c'est apprendre »
enchaîne deux phrases —, ni devant une version dite presque mot pour mot : « s'il vous
plaît | apprenez-moi » reste dehors, comme ci-dessus.

Une version imposée **entraîne sa suite** : la phrase qui la suit dans la même tentative,
sans pause notable, est préférée aux autres bonnes versions — choisir la première version de
« Derrière la digue », c'est choisir cette tentative. « Revenir au montage proposé »
oublie tous les choix.

### 12.5.6 Deux moteurs de transcription (V10) — NORMATIF

Les instants de Whisper sont approximatifs (§12.5.4). Workers AI propose aussi **Deepgram
Nova-3** (`@cf/deepgram/nova-3`), qui transcrit le français et a la réputation d'horodater
les mots plus justement — réputation à vérifier sur la voix de Florent, d'où un choix
plutôt qu'un remplacement.

| Moteur | Coût (Workers AI) | Rôle |
| :--- | :--- | :--- |
| Whisper (`@cf/openai/whisper-large-v3-turbo`) | ≈ 47 neurones la minute de son | le défaut, au dépôt |
| Nova-3 | ≈ 470 neurones la minute — dix fois plus | sur demande, pour comparer |

Avec 10 000 neurones gratuits par jour, Nova-3 transcrit une vingtaine de minutes de son
quotidiennes : assez pour des Reels, et l'écran des quotas (§0.4) le compte comme le reste
de Workers AI.

**La route** (`POST /api/transcription`) prend `moteur` (`whisper` par défaut, ou
`nova-3`). Nova-3 reçoit le WAV en flux d'octets (`audio: { body, contentType }`), avec la
ponctuation demandée : le mot ponctué est celui qu'on garde. Les deux moteurs rendent la
même forme — les mots, le texte, la durée, et **le moteur** — : le reste de la chaîne
(enveloppe, choix des prises, dérushage) ne sait pas qui a transcrit. Une panne nomme le
moteur qui a échoué.

**L'écran** : « Transcrire à nouveau : Whisper | Nova-3 » sous la prise, et la ligne du
calage dit qui a fait la transcription affichée. Le dépôt transcrit toujours avec
Whisper ; si Nova-3 l'emporte sur pièces, il deviendra le défaut par décision de Florent.

**Première comparaison, le 30/10/2026**, sur la même prise exportée deux fois : la vidéo
transcrite par Whisper ne garde aucun blanc de plus de 0,6 s ; celle de Nova-3 en garde
quatre, de 1 à 1,8 s, et s'ouvre sur une accroche coupée au milieu de sa phrase (§12.5.5,
« Une reformulation commence avec sa phrase »). La cause des blancs n'est pas établie : la
transcription de Nova-3 n'a pas été relue, seule la vidéo l'a été. Le défaut reste Whisper.

### 12.5.7 Les réglages d'une prise (V11) — NORMATIF

Constaté le 26/10/2026 sur une prise de Florent, enregistrée dans QuickTime sur le Mac
(qualité « Maximale », donc ProRes 422, 4K, 25 images/s) : l'image vient d'une caméra
montée à la verticale, livrée **couchée** (3840 × 2160, aucune rotation dans le fichier),
et le son d'un **micro USB** (Blue Yeti). Deux chaînes de capture, deux latences : les
lèvres précèdent le son de 150 à 250 ms, dès les premières secondes et jusqu'à la fin —
mesuré image par image aux reprises de parole. Rien de tout cela ne se lit dans le
fichier.

**Deux réglages par prise**, rangés avec elle (`montage_prises.decalage_son`,
`montage_prises.rotation`, migration 0011) :

| Réglage | Valeur | Effet au rendu |
| :--- | :--- | :--- |
| `rotation` | 0, 90, 180, 270 (°, sens horaire) | l'image tourne dans une boîte aux dimensions du cadre inversées, puis la remplit (`cover`) |
| `decalageSon` | secondes, positif si le son arrive APRÈS les lèvres ; ± 2 s | **l'image** est avancée d'autant ; le son ne bouge pas |

Le temps du montage est celui du son : mots, coupes, sous-titres et cartes en viennent.
Corriger la synchronisation déplace donc l'image, jamais le son — rien d'autre ne bouge.
Une prise décalée se rend en deux éléments par morceau (`<Video muted>` pour l'image,
`<Audio>` pour le son, depuis le même fichier) ; sans décalage, un seul.

**Le décalage se règle en images** (1/30 s), en regardant l'aperçu : un mot qui commence
par p, b ou m, les lèvres doivent s'ouvrir avec le son. Une mesure automatique a été
tentée sur la prise du 26/10 (mouvement et ouverture de la bouche contre le niveau du
son) : trop bruitée pour décider. Un clap en début de prise rend le réglage évident.

**Une prise neuve reprend les réglages de la plus récente au même format** (largeur et
hauteur du fichier), de n'importe quel contenu : même caméra, même micro, même décalage.
Remplacer une prise ne garde ses réglages que si la nouvelle a son format. Sans prise au
même format, elle part de zéro. Révisé le 28/10/2026 (v2.25) : une prise 1920 × 1080
avait reçu le décalage de −0,13 s d'une prise tournée avec une autre caméra. La
recherche est la cinquième requête de la déclaration, épargnée quand la prise remplacée a
le même format.

**Une prise horizontale le dit** (v2.25, `cadrageVertical`). En 9:16, la vidéo la remplit
(`cover`) : elle n'en garde que le centre, et l'agrandit d'autant. Constaté sur une prise
1920 × 1080 : un tiers de l'image, agrandi 1,8 fois — une image adoucie, un visage qui
remplit le cadre, des sous-titres posés sur la bouche. Rien ne l'empêche ; les réglages de
la prise le disent, une fois la rotation appliquée.

Vérifié à l'export sur la prise du 26/10 convertie en H.264 : rotation d'un quart de
tour, son recalé de 200 ms — chaque image de la vidéo produite est celle de la prise
200 ms avant le son, à 20 ms près.

**Le ProRes ne se lit pas dans le navigateur** (WebCodecs ne le décode pas, Chrome
compris) : le dépôt le refuse en disant le remède — enregistrer en qualité « Haute »
(H.264) dans QuickTime, ou convertir en H.264 ou HEVC. Sur le Mac, `avconvert -p
Preset1920x1080 -s prise.mov -o prise.mp4` convertit 79 s de ProRes 4K en 12 s.

### 12.6 Phasage — NORMATIF

Une branche par étape ; aucune ne laisse l'application cassée, et chacune sert seule.

| # | Étape | Critère de sortie |
| :--- | :--- | :--- |
| **V1** | **Le format** — grille, contrôles, storyboard statique dans l'onglet Script | Un Reel expliqué rédigé sur un vrai sujet, lisible et tournable tel quel |
| **V2** | **Les scènes animées** — composition Remotion, emplacement des visuels, aperçu cadencé sur le débit estimé, export des scènes seules | Les scènes d'un vrai script exportées en MP4 et posées dans Final Cut |
| **V3** | **Le calage** — dépôt du rush, son extrait, Whisper mot à mot, repères alignés, ajustement à la main (§12.5) | Les scènes tombent sur les bons mots d'une vraie prise |
| **V4** | **Le rendu** — face caméra, scènes, sous-titres, 9:16 et 4:5, seconde accroche (§12.5.1) | Une vidéo publiée, et une variante publicitaire |
| **V5** | **Le dérushage** — silences, reprises, improvisations ; cadre alterné aux raccords (§12.5.2) | Une prise brute, déposée sans passer par Final Cut, sort publiable |
| **V6** | **Les sous-titres mot à mot** — le mot qui se dit s'éclaire (§12.5) | Un Reel suivi sans le son |
| **V7** | **Le rythme** — recadrage aux phrases, coup de poing, moments figés (§12.5.3) | Une vidéo dont l'image change au moins toutes les cinq secondes |
| **V8** | **Le son corrige Whisper** — mots recalés, coupes dans les silences, micro-fondu (§12.5.4) | Une prise brouillonne sort sans silence de plus d'une seconde ni syllabe amputée |
| **V9** | **Le choix des prises et le montage par le texte** (§12.5.5) | Aucune coupe ne joint deux versions au milieu d'une phrase ; tout passage se tranche en lisant |
| **V10** | **Deux moteurs de transcription** — Whisper et Nova-3 (§12.5.6) | La même prise, transcrite par les deux, départage le défaut |
| **V11** | **Les réglages d'une prise** — rotation, synchronisation du son (§12.5.7) | Une prise couchée et décalée sort droite et synchrone |
| **V12** | **La vidéo directe** — Script Reel monté, vidéo sans script, hésitations (§12.7) | Une vidéo face caméra, filmée d'un jet, sort publiable sans Final Cut |
| **V13** | **Ce qu'a montré la première vidéo** — élisions recollées, coupe des sous-titres à la ponctuation, export sans gabarit, réglages au même format (v2.25) | La prise du 28/10 sort sans « c est », sans sous-titres superposés, sans description à l'écran |
| **V14** | **Un écran à la fois** — schémas dessinés et animés, illustration de la métaphore (v2.26) | La même prise, redécoupée écran par écran : aucune scène de plus de six secondes, aucune image figée |
| **V15** | **La signature** — bandeau sur l'accroche, carton final (v2.27) | Une vidéo qui dit qui parle et où le retrouver, même quand l'adresse n'a pas été dite |
| **V16** | **L'illustration générée** — style des pages du site, par OpenRouter (v2.28) | Un Reel dont l'illustration n'a été ni dessinée ni cherchée par Florent |
| **V17** | **Ce qu'a montré la prise du 30/10** — fin improvisée, reformulation qui commence avec sa phrase, rien en sous-titre hors de la vidéo ni à cheval sur deux phrases ou sur une scène, zones montées une à une (v2.29) | La prise du 30/10 sort avec son appel à l'action improvisé, sur une accroche entière, sans un mot affiché qu'on n'entend pas |
| **V18** | **Le calme, et la prise fait foi** — plus d'air, pas de visage éclair, moins de mouvements, fonds en deux temps ; redites, flexions, alerte sur les écrans estimés (v2.30) | La prise du 30/10, réexportée, se suit sans effort, et aucune alerte ne tient à l'écart entre le script et la parole |
| **V19** | **Les écrans en Brume** — fond d'atmosphère par temps, eau dans le paysage, liste sans pastilles, mot-clé en Abril, coup de poing et carton final (v2.31) | Un Reel dont les écrans tiennent dans la série des illustrations du site |
| **V20** | **Le studio sans onglets** — « Avant d'exporter », texte coupé replié, une phrase se clique, un écran se place d'un clic sur un mot, la prise en tiroir, les improvisations là où la vidéo les montre (v2.32) | La prise du 30/10 se monte sans changer d'onglet ni compter en dixièmes de seconde |

Au 04/10/2026, les quatre étapes sont écrites et vérifiées dans le navigateur ; les
critères de sortie, eux, demandent une vraie prise et une vraie publication.


### 12.7 La vidéo directe (V12) — NORMATIF

Demande de Florent, le 26/10/2026 : une vidéo **sans animation** — face caméra de bout en
bout — doit pouvoir passer par l'outil aussi, pour se passer de Final Cut. Décision : **les
deux** — depuis un Script Reel, et sans script du tout.

**Le registre dit ce que chaque format donne au montage** (`FormatDefinition.versMontage`,
`animee`) ; `estMontable` et l'espace Vidéos le lui demandent, sans nommer de format :

| Format | Ce que voit le montage | Sorte |
| :--- | :--- | :--- |
| Reel expliqué | ses séquences, telles quelles | avec animations |
| Script Reel | chaque section non vide : un passage face caméra (`voix` = son texte) | directe |

**Une vidéo directe sans script** est un Script Reel dont le brouillon n'a pas de section
(`VIDEO_DIRECTE`). Elle se crée dans Vidéos → Montage (« Nouvelle vidéo directe » : un
titre, et le contenu naît en Brouillon, ouvert sur son montage). Son texte de référence
vient de la transcription (`scriptDepuisLaTranscription`, `packages/editorial/src/directe.ts`) :

1. Les mots, **recalés sur l'enveloppe** (§12.5.4) — sans quoi Whisper avale les pauses, et
   une phrase reste collée à sa reprise.
2. Découpés en phrases : une ponctuation forte de Whisper, ou une pause de 0,6 s. Les
   hésitations (« euh », « hum »…) n'y entrent pas.
3. Une phrase dont 60 % des mots se retrouvent, dans l'ordre, dans l'une des trois
   suivantes (à moins de 25 s) est une **première version** : on n'en retire que la
   tentative ratée — à partir du point le plus tardif d'où l'on retrouve encore autant de
   mots de la reprise —, ce qui la précède restant. Sur la prise du 25/10, « la boule au
   ventre… les larmes… » précédait sans pause la version ratée de « Derrière la digue », et
   ne devait pas partir avec elle. Ce qui se dit de court entre le raté et sa reprise
   (« pardon », « je reprends ») part avec le raté.

Le reste de la chaîne — choix des prises, dérushage, montage par le texte, sous-titres,
réglages, rendu — n'y voit qu'un script : la première version d'une phrase redite devient
une version écartée, et se coupe. Sans script, c'est la dernière version qui gagne ; le
montage par le texte la change d'un clic. Rejouée sur la prise réelle du 25/10, la vidéo
sans script fait 75 s, contre 73 s avec.

**Les hésitations se coupent d'office**, dans toutes les vidéos : un passage hors script
fait seulement d'hésitations est une coupe `hesitation` (clé `e…`), même d'un seul mot.

**L'espace Vidéos → Montage** (jusqu'à la v2.19 ; depuis, « + Nouveau → Vidéo directe »
dans Conversations, §13.8) dit sur chaque ligne « Directe » ou « Avec animations », et
propose « Nouvelle vidéo directe » et « Nouveau Reel expliqué » (qui mène à la boîte à
idées). Une vidéo directe ne s'y liste que **en chantier** — Brouillon ou Prêt, une prise
déposée, ou pas de script — : les Script Reels publiés avant, jamais montés ici,
encombreraient la liste. **Le panneau de montage** d'une vidéo directe n'a ni repère ni
export de scènes seules ; sans script et sans prise, il dit que la transcription servira de
texte.

## 13. Contenus : le fil (v2.19) — NORMATIF

Demande de Florent, le 26/10/2026 : « je suis perdu dans l'interface ». L'onglet Script
d'un Reel expliqué mêlait le script et tout le montage ; Vidéos → Montage listait des
idées et des vidéos publiées ; un contenu s'ouvrait tantôt sur un onglet, tantôt sur un
autre. Une refonte dessinée avec Claude Design (passation « Contenus, le fil »,
27/10/2026) en est sortie. Cette section en fixe le modèle ; l'écran la suit.

### 13.1 Une étape calculée, jamais stockée

Les quatre statuts — Idée, Brouillon, Prêt, Publié — restent en base mais **ne
s'affichent plus**. « Brouillon » couvrait sept situations, d'un atelier à peine ouvert à
un script prêt à tourner. L'écran montre l'**étape**, calculée par une seule fonction
pure, `etapeCourante` (`packages/editorial/src/etape.ts`), à partir de :

- `contents` : statut, brouillon, slides, analyse, série et rang, date de publication,
  état de la session Coach ;
- la conversation Coach, comptée (messages, tours) ;
- la **dernière relecture à froid** du journal, comparée à la dernière production qui a
  écrit le brouillon — plus ancienne, elle jugeait un autre texte ;
- le résumé des montages (`GET /api/montage`) : prise, transcription, export ;
- ce que l'onglet fait en ce moment : un envoi, une transcription, un export.

Elle rend `{ sorte, etape, libelle, geste, progression }`. Les listes, le sélecteur
d'étape et la règle d'arrivée la lisent tous : **ils ne peuvent plus se contredire.**

### 13.2 Les fils d'étapes, par sorte

Le registre compose le fil, sans qu'aucun format soit nommé : `rendu: 'slides'` (nouveau,
le carrousel) ajoute l'étape Slides, `versMontage` ajoute Tournage et Montage. Une vidéo
dont le brouillon n'a aucune séquence est une vidéo directe sans script (§12.7).

| Sorte | Étapes | Segments de la barre de progression |
| :--- | :--- | :--- |
| Écrit | Ouverture · Atelier · Brouillon · Publication | ouvert · atelier validé · brouillon · relu Publiable · bon à publier |
| Carrousel | Ouverture · Atelier · Brouillon · Slides · Publication | ouvert · atelier validé · brouillon · relu Publiable · slides · bon à publier |
| Vidéo | Ouverture · Atelier · Script · Tournage · Montage · Publication | ouvert · atelier validé · prête à tourner · prise déposée · exportée |
| Vidéo directe sans script | Montage · Publication | prise calée · exportée |

Un segment est fait dès qu'un segment plus avancé l'est : une vidéo exportée a forcément
été tournée. Un contenu publié est complet, même une vidéo publiée avant le montage
intégré.

**Écart avec la passation :** un format qui ne se relit pas à froid (article, newsletter,
script YouTube — décision du 26/08/2026, §4 de `formats.ts`) n'a pas de segment « relu »,
et son brouillon se dit « Brouillon écrit » plutôt que « pas encore relu » : l'écran ne
promet pas une relecture qui ne viendra pas.

### 13.3 Les libellés

La première ligne qui s'applique l'emporte. Ils sont repris tels quels de la passation.

**Une vidéo** : `Publié le 12 oct.` ou `Programmé le 3 nov.` · `Export en cours · 40 %` ·
`Exportée le 20 oct. · 9:16` · `Envoi de la prise · 62 %` · `Transcription en cours` ·
`Envoi interrompu · à redéposer` · `Prise déposée · à transcrire` · `Montage · 2 visuels à
déposer` · `Montage · prête à exporter` · `Montage · déposez la prise` (sans script) ·
`Prête à tourner` · `Script · 2 points à corriger` (les contrôles du format) · `Script écrit`.

**Un écrit ou un carrousel** : la date de publication · `Bon à publier` · `Slides prêtes` ·
`Relu : Publiable · slides à produire` · `Brouillon · relu : Publiable` · `Brouillon · relu :
2 points` · `Brouillon · pas encore relu` (ou `Brouillon écrit`, §13.2).

**Avant le brouillon** : `Préparée` / `À préparer` (une idée) · `Rédaction à relancer` (atelier
validé sans brouillon : la rédaction a échoué) · `Atelier · 4 tours` · `À ouvrir · préparée`
(analysée, ou posée par le plan de série) · `À ouvrir`.

Une vidéo **exportée puis retouchée** reste « Exportée » (décision de Florent, 27/10/2026) :
l'étape suit le dernier export, le bouton devient « Exporter à nouveau ».

### 13.4 La règle d'arrivée

Un contenu **s'ouvre sur son étape courante**, d'où qu'on vienne — liste, série,
calendrier, recherche, lien. La provenance ne décide que du libellé du retour. La
première ligne qui s'applique :

1. publié : Publication ;
2. vidéo exportée : Publication ;
3. vidéo avec une prise, même interrompue, ou vidéo sans script : Montage ;
4. vidéo prête à tourner : Tournage ;
5. écrit ou carrousel bon à publier : Publication ;
6. un brouillon : l'étape d'écriture — Brouillon, Script, ou Slides si elles existent ;
7. aucune session Coach : Ouverture ;
8. sinon : Atelier.

Une étape écrite dans l'adresse est respectée (rechargement, retour du navigateur).

### 13.5 Le geste qui attend

C'est le filtre de la liste Conversations : vidéo exportée → **Publier** ; vidéo avec une
prise, ou sans script → **Monter** ; vidéo prête à tourner → **Tourner** ; écrit ou
carrousel prêt → **Publier** ; sinon **Écrire**. Un contenu publié n'attend rien.

### 13.6 Les gestes de Florent

Trois gestes seulement changent un statut : **« Bon à publier »** (remplace « Marquer
comme Prêt », écrit `Prêt`), **« Marquer prête à tourner »** sur une vidéo (écrit aussi
`Prêt`), **« Marquer publié »** avec une date (écrit `Publié`). « Repasser en écriture »
revient à `Brouillon`. Un dépôt, une transcription ou un export **ne déplacent jamais
l'écran** : on exporte souvent deux versions d'affilée. **Mais l'étape se relit aussitôt**
(v2.23) : chaque relecture du montage après un changement prévient l'application, qui
relit le résumé des montages (`useMontage`, `onChange`). Le sélecteur ouvre la
Publication, le libellé devient « Exportée le 28 oct. · 9:16 » et la série le dit — le
28/10/2026, il fallait recharger la page pour le voir.

Une vidéo exportée se publie **directement**, même jamais marquée « prête à tourner »
(décision de Florent, 27/10/2026) : `Brouillon` → `Publié` est un passage permis.

**Chaque changement de statut est daté** dans la table `gestes` (migration 0012) : le
statut posé, celui d'avant, l'instant. C'est le Worker qui l'écrit, dans le même batch que
le `PATCH` qui change le statut : aucun bouton ne peut l'oublier, et un statut renvoyé tel
quel n'est pas un geste. Pas dans `generations` : le journal est réservé à ce que l'IA
produit (§2.6). L'export de la base (§9.4) emporte les gestes.

**Un déplacement entre séries est un geste aussi (v2.36, migration 0016).** `nature` vaut
`deplacement` (et `statut` pour tous les autres) ; `detail` dit d'où et vers où — série,
titre, rang —, les titres figés au moment du geste : renommer ou supprimer la série plus tard
ne réécrit pas le fil. `statut` et `avant` y répètent le statut, qui n'a pas changé. Le fil
le dit en une phrase (`phraseDuDeplacement`, `series.ts`) : « Déplacé de « A » n° 4 vers
« B » n° 2. », « Sorti de la série « A » (n° 4). », « Rangé dans « B » n° 2. », « Déplacé du
n° 4 au n° 2 dans « A ». » Réordonner une série n'en laisse pas.

### 13.7 Le fil

Le fil d'un contenu est le journal des productions rendu lisible — analyse, brief,
rédaction, ajustement, relecture, slides, plan —, avec les messages de la conversation
Coach intercalés par date, les gestes de Florent et les événements du montage.

**La liste a besoin du dernier fait de chaque contenu** sans l'ouvrir.
`GET /api/contents/fils` le rend pour tous en **un batch de six lectures**, quel que soit
le nombre de contenus (§3.6) : les messages Coach comptés, le dernier message, les dates
de la dernière production qui a écrit le brouillon et les slides, la dernière relecture
(verdict, et nombre de points : problèmes relevés et contrôles en échec), la dernière
production, le dernier geste. Les charges ne voyagent pas : des extraits de 240
caractères, et le verdict lu par `json_extract` — gardé par `json_valid`, pour qu'une
relecture illisible n'emporte pas la liste. Le résumé des montages porte désormais les
dates de la prise (déposée, envoyée, transcrite).

### 13.8 Les listes (F2)

La barre latérale perd l'entrée **Vidéos** ; le panneau Contenus passe de six entrées à
trois, chacune avec son compteur. Un contenu est dans **une** liste, et une seule :

| Entrée | Contient | Adresse |
| :--- | :--- | :--- |
| Conversations | tout contenu ni idée ni publié | `#social/conversations` |
| Idées | les idées | `#social/ideas` |
| Publiés | publiés et programmés, en liste ou en calendrier | `#social/publies`, `?vue=calendrier` |

Un plan de série s'ouvre à `#social/series/<série>`. **Les adresses d'avant restent
valables** : `drafts` et `ready` mènent à Conversations, `calendar` au calendrier des
Publiés, `archive` aux Publiés, `#videos/…` à Conversations — remplacées sans entrée
d'historique, pour que « retour » n'y ramène pas.

**Conversations** a une barre d'outils d'une ligne : la recherche, les filtres par geste
(§13.5) avec leur compte, et **« + Nouveau »**, qui ouvre trois choix — une idée (la
ligne s'écrit dans Idées), une série (un titre, puis le plan), une vidéo directe (un
titre, puis son montage). Les séries viennent d'abord, une carte chacune, ses
publications dans l'ordre du plan ; une série en cours sans publication garde sa carte,
sans quoi un plan pas encore généré ne se retrouverait nulle part. Puis le hors série,
**les plus avancés d'abord** : on finit ce qui est presque fini. Chaque ligne porte le
rang dans la série, le titre, le format, le dernier fait du fil (§13.7) avec son moment,
la barre d'avancement et l'étape.

**Idées** n'a plus de verdict, ni en étiquette ni en filtre : l'Analyste et son prompt
restent, mais « Valide », « Trop lisse », « À revoir » étaient une porte qui n'arrêtait
rien. Une idée y est « Préparée » ou « À préparer ». L'ajout exige un format.
**« Préparer 3 idées »** remplace « Analyser tout » : l'Analyste prépare les trois idées
les plus récentes qui ne le sont pas — on prépare ce qu'on va ouvrir bientôt.

**Disparaissent** : l'espace Vidéos (`MontageView`, `Video/sections.ts`), l'outil
Sous-titres (`SubtitleConverter`, .srt → Final Cut : Final Cut n'est plus une étape,
§12.5.2), la liste des Séries (`SeriesView` : une série se trouve dans Conversations et
se crée par « + Nouveau »), les tableaux triables (`SocialGridView`, `TriTableau`).

Tant que le cadre du contenu n'est pas refait (F3), un contenu s'ouvre dans l'éditeur
d'avant, sur l'onglet qui correspond à son étape d'arrivée (§13.4).

### 13.9 Le cadre d'un contenu ouvert (F3)

Le même cadre à toutes les étapes. Le panneau Contenus et le bandeau de l'application
s'effacent ; le rail reste. Un **bandeau de 80 px** porte le retour (libellé de la liste
d'où l'on vient, ou « Plan de la série »), le titre en Abril Display — modifiable en
place —, les pastilles format · objectif · plateformes, et le **sélecteur d'étape**.

**Le sélecteur sépare l'état de la navigation** (`etapesDuSelecteur`, `etape.ts`). Une
ligne par étape du fil : faite (coche), actuelle (« étape actuelle »), ou **verrouillée**
quand ce qu'elle montrerait n'existe pas — Brouillon, Script, Tournage et Montage sans
brouillon, Slides sans slides, Publication tant que le contenu n'est ni bon à publier ni
exporté. Une étape verrouillée reste visible, à 40 %, avec sa raison en info-bulle. Son
statut s'affiche à droite (« relu : Publiable », « prise calée », « Publié le 12 oct. »).
Une adresse qui demande une étape absente ou verrouillée retombe sur l'étape courante.

**Le pied (48 px)** dit « Enregistré automatiquement », le coût IA (« ≥ » quand une partie
n'est pas chiffrée, §2.6) et « Supprimer ce contenu ». **Il n'y a plus de bouton
« Enregistrer »** : ce qu'on tape — titre, notes, format — part une seconde après la
dernière frappe ; un échec s'affiche en rouge, avec « Réessayer ».

**La matière a une seule action principale**, toujours à la même place, et un « ⋯ » pour
le reste ; une action indisponible reste visible avec sa raison :

| Étape | Action principale | Dans « ⋯ » |
| :--- | :--- | :--- |
| Brouillon, écrit | Bon à publier — indisponible tant que la relecture du texte d'aujourd'hui relève des points | Relire à froid, Régénérer, Modifier à la main |
| Brouillon, carrousel | Produire les slides | Relire à froid, Régénérer, Modifier à la main |
| Slides | Bon à publier | Reproduire les slides |
| Script | Marquer prête à tourner — indisponible tant que les contrôles du format échouent | Relire à froid, Régénérer |
| Tournage | Déposer la prise (mène au Montage) | Repasser en écriture |
| Contenu déjà prêt | — | Repasser en écriture |

**« Modifier à la main » est un ajout à la passation**, qui ne le mentionnait pas : la
retouche directe d'un écrit existait, et rien ne disparaît sans décision.

Le corps de la matière : à l'Ouverture, les notes et le format (le format se fige à
l'ouverture de l'atelier) ; au Brouillon, le texte (une carte par slide pour un carrousel,
avec sa longueur sur 140) ; aux Slides, leurs vignettes puis les prompts d'image, chacun
avec « Copier » et « Illustrer » (v2.37) ;
au Script, une carte par séquence et son minutage estimé ; au **Tournage, le script en
grand avec ce qui sera à l'écran** — Florent ne lit pas en filmant, il s'approprie le
texte avant ; à la Publication, ce qui sera publié — pour un Post Texte, le texte et le
prompt d'image à copier, et « Illustrer » (v2.37) — et le bloc « Publier » (plateformes,
date, « Marquer publié », « Repasser en écriture », « Décliner en série »).

« Bon à publier » mène à la Publication, « Marquer prête à tourner » au Tournage.
**Le sélecteur de modèle n'est pas dans le cadre** : il reste sur les listes, et chaque
action garde son modèle réglé (Réglages → Modèles IA). Le menu des modèles d'image fait
exception, comme au studio (§12.3) : Illustrer se choisit au moment de générer, le réglage
de la famille donnant le défaut.

### 13.10 Le fil (F4)

À gauche de la matière, sur fond `fil`, **le fil** : le journal des productions rendu
lisible (`composerLeFil`, `fil.ts`), avec la conversation Coach intercalée par date, les
gestes et ce que le montage a fait. Des bulles de messagerie, les voix de l'IA à gauche,
Florent à droite, ancrées en bas : le dernier message est celui qui dit où en est le
contenu.

- **L'analyse ouvre le fil** : objectif, plateformes, angle, métaphore, et « ce qui
  manque » quand l'Analyste ne trouvait pas l'idée prête — sans son verdict (§13.8).
- **Un atelier validé se replie** en une ligne pointillée, « Atelier · 6 messages ·
  validé », qui se relit par « Lire la trame » (v2.24 : « Déplier » ne disait pas que la
  trame du Coach était là). Un message du Coach se lit en markdown — gras, listes
  numérotées, et le tableau de la carte de la métaphore (§13.14).
- **Le brief verrouillé** dit ce qu'il retient — « 4 interdits, 2 questions ouvertes » —
  et se déplie, « Lire le brief », sur la carte de la métaphore, les images écartées, les
  interdits et les questions ouvertes. Des questions ouvertes mettent la bulle en
  alerte : le Rédacteur écrit sans leurs réponses.
- **Une relecture** dit son verdict, ce qu'un inconnu a compris, et ses points. La
  dernière, si elle juge le texte d'aujourd'hui, porte « Appliquer les corrections » et
  « Ignorer » ; appliquée, elle porte sa date. Quand le Lecteur froid a lu les images,
  « Comparer la carte » met sa lecture en face de la carte du brief (§13.14).
- **Le contrôle du format** d'une vidéo parle en dernier, avec « Corriger ».
- La dernière écriture du brouillon ou des slides porte **« Revenir à la version
  précédente »** — par le journal, qui ajoute une ligne (§3.2.2).
- Quand un rôle travaille, sa bulle dit « réfléchit… ».

**En bas du fil**, selon l'étape. À l'Ouverture : « Ouvrir l'atelier avec le Coach »,
« Rédiger sans atelier », et « Demander l'ouverture à l'Analyste » si l'idée n'est pas
préparée. Ouvrir l'atelier ou rédiger sans lui **fait passer une idée en Brouillon** :
elle quitte Idées pour Conversations. Ensuite, **le composeur, à deux destinataires** :
« Au Coach · « Go » valide la direction » avant le brouillon, « Au Rédacteur · un message
= un ajustement » après. « Go », seul, valide — sauf si le dernier message du Coach pose des questions : « Go » les
rappelle d'abord, avec « Répondre d'abord » et « Passer au Rédacteur sans répondre »
(`questionsEnSuspens`, `atelier.ts` ; v2.24) ; deux réponses rapides au plus (« Go, passe
à l'Éditeur » après deux tours, ou ce que le Coach propose). « Parler au Coach » rouvre
l'atelier (§2.7) ; « Réinitialiser l'atelier », dans le « ⋯ » de l'Atelier, se confirme.

**Disparaissent** : la fenêtre Idée et « Travailler cette idée », le sas « Démarrer la
session », l'aperçu comme écran à part, le bloc Format · Objectif · Plateformes répété
dans chaque onglet, la pastille de statut et l'étiquette de verdict
(`IdeaModal`, `CoachChat`, `DraftView`, `PreviewView`, `EditorLayout`).

**Côté données** : `GET /contents/:id` rend aussi les gestes du contenu (4 requêtes), et
le journal se relit après chaque production (`?limit=50`).

### 13.11 Le studio (F5)

L'étape Montage d'une vidéo. **Le fil se replie** derrière le bouton « Le fil » du
bandeau, qui ouvre un volet de 440 px par-dessus, à droite. Le reste se partage en deux
niveaux (`PanneauMontage`, enveloppé par `Contenu/Studio.tsx`, qui lit le texte de
référence : le script, ou la transcription pour une vidéo sans script, §12.7).

**À gauche, la vidéo telle qu'elle sortira**, sur une scène sombre (`dark-bg`, dans les
deux thèmes) : l'aperçu 9:16 de 306 × 544, puis les deux choix de sortie — 9:16 ou 4:5,
organique ou publicité (indisponible sans seconde accroche, avec la raison) — et
**« Exporter la vidéo »**, qui attend une prise calée, montre sa progression, et devient
« Exporter à nouveau » après un export. Une ligne résume : « 1:26 gardées · 9:16 ·
organique », ou la date du dernier export. Pour une vidéo avec animations,
« Exporter les scènes seules » ouvre la liste des scènes.

**À droite, plus d'onglets** (v2.32). Ils étaient quatre — Texte, Scènes, Rythme,
Prise —, chacun avec sa pastille, et ils séparaient ce qui va ensemble : Rythme
conseillait « un repère avancé, ou une coupe », mais les repères étaient dans Scènes et
les coupes dans Texte. Florent les a trouvés « hyper confus », et une refonte en
chronologie « démesurément complexe » pour le peu de retouches qu'une prise demande. Il
reste, de haut en bas :

- **un en-tête** : « 1:23 gardées sur 5:53 de prise », « Revenir au montage proposé »,
  et le bouton **« La prise »**, pastille « calée » ;
- **l'encadré « Avant d'exporter »** (`AvantDExporter`), quand il y a quelque chose à y
  faire : les visuels à fournir (§12.4.1), chaque moment où rien ne bouge (§12.5.3), avec
  « Voir », et les écrans à vérifier ; tout étant fait, il ne garde que les visuels, sous
  le titre « Visuels », pour qu'on puisse en remplacer un ;
- **le montage par le texte** (§12.5.5), avec ses deux gestes — cliquer une phrase,
  cliquer l'étiquette d'un écran —, puis celui de la seconde accroche quand elle existe.

**La prise passe dans un tiroir** de 440 px, à droite, comme le fil : le dépôt, la
transcription et son moteur, l'image et le son (§12.5.7), la seconde accroche, le
stockage. Tant qu'aucune prise n'est calée, ce contenu tient la place du texte, sous
l'en-tête « Avant le tournage » : déposer la prise est alors la seule chose à faire, et
les visuels se fournissent déjà. « Déposer la prise », depuis le Tournage, ouvre le
tiroir quand une prise est déjà calée (`priseOuverte`). Échap le ferme.

**Aucun outil de montage ne disparaît**, sauf les miniatures des scènes : l'aperçu les
montre à leur place. **Sans prise, une vidéo avec animations garde son aperçu estimé**,
au débit réglé sous la prise : c'est là qu'on voit ses scènes s'animer avant de tourner.
Une vidéo directe sans prise montre le cadre en pointillé, « L'aperçu apparaîtra avec la
prise ».

Disparaissent avec lui : le storyboard de l'ancien onglet Script (`StoryboardRenderer`),
`MontageDirect`, `ScriptVideoRenderer` ; avec la v2.32, les cartes de scène
(`CartesDeScene`, devenu `VisuelsAFournir`), la liste des repères (`ReperesPrise`) et
l'onglet Rythme (`RythmeReel`).

### 13.12 La série (F6)

**Le panneau Série** (272 px) se tient à gauche du fil dès qu'un contenu appartient à une
série — **d'où qu'on l'ouvre**, et non plus seulement depuis le plan : c'était un défaut.
En tête, « Plan de la série » ; puis chaque publication dans l'ordre du plan, avec son
rang, sa barre et son étape. Un clic ouvre la publication sur **son** étape courante. Il
remplace les boutons « Précédente » et « Suivante ».

**Le plan de série vit dans le cadre d'un contenu** : le bandeau porte le titre de la
série et, à la place du sélecteur d'étape, un bloc « Avancement » qui ne se clique pas —
un segment par publication, publiée, commencée ou à venir. Le panneau Série y a « Plan de
la série » actif. La matière a **une** action principale, « Générer une publication de
plus » (l'Éclateur, §6.2, pour une publication ; le plan de publication garde le choix du
nombre), puis l'intention, le plan de publication, et les publications dans l'ordre avec
leur avancement. « Supprimer la série » est au pied, et se confirme comme avant (§3.3).

La liste des séries (`SeriesView`) a disparu en F2 : une série se trouve dans
Conversations et se crée par « + Nouveau ».

### 13.13 Le téléphone et le thème sombre (F7)

**À 375 px**, les listes deviennent des cartes : le titre et le moment, le dernier fait,
puis l'avancement dessous ; les filtres par geste défilent, la recherche prend sa ligne.
Le sélecteur de modèle quitte le bandeau des listes : il céderait toute la place au
titre, et chaque action garde son modèle réglé. **Un contenu ouvert se lit en deux
onglets, Le fil et la matière** — la matière d'abord au Tournage et à la Publication,
qui se lisent en plein écran ; le fil ailleurs. Le panneau Série s'efface. **Le montage
n'est pas proposé sur téléphone** : l'étape dit où elle en est et quand la dernière
vidéo a été exportée, et le studio — Remotion compris — ne se charge même pas.

**Le thème sombre** décline les écrans avec les jetons `dark-*` existants ; le fil prend
`dark-bg`, le survol `dark-sec-bg`, et la scène du studio reste `dark-bg` dans les deux
thèmes.

### 13.14 La carte de la métaphore (v2.24) — NORMATIF

**Pourquoi.** Le 28/10/2026, un Reel sur la retenue des émotions était confus de bout en
bout : on ne savait pas ce que représentaient la digue, l'eau, les fuites ni le
sparadrap. Le Coach avait glissé une amygdale « derrière la digue » et rangé parmi les
fuites ce qui était un pansement ; le Verrouilleur avait pris pour « matière validée »
une phrase de patient que le Coach n'avait proposée qu'en hypothèse ; le Rédacteur a
suivi ; le Lecteur froid a dit « Publiable », parce qu'il comptait les métaphores sans
vérifier qu'elles se lisaient. Aucun rôle ne tenait la correspondance entre l'image et
la réalité. La carte la tient.

**Où elle passe.**

| Rôle | Ce qu'il fait de la carte |
| :--- | :--- |
| Coach | la pose dès le premier tour, en tableau markdown, 4 à 8 lignes — *dans l'image* / *ce que c'est, en vrai* —, avec « Hors de l'image : … » ; la repose entière à chaque correction |
| Verrouilleur | recopie la dernière dans le brief : `metaphore.carte` (`{ element, realite }[]`) et `metaphore.hors_image` ; sans tableau, la reconstitue de la structure validée, et ce dont le sens n'a jamais été dit va en question ouverte |
| Rédacteur | la suit : aucun élément hors carte, un élément garde son sens du premier mot au CTA, rien de `hors_image` |
| Lecteur froid | ne la voit pas ; il rend `lecture_naive.carte_percue` (`{ element, represente }[]`) — ce que chaque image représente pour lui — et signale une image illisible ou qui change de sens |
| Le fil | met les deux face à face (`confronterLesCartes`, `metaphore.ts`), dans l'ordre de la carte : un élément non relevé reste visible, une image que la carte ignore vient en fin |

L'appariement se fait sur les mots, pas sur le sens : c'est Florent qui lit l'écart. Un
brief ou une relecture d'avant la v2.24 n'a pas de carte, et le fil n'en montre pas.

**Les phrases prêtées.** Le Coach ne prête plus à Florent ni à ses patients une phrase
qu'il n'a pas reçue : il la propose « (à confirmer) » et demande la vraie. Le Verrouilleur
ne range une telle phrase en matière validée que si Florent l'a confirmée, et sait que le
premier message « user » — « TITRE : … » — est composé par l'outil.

### Phasage de la refonte — NORMATIF

Une branche par étape ; aucune ne laisse l'application cassée.

| # | Étape | Critère de sortie |
| :--- | :--- | :--- |
| **F1** | **L'étape** — `etapeCourante`, `rendu`, `gestes`, `GET /api/contents/fils` | Un test par ligne des tableaux §13.3 et §13.4 |
| **F2** | **Les listes** — Conversations, Idées, Publiés ; Vidéos et Sous-titres disparaissent | Chaque contenu est à un seul endroit, avec son étape |
| **F3** | **Le cadre du contenu** — bandeau, sélecteur d'étape, pied, règle d'arrivée, une action principale | Un contenu s'ouvre au même endroit d'où qu'on vienne |
| **F4** | **Le fil** — bulles, composeur à deux destinataires, ouverture | L'atelier, la rédaction et les ajustements se font dans le fil |
| **F5** | **Le studio** — aperçu, sortie, onglets Texte · Scènes · Rythme · Prise ; sans onglets depuis la v2.32 | Aucun outil de montage perdu, l'aperçu toujours visible |
| **F6** | **La série** — panneau Série, plan dans le cadre du contenu | Une publication se travaille sans quitter sa série |
| **F7** | **Mobile, thème sombre, contrôles de DESIGN.md** | Zéro ligne aux commandes de fin |

Au 27/10/2026, les sept étapes sont écrites et vérifiées dans le navigateur, sur une API
simulée ; leurs critères de sortie demandent maintenant l'usage réel.

---

## 14. Les clients, les séances et la réservation (v3.0) — NORMATIF

### 14.1 Ce qui change de nature

Jusqu'à la v2.37, gestion gère des contenus, et le §3.8 dit de son écran de rendez-vous : « ni un
agenda, ni un CRM ». Florent, les 25 et 26/11/2026 : la base des clients quitte Notion, la
réservation quitte Calendly, et les deux arrivent ici. Gestion devient aussi le registre des
personnes accompagnées et l'agenda où l'on réserve.

Ce qui ne change pas : la moitié éditoriale — son modèle, ses routes, ses règles, ses prompts. Les
deux moitiés partagent une console et une session ; elles ne partagent ni base, ni code métier.

Trois appelants nouveaux, que la console ne connaissait pas : **le site** (des inconnus, sans
session), **Make** (une machine, qui exécute), et **l'agenda Google** (lu et écrit par gestion).
Tout ce chapitre découle de là : ce qui était une application privée reçoit maintenant des
données de santé, envoyées par des gens qu'elle ne peut pas authentifier.

### 14.2 Les dix règles — NORMATIF

1. **Deux bases, qui ne se connaissent pas.** `DB` porte l'éditorial, `CLIENTS` les personnes.
   Aucune requête ne joint les deux. Seul `workers/api/src/clients/` touche à `env.CLIENTS`, et
   aucun module éditorial — IA, corpus, export, montage, accès du serveur MCP — ne l'importe, même
   indirectement. Un test le vérifie.
2. **La liaison `CLIENTS` est facultative.** Absente, toute route des clients répond par un
   `Refus` (409, « La base des clients n'est pas reliée à cet environnement. ») et le reste de
   l'application fonctionne à l'identique. C'est ce qui tient la règle du chantier — aucune donnée
   réelle en ligne avant les protections de la phase S4 : en production, la liaison n'est posée
   qu'à ce moment-là.
3. **Les données sensibles ont leurs tables, et un seul module les nomme.** Sont sensibles :
   `questionnaires`, `seances_notes`, `seances_reponses`, `clients_confiance`, `clients_notes`.
   Dans le code (`workers/*/src`, `packages/*`, `apps/*`), seul
   `workers/api/src/clients/sensible.ts` écrit leurs noms ; un test parcourt ces sources et échoue
   si un autre fichier en nomme une. Les migrations, les tests, le jeu d'essai, l'outil d'import
   (`workers/api/import/`, hors de `src` : il écrit ces tables, sur le poste, dans une base
   locale — §14.9.1) et cette spécification sont hors du contrôle. Ces données ne sortent par aucun autre chemin : ni la
   porte de service, ni le serveur MCP, ni l'IA, ni l'export général, ni les journaux, ni le
   stockage du navigateur.
4. **La porte publique n'apprend rien sur personne, et ne change rien à une fiche.** À parcours
   égal, elle répond la même chose — même corps, même statut, mêmes en-têtes — que la personne
   soit connue ou non, en double ou non, attendue ou non ; ce qui dépend de qui elle est se traite
   après la réponse. Elle donne les créneaux libres et dit qu'une journée est complète ; rien
   d'autre. Une identité déclarée n'est pas une preuve : elle ne donne le droit ni de lire, ni de
   modifier une fiche existante, ni de déplacer un rendez-vous (§14.4).
5. **Toute écriture venue d'une porte porte une clé, et se rejoue sans doublon.** Un double clic,
   un réseau coupé, une relance de Make : le même effet et le même reçu, rien en double (§14.6).
6. **Ce qui ne doit arriver qu'une fois se décide dans une seule instruction SQL, et tout ce qui
   en dépend réussit ou échoue avec elle.** Un créneau, la dernière place d'une journée, un
   créneau libéré, un paiement confirmé : jamais une lecture suivie d'une écriture. Une
   instruction conditionnelle qui n'écrit rien n'est pas une erreur pour la base : les écritures
   qui la suivent portent donc la même condition, dans le même lot. **Une décision refusée ne
   laisse ni fiche, ni mouvement, ni ordre** (§14.4).
7. **Rien de personnel dans les journaux ni dans les adresses.** Une erreur du domaine porte un
   code, jamais une valeur, et se journalise par un code d'incident fixe — pas l'exception
   entière. Le corps d'une requête n'est jamais journalisé ; un refus de validation rend les noms
   des champs, pas ce qui a été reçu ; un `Refus` ne journalise rien. Aucune route ne prend un
   nom, une adresse e-mail, un téléphone ni un jeton dans son adresse. Garder la base en Europe ne
   suffit pas : le calcul et les journaux de la plateforme n'y sont pas tenus.
8. **Un effacement est réel.** Les tables qui portent des personnes n'ont pas de `deleted_at`
   (écart au §2.1) : effacer une personne retire ses lignes, y compris celles qui ne lui sont pas
   encore rattachées. Seuls ses paiements restent, détachés d'elle : ce sont des pièces
   comptables.
9. **Gestion décide, Make exécute.** Gestion enregistre, puis inscrit ce qu'il reste à faire
   dehors — un e-mail, un SMS, une facture, une conversion — dans la table `ordres`. Make le fait
   et le confirme. Make ne lit aucune fiche et ne choisit rien.
10. **Deux environnements, durables.** La recette reste en place : mêmes Workers, ses propres
    bases, des données fictives, des messages détournés vers Florent. Rien n'atteint la production
    sans y être passé.

### 14.3 L'architecture

Ce qui s'ajoute à l'arbre du §1 :

```
├── packages/
│   ├── pratique/           LES RÈGLES DE LA PRATIQUE : qui est le même client, quels
│   │                       créneaux sont libres, qui prévenir d'un créneau libéré.
│   │                       Zéro dépendance, comme `editorial`.
│   └── contrat/            le contrat /v1 en schémas zod, avec ses exemples (phase S2a)
├── workers/
│   ├── api/
│   │   ├── migrations-clients/   NNNN_description.sql — la base `luminose-clients`
│   │   └── src/clients/          l'accès à cette base, et lui seul
│   └── porte/              la porte publique et la porte de service, api.luminose.fr (S2b)
```

Règles de dépendance, en plus de celles du §1.1 :

```
workers/api    ──▶ packages/{pratique, contrat}
workers/porte  ──▶ packages/contrat
packages/contrat  ──▶ zod, et rien d'autre
packages/pratique ──▶ (rien)
```

- **`packages/pratique`** est à ce domaine ce que `editorial` est aux contenus : des fonctions
  pures, testables sans réseau ni base. La clé d'un client, le calcul des créneaux, la fenêtre de
  réservation, les règles de la liste d'attente y vivent — et nulle part ailleurs.
- **`workers/porte` n'a ni base, ni secret.** Il reçoit, borne, valide, et appelle gestion par
  une liaison de service. Il ne peut que ce que ces entrées lui ouvrent : un défaut dans le code
  le plus exposé du dépôt n'atteint ni une table, ni une clé.
- **Gestion ouvre à la porte des entrées nommées, sans adresse.** Ce sont des classes
  `WorkerEntrypoint` exportées par `workers/api` (`PortePublique`, `PorteService`) : seul un
  Worker qui déclare la liaison les atteint. Pas de routes HTTP « internes » : une route interne
  est une route qu'un jour quelqu'un expose. **Une entrée ne vaut pas une authentification** :
  c'est gestion qui vérifie le jeton de Make et la signature de Stripe.
- **Les schémas du contrat sont appliqués deux fois**, par la porte puis par l'entrée de gestion.
  La porte protège gestion du bruit ; gestion ne fait confiance à personne (« zod à la
  frontière » : une liaison de service est une frontière).
- L'interface TypeScript des entrées vit dans `packages/contrat` : la porte n'importe rien de
  `workers/api`.

La phase S2b commence par un essai à blanc de ce montage — deux Workers, deux liaisons, une
méthode — avant d'y poser quoi que ce soit : qu'aucune adresse ne mène aux entrées, et ce qu'un
parcours complet consomme de temps de calcul et de sous-requêtes sur le plan gratuit.

### 14.4 La base `luminose-clients`

**Créée en Europe, et tenue d'y rester** : `wrangler d1 create luminose-clients
--jurisdiction=eu`. Une juridiction se fixe à la création et ne se change plus ; `--location weur`,
utilisé pour `luminose-gestion`, n'est qu'une préférence et ne garantit rien. La base de recette
est créée de la même façon. Les fichiers (PDF des questionnaires) iront dans un espace R2 créé lui
aussi en juridiction `eu`. La juridiction tient les données au repos ; elle ne dit rien du calcul
ni des journaux (règle 7).

Ses migrations vivent dans `workers/api/migrations-clients/`, numérotées à part
(`migrations_dir` de la liaison). Son schéma est en Annexe C.

**Une table arrive avec la phase qui s'en sert**, pas avant : une migration ne se modifie plus
une fois appliquée, et une table dessinée sans son usage est une table à refaire.

Jusqu'à la phase S4, cette base ne porte que des données fictives. Si le modèle doit être revu
d'ici là, Florent peut décider de la supprimer et de la recréer, migrations récrites (décision du
26/11). Dès qu'elle existe en production, la règle vaut pour elle sans exception.

| Phase | Tables |
| :--- | :--- |
| S1 | `types_seance`, `horaires`, `horaires_dates`, `reglages`, `textes_versions`, `professionnels`, `clients`, `clients_confiance` ★, `clients_notes` ★, `seances`, `seances_mouvements`, `seances_notes` ★, `seances_reponses` ★, `evenements`, `inscriptions`, `questionnaires` ★, `paiements` |
| S2a | `commandes`, `ordres`, `alertes`, `messages_modeles` ; deux colonnes de `questionnaires` (`envoi_empreinte`, `fiche_completee_le`) |
| S4 | `effacements` |
| Réservation | `creneaux_liberes` |

**Conventions.** Celles du §2, avec quatre écarts :

| Écart | Règle | Pourquoi |
| :--- | :--- | :--- |
| Effacement | Pas de `deleted_at` sur les tables qui portent des personnes ; les autres (types de séance, horaires, professionnels, évènements, modèles de messages) gardent la suppression logique | règle 8 |
| Dates sans heure | une date de naissance, une ouverture datée : `AAAA-MM-JJ` en texte ; une heure d'horaire : `HH:MM`, heure de Paris | un instant en millisecondes n'a pas de sens pour « le 12 avril » |
| Montants | en centimes, entiers, toujours | Notion rangeait des euros |
| Choix | en minuscules sans accent dans la base (`a_payer`), le libellé à l'écran | une valeur qu'on compare ne doit pas dépendre d'une majuscule |

La conversion `snake_case` ↔ `camelCase` a **un point d'entrée par base** : `db.ts` pour
l'éditorial, `clients/db.ts` pour celle-ci. `db.ts` ne doit pas connaître cette base (règle 1).

**Les clés étrangères sont appliquées** (D1 les active d'office). L'Annexe C donne, relation par
relation, ce que devient la ligne quand son propriétaire est effacé : retirée, ou détachée.

#### Ce qui ne se décide qu'une fois (règle 6)

Chaque décision est une instruction conditionnelle ; le nombre de lignes qu'elle écrit dit son
issue. Les écritures qui en dépendent partent dans le même lot (`db.batch`, une transaction) et
portent la condition qui les y lie — par exemple l'existence de la ligne qui vient d'être écrite.

```sql
-- Entrer dans l'agenda : n'écrit que si rien ne chevauche.
-- `occupe_jusqua` = début + durée + marge. Bornes : [debut, occupe_jusqua[.
INSERT INTO seances (id, client_id, type_seance_id, debut, occupe_jusqua, statut, …)
SELECT :id, :client_id, :type_seance_id, :debut, :occupe_jusqua, 'prevue', …
WHERE NOT EXISTS (
  SELECT 1 FROM seances
  WHERE statut = 'prevue' AND debut < :occupe_jusqua AND occupe_jusqua > :debut
);
-- 0 ligne écrite → « creneau_pris ». Le mouvement « créée » et les ordres qui suivent,
-- dans le même lot, ne s'écrivent que si la séance :id existe.
```

- **Un créneau.** La même condition vaut pour toute entrée dans le statut `prevue` — une
  réservation, un rendez-vous posé par Florent, une séance annulée qu'on rétablit — et pour tout
  déplacement, la séance déplacée étant exclue de la comparaison et sa borne recalculée.
- **La dernière place.** L'inscription ne s'écrit que si le nombre de places occupées est
  inférieur aux places de l'évènement. Occupe une place, **à l'instant de la décision** : une
  inscription `payee` ou `confirmee` ; une `retenue` par virement ; une `retenue` par carte dont
  le délai n'est pas passé. Une retenue par carte échue ne compte plus, que la tâche planifiée
  l'ait déjà marquée ou non.
- **Un créneau libéré.** Un seul lot vérifie le lien (valable, non échu), que la séance de la
  personne est toujours prévue et n'a pas bougé depuis l'envoi, que tout l'intervalle visé est
  libre, marge comprise ; puis prend le créneau (`… WHERE pris_par IS NULL`), déplace la séance,
  écrit le mouvement et libère l'ancien intervalle. Tout, ou rien.
- **Un paiement confirmé.** C'est le passage d'une tentative attendue de `cree` à `reussi`, et
  non une insertion : il ne se fait que si le prestataire, la référence, le montant, la devise et
  l'environnement (réel ou test) sont ceux de la tentative. La seconde confirmation n'écrit rien.
  Un paiement arrivé après que la place a été rendue est enregistré et signalé ; il ne reprend
  pas la place.

L'agenda Google, lui, est hors de la base. Il est relu juste avant d'écrire ; si cette lecture
échoue, rien n'est réservé. La séance garde l'état de son écriture dans l'agenda (`a_ecrire`,
`ecrit`, `echec`) : une panne entre les deux se reprend, sur le même rendez-vous, et la
confirmation ne part qu'une fois l'agenda écrit. Un contrôle de nuit compare les deux et lève une
alerte. L'écriture unique garantit qu'il n'y a jamais deux séances de gestion sur la même heure ;
elle ne peut pas garantir l'agenda.

#### Désigner un client

Par sa clé seulement (`packages/pratique`) : l'adresse e-mail normalisée, et les mots du prénom et
du nom, sans accents, en minuscules, triés. Jamais par le nom seul.

| Ce que la base contient | Ce qui se passe |
| :--- | :--- |
| pas d'adresse e-mail dans l'envoi, donc pas de clé | impossible depuis le site, où l'adresse est obligatoire ; depuis la console, Florent choisit la fiche |
| aucune fiche de cette clé | la fiche est créée **dans le lot de la décision**, par une écriture qui n'aboutit que si aucune fiche de cette clé n'existe : deux envois simultanés ne créent pas deux fiches |
| une fiche | la séance ou l'inscription lui est rattachée |
| plusieurs fiches | rien n'est rattaché : la ligne garde l'identité reçue, reste « à rapprocher », et une alerte est levée |

La clé n'est donc pas unique en base : deux fiches peuvent la partager, et c'est Florent qui
tranche. Une séance comme une inscription peuvent exister sans client, avec l'identité telle
qu'elle a été envoyée (`identite_recue`) ; leurs messages partent alors vers cette identité.

**La porte publique ne modifie jamais une fiche existante.** Elle peut remplir un champ vide.
Quand ce qu'elle reçoit diffère de la fiche — un autre téléphone, une autre adresse —, la fiche
ne bouge pas : l'écart est gardé sur la ligne reçue et montré à Florent, qui décide. Sans cette
règle, connaître le nom et l'adresse e-mail d'une personne suffirait à détourner ses rappels.

### 14.5 Les trois portes

| | Adresse | Qui | Ce qu'elle ouvre |
| :--- | :--- | :--- | :--- |
| **Publique** | `api.luminose.fr/v1/…` | les pages du site | les créneaux libres ; des commandes : réserver, envoyer un questionnaire, s'inscrire, payer |
| **De service** | `api.luminose.fr/service/v1/…` | Make ; Stripe | confirmer un ordre ; annoncer un paiement abouti — et rien d'autre |
| **Console** | `gestion.luminose.fr/api/…` | Florent | tout, derrière sa session (§7) |

**La porte publique.** La console reste de même origine (§1.2) ; la porte publique et le serveur
MCP ont chacun leur politique CORS. Ici, `Access-Control-Allow-Origin` vaut l'origine exacte du
site de cet environnement, sans cookie ni identifiant. **L'origine écarte les autres sites ; elle
n'authentifie personne** : un script hors navigateur l'écrit comme il veut.

Avant d'appeler gestion, la porte vérifie l'origine, la méthode, le type et la taille de l'envoi,
un champ piège, et une limite de fréquence par adresse hachée (liaison `ratelimits`). Cette
limite est approchée et comptée par centre de données : elle écarte le bruit, elle ne borne rien.
**Les vraies bornes sont dans gestion**, et ce sont des réglages : un nombre de commandes
acceptées par jour et par sorte ; un nombre d'e-mails et de SMS déclenchables par jour ; un nombre
de places retenues par virement en même temps sur une journée — la retenue la plus longue, donc
la plus coûteuse à l'abus. Au-delà, la commande est refusée (`trop_de_demandes`) ou l'ordre
retenu, et une alerte est levée.

Ses réponses n'ont que trois formes : réussite, refus avec un motif d'une liste fermée (les deux
en 200), panne (5xx). Une base non reliée est une panne. La page qui reçoit une panne affiche le
téléphone de Florent.

**Un interrupteur** la coupe sans rien déployer : un réglage de la base, que la console change, y
compris depuis un téléphone. Coupée, toute commande reçoit le refus `ferme`.

**Les liens envoyés aux personnes** — remplir un questionnaire, prendre un créneau libéré, payer
une séance — portent un jeton signé par gestion : l'usage, l'objet, une échéance, une version.
Rien n'en est rangé : le jeton se recalcule quand un message doit le porter, et se révoque en
changeant la version de l'objet. Un jeton n'ouvre que son usage, sur son objet. Le voir ne le
consomme pas ; c'est l'état de l'objet — créneau pris, séance payée — qui dit s'il sert encore.
Il voyage après le `#` de l'adresse, et dans le corps des requêtes : jamais dans une adresse
appelée, jamais dans un journal.

**La porte de service.** Make présente un jeton en `Authorization: Bearer` ; gestion n'en garde
que l'empreinte (`SERVICE_JETON_EMPREINTE`), comme pour le serveur MCP (§7). Facultative : absente,
tout porteur est refusé. Le jeton n'ouvre que la confirmation d'un ordre. Make ne s'adresse
jamais à `gestion.luminose.fr`.

Stripe y annonce les paiements aboutis (`/service/v1/stripe`). Pas de jeton : l'annonce est
signée. La porte transmet le corps tel qu'il est arrivé, borné en taille, sans le lire ni le
valider — la signature porte sur ces octets-là — et gestion la vérifie avant tout décodage, avec
sa fraîcheur, puis écarte une annonce déjà traitée. Le secret de signature reste dans gestion.

**La console.** Ses routes des clients vivent sous `/api/clients`, `/api/seances`,
`/api/evenements`, `/api/reservation` et suivantes, avec la session du §7. `gestion.luminose.fr`
reste fermée à tout autre domaine. L'origine acceptée pour une écriture est celle de
l'environnement, et elle seule.

**Le serveur MCP n'atteint rien de tout cela.** Sa liste fermée (§7) ne s'allonge pas, et son
refus (403) tombe avant tout examen de la liaison ; un test le vérifie sur chaque famille de
routes des clients.

### 14.6 Les commandes et les ordres

**`commandes`** — ce qu'une porte a reçu : la porte, la clé fournie par l'appelant, la sorte,
l'objet créé, l'empreinte de l'envoi, et **le reçu** : la réponse minimale rendue, refus compris.
Le couple (porte, clé) est unique.

- Une clé déjà vue rend le même reçu. Avec une autre empreinte, elle est refusée.
- L'empreinte est calculée avec un secret de gestion : celle d'un questionnaire ne doit pas
  permettre d'en deviner les réponses.
- Le reçu ne porte ni identité ni réponse : une référence, des dates, un montant. Il est gardé
  trente jours (un réglage), puis purgé ; il part aussi avec l'effacement de son objet.
- Un rejeu rend ce qui a été répondu ; il ne rouvre pas un droit échu ou révoqué. L'état du
  moment — un paiement a-t-il abouti ? — se lit par une autre requête.

**`ordres`** — ce que gestion demande à Make. Une sorte, l'objet concerné, une échéance, un état
et une clé d'unicité. **Ni adresse, ni numéro, ni texte.**

- **Une clé par effet.** Celle d'un rappel porte la séance, le canal et la **révision** de la
  séance, qui avance à chaque déplacement : un rendez-vous déplacé a de nouveaux rappels, et ceux
  de l'ancienne date sont annulés tant qu'ils ne sont pas partis.
- **Le message est composé au départ**, depuis le modèle et la fiche du moment. Juste avant de le
  remettre à Make, gestion revérifie que l'ordre a encore lieu d'être : la séance est toujours
  prévue, à cette révision ; le questionnaire n'est pas arrivé entre-temps ; il y a un
  destinataire. Un ordre déjà remis ne se reprend pas : il reste tracé.
- **États** : `prevu` → `confie_a_make` → `fait` ou `echec` ; `annule`. Un ordre confié et non
  confirmé est représenté après un délai, un nombre borné de fois, puis passe en `echec` et lève
  une alerte.
- **Make ne refait pas ce qu'il a fait.** Il garde le résultat de chaque ordre sous son
  identifiant et le renvoie quand le même ordre lui revient : une confirmation perdue ne donne pas
  un second SMS. Une confirmation identique est sans effet ; une confirmation contraire lève une
  alerte. Après une réponse incertaine d'un prestataire de paiement, on vérifie chez lui avant de
  redemander.
- Un ordre part vers le webhook Make de sa sorte, avec un secret en en-tête. **Chaque webhook est
  facultatif** : sans adresse configurée, l'ordre reste `prevu`, visible dans la console, et rien
  d'autre ne casse.
- **En recette, tout message est détourné** vers l'adresse et le numéro de Florent
  (`DETOURNEMENT_EMAIL`, `DETOURNEMENT_SMS`). Sans eux, la recette n'envoie rien : un oubli de
  configuration ne doit pas pouvoir écrire à une vraie personne.

#### 14.6.1 Précisions de la phase S2a

Ce que la phase S2a apporte au contrat (`contrat-v1`, §2, §3.2, §4). **À faire confirmer par
Florent** ; la première écarte une règle générale du contrat et se tranche avant les autres.

1. **Un questionnaire n'est jamais refusé pour son lien.** Le contrat (§2) donne `lien_invalide`
   à un lien inconnu ou expiré ; pour un questionnaire, on écarte cette règle : référence absente,
   fausse, échue ou révoquée, il est enregistré « à rapprocher », et la réponse est la même
   (`{ "ok": true }`). L'autre lecture ferait perdre ses réponses de santé à une personne pour un
   lien périmé. Si Florent préfère le refus, c'est une branche à changer
   (`clients/portes/publique.ts`), pas une structure.
2. **Sans jeton valable, aucun rattachement** — ni à une séance, ni à une fiche. L'identité
   déclarée ne désigne personne (§14.4).
3. **Le premier questionnaire rattaché à une séance le reste.** Un second envoi pour la même
   séance est enregistré à part, « à rapprocher », avec la séance d'où il vient, et une alerte
   `second_questionnaire`. Le rattachement se décide dans le lot, sur l'état du moment : une
   séance annulée ou un lien révoqué entre la lecture et l'écriture donnent « à rapprocher ».
4. **Le champ piège rempli donne une erreur visible** (`invalide`, sans champ), pas un faux
   succès : une personne dont le navigateur l'aurait rempli doit le voir.
5. **L'accord de conservation doit être accepté, et sa version connue de gestion**
   (`textes_versions`) ; inconnue : `invalide` (`accord.version`). Le texte de la version
   acceptée est recopié sur le questionnaire.
6. **Moins de 18 ans** à la réception (date de l'envoi, sinon celle de la fiche désignée ; jour
   de Paris) : autorisation parentale « à obtenir ». **Âge inconnu** — un suivi sans coordonnées
   ni fiche — : « sans objet ».
7. **Hors production, on détourne par défaut** : c'est `ENVIRONNEMENT = "production"`, et lui
   seul, qui autorise un vrai destinataire. Sans adresse de détournement valide et unique, rien ne
   part ; l'objet détourné est préfixé « [Recette] ».
8. **Les refus d'avant la décision ne sont pas gardés** (`invalide`, `ferme`,
   `trop_de_demandes`) : ils n'ont rien décidé, et les garder ferait écrire la base par cela même
   qu'elle refuse. Le « refus compris » du §14.6 vaut pour les refus d'une décision
   (`creneau_pris`, `journee_complete`), qui viendront avec leurs phases.
9. **Porte coupée : `ferme` pour tout**, y compris pour un envoi déjà accepté qu'on rejoue.
10. **La fiche est complétée après la réponse**, jamais avant (règle 4) : ses champs vides
    seulement — civilité, date de naissance, profession, adresse, code postal, ville, téléphone —,
    la personne de confiance si la fiche n'en a pas ; un écart (téléphone, adresse e-mail,
    personne de confiance) ouvre `ecart_fiche` sur le questionnaire. Si ce travail n'a pas tourné,
    le passage planifié le reprend (`fiche_completee_le` vide).
11. **Une confirmation contraire de Make** reçoit `{ "ok": true }` : elle ouvre une alerte
    `confirmation_contraire`, elle ne change pas l'ordre. Une confirmation d'un ordre jamais
    confié ou annulé reçoit `invalide` (`ordre`), et ne consomme pas sa clé.
12. **Après la purge de sa commande, un questionnaire garde la mémoire de son envoi**
    (`envoi_id`, `envoi_empreinte`) : la même clé et le même contenu reçoivent `{ "ok": true }`
    sans rien écrire ; un autre contenu, `invalide`.
13. **Les longueurs maximales** (`packages/contrat`, `LONGUEURS`) : prénom et nom 80 ; e-mail 254 ;
    téléphone 30 ; profession 120 ; adresse 200 ; code postal 12 ; ville 80 ; `reference` 512 ;
    `evenement` 64 ; `version_formulaire` 16 ; `reponses` 80 éléments, `cle` 80 (`[a-z0-9._-]`),
    `libelle` 500, `reponse` 2 000 ; `informations` 4 000. Les objets sont stricts ; une clé
    inconnue se dit `champ_inconnu`, jamais par son nom. **Les valeurs de départ des réglages** :

    | `cle` | Départ | Sens |
    | :--- | --: | :--- |
    | `porte_publique_ouverte` | 1 | l'interrupteur ; 0 : toute commande publique reçoit `ferme` |
    | `commandes_questionnaire_max_jour` | 30 | questionnaires acceptés sur 24 heures glissantes |
    | `emails_max_jour` | 50 | e-mails confiés à Make sur 24 heures glissantes (premières remises) |
    | `recus_garde_h` | 720 | garde d'une commande et de son reçu |
    | `ordre_relance_min` | 15 | délai avant de représenter un ordre non confirmé |
    | `ordre_tentatives_max` | 5 | au-delà, l'ordre passe en `echec` |

Et trois choix d'écriture, du même ordre : le secret présenté à Make voyage dans l'en-tête
`x-make-apikey` (à confirmer en S2b contre le scénario) ; l'empreinte d'un envoi est un HMAC de sa
forme canonique (clés triées, `cle` retirée), sous une sous-clé de `PORTES_SECRET` distincte de
celle qui signe les liens ; le passage planifié tourne toutes les cinq minutes, en recette
seulement (`src/declencheurs.ts`).

### 14.7 Le temps

- En base, un instant est en millisecondes UTC (§2.2). Un horaire est une heure de Paris.
- **Un délai est une durée écoulée**, en heures : la fenêtre de réservation, les rappels, les
  seuils de la liste d'attente. « Dans 21 jours » vaut 504 heures à partir de maintenant, pas
  « à partir du 21ᵉ jour à minuit ».
- Le calcul des créneaux vit dans `packages/pratique`, sans base ni réseau : horaires du jour −
  séances prévues et leur marge − plages occupées de l'agenda, dans la fenêtre du type, par pas
  du type. **La même fonction sert à afficher et à réserver**, avec un quart d'heure de tolérance
  à la réservation sur le début de la fenêtre : un créneau affiché ne doit pas être refusé parce
  que la personne a mis trois minutes à remplir le formulaire. Elle est testée sur les deux
  changements d'heure de l'année.
- Dans le contrat, une date voyage avec son décalage (`2026-12-17T09:30:00+01:00`).
- **Les tâches planifiées se partagent les déclencheurs.** Le plan gratuit en donne cinq par
  compte, recette comprise : un déclencheur porte plusieurs tâches — relever les ordres échus,
  libérer les places dont la retenue est passée, comparer gestion et l'agenda. Partager un
  déclencheur ne réduit pas le travail : chaque passage traite un nombre borné d'ordres et laisse
  le reste au suivant.

#### 14.7.1 Le calcul des créneaux — NORMATIF

Les règles de temps de la réservation vivent dans `packages/pratique` (`temps.ts`,
`creneaux.ts`, `attente.ts`) : des fonctions pures, sans base, sans réseau, **sans horloge** —
l'instant présent est un paramètre, et un test vérifie qu'aucune source ne lit `Date.now()` ni
`new Date()` sans argument. Les valeurs font foi dans les tests du paquet
(`packages/pratique/test/`), écrites en toutes lettres ; ce qui suit en donne les règles.

**Le temps de Paris.** Tout horaire est une heure de Paris ; tout instant, des millisecondes UTC.

- `instantDeParis(date, heure)` : `'AAAA-MM-JJ'` et `'HH:MM'` → instant. Une heure **qui
  n'existe pas** (nuit du passage à l'heure d'été) se lit avec le décalage d'avant le
  changement : `2027-03-28` `02:30` → `2027-03-28T01:30:00Z`. Une heure **qui existe deux fois**
  (nuit du passage à l'heure d'hiver) désigne sa première occurrence : `2027-10-31` `02:30` →
  `2027-10-31T00:30:00Z`.
- `isoDeParis(instant)` : l'instant avec son décalage, tel que le contrat le veut —
  `2026-12-17T08:30:00Z` → `2026-12-17T09:30:00+01:00` ; `2027-07-01T07:30:00Z` →
  `2027-07-01T09:30:00+02:00`.
- `jourDeParis(instant)` → `'AAAA-MM-JJ'` ; `jourDeLaSemaine(date)` → 1 (lundi) … 7 (dimanche),
  la convention de la table `horaires`.
- `instantDepuisIso(texte)` refuse (rend `null`) un texte sans décalage, ou qui n'est pas une
  date.

**Les créneaux.** `creneauxLibres({ type, horaires, occupations, maintenant, du, au,
toleranceMin = 0 })` rend la liste triée des débuts libres (instants), du jour `du` au jour `au`
compris. Un type porte `dureeMin`, `margeApresMin`, `pasMin`, `fenetreDebutH`, `fenetreFinH` ;
les horaires, une semaine type (1 = lundi … 7 = dimanche) et des dates ; une occupation est un
intervalle d'instants `[debut, fin[`.

1. **Les plages d'un jour** sont celles de `dates[jour]` quand le jour y figure — elles
   **remplacent** la semaine type, et une liste vide ferme la journée ; sinon celles de
   `semaine[jour de la semaine]` ; sinon aucune.
2. **Dans une plage, un créneau commence au début de la plage, puis tous les `pasMin`**, en
   durée écoulée. Il est retenu si **tout son intervalle — durée et marge — tient dans la
   plage** : `debut + dureeMin + margeApresMin ≤ fin de la plage`.
3. **Il est écarté s'il chevauche une occupation.** Son intervalle est
   `[debut, debut + dureeMin + margeApresMin[` ; une occupation est `[debut, fin[`. Deux
   intervalles qui se touchent ne se chevauchent pas. Les occupations sont fournies par
   l'appelant : les séances prévues (de `debut` à `occupe_jusqua`, marge comprise) et les plages
   occupées de l'agenda Google. La fonction ne les distingue pas, et elles peuvent se recouvrir.
4. **La fenêtre** : `maintenant + fenetreDebutH − toleranceMin ≤ debut ≤ maintenant +
   fenetreFinH`, en heures écoulées (§14.7). `toleranceMin` vaut 0 pour afficher, 15 pour
   réserver. Les deux bornes sont **comprises** ; la tolérance ne joue qu'en bas, jamais en haut.
5. **Une plage vide ou inversée** une fois convertie en instants — une ouverture `02:30`–`03:00`
   la nuit du passage à l'heure d'été — ne donne aucun créneau, et ne lève rien.
6. La fonction ne borne pas la période (les 62 jours du contrat sont l'affaire de la porte) ;
   `du` après `au` rend une liste vide.

`verifierCreneau({ …les mêmes, debut })` rend `'libre'`, `'hors_fenetre'` ou `'creneau_pris'`.
**Elle s'appuie sur la même génération** que `creneauxLibres` (§14.7 : « la même fonction sert à
afficher et à réserver ») :

- `debut` n'est le début d'aucun créneau de la grille de son jour, ou sort de la fenêtre →
  `hors_fenetre` ;
- il est dans la grille et dans la fenêtre, mais chevauche une occupation → `creneau_pris` ;
- sinon `libre`.

Un test le vérifie sur chaque cas, toutes les cinq minutes : un début est `libre` **si et
seulement si** `creneauxLibres` le rend, à tolérance égale.

**La liste d'attente.** `quiPrevenir({ creneau, seances, reglages, maintenant })` rend les
identifiants des séances dont la personne est à prévenir d'un créneau libéré, dans l'ordre. Le
créneau porte son début et sa durée (l'intervalle rendu, marge comprise) ; une séance, sa fiche
(`null` pour une séance « à rapprocher »), son début, son occupation (durée + marge de son type),
sa date de réservation, sa case de liste d'attente et son statut ; les réglages,
`creneauMinH`, `seanceMinH` et `personnesMax` (48, 48, 8).

**Personne** si le créneau commence dans moins de `creneauMinH` ; sinon les séances `prevue`, en
liste d'attente, qui commencent **après** ce créneau **et** dans `seanceMinH` ou plus, et dont
l'occupation tient dans le créneau (`occupationMin ≤ dureeMin`). Les deux seuils sont
**compris** : à 48 heures exactement, on prévient. **Le plafond compte des personnes, pas des
séances** : d'une même personne, seule sa réservation éligible la plus ancienne est gardée ; une
séance sans fiche compte pour elle-même. Puis les `personnesMax` **réservées depuis le plus
longtemps** (`reserveeLe` croissant ; à égalité, par identifiant, pour un ordre stable).

### 14.8 Les environnements

| | Production | Recette |
| :--- | :--- | :--- |
| Console | `gestion.luminose.fr` | `gestion-recette.luminose.fr` |
| Portes | `api.luminose.fr` | `api-recette.luminose.fr` |
| Bases | `luminose-gestion`, `luminose-clients` | `luminose-gestion-recette`, `luminose-clients-recette` |
| Données | réelles, après la phase S4 | fictives, toujours |
| Messages | aux personnes | détournés vers Florent |
| Make, paiements | réels | scénarios et clés de test |
| Agenda Google | celui de Florent | un agenda de test |

- Un environnement est une section `[env.recette]` de chaque `wrangler.toml`. Les liaisons et les
  variables ne s'héritent pas de la racine ; **`routes`, `triggers` et `workers_dev` s'héritent** :
  la recette les déclare donc tous, explicitement, faute de quoi elle viserait les adresses de la
  production.
- `scripts/deploy.sh` reçoit l'environnement en paramètre et **vérifie sa cible avant tout
  effet** : le compte, les bases attendues, le Worker, le projet Pages et son domaine. La
  production reste la cible par défaut, et son chemin ne change pas.
- Le poste de développement a lui aussi sa déclaration explicite de `CLIENTS` : la racine de la
  configuration n'en porte pas.
- La recette a ses propres secrets et ses propres identifiants de connexion.
- **La console dit où l'on est** : un bandeau « Recette » permanent. Rien dans les messages du
  contrat ne dit « test » ; c'est l'adresse appelée qui le dit.
- Le jeu d'essai (identités fictives) se charge par une commande, qui vérifie la base qu'elle va
  écrire et refuse toute autre cible que le poste local ou la recette.

### 14.9 L'import de Notion

- **Rejouable** : une ligne reprise garde l'identifiant de sa page Notion (§2.4). Deux imports de
  suite donnent la même base.
- **Local tant que la phase S4 n'est pas finie** : l'outil lit Notion et produit un fichier SQL,
  appliqué à la base locale du poste. Ce fichier contient des données réelles : il n'entre jamais
  dans le dépôt.
- **Vérifié champ par champ** (§9.3), avec en plus les valeurs recalculées — nombre de séances
  par client, places libres par évènement — comparées à celles de Notion, et la liste de ce qui
  demande un regard : fiches de trois mots ou plus, séances sans type reconnu, fiches de même clé.
- Les correspondances sont en Annexe D.

#### 14.9.1 L'outil

`workers/api/import/`, lancé par Florent sur son poste : `npm run import -w workers/api -- <commande>`.
Quatre temps, puis de quoi voir le résultat.

| Temps | Commande | Ce qu'il fait |
| :--- | :--- | :--- |
| Exporter | `exporter` | lit les quatre bases par l'API de Notion (clé `NOTION_API_KEY` du poste, identifiants des bases dans `config.json` du dossier privé — modèle : `import/config.modele.json`) et écrit **un** fichier : pour chaque base, son schéma et toutes ses pages, propriétés brutes ; pour les Clients et les Séances, le corps de chaque page, blocs datés. Pagination complète, limite de débit respectée ; une erreur arrête tout, **sans fichier partiel** |
| Lire et transformer | `preparer` | confronte le schéma exporté aux propriétés attendues (inventaire, §1) et **s'arrête** sur une propriété absente ou d'un type illisible, en la nommant ; puis transforme, en fonction pure, l'export en lignes et en **rapport de ce qui demande un regard** ; écrit le fichier SQL et le rapport |
| Écrire et appliquer | `appliquer` | applique le SQL à la base **locale** du dossier privé, migrations comprises — tout ou rien |
| Vérifier | `verifier` | compare l'export et la base ligne par ligne et champ par champ (§9.3), et les valeurs recalculées à celles de Notion ; affiche les écarts par identifiant et nom de champ, **jamais leur valeur** |
| Voir | `voir` | l'API locale sur cette base (`wrangler dev`), pour ouvrir la console sur ses vraies données sans qu'elles passent par le dossier du dépôt |

**Les garde-fous.**

- **Un dossier privé, un seul**, pour tout ce que l'outil produit : export, SQL, rapport, fichiers
  temporaires, et la base locale elle-même (`--persist-to`). Par défaut `~/.luminose-import`,
  créé en droits `700`. Le chemin est résolu dans sa forme réelle, liens symboliques suivis, et
  **tout dossier situé dans un arbre git est refusé** — le dépôt comme un autre ; chaque sortie
  est revérifiée. `.gitignore` ne protège de rien : c'est le refus du chemin qui protège.
- **Le mode local est écrit en dur** (`import/appliquer.ts`) : aucune option, aucune variable ne
  vise une base distante ; `--remote` et `--env` sont refusés. Le nom et l'identifiant d'une base
  sont les mêmes en local et à distance : ils ne protègent de rien. La télémétrie de wrangler est
  coupée : aucun appel réseau pendant l'application.
- **Tout, ou rien** : `wrangler d1 execute --local --file` joue le fichier en une transaction ;
  une erreur au milieu laisse la base d'avant (testé, sur la VM).
- La clé de Notion n'est ni affichée, ni journalisée, ni écrite. Les messages d'erreur ne
  recopient ni une valeur lue, ni la sortie de wrangler.
- `detruire --oui` efface le dossier privé.

**Les règles de reprise** — ce que le modèle (§6) ne dit pas ; elles sont en Annexe D.


### 14.10 Ce qui se teste

| Cible | Nature |
| :--- | :--- |
| `packages/pratique` | la clé d'un client sur les noms du jeu d'essai, avec la clé attendue écrite en toutes lettres ; les créneaux, la fenêtre et la liste d'attente (§14.7.1), changements d'heure compris |
| Migrations des clients | appliquées sur une base vide, clés étrangères actives ; puis, **sur la base de recette elle-même**, une violation de clé étrangère et un conflit d'index partiel provoqués à la main |
| Règle 6 | chaque décision jouée deux fois : une seule aboutit ; **un refus à zéro ligne ne laisse rien** — ni fiche, ni mouvement, ni ordre ; une erreur au milieu d'un lot l'annule en entier |
| Règle 1 | aucun module éditorial n'importe `src/clients/` ; `env.CLIENTS` n'apparaît que là |
| Règle 2 | sans `CLIENTS`, toute la suite d'avant passe ; les routes des clients répondent 409 |
| Règle 3 | les noms des tables sensibles n'apparaissent, dans le code, que dans `sensible.ts` |
| Règle 4 | chaque commande publique, personne connue contre inconnue, doublon, suivi sans complet : même corps, même statut, mêmes en-têtes, et des délais comparables sur une série d'essais ; aucune fiche existante modifiée |
| Règle 5 | chaque commande envoyée deux fois : un seul objet, le même reçu ; la même clé avec un autre contenu : refus |
| Règle 7 | des valeurs repères envoyées sur les chemins de réussite, de refus et de panne ne se retrouvent ni dans les journaux, ni dans une réponse qui n'a pas à les porter, ni dans l'export |
| Règle 8 | après un effacement, plus aucune ligne ne mène à la personne, hors ses paiements détachés ; une autre personne, ses séances et ses questionnaires sont intacts |
| Serveur MCP | refusé (403) sur chaque famille de routes des clients, liaison présente ou non |
| Export général | ne contient aucune table de la base des clients |

Ce que la suite de tests ne peut pas voir — la concurrence réelle, les quotas, les liaisons de
service, le routage de Pages, une signature reçue à travers la porte — se constate en recette, et
chaque phase dit quoi.

### 14.11 Phasage du socle — NORMATIF

Une branche par étape ; aucune ne laisse l'application cassée. Chaque étape se reçoit en trois
temps : la branche testée ; la recette déployée et vérifiée par Florent ; la production
contrôlée après son déploiement.

| # | Étape | Critère de sortie |
| :--- | :--- | :--- |
| **S1** | **La base et la recette** — ce chapitre ; le schéma des tables de la phase ; la liaison facultative ; `packages/pratique` (clé d'un client) ; les deux décisions de l'agenda et de la dernière place ; l'environnement de recette et son jeu d'essai | La console de recette s'ouvre sur son adresse, base reliée en juridiction européenne, jeu d'essai chargé ; la production, redéployée, est inchangée et dit « non reliée » |
| **S2a** | **Ce que gestion fait d'une commande** — `packages/contrat`, commandes rejouables, jetons des liens, bornes, interrupteur, ordres et confirmations, passage planifié ; le premier parcours, recevoir un questionnaire, par une fonction qui ne sait rien du transport (§14.6.1). Aucun Worker ni aucune adresse nouvelle | La suite et le typecheck verts, la suite d'avant inchangée ; en local, avec le jeu d'essai, un questionnaire fictif envoyé deux fois par le script d'essai (`npm run essai:questionnaire`) : une ligne, un ordre `prevu` ; Réglages montre les compteurs ; porte coupée : `ferme` ; `DRY_RUN=1` sur la production affiche les mêmes commandes qu'avant |
| **S2b** | **Les portes** — l'essai à blanc du §14.3 ; `workers/porte`, les entrées nommées (`WorkerEntrypoint`), CORS, la limite de fréquence, la porte de service, le déploiement en recette et sa page d'essai | Un questionnaire fictif envoyé deux fois depuis une page de recette : une ligne, un accusé de réception, détourné ; le temps de calcul et les sous-requêtes d'un parcours relevés |
| **S3** | **L'import** — outil, vérification, liste de ce qui demande un regard | Deux imports de suite sur les vraies bases, en local : zéro écart inexpliqué |
| **S4** | **Les protections** — second facteur à la connexion ; sauvegarde chiffrée de la base et des fichiers, restauration essayée ; effacement d'une personne, lignes non rattachées et fichiers compris ; inspection des journaux, de l'export et du stockage du navigateur | Une restauration et un effacement faits en recette ; alors seulement, la liaison `CLIENTS` est posée en production |

La réservation, les écrans de la console et les autres parcours viennent ensuite, chacun avec son
chapitre et son brief.

**Ce qu'un effacement ne peut pas.** La base l'applique aussitôt, mais l'historique de D1 (Time
Travel) et les sauvegardes le gardent jusqu'à leur terme : la durée réelle est relevée en S4, et
l'écran d'effacement la dit. Une restauration ramènerait une personne effacée : la trace des
effacements garde donc les identifiants retirés — pas les identités —, et tout effacement
postérieur à la sauvegarde est rejoué avant de rouvrir la base.

## 15. La console des clients — NORMATIF

> **v0.1, proposition** — en attente de la relecture de Florent. Les routes du §15.3 sont
> livrées par la phase C1 ; les écrans du §15.4 viendront avec la phase C2.

### 15.1 Ce qu'elle remplace

Les vues de Notion, dans l'usage qu'en a Florent. Sur le Mac : saisir la fiche d'une personne
pendant l'entretien de 20 minutes ; écrire ses notes après une séance ; changer le statut d'une
séance et de son paiement ; consulter une fiche ; voir la semaine et le mois ; plus rarement,
saisir un évènement. Sur l'iPhone : consulter une fiche, compléter un texte oublié.

Elle vit dans l'espace « Clients » de la console, à côté de l'écran Calendly du §3.8, qui reste
en service jusqu'à la bascule.

**Ce que cette console ne fait pas encore**, et que ses écrans disent là où cela compte :
- elle n'écrit rien dans l'agenda Google : une séance posée ici garde `agenda_etat = 'a_ecrire'` ;
- elle n'envoie aucun message : ni confirmation, ni rappel ;
- elle ne publie pas un évènement sur le site ;
- elle n'efface personne (phase S4).

Ces quatre points arrivent avec la réservation et les phases suivantes. Jusque-là, la console ne
sert qu'en local et en recette, sur des données fictives.

### 15.2 Les règles — NORMATIF

1. **Une route valide, appelle, rend.** Toute lecture et toute écriture de la base des clients
   vit dans `workers/api/src/clients/` ; les routes n'écrivent pas de SQL.
2. **Un écran, un nombre fixe de requêtes** (§3.6) : la liste des fiches en une instruction ; une
   fiche et tout ce qu'elle montre en une lecture groupée ; la semaine en une instruction. Jamais
   une requête par ligne.
3. **Rien de personnel dans une adresse** (§14.2, règle 7). Une recherche de personne part dans
   le corps d'une requête `POST`, jamais dans une adresse. Les identifiants (UUID) et les dates
   peuvent y figurer.
4. **Les données sensibles ont leurs routes**, et leur contenu ne voyage dans aucune autre
   réponse : notes de fiche, personne de confiance, notes de séance, réponses à la réservation,
   réponses d'un questionnaire. Aucune liste ne les porte ; une fiche ne dit d'un questionnaire
   que ce qui sert à le retrouver et à savoir s'il attend un geste — sa date, sa version, s'il
   est relu, s'il est à revoir. Rien d'autre, et la réponse est testée sur ses clés exactes.
5. **Rien de la base des clients n'est gardé par le navigateur** : ni `localStorage`, ni
   `sessionStorage`, ni IndexedDB, ni cache de service. Toutes les routes de ce chapitre
   répondent `Cache-Control: no-store`. Un test parcourt le code du front et le vérifie.
6. **L'agenda ne se modifie que par ses décisions** (§14.4). Poser, déplacer, remettre une séance
   à « prévue » passent par l'écriture unique ; un chevauchement est refusé, **y compris à
   Florent**. Lui seul passe outre la fenêtre et les horaires, pas l'agenda. Annuler écrit le
   statut et le mouvement dans le même lot.
7. **Une note ne s'écrase pas en silence.** Écrire une note envoie la version lue — la date de
   sa dernière écriture, ou « aucune » pour une note qui n'existe pas encore ; si la note a
   changé entre-temps (le Mac et l'iPhone ouverts sur la même séance), la route refuse (409,
   « Cette note a été modifiée ailleurs. Rechargez-la avant d'enregistrer. ») et l'écran garde le
   texte saisi. Chaque écriture avance cette date strictement, même dans la même milliseconde ;
   de deux premières écritures simultanées, une seule aboutit.
8. **Pas de suppression de personne.** Aucune route ne retire une fiche, une séance, une
   inscription ni un questionnaire : l'effacement est une action à part (phase S4). Les tables
   sans personne — professionnels, types de séance, horaires, évènements sans inscrit — ont la
   suppression logique.
9. **Deux fiches peuvent partager une clé, et c'est Florent qui tranche** (§14.4). Créer une
   fiche n'est jamais refusé pour cette raison ; l'écran montre les fiches semblables avant.
10. Session de la console sur toutes les routes ; **toute écriture — recherches en `POST`
    comprises — n'est acceptée que de l'origine de l'environnement** (§14.5) ; 403 pour le jeton
    du serveur MCP ; 409 sans liaison `CLIENTS` (§14.2).
11. **Ce qui change l'intervalle d'une séance prévue passe par la décision d'agenda** : son
    début, mais aussi sa durée et son type — la marge d'un type compte dans ce qu'elle occupe.
12. **Une place ne se reprend que par sa décision** : toute inscription qui revient à un statut
    occupant une place, d'où qu'elle vienne — annulée, déconseillée, expirée, retenue par carte
    échue —, repasse par l'écriture unique de la dernière place.
13. **Une séance ou une inscription sans fiche se voit quand même** (« à rapprocher »), avec le
    prénom et le nom reçus — pas l'adresse ni le téléphone. Une séance sans type montre son
    libellé d'origine. Une séance qui bloque l'agenda ne disparaît jamais d'une liste.

### 15.3 Les routes

Toutes sous la session de la console. Les montants sont en centimes ; une date avec heure voyage
avec son décalage (`2026-12-17T09:30:00+01:00`) et se convertit par `packages/pratique`. **Toute
ligne rendue porte son identifiant** : c'est par lui que l'écran ouvre une fiche, une séance, un
évènement.

**Les fiches**

| Route | Ce qu'elle fait |
| :--- | :--- |
| `POST /api/clients/recherche` `{ q, page }` | la liste, 50 par page, par ordre alphabétique : nom, ville, nombre de séances non annulées, dernière séance passée, prochaine séance prévue. `q` vide : tout. `q` se cherche, sans accents, dans le nom et le prénom, et dans l'adresse e-mail. **Une instruction.** |
| `POST /api/clients/semblables` `{ prenom, nom, email }` | les fiches de même clé, de même adresse e-mail, ou de même prénom et nom (sans accents) : identifiant, prénom, nom, ville. **Une valeur vide ne se compare à rien** : sans adresse saisie, les fiches sans adresse ne sont pas « semblables ». Pour l'écran de création. |
| `POST /api/clients` | crée une fiche. Prénom obligatoire. Calcule `nom_recherche` et `cle_client` (`packages/pratique`). |
| `GET /api/clients/:id` | la fiche : identité, coordonnées, provenance, les trois liens avec le nom de la fiche ou du professionnel lié, « a recommandé » ; ses séances (numéro calculé, date, type, statut, paiement, montant) ; ses inscriptions ; la liste de ses questionnaires (date, version, relu, à revoir — règle 4). **Une lecture groupée.** |
| `PATCH /api/clients/:id` | modifie les champs ci-dessous ; recalcule nom de recherche et clé. Le lien « couple » s'écrit des deux côtés, et se défait des deux côtés, dans le même lot. |
| `GET`, `PUT /api/clients/:id/notes` | la note de la fiche (règles 4 et 7). |
| `GET`, `PUT /api/clients/:id/confiance` | la personne de confiance (règle 4). |

**Ce qu'une création ou une modification de fiche accepte**, et rien d'autre : civilité, prénom,
nom, e-mail, téléphone, date de naissance, profession, adresse, code postal, ville, pays,
origine, mot-clé Google Ads, venu par un professionnel, venu par une personne, couple. **Jamais** :
la clé, le nom de recherche, le clic d'annonce et sa date, les identifiants Stancer et Qonto, les
traces d'envoi vers Brevo et la comptabilité — un envoi qui en porte un est refusé.

**Les séances**

| Route | Ce qu'elle fait |
| :--- | :--- |
| `GET /api/seances?du=&au=` | les séances de la période (62 jours au plus), tous statuts, **avec ou sans fiche, avec ou sans type** (règle 13) : heure, durée, type, statut, paiement, mode, et le prénom et le nom de la personne. **Une instruction.** |
| `GET /api/seances/:id` | la séance, sa personne, son type, ses mouvements. |
| `GET`, `PUT /api/seances/:id/notes` | la trame : demande, objectif, séance, travail personnel, idées pour la suite, réponse SMS ; en lecture seule, les réponses données à la réservation et la copie brute reprise de Notion (règles 4 et 7). |
| `POST /api/seances` | pose un rendez-vous : personne, type, début, et — facultatifs — durée, mode, montant. Durée, marge, montant et état de paiement viennent du type par défaut. Origine `console`. Refus 409 si l'intervalle chevauche une séance prévue. |
| `POST /api/seances/:id/deplacer` `{ debut, revision }` | déplace ; la révision attendue protège d'un double geste. |
| `POST /api/seances/:id/annuler` | prévue → annulée, avec son mouvement. |
| `POST /api/seances/:id/prevoir` | remet à « prévue » une séance annulée, réalisée ou marquée absente : par la décision d'agenda. |
| `PATCH /api/seances/:id` | statut (`realisee`, `absent`), état de paiement, montant, mode, liste d'attente ; type et durée — **par la décision d'agenda quand la séance est prévue** (règle 11) : refus 409 si le nouvel intervalle, marge comprise, en chevauche un autre. Jamais le début, jamais `prevue`. |

**Les évènements**

| Route | Ce qu'elle fait |
| :--- | :--- |
| `GET /api/evenements` | tous, avec les places occupées et libres, calculées à l'instant (§14.4). **Une instruction.** |
| `GET /api/evenements/:id` | l'évènement et ses inscriptions : personne, statut, mode de paiement, retenue. |
| `POST /api/evenements`, `PATCH /api/evenements/:id` | nom, type, début, fin, ville, places, **prix** (`prixCentimes`), questionnaire demandé, adresse d'inscription extérieure, et les contenus HTML, non interprétés. `publie` ne se modifie pas ici. **Les places ne descendent pas sous le nombre de places occupées** : la condition est dans l'écriture ; refus 409. |
| `DELETE /api/evenements/:id` | suppression logique, refusée s'il a une inscription — condition portée par l'écriture elle-même, pas par une lecture avant. |
| `POST /api/evenements/:id/inscriptions` `{ clientId }` | inscrit une personne, `confirmee`, origine `console` : par la décision de la dernière place, qui exige aussi un évènement non supprimé. Refus 409 si la journée est complète, ou si la personne y est déjà. |
| `PATCH /api/inscriptions/:id` `{ statut }` | `annulee`, `deconseillee` : une mise à jour. `confirmee` : par la décision de la dernière place quand l'inscription n'occupe pas de place à cet instant (règle 12) ; refus 409 si la journée est complète. |

**Les professionnels**

`GET /api/professionnels` (tous, avec le nombre de fiches qui les désignent, en une
instruction), `POST`, `PATCH`, `DELETE` (logique ; les fiches qui le désignaient gardent leur
lien jusqu'à ce que Florent le change).

**Les réglages de la réservation**

| Route | Ce qu'elle fait |
| :--- | :--- |
| `GET /api/reservation` | les types, la semaine type, les dates d'exception à venir, les réglages. **Une lecture groupée.** |
| `PATCH /api/reservation/types/:id` | durée, marge, pas, lieu, montant, fenêtre, réservable en ligne, actif, ordre. La clé d'un type ne change pas. |
| `PUT /api/reservation/semaine` | remplace la semaine type, en un lot. Plages sans chevauchement, début avant fin. |
| `PUT`, `DELETE /api/reservation/dates/:date` | les plages d'une date, ou sa fermeture (liste vide) ; retirer l'exception rend la date à la semaine type. |
| `PATCH /api/reservation/reglages` | les valeurs de `reglages`, par clé connue. |

### 15.4 Les écrans

L'espace « Clients » reçoit quatre onglets — **Semaine** (celui qui s'ouvre), **Fiches**,
**Évènements**, **Professionnels** — et garde l'onglet Calendly existant. Réglages reçoit une
section « Réservation ». Composants, échelles et gabarits de `DESIGN.md` ; aucun composant
nouveau sans y être écrit. Chaque écran se tient sur un téléphone (une colonne) comme sur un
ordinateur, en clair et en sombre.

L'adresse dit où l'on est, par des identifiants seulement : `#clients/semaine`,
`#clients/fiches`, `#clients/fiches/<id>`, `#clients/seances/<id>`, `#clients/evenements/<id>`,
`#clients/professionnels`.

**Semaine.** La semaine en cours, du lundi au dimanche, jour par jour ; pour chaque séance :
l'heure, la personne, le type, et deux pastilles — statut et paiement. Précédente, suivante,
aujourd'hui. Un contrôle « Semaine · Mois » ; le mois est une grille qui montre, par jour,
l'heure et le prénom. Toucher une séance l'ouvre. L'action principale de l'écran : **Poser un
rendez-vous**. Sur téléphone, la semaine est une liste de jours.

**Fiches.** Un champ de recherche, large, qui a le focus à l'ouverture ; la liste se met à jour
pendant la frappe. Chaque ligne : nom, ville, nombre de séances, dernière ou prochaine séance.
« Afficher la suite » au bas de la page. L'action principale : **Nouvelle fiche**.

**Nouvelle fiche** — l'écran de l'entretien de 20 minutes : il doit se remplir sans quitter le
clavier. Prénom, nom, e-mail, téléphone d'abord ; puis civilité, date de naissance, profession,
adresse, origine, « venu par ». Dès que le prénom, le nom ou l'e-mail sont saisis, l'écran
montre les **fiches semblables**, chacune avec « Ouvrir cette fiche » : c'est là que se décide
de ne pas créer un doublon. Enregistrer ouvre la fiche créée.

**Une fiche.** En tête, le nom, l'âge, le téléphone et l'e-mail (touchables : appeler, écrire).
Des cartes : *Identité et coordonnées*, *Provenance et liens* (origine, mot-clé, venu par un
professionnel ou par une personne, couple, « a recommandé »), *Personne de confiance*, *Notes*.
Chaque carte s'ouvre en lecture ; « Modifier » la passe en saisie, avec Enregistrer et Annuler.
Puis les **séances**, de la plus récente à la plus ancienne (numéro, date, type, statut,
paiement), avec **Poser un rendez-vous** ; les inscriptions ; les questionnaires (date, version,
relu ou non). Sur ordinateur : les cartes à gauche, les séances à droite.

**Une séance.** En tête : la date et l'heure, le type, la personne (qui ouvre sa fiche), le
statut et le paiement, modifiables sur place, le montant. Actions : Déplacer, Annuler, Remettre
à « prévue ». Puis **les notes**, dans l'ordre de la trame : Demande, Objectif, Séance, Travail
personnel, Idées pour la suite, Réponse SMS — cette dernière avec « Copier ». Un seul bouton
Enregistrer pour la trame ; l'écran dit quand un texte n'est pas enregistré, et le signale avant
de le laisser quitter. Dessous, en lecture : les réponses données à la réservation, l'histoire
du rendez-vous, et, repliée, la copie brute reprise de Notion.

**Poser un rendez-vous** — une fenêtre. La personne (déjà choisie depuis une fiche ; sinon la
même recherche que l'écran Fiches), le type, la date, l'heure, et — repliés — la durée, le mode,
le montant. Sous la date choisie, les séances déjà prévues ce jour-là. Un chevauchement est
refusé, et le message le dit. La fenêtre rappelle que le rendez-vous n'est pas écrit dans
l'agenda Google et qu'aucun message ne part.

**Évènements.** À venir, puis passés : nom, date, ville, places libres sur places totales.
Un évènement : ses champs (le prix en euros à l'écran, en centimes en base), ses contenus HTML en
zones de texte, et ses inscrits — personne, statut, mode de paiement —, avec **Inscrire une
personne** et le changement de statut.

**Professionnels.** Un tableau : nom, catégories, ville, téléphone, connu, nombre de personnes
reçues. Un filtre de texte, appliqué sur place. Une fenêtre pour créer et modifier, tous les
champs du modèle, courriers compris.

**Réglages → Réservation.** Les types (une ligne par type, modifiable), la semaine type (les
plages de chaque jour), les dates d'exception à venir (ouvrir une date, la fermer, la rendre à
la semaine type), et les réglages — rappels, retenues, liste d'attente — avec leur unité.

**Partout.** Sans liaison `CLIENTS`, chaque écran dit : « La base des clients n'est pas reliée à
cet environnement. » Un refus s'affiche tel que la route l'écrit (`error`). Une panne passe par
`ErreurEcran`. Les pastilles de statut et de paiement portent un sens par les tokens de
`DESIGN.md` et **toujours leur libellé** : jamais la couleur seule.

### 15.5 Ce qui se teste

| Cible | Nature |
| :--- | :--- |
| Chaque famille de routes | session exigée ; une écriture venue d'une autre origine, session valable : refusée, base intacte ; 403 pour le jeton du serveur MCP ; 409 sans `CLIENTS` ; refus de validation sans valeur recopiée, **y compris quand la valeur est le nom d'un champ inconnu** ; une panne ne journalise qu'un code d'incident ; `no-store` sur les réussites comme sur les refus |
| Règle 2 | le nombre d'instructions de la liste, de la fiche et de la semaine est compté, et ne dépend pas du volume |
| Règle 3 | aucune route de ce chapitre ne lit un nom, une adresse ou un téléphone dans son adresse |
| Règle 4 | la fiche, la liste et la semaine ne portent le contenu d'aucune table sensible ; valeurs repères à l'appui |
| Règle 5 | le front n'écrit rien de ces routes dans le stockage du navigateur ; `Cache-Control: no-store` |
| Règles 6 et 11 | poser, déplacer, remettre à « prévue » sur une heure prise : refusé, rien d'écrit ; annuler écrit le mouvement ; changer le type d'une séance prévue quand seule la marge du nouveau type chevauche : refusé |
| Règle 7 | une note écrite depuis une version périmée est refusée, et la note en base est intacte ; deux premières écritures simultanées : une seule aboutit |
| Règle 12 | la dernière place demandée deux fois en même temps, par une inscription et par le retour d'une annulée : une seule l'obtient ; places abaissées sous l'occupation : refusé ; suppression d'un évènement pendant une inscription : l'une des deux échoue |
| Règle 13 | une séance sans fiche et une séance sans type figurent dans la semaine ; l'adresse et le téléphone reçus n'y figurent pas |
| Règle 8 | aucune route `DELETE` sur les fiches, les séances, les inscriptions, les questionnaires |
| Écrans | chaque composant à retour anticipé monté dans ses deux états (`screens.test.tsx`) ; chaque écran vu dans le navigateur, téléphone et ordinateur, clair et sombre |

---

## Annexe A — Schéma D1

```sql
-- 0001_init.sql

CREATE TABLE series (
  id                TEXT PRIMARY KEY,
  titre             TEXT NOT NULL,
  intention         TEXT,
  statut            TEXT NOT NULL DEFAULT 'en_cours',   -- en_cours | terminee
  source_content_id TEXT REFERENCES contents(id) ON DELETE SET NULL,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL,
  deleted_at        INTEGER
);

CREATE TABLE contents (
  id                 TEXT PRIMARY KEY,
  title              TEXT NOT NULL DEFAULT '',
  status             TEXT NOT NULL,                     -- Idée | Brouillon | Prêt | Publié
  platforms          TEXT NOT NULL DEFAULT '[]',        -- tableau JSON (§2.8)
  target_format      TEXT,
  objectif           TEXT,
  depth              TEXT,

  -- Produit par l'Analyste
  analyzed_at        INTEGER,                           -- NULL = jamais analysé (§2.8)
  verdict            TEXT,
  strategic_angle    TEXT,
  justification      TEXT,
  suggested_metaphor TEXT,

  -- Matière et productions courantes (JSON pur, sans signature — §2.3, §2.6)
  notes              TEXT NOT NULL DEFAULT '',
  draft              TEXT,                              -- LE brouillon, tous formats (§2.5)
  slides             TEXT,                              -- enrichissement carrousel (§2.5)

  -- Session Coach : état ; les messages sont dans coach_messages (§2.7)
  coach_status       TEXT,                              -- in_progress | validated
  coach_format_cible TEXT,                              -- format pour lequel la session a été calibrée
  coach_brief        TEXT,                              -- brief verrouillé par le Verrouilleur
  coach_validated_at INTEGER,

  -- Séries (§2.9)
  serie_id           TEXT REFERENCES series(id) ON DELETE SET NULL,
  angle              TEXT,
  serie_position     INTEGER,                           -- rang dans la série (§2.9)

  scheduled_date     TEXT,                              -- date ISO, sans heure
  legacy_json        TEXT,                              -- matière de l'ancien flow Interviewer (§2.8)
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL,
  deleted_at         INTEGER
);

-- Journal des productions IA (§2.6)
CREATE TABLE generations (
  id          TEXT PRIMARY KEY,
  content_id  TEXT NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,        -- analysis | draft | slides | cold_read
                                    -- | adjustment | brief | plan_series
  target      TEXT,                 -- colonne visée : draft | slides (NULL sinon)
  model_id    TEXT REFERENCES ai_models(id) ON DELETE SET NULL,
  model_label TEXT NOT NULL,        -- figé à l'écriture : survit à la suppression du modèle
  instruction TEXT,                 -- l'instruction d'ajustement, le cas échéant
  payload     TEXT NOT NULL,        -- JSON produit, propre
  created_at  INTEGER NOT NULL
);

-- Conversation Coach (§2.7)
CREATE TABLE coach_messages (
  id               TEXT PRIMARY KEY,
  content_id       TEXT NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
  role             TEXT NOT NULL,                       -- user | assistant
  content          TEXT NOT NULL,
  raw              TEXT,                                -- réponse JSON brute de l'assistant
  quick_replies    TEXT,                                -- tableau JSON
  ready_for_editor INTEGER NOT NULL DEFAULT 0,
  created_at       INTEGER NOT NULL,
  deleted_at       INTEGER                              -- réinitialisation de session (§2.7)
);

CREATE TABLE ai_models (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  api_code        TEXT NOT NULL,
  provider        TEXT NOT NULL DEFAULT 'onemin',       -- adaptateur appelé (§5.3)
  vendor          TEXT,                                 -- affichage (§5.3)
  cost            TEXT,
  strengths       TEXT,
  best_use_cases  TEXT,
  text_quality    INTEGER,
  is_default      INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  deleted_at      INTEGER
);

CREATE TABLE app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Synchronisation incrémentale (§8)
CREATE INDEX idx_contents_updated   ON contents(updated_at);
CREATE INDEX idx_series_updated     ON series(updated_at);
CREATE INDEX idx_models_updated     ON ai_models(updated_at);
-- Listes filtrées, contenus d'une série (§3.3)
CREATE INDEX idx_contents_status    ON contents(status)   WHERE deleted_at IS NULL;
CREATE INDEX idx_contents_serie     ON contents(serie_id) WHERE deleted_at IS NULL;
-- Dernière génération d'une nature pour un contenu (§2.6)
CREATE INDEX idx_generations_lookup ON generations(content_id, kind, created_at DESC);
CREATE INDEX idx_coach_messages     ON coach_messages(content_id, created_at);
```

## Annexe B — Correspondance Notion → D1

| Colonne Notion | Type Notion | Cible D1 | Conversion |
| :--- | :--- | :--- | :--- |
| *(id de page)* | — | `contents.id` | conservé tel quel (§2.4) |
| Titre | title | `title` | texte brut |
| Statut | select | `status` | nom de l'option |
| Plateforme | multi_select | `platforms` | tableau JSON des noms |
| Contenu | rich_text | `draft` | **texte brut**, signature retirée (§2.6) |
| Script vidéo | rich_text | `draft` | idem — une seule colonne (§2.5) |
| Slides | rich_text | `slides` | texte brut, signature retirée |
| Post Court | rich_text | **abandonné** | dérivé de `draft` à la lecture (§2.8) |
| Notes | rich_text | `notes` | texte brut |
| Coach Session | rich_text | `coach_*` + `coach_messages` | JSON éclaté en lignes (§2.7) |
| Date de publication | date | `scheduled_date` | `start` seul |
| Analysé | checkbox | `analyzed_at` | `true` → `last_edited_time` ; `false` → `NULL` |
| Verdict | select | `verdict` | nom |
| Angle stratégique | rich_text | `strategic_angle` | texte brut, signature retirée |
| Format cible | select | `target_format` | nom |
| Objectif | select | `objectif` | nom |
| Justification | rich_text | `justification` | texte brut |
| Métaphore Suggérée | rich_text | `suggested_metaphor` | texte brut |
| Profondeur | select | `depth` | nom |
| Réponses / Questions interview | rich_text | `legacy_json` | objet JSON `{answers, questions}` (§2.8) |
| *(created_time)* | — | `created_at` | ISO → epoch ms |
| *(last_edited_time)* | — | `updated_at` | ISO → epoch ms |

**Signatures.** Les champs produits par l'IA portent une signature markdown concaténée
après le JSON (`_Généré par : … - le …_`). L'import la **retire du contenu** et en dérive
une ligne `generations` (`kind` selon le champ, `model_label` extrait du texte,
`created_at` extrait de la date). L'historique d'avant migration est ainsi conservé, au
bon endroit, et les colonnes redeviennent du JSON pur.

**Modèles IA** : correspondance directe ; `provider` initialisé à `onemin` pour toutes les
lignes, `vendor` reprenant l'ancienne colonne « Fournisseur » (§5.3).

### Corrections de largeur intermédiaire (31/10/2026)

Les deux onglets du contenu s’utilisent également sous 1024 px, ou sous 1280 px
quand la série demanderait une troisième colonne. Le panneau Série s’efface alors.
Le seuil de chargement du studio reste 768 px. Les listes passent leurs étapes sous
le titre sous 1280 px, et la barre d’outils peut revenir à la ligne pour garder
chaque filtre accessible.

Les dépendances corrigées sont verrouillées dans `package-lock.json`. Remotion
4.0.532 épingle une version vulnérable de Zod ; la surcharge ciblée de sa dépendance
utilise Zod 4.6.7 ou ultérieur compatible, sans rétrograder le moteur vidéo.

### Retours d’interaction (31/10/2026)

Les boutons confirment l’appui, les menus et la matière d’une étape apparaissent
brièvement, les copies et sauvegardes réussies confirment par une coche. Les
contrôles segmentés se parcourent aussi avec les flèches, Début et Fin.
Après « Marquer publié », « Annuler le marquage » rétablit le statut ET la date
d’avant. Cette action n’est proposée qu’après une sauvegarde réussie et reste
disponible dans le contenu ouvert, sans compte à rebours. Le mouvement respecte
la préférence système de réduction des animations (DESIGN.md).

## Annexe C — Schéma de `luminose-clients` (v3.0, v3.1)

Les tables des phases S1 et S2a (§14.4), d'après le modèle de données du 26/11/2026. **Les
fichiers `workers/api/migrations-clients/0001_schema.sql` et `0003_portes.sql` font foi** ; ce qui suit en est la copie au
moment de la v3.0, comme l'Annexe A pour l'éditoriale. Les données de départ — six types de
séance, la semaine type, les réglages — sont dans `0002_reference.sql`.

Rappel des écarts au §2 (§14.4) : pas de `deleted_at` sur les tables qui portent des
personnes ; dates sans heure en `AAAA-MM-JJ`, heures d'horaire en `HH:MM` (heure de Paris) ;
montants en centimes ; choix en minuscules sans accent, contraints par `CHECK` quand la liste
est fermée (`clients.origine` reste libre : sa liste bouge).

```sql
-- 0001_schema.sql (migrations-clients)

-- ─── La réservation : types, horaires, réglages ─────────────────────────────

CREATE TABLE types_seance (
  id                      TEXT PRIMARY KEY,
  cle                     TEXT NOT NULL,
  libelle                 TEXT NOT NULL,
  nature                  TEXT NOT NULL CHECK (nature IN ('rencontre', 'seance')),
  duree_min               INTEGER NOT NULL CHECK (duree_min > 0),
  -- Le temps bloqué après la séance : un quart d'heure pour le breathwork.
  marge_apres_min         INTEGER NOT NULL DEFAULT 0 CHECK (marge_apres_min >= 0),
  -- L'écart entre deux débuts proposés : un entretien de 20 minutes se propose
  -- toutes les 30 minutes.
  pas_min                 INTEGER NOT NULL CHECK (pas_min > 0),
  lieu                    TEXT NOT NULL CHECK (lieu IN ('sur_place', 'visio', 'visio_ou_appel')),
  montant_centimes        INTEGER NOT NULL DEFAULT 0 CHECK (montant_centimes >= 0),
  etat_paiement_defaut    TEXT NOT NULL
                          CHECK (etat_paiement_defaut IN ('a_payer', 'attente_especes', 'payee', 'offerte', 'annulee')),
  questionnaire_requis    INTEGER NOT NULL DEFAULT 0 CHECK (questionnaire_requis IN (0, 1)),
  conditions_annulation   INTEGER NOT NULL DEFAULT 0 CHECK (conditions_annulation IN (0, 1)),
  liste_attente_proposee  INTEGER NOT NULL DEFAULT 0 CHECK (liste_attente_proposee IN (0, 1)),
  -- La fenêtre proposée en ligne, en heures écoulées (§14.7) : 504 h = 21 jours.
  fenetre_debut_h         INTEGER NOT NULL CHECK (fenetre_debut_h >= 0),
  fenetre_fin_h           INTEGER NOT NULL CHECK (fenetre_fin_h > fenetre_debut_h),
  -- JSON : les questions posées à la réservation. Vide jusqu'à la réservation.
  questions               TEXT NOT NULL DEFAULT '[]',
  reservable_en_ligne     INTEGER NOT NULL DEFAULT 1 CHECK (reservable_en_ligne IN (0, 1)),
  actif                   INTEGER NOT NULL DEFAULT 1 CHECK (actif IN (0, 1)),
  ordre                   INTEGER NOT NULL DEFAULT 0,
  created_at              INTEGER NOT NULL,
  updated_at              INTEGER NOT NULL,
  deleted_at              INTEGER
);
CREATE UNIQUE INDEX idx_types_seance_cle ON types_seance(cle);

-- La semaine type, un seul horaire pour tous les types (modèle §9, point 5).
CREATE TABLE horaires (
  id          TEXT PRIMARY KEY,
  jour        INTEGER NOT NULL CHECK (jour BETWEEN 1 AND 7),   -- 1 = lundi … 7 = dimanche
  debut       TEXT NOT NULL CHECK (debut GLOB '[0-2][0-9]:[0-5][0-9]'),
  fin         TEXT NOT NULL CHECK (fin GLOB '[0-2][0-9]:[0-5][0-9]'),
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  deleted_at  INTEGER,
  CHECK (debut < fin)
);

-- Les exceptions datées : une ligne par plage. Une date présente remplace la
-- semaine type ce jour-là ; une ligne sans plage (debut et fin vides) ferme la
-- journée.
CREATE TABLE horaires_dates (
  id          TEXT PRIMARY KEY,
  date        TEXT NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
  debut       TEXT CHECK (debut GLOB '[0-2][0-9]:[0-5][0-9]'),
  fin         TEXT CHECK (fin GLOB '[0-2][0-9]:[0-5][0-9]'),
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  deleted_at  INTEGER,
  CHECK ((debut IS NULL AND fin IS NULL) OR (debut IS NOT NULL AND fin IS NOT NULL AND debut < fin))
);
CREATE INDEX idx_horaires_dates_date ON horaires_dates(date);

-- Ce qui se règle sans toucher au code. Une valeur entière : une durée en
-- heures (le suffixe `_h` de la clé le dit) ou un nombre.
CREATE TABLE reglages (
  cle         TEXT PRIMARY KEY,
  valeur      INTEGER NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

-- Les textes qu'une personne accepte. Une modification crée une version ; la
-- séance ou le questionnaire garde la version acceptée.
CREATE TABLE textes_versions (
  id              TEXT PRIMARY KEY,
  cle             TEXT NOT NULL,           -- conditions_annulation | accord_conservation
  version         INTEGER NOT NULL CHECK (version >= 1),
  texte           TEXT NOT NULL,
  en_vigueur_le   INTEGER NOT NULL,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_textes_versions_cle ON textes_versions(cle, version);

-- ─── Références ─────────────────────────────────────────────────────────────

CREATE TABLE professionnels (
  id              TEXT PRIMARY KEY,
  nom             TEXT NOT NULL,
  categories      TEXT NOT NULL DEFAULT '[]',   -- JSON : liste
  specialisation  TEXT,
  adresse         TEXT,
  code_postal     TEXT,
  ville           TEXT,
  telephone       TEXT,
  email           TEXT,
  site_web        TEXT,
  note            TEXT,
  connu           INTEGER NOT NULL DEFAULT 0 CHECK (connu IN (0, 1)),
  courriers       TEXT NOT NULL DEFAULT '[]',   -- JSON : « Mai 2023 »…
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  deleted_at      INTEGER
);

-- ─── Les personnes ──────────────────────────────────────────────────────────

CREATE TABLE clients (
  id                    TEXT PRIMARY KEY,
  civilite              TEXT,                    -- Mme | M.
  prenom                TEXT NOT NULL,
  nom                   TEXT NOT NULL DEFAULT '',
  -- Sans accents, en minuscules : la recherche et l'ordre alphabétique.
  nom_recherche         TEXT NOT NULL,
  -- La clé d'un client (packages/pratique). Indexée, PAS unique : deux fiches
  -- peuvent la partager, et c'est le cas « à rapprocher » (§14.4). Vide pour
  -- une fiche sans adresse, qui ne se rattache jamais d'elle-même.
  cle_client            TEXT,
  email                 TEXT,
  telephone             TEXT,
  date_naissance        TEXT CHECK (date_naissance GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
  profession            TEXT,
  adresse               TEXT,
  code_postal           TEXT,
  ville                 TEXT,
  pays                  TEXT,                    -- code : FR
  -- Texte libre : la liste des origines bouge.
  origine               TEXT,
  mot_cle_google_ads    TEXT,
  clic_annonce          TEXT,
  clic_date             INTEGER,
  via_professionnel_id  TEXT REFERENCES professionnels(id) ON DELETE SET NULL,
  via_client_id         TEXT REFERENCES clients(id) ON DELETE SET NULL,
  couple_client_id      TEXT REFERENCES clients(id) ON DELETE SET NULL,
  stancer_customer_id   TEXT,
  qonto_client_id       TEXT,
  brevo_ajoute_le       INTEGER,
  compta_wlu_ajoute_le  INTEGER,
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL
);
CREATE INDEX idx_clients_cle ON clients(cle_client);
CREATE INDEX idx_clients_nom_recherche ON clients(nom_recherche);
CREATE INDEX idx_clients_via_professionnel ON clients(via_professionnel_id);
CREATE INDEX idx_clients_via_client ON clients(via_client_id);
CREATE INDEX idx_clients_couple ON clients(couple_client_id);

-- ★ La personne de confiance : une par fiche.
CREATE TABLE clients_confiance (
  id                TEXT PRIMARY KEY,
  client_id         TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  civilite          TEXT,
  prenom            TEXT,
  nom               TEXT,
  telephone         TEXT,
  email             TEXT,
  mis_a_jour_le     INTEGER,
  questionnaire_id  TEXT REFERENCES questionnaires(id) ON DELETE SET NULL,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_clients_confiance_client ON clients_confiance(client_id);
CREATE INDEX idx_clients_confiance_questionnaire ON clients_confiance(questionnaire_id);

-- ★ Le texte libre de la fiche : un par fiche.
CREATE TABLE clients_notes (
  id          TEXT PRIMARY KEY,
  client_id   TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  texte       TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_clients_notes_client ON clients_notes(client_id);

-- ─── Les séances ────────────────────────────────────────────────────────────

CREATE TABLE seances (
  id                      TEXT PRIMARY KEY,
  -- Vide tant que la séance est « à rapprocher » : elle garde alors l'identité
  -- reçue. Aucune cascade ne l'atteint.
  client_id               TEXT REFERENCES clients(id) ON DELETE CASCADE,
  -- Vide sur une séance ancienne dont le type n'est pas reconnu.
  type_seance_id          TEXT REFERENCES types_seance(id),
  -- JSON : prénom, nom, e-mail et téléphone tels qu'envoyés.
  identite_recue          TEXT,
  debut                   INTEGER NOT NULL,
  duree_min               INTEGER NOT NULL CHECK (duree_min > 0),
  -- début + durée + marge du type : écrit à la création et à chaque
  -- déplacement, par l'instruction même qui décide (clients/decisions.ts).
  -- L'intervalle occupé est [debut, occupe_jusqua[.
  occupe_jusqua           INTEGER NOT NULL CHECK (occupe_jusqua > debut),
  -- Avance à chaque déplacement : c'est elle qui distinguera les rappels de
  -- l'ancienne date de ceux de la nouvelle.
  revision                INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  statut                  TEXT NOT NULL CHECK (statut IN ('prevue', 'realisee', 'annulee', 'absent')),
  etat_paiement           TEXT NOT NULL
                          CHECK (etat_paiement IN ('a_payer', 'attente_especes', 'payee', 'offerte', 'annulee')),
  montant_centimes        INTEGER NOT NULL DEFAULT 0 CHECK (montant_centimes >= 0),
  mode                    TEXT CHECK (mode IN ('sur_place', 'visio', 'appel')),
  visio_url               TEXT,
  agenda_evenement_id     TEXT,
  agenda_etat             TEXT NOT NULL DEFAULT 'a_ecrire' CHECK (agenda_etat IN ('a_ecrire', 'ecrit', 'echec')),
  -- La changer révoque les liens déjà envoyés pour cette séance (§14.5).
  liens_version           INTEGER NOT NULL DEFAULT 1 CHECK (liens_version >= 1),
  liste_attente           INTEGER NOT NULL DEFAULT 0 CHECK (liste_attente IN (0, 1)),
  conditions_acceptees_le INTEGER,
  conditions_version      INTEGER,
  questionnaire_id        TEXT REFERENCES questionnaires(id) ON DELETE SET NULL,
  origine                 TEXT NOT NULL CHECK (origine IN ('site', 'console', 'import')),
  clic_annonce            TEXT,
  provenance              TEXT,                    -- JSON : source, campagne, mot-clé
  conversion_importee_le  INTEGER,
  conversion_retiree_le   INTEGER,
  libelle_importe         TEXT,
  created_at              INTEGER NOT NULL,
  updated_at              INTEGER NOT NULL
);
CREATE INDEX idx_seances_debut ON seances(debut);
CREATE INDEX idx_seances_client_debut ON seances(client_id, debut);
CREATE INDEX idx_seances_type ON seances(type_seance_id);
CREATE INDEX idx_seances_questionnaire ON seances(questionnaire_id);

-- L'histoire d'un rendez-vous : créé, déplacé, annulé, rétabli ; par qui.
CREATE TABLE seances_mouvements (
  id             TEXT PRIMARY KEY,
  seance_id      TEXT NOT NULL REFERENCES seances(id) ON DELETE CASCADE,
  nature         TEXT NOT NULL CHECK (nature IN ('creee', 'deplacee', 'annulee', 'retablie')),
  -- florent : depuis la console ; personne : la personne elle-même (une
  -- réservation, un créneau libéré pris) ; import : la reprise de Notion.
  par            TEXT NOT NULL CHECK (par IN ('florent', 'personne', 'import')),
  ancien_debut   INTEGER,
  nouveau_debut  INTEGER,
  -- La révision de la séance après le mouvement.
  revision       INTEGER NOT NULL,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);
CREATE INDEX idx_seances_mouvements_seance ON seances_mouvements(seance_id, created_at);

-- ★ La trame des notes d'une séance : une par séance.
CREATE TABLE seances_notes (
  id                 TEXT PRIMARY KEY,
  seance_id          TEXT NOT NULL REFERENCES seances(id) ON DELETE CASCADE,
  demande            TEXT,
  objectif           TEXT,
  seance             TEXT,
  travail_personnel  TEXT,
  idees_suite        TEXT,
  reponse_sms        TEXT,
  -- La copie brute de la page Notion d'origine, gardée entière.
  import_notion      TEXT,
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_seances_notes_seance ON seances_notes(seance_id);

-- ★ Les réponses aux questions posées à la réservation.
CREATE TABLE seances_reponses (
  id          TEXT PRIMARY KEY,
  seance_id   TEXT NOT NULL REFERENCES seances(id) ON DELETE CASCADE,
  rang        INTEGER NOT NULL,
  question    TEXT NOT NULL,
  reponse     TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_seances_reponses_rang ON seances_reponses(seance_id, rang);

-- ─── Les évènements ─────────────────────────────────────────────────────────

CREATE TABLE evenements (
  id                      TEXT PRIMARY KEY,         -- page Notion pour les anciens, UUID ensuite
  nom                     TEXT NOT NULL,
  type                    TEXT,                     -- meditation | hypnose | respiration-holotropique
  debut                   INTEGER NOT NULL,
  fin                     INTEGER,
  ville                   TEXT,
  places_totales          INTEGER CHECK (places_totales >= 0),
  prix_centimes           INTEGER CHECK (prix_centimes >= 0),
  questionnaire_requis    INTEGER NOT NULL DEFAULT 0 CHECK (questionnaire_requis IN (0, 1)),
  -- Renseignée : l'inscription se fait ailleurs ; vide : sur le site.
  url_inscription         TEXT,
  publie                  INTEGER NOT NULL DEFAULT 0 CHECK (publie IN (0, 1)),
  publie_le               INTEGER,
  publication_empreinte   TEXT,
  meta_description        TEXT,
  html_permalink          TEXT,
  html_programme          TEXT,
  html_prix               TEXT,
  html_lieu_adresse       TEXT,
  html_lieu_instructions  TEXT,
  created_at              INTEGER NOT NULL,
  updated_at              INTEGER NOT NULL,
  deleted_at              INTEGER
);
CREATE INDEX idx_evenements_debut ON evenements(debut);

CREATE TABLE inscriptions (
  id                TEXT PRIMARY KEY,
  -- Un évènement n'est jamais retiré pour de bon (suppression logique) : le
  -- lien est restreint, il ne se vide pas.
  evenement_id      TEXT NOT NULL REFERENCES evenements(id),
  -- Vide tant que l'inscription est « à rapprocher ». Aucune cascade ne l'atteint.
  client_id         TEXT REFERENCES clients(id) ON DELETE CASCADE,
  statut            TEXT NOT NULL
                    CHECK (statut IN ('retenue', 'payee', 'confirmee', 'expiree', 'annulee', 'deconseillee')),
  retenue_jusqua    INTEGER,
  mode_paiement     TEXT CHECK (mode_paiement IN ('carte', 'virement')),
  montant_centimes  INTEGER CHECK (montant_centimes >= 0),
  code_promo        TEXT,
  questionnaire_id  TEXT REFERENCES questionnaires(id) ON DELETE SET NULL,
  -- Tirée au hasard, sans signification : c'est elle que la page de paiement
  -- présente pour suivre une inscription.
  reference         TEXT NOT NULL,
  identite_recue    TEXT,                           -- JSON, comme sur une séance
  liens_version     INTEGER NOT NULL DEFAULT 1 CHECK (liens_version >= 1),
  provenance        TEXT,
  origine           TEXT NOT NULL CHECK (origine IN ('site', 'console', 'import')),
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL,
  -- Une retenue sans mode ni échéance échapperait au compte des places : la
  -- dernière place (§14.4) ne sait la compter que par l'un ou par l'autre.
  CHECK (statut <> 'retenue' OR (mode_paiement IS NOT NULL AND retenue_jusqua IS NOT NULL))
);
CREATE UNIQUE INDEX idx_inscriptions_reference ON inscriptions(reference);
CREATE INDEX idx_inscriptions_evenement_statut ON inscriptions(evenement_id, statut);
CREATE INDEX idx_inscriptions_client ON inscriptions(client_id);
-- Une fiche n'a qu'une inscription vivante par évènement. Deux inscriptions
-- encore « à rapprocher » peuvent venir de la même personne : l'index ne les
-- voit pas, l'alerte de rapprochement les montre ensemble.
CREATE UNIQUE INDEX idx_inscriptions_vivante
  ON inscriptions(evenement_id, client_id)
  WHERE client_id IS NOT NULL AND statut IN ('retenue', 'payee', 'confirmee');

-- ─── Les questionnaires ★ ───────────────────────────────────────────────────

CREATE TABLE questionnaires (
  id                      TEXT PRIMARY KEY,
  -- La clé de la commande qui l'a porté : reçu deux fois, il ne crée qu'une
  -- ligne. Vide pour un ancien questionnaire repris de Drive.
  envoi_id                TEXT,
  contexte                TEXT NOT NULL CHECK (contexte IN ('seance', 'decouverte', 'groupe', 'journee_externe')),
  version                 TEXT CHECK (version IN ('complet', 'suivi')),
  version_formulaire      TEXT,                     -- « 2026-12 »
  -- Vide tant que le questionnaire est « à rapprocher ». Aucune cascade ne l'atteint.
  client_id               TEXT REFERENCES clients(id) ON DELETE CASCADE,
  seance_id               TEXT REFERENCES seances(id) ON DELETE SET NULL,
  inscription_id          TEXT REFERENCES inscriptions(id) ON DELETE SET NULL,
  evenement_id            TEXT REFERENCES evenements(id),
  identite                TEXT,                     -- JSON, tels qu'envoyés
  coordonnees             TEXT,
  confiance               TEXT,
  -- Copie figée : pour chaque question, son libellé tel qu'affiché et la réponse.
  reponses                TEXT,
  nb_oui                  INTEGER,
  autorisation_parentale  TEXT NOT NULL DEFAULT 'sans_objet'
                          CHECK (autorisation_parentale IN ('sans_objet', 'a_obtenir', 'recue')),
  declaration             INTEGER CHECK (declaration IN (0, 1)),
  accord_conservation     INTEGER CHECK (accord_conservation IN (0, 1)),
  accord_texte            TEXT,
  accord_le               INTEGER,
  rattachement            TEXT NOT NULL DEFAULT 'fait' CHECK (rattachement IN ('fait', 'a_rapprocher')),
  a_revoir                INTEGER NOT NULL DEFAULT 0 CHECK (a_revoir IN (0, 1)),
  relu_le                 INTEGER,
  pdf_cle                 TEXT,
  pdf_le                  INTEGER,
  source                  TEXT NOT NULL DEFAULT 'site' CHECK (source IN ('site', 'import_drive')),
  drive_url               TEXT,
  created_at              INTEGER NOT NULL,
  updated_at              INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_questionnaires_envoi ON questionnaires(envoi_id);
CREATE INDEX idx_questionnaires_client ON questionnaires(client_id);
CREATE INDEX idx_questionnaires_seance ON questionnaires(seance_id);
CREATE INDEX idx_questionnaires_inscription ON questionnaires(inscription_id);
CREATE INDEX idx_questionnaires_evenement ON questionnaires(evenement_id);

-- ─── Les paiements ──────────────────────────────────────────────────────────

-- Une ligne par tentative. Ce sont des pièces comptables : effacer une
-- personne les détache (seance_id, inscription_id remis à vide), ne les retire pas.
CREATE TABLE paiements (
  id                TEXT PRIMARY KEY,
  seance_id         TEXT REFERENCES seances(id) ON DELETE SET NULL,
  inscription_id    TEXT REFERENCES inscriptions(id) ON DELETE SET NULL,
  prestataire       TEXT NOT NULL CHECK (prestataire IN ('stancer', 'stripe', 'virement', 'especes')),
  reference         TEXT NOT NULL,
  montant_centimes  INTEGER NOT NULL CHECK (montant_centimes >= 0),
  devise            TEXT NOT NULL DEFAULT 'EUR',
  statut            TEXT NOT NULL CHECK (statut IN ('cree', 'reussi', 'echoue', 'rembourse')),
  -- Un paiement de test (clés de test du prestataire) : jamais confondu avec un réel.
  test              INTEGER NOT NULL DEFAULT 0 CHECK (test IN (0, 1)),
  facture_qonto_id  TEXT,
  reussi_le         INTEGER,
  rembourse_le      INTEGER,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_paiements_reference ON paiements(prestataire, reference);
CREATE INDEX idx_paiements_seance ON paiements(seance_id);
CREATE INDEX idx_paiements_inscription ON paiements(inscription_id);
```

### Phase S2a — `0003_portes.sql` (v3.1)

Les tables des portes, côté gestion (§14.6) : aucune ne porte de valeur personnelle. Leurs
valeurs de départ sont au §14.6.1.

```sql
-- Les portes, côté gestion : ce qu'une porte a reçu, ce que gestion demande à
-- Make, ce qui demande le regard de Florent, et les modèles de messages
-- (SPEC §14.6, phase S2a ; Annexe C).
--
-- `0001` et `0002` ne se modifient pas : cette migration ajoute. Aucune des
-- quatre tables ne porte de valeur personnelle — une commande garde une
-- empreinte et un reçu minimal, un ordre et une alerte désignent un objet sans
-- le décrire. Leurs liens vers l'objet sont polymorphes (`objet_type`,
-- `objet_id`), donc sans clé étrangère : c'est l'effacement de la phase S4 qui
-- les retire avec la personne (Annexe C, matrice d'effacement).

-- ─── Ce qu'une porte a reçu ─────────────────────────────────────────────────

-- Une ligne par commande ACCEPTÉE : les refus d'avant la décision (invalide,
-- ferme, trop_de_demandes) ne s'y écrivent pas (§14.6.1). Le couple
-- (porte, cle) est unique : c'est lui qui fait qu'un envoi rejoué ne crée rien
-- en double (règle 5).
CREATE TABLE commandes (
  id          TEXT PRIMARY KEY,
  porte       TEXT NOT NULL CHECK (porte IN ('publique', 'service')),
  -- Fabriquée par l'appelant (contrat §2) ; pour une confirmation de Make,
  -- l'identifiant de l'ordre.
  cle         TEXT NOT NULL,
  sorte       TEXT NOT NULL CHECK (sorte IN ('questionnaire', 'confirmation')),
  objet_type  TEXT,
  objet_id    TEXT,
  -- HMAC de l'envoi, avec un secret de gestion : elle ne permet pas d'en
  -- deviner le contenu.
  empreinte   TEXT NOT NULL,
  -- JSON : la réponse rendue. Ni identité, ni réponse.
  recu        TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_commandes_cle ON commandes(porte, cle);
-- La purge, et le compte des commandes du jour (la borne).
CREATE INDEX idx_commandes_created ON commandes(created_at);
CREATE INDEX idx_commandes_objet ON commandes(objet_type, objet_id);

-- ─── Ce que gestion demande à Make ──────────────────────────────────────────

-- Ni adresse, ni numéro, ni texte : le message se compose au départ, depuis le
-- modèle et la fiche du moment (§14.6).
CREATE TABLE ordres (
  id                  TEXT PRIMARY KEY,
  -- La liste du contrat, §4.1. Seul `message.email` sert dans la phase S2a.
  sorte               TEXT NOT NULL CHECK (sorte IN (
                        'message.email', 'message.sms', 'conversion.importer', 'conversion.retirer',
                        'contact.brevo', 'client.comptabilite', 'paiement.stancer.creer',
                        'paiement.stancer.verifier', 'facture.qonto.creer', 'notification.florent')),
  -- Pour un message : la clé du modèle (`questionnaire_accuse`…).
  modele_cle          TEXT,
  objet_type          TEXT NOT NULL,
  objet_id            TEXT NOT NULL,
  prevu_le            INTEGER NOT NULL,
  etat                TEXT NOT NULL DEFAULT 'prevu'
                      CHECK (etat IN ('prevu', 'confie_a_make', 'fait', 'echec', 'annule')),
  -- Une clé par effet : `accuse:<questionnaire>`, plus tard
  -- `rappel:<séance>:<canal>:<révision>`.
  cle_unicite         TEXT NOT NULL,
  tentatives          INTEGER NOT NULL DEFAULT 0 CHECK (tentatives >= 0),
  -- Posée une fois, à la première remise : c'est elle qui compte un e-mail
  -- dans la borne du jour, pas ses relances.
  premiere_remise_le  INTEGER,
  confie_le           INTEGER,
  termine_le          INTEGER,
  -- JSON rendu par Make : des identifiants, jamais un texte.
  resultat            TEXT,
  -- Un code court : `objet_absent`, le motif d'un échec rendu par Make…
  motif               TEXT,
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_ordres_cle_unicite ON ordres(cle_unicite);
CREATE INDEX idx_ordres_etat ON ordres(etat, prevu_le);
CREATE INDEX idx_ordres_premiere_remise ON ordres(sorte, premiere_remise_le);

-- ─── Ce qui demande le regard de Florent ────────────────────────────────────

-- Une alerte désigne un objet, elle ne le décrit pas : aucune valeur
-- personnelle ici. L'écart d'une fiche, par exemple, se lit sur la ligne reçue.
CREATE TABLE alertes (
  id          TEXT PRIMARY KEY,
  sorte       TEXT NOT NULL CHECK (sorte IN (
                'a_rapprocher', 'a_revoir', 'ecart_fiche', 'second_questionnaire', 'message_echec',
                'confirmation_contraire', 'borne_atteinte', 'modele_absent')),
  objet_type  TEXT NOT NULL,
  objet_id    TEXT NOT NULL,
  resolue_le  INTEGER,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
-- La même alerte ne s'ouvre pas deux fois tant qu'elle n'est pas résolue.
CREATE UNIQUE INDEX idx_alertes_ouvertes ON alertes(sorte, objet_type, objet_id) WHERE resolue_le IS NULL;
CREATE INDEX idx_alertes_objet ON alertes(objet_type, objet_id);

-- ─── Les modèles de messages ────────────────────────────────────────────────

-- Créée vide : les textes viennent du lot F. Une modification crée une version.
CREATE TABLE messages_modeles (
  id          TEXT PRIMARY KEY,
  cle         TEXT NOT NULL,
  canal       TEXT NOT NULL CHECK (canal IN ('email', 'sms')),
  version     INTEGER NOT NULL CHECK (version >= 1),
  objet       TEXT,
  corps       TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  deleted_at  INTEGER
);
CREATE UNIQUE INDEX idx_messages_modeles_version ON messages_modeles(cle, canal, version);

-- ─── La mémoire d'un envoi, après la purge de sa commande ───────────────────

-- L'empreinte de l'envoi : un rejeu reconnu après la purge de sa commande
-- (§14.6.1). Et la fiche complétée : posée quand la fiche a reçu ce que ce
-- questionnaire pouvait lui apporter — vide, le passage planifié le reprend.
ALTER TABLE questionnaires ADD COLUMN envoi_empreinte TEXT;
ALTER TABLE questionnaires ADD COLUMN fiche_completee_le INTEGER;

-- Puis six réglages (§14.6.1).
```

### La matrice d'effacement — NORMATIF

Pour chaque relation : qui possède la ligne, si le lien peut être vide, et ce que devient la
ligne quand son propriétaire est effacé. **Retirée** : `ON DELETE CASCADE`. **Détachée** :
`ON DELETE SET NULL`, la ligne reste. **Restreinte** : aucune clause — le propriétaire
n'est jamais retiré pour de bon (suppression logique), une suppression réelle serait refusée.

| Ligne | Lien | Propriétaire | Vide possible | À l'effacement du propriétaire |
| :--- | :--- | :--- | :---: | :--- |
| `clients_confiance` ★ | `client_id` | `clients` | non | **retirée** |
| `clients_confiance` ★ | `questionnaire_id` | `questionnaires` | oui | détachée |
| `clients_notes` ★ | `client_id` | `clients` | non | **retirée** |
| `clients` | `via_professionnel_id` | `professionnels` | oui | détachée |
| `clients` | `via_client_id` | `clients` (l'autre fiche) | oui | détachée |
| `clients` | `couple_client_id` | `clients` (l'autre fiche) | oui | détachée |
| `seances` | `client_id` | `clients` | oui — « à rapprocher » | **retirée** |
| `seances` | `type_seance_id` | `types_seance` | oui — séance ancienne | restreinte |
| `seances` | `questionnaire_id` | `questionnaires` | oui | détachée |
| `seances_mouvements` | `seance_id` | `seances` | non | **retirée** |
| `seances_notes` ★ | `seance_id` | `seances` | non | **retirée** |
| `seances_reponses` ★ | `seance_id` | `seances` | non | **retirée** |
| `inscriptions` | `evenement_id` | `evenements` | non | restreinte |
| `inscriptions` | `client_id` | `clients` | oui — « à rapprocher » | **retirée** |
| `inscriptions` | `questionnaire_id` | `questionnaires` | oui | détachée |
| `questionnaires` ★ | `client_id` | `clients` | oui — « à rapprocher » | **retirée** |
| `questionnaires` ★ | `seance_id` | `seances` | oui | détachée |
| `questionnaires` ★ | `inscription_id` | `inscriptions` | oui | détachée |
| `questionnaires` ★ | `evenement_id` | `evenements` | oui | restreinte |
| `paiements` | `seance_id` | `seances` | oui | **détachée** — pièce comptable |
| `paiements` | `inscription_id` | `inscriptions` | oui | **détachée** — pièce comptable |
| `commandes` | `objet_type`, `objet_id` | l'objet créé (polymorphe, sans clé étrangère) | oui | **retirée par l'effacement** (S4), avec son reçu (§14.6) |
| `ordres` | `objet_type`, `objet_id` | l'objet concerné (polymorphe) | non | **retiré par l'effacement** (S4) |
| `alertes` | `objet_type`, `objet_id` | l'objet désigné (polymorphe) | non | **retirée par l'effacement** (S4) |

Ces trois liens n'ont pas de clé étrangère : une commande, un ordre ou une alerte peut désigner
un questionnaire, une séance, un ordre ou un réglage. Aucune cascade ne les atteint donc ; c'est
l'effacement de la phase S4 qui les cherche par `(objet_type, objet_id)` et les retire. Ils ne
portent aucune valeur personnelle — une empreinte, un reçu minimal, une sorte, un état —, mais
ils mèneraient à la personne. `messages_modeles` ne porte personne : suppression logique.

Effacer un client retire donc, en cascade : ses séances et, avec elles, leurs mouvements,
leurs notes et leurs réponses ; sa personne de confiance ; ses notes de fiche ; ses
questionnaires ; ses inscriptions. Ses paiements restent, `seance_id` et `inscription_id`
remis à vide (règle 8). Les fiches qui le désignaient (`via_client_id`, `couple_client_id`)
perdent ce lien et rien d'autre.

**Ce qu'aucune cascade n'atteint** : une séance, une inscription ou un questionnaire **sans
client** (`client_id` vide, « à rapprocher »), même s'il porte l'identité de la personne
effacée (`identite_recue`, `identite`), ou s'il ne lui est relié que par une séance ou une
inscription retirée — il en est alors détaché, pas retiré. La règle 8 exige qu'il parte
aussi : c'est l'effacement de la phase S4 qui le cherche et le retire, avec sa trace.

## Annexe D — Correspondance Notion et Calendly → `luminose-clients` (v3.0)

D'après le §6 du modèle de données. L'import est rejouable : une ligne reprise garde
l'identifiant de sa page Notion (§14.9).

### Calendly

| Calendly | Gestion |
| :--- | :--- |
| Les six types ouverts par le site : durée, marge, pas, lieu, questions | `types_seance` |
| Leurs notes internes (montant, état de paiement) | `types_seance` |
| L'horaire « Séances individuelles » et ses ouvertures datées à venir | `horaires`, `horaires_dates` |
| Les rendez-vous à venir | déjà dans Notion : repris avec les séances ; l'identifiant de leur rendez-vous dans l'agenda Google, que Calendly garde, permet de les y rattacher |

### Clients (33 propriétés)

| Notion | Gestion |
| :--- | :--- |
| Nom | `prenom` (premier mot) et `nom` (le reste) — les fiches de trois mots ou plus sont listées pour vérification |
| Genre, Date de naissance, Email, Phone, Profession | `clients` (`civilite`, `date_naissance`, `email`, `telephone`, `profession`) |
| Adresse, Code postal, Ville, Pays | `clients` (« France - FR » → `FR`) |
| Origine, Google Ads Keyword | `clients.origine`, `clients.mot_cle_google_ads` |
| Via professionnel, Via client, Couple | `via_professionnel_id`, `via_client_id`, `couple_client_id` ; « A recommandé » se calcule |
| Séances, Evènements | `seances.client_id` ; `inscriptions` (statut `confirmee`, origine `import`) |
| Personne de confiance (5 propriétés) | `clients_confiance` ★ |
| stancer_customer_id, qonto_client_id | `clients` |
| Corps de la page | `clients_notes` ★ |
| Nombre de séances, Dernière séance, Âge | calculés, non repris |
| Prise de rendez-vous, Paiement stage respiration, Créer dans Stancer et Qonto | des gestes de la console, pas des données |
| Mot de passe (SHA-256) | **non repris** : aucun script ne s'en sert |

`nom_recherche` et `cle_client` se calculent à l'import (`packages/pratique`).

### Séances (15 propriétés)

| Notion | Gestion |
| :--- | :--- |
| Name | `libelle_importe` ; le type est déduit du nom entre parenthèses quand il correspond à un type connu |
| Date | `debut` et `duree_min` ; `occupe_jusqua` se calcule |
| Clients, Statut, État paiement | `seances` |
| Demande, Objectif, corps de la page | `seances_notes` ★ ; le corps est découpé selon la trame quand ses titres y sont, et toujours gardé entier dans `import_notion` |
| gclid | `clic_annonce` |
| stancer_payment_intent_id, stancer_payment_intent_amount, qonto_client_invoice_id | une ligne de `paiements` ; le montant passe d'euros en centimes |
| recevoir_notification_disponibilite | `liste_attente` |
| calendly_uri, calendly_cancel_uri, calendly_reschedule_uri | **non repris** : sans objet une fois Calendly quitté |

Pour les séances à venir, l'import inscrit aussi les rappels (phase S2 et suivantes) ; leur
rendez-vous de l'agenda Google existe déjà, créé par Calendly, et leur est rattaché.

### Évènements (18 propriétés)

| Notion | Gestion |
| :--- | :--- |
| Nom, Date, Type d'évènement, Ville, Places totales | `evenements` |
| Clients | `inscriptions` |
| Publié sur le site, Questionnaire de santé, URL Inscription, Meta description, cinq contenus HTML | `evenements` |
| Places libres | calculé |
| cle | **non repris** |
| — | `prix_centimes`, à renseigner à la main pour les évènements à venir |

### Professionnels (15 propriétés)

Tout est repris ; « Adresse complète » et « Clients reçus » se calculent.

### Hors Notion

Les anciens questionnaires : une ligne `questionnaires` ★ par PDF de Drive (client, date,
lien ; `source = 'import_drive'`), sans en lire le contenu ; les cas douteux reviennent à
Florent.

### Les règles de reprise (phase S3)

Ce que la correspondance ne dit pas, et que l'outil applique (`workers/api/import/`). Ce qu'il
ne sait pas traduire, il ne le devine jamais : la ligne est reprise sans la valeur quand la
colonne l'accepte, et le cas est listé dans le rapport, par identifiant.

**Partout.**
- L'identifiant d'une ligne est celui de sa page Notion. Une ligne sans page — une note, une
  personne de confiance, un paiement, une inscription, un ancien questionnaire — a un
  identifiant **dérivé** des siens (`note-<fiche>`, `paiement-<séance>`,
  `inscription-<évènement>-<fiche>`, `drive-<fichier>`) : deux imports donnent les mêmes.
- Les relations sont validées avant d'écrire : vers une page absente de l'export, la ligne est
  reprise sans le lien ; une relation « un seul » qui en porte plusieurs : aucun lien choisi.
  Les deux cas sont listés.
- `created_at`, `updated_at` : ceux de la page. Une date sans heure, là où le modèle veut
  `AAAA-MM-JJ`, reste un texte.
- **Insertion ou mise à jour, jamais `INSERT OR REPLACE`** — il retirerait la ligne et, par les
  clés étrangères, tout ce qui en dépend. La cible du conflit se définit table par table d'après
  les index uniques ; une mise à jour ne touche que les colonnes que Notion pilote. Le prix d'un
  évènement, la référence d'une inscription, le type attribué à la main ne sont jamais remis à
  vide. Les lignes de référence (types, horaires, réglages) ne sont pas touchées.
- Une ligne importée puis absente de l'export suivant n'est pas retirée : elle est listée.

**Clients.** « Nom » : le premier mot en prénom, le reste en nom ; trois mots ou plus, listé.
Nom de recherche et clé par `packages/pratique`. « France - FR » → `FR`. Origine reprise telle
quelle. Les trois liens s'écrivent après toutes les fiches. Une personne de confiance seulement
si l'un de ses cinq champs est rempli. Le corps de la page, en texte brut, devient la note de
la fiche. **Un ancien questionnaire** : un lien Drive dont le paragraphe contient
« questionnaire » — une ligne `questionnaires` par fichier Drive (`source = 'import_drive'`, la
date du bloc, aucune réponse, contexte `seance` par défaut) ; les autres liens Drive ne créent
rien et sont listés. Aucun PDF n'est ouvert.

**Séances.** Le type, par le libellé entre parenthèses du titre, selon une table de
correspondance versionnée (`import/correspondance.ts`) ; un libellé inconnu : sans type, listé
avec son nombre. Sans fin : la durée du type, sinon 60 minutes, listé. Origine `import`,
`agenda_etat = 'ecrit'`, révision 0, aucun mouvement. Le corps est découpé selon la trame
(Séance, Travail personnel, Idées pour la suite, Réponse SMS) quand ses titres y sont, et
toujours gardé entier. Un paiement par référence Stancer, en centimes ; deux séances de même
référence : aucun paiement, listées ; payée sans Stancer : pas de ligne, comptée. **Un statut
vide : la séance n'est pas reprise**, et listée ; un état de paiement vide : « à payer », listé.
**Deux séances prévues, à venir, qui se chevauchent — marge comprise — arrêtent l'import avant
toute écriture**, désignées par leurs identifiants : cela se corrige dans Notion. Passées, elles
sont reprises : c'est de l'histoire.

**Évènements.** Le prix reste vide, et chaque évènement à venir est listé « prix à saisir ».
Une inscription par personne, `confirmee`, origine `import` ; sa référence publique est tirée
au hasard à la première insertion et gardée ensuite. Une inscription prise dans gestion pour la
même fiche l'emporte.
