# Passation à Claude Code — refonte de l'interface de la console Luminose

*Rédigé le 28/11/2026. Fait suite à `01-architecture-information.md` (v3), `02-parcours-usage.md` et `03-brief-claude-design.md`. Ce document dit quoi construire, dans quel ordre, et ce qui n'est pas décidé.*

## 1. Ce qui t'est demandé

Remplacer l'interface de la console (application React/TypeScript, gestion.luminose.fr, recette sur gestion-recette.luminose.fr) par celle des maquettes validées. **L'organisation, la navigation et l'habillage changent. Les données, les règles métier et la logique de l'éditorial ne changent pas.**

Avant d'écrire du code : lis les trois documents cités ci-dessus et l'existant, puis propose ton plan lot par lot (voir §7). Ne commence pas par un grand remplacement.

## 2. Ce que tu reçois

| Fichier | Rôle |
| :--- | :--- |
| `tokens.css` | Les jetons de design : couleurs des deux thèmes, typographie, espacements, formes, ombres, largeurs. **Source de vérité pour les valeurs.** |
| `console-reference.css` | La feuille de style commune des maquettes. Une référence pour les états (survol, appui, focus, section repliable), pas un fichier à livrer tel quel. |
| `maquettes/*.dc.html` | Une maquette par écran, 62 planches (liste au §5). Chaque planche a une variante sombre `…Sombre.dc.html`, qui ne fait que monter la même planche avec `sombre = true`. |
| `sources/*.html` | Les mêmes écrans avant assemblage : plus courts à lire (`@title`, `@size`, `@body`, `@logic`). |

Le canevas est consultable ici : https://claude.ai/artifact/TXhvZszwyfxrnitLG3qeV8 (privé, compte de Florent).

**Lire une maquette.** Ce sont des gabarits, pas du code à copier. `{{chemin}}` est une valeur ; `<sc-for list="{{x}}" as="i">` répète ; `<sc-if value="{{x}}">` conditionne ; `<dc-import name="Nav" …>` monte la barre latérale ; les données d'exemple sont dans la méthode `vals()` en bas de fichier. Dans `sources/`, `@@MAC@@`, `@@NAV x@@`, `@@MAIN@@`, `@@TEL@@`, `@@TAB x@@` et `@@WIN@@` sont le cadre Mac, la barre latérale, la zone de travail, le cadre iPhone, la barre du bas et la fenêtre modale.

Classes courtes des maquettes : `.e` étiquette, `.s` texte secondaire, `.c` carte, `.l` filet haut, `.b` bouton (`.o` bordé, `.d` discret, `.p` petit), `.p` pastille (`.ok`, `.al`, `.er`), `.f` champ. Renomme-les selon les conventions du dépôt.

## 3. La charte (validée)

Toutes les valeurs sont dans `tokens.css`. L'essentiel :

- **Polices** : Figtree (interface, 400/500/600), Fraunces 500 (titre d'écran et titre d'un contenu ouvert, rien d'autre). Google Fonts, licence SIL OFL. Futura LT et Abril Display sortent.
- **Typographie** : étiquette 12, secondaire 13, courant 15, titre d'écran 26 (23 sur iPhone). Titres de carte en 15/600. Champs à 16 px sur l'iPhone (en dessous, Safari zoome au focus). Chiffres tabulaires partout.
- **Couleurs** : une couleur de marque (violet), trois couleurs de sens (succès, alerte, erreur), chacune avec son fond teinté. Contraste AA mesuré dans les deux thèmes.
- **Boutons** : trois intentions (plein, bordé, souligné), trois hauteurs (32, 40, 44). Rayon 8 px. Jamais de bouton rond.
- **Pastilles** : toujours un signe et un libellé (`✓ Payé`, `! À encaisser`, `○ Prévue`, `× Annulée`, `– Absente`). Jamais la couleur seule.
- **Deux ombres** : carte (thème clair seulement), fenêtre et menu.
- **Mouvement** : 140 ms, retiré si l'utilisateur réduit les animations.

## 4. Les règles qui traversent tout

**Navigation**
- Barre latérale à libellés visibles, ouverte par défaut sur le Mac, repliable en icônes. Deux groupes : Pratique, Éditorial. En bas : Rechercher (⌘K), Réglages, ligne d'état « Réception du site ».
- La console s'ouvre sur **Aujourd'hui**. Si la base n'est pas reliée, elle s'ouvre sur Contenus et les entrées de la pratique sont grisées.
- Second niveau, la même règle partout : des onglets en haut de l'écran jusqu'à quatre vues ; au-delà, une liste à gauche **dans l'écran** (Réglages, documents du Corpus). Plus de panneau qui apparaît selon l'espace.
- iPhone : barre du bas Aujourd'hui · Agenda · + · Clients · Plus. Le « + » ouvre Noter une idée, Nouvelle fiche, Poser un rendez-vous. « Plus » liste le reste, la réception du site en tête.

**Une action principale par écran**, toujours en haut à droite sur le Mac, en bas sur l'iPhone. Aujourd'hui n'en a pas : chaque ligne est un lien.

**Divulgation progressive.** Ce qui sert rarement est replié et dit en une ligne ce qu'il contient (« Durée, mode et montant · 1 h 30 · en séance · 80 € »). Les actions rares vont dans « Autres actions ».

**Confidentialité** (contraintes fonctionnelles, pas seulement visuelles)
- Les listes (Aujourd'hui, Agenda, Clients, Paiements, Stages) ne montrent jamais le contenu d'une note, d'un questionnaire ou de la personne de confiance : seulement leur état.
- La recherche ne renvoie de personnes que depuis la pratique. Depuis l'éditorial : aucune. Aucun historique de recherche.

**Vocabulaire de l'interface**
- « Clients », « les personnes accompagnées » ; jamais « patient ».
- Pas de « mon cabinet », « diagnostic », « clinique ». Dire « en séance, à Villefranche-de-Lauragais ».
- « Breathwork holotropique », « entretien préalable », « accompagnement », « stage ».
- Libellés d'usage : « Réception du site » (pas « Porte publique »), « À ranger » (pas « Inbox »).
- Un bouton dit ce qu'il fait : « Marquer payé », pas « Valider ». Jamais d'emoji.

**Accessibilité** : contraste AA dans les deux thèmes, cibles de 44 px sur l'iPhone, focus visible (contour 2 px, décalé de 2 px), tout se fait au clavier sur le Mac (la nouvelle fiche se remplit pendant un appel).

## 5. Les écrans

Le nom de fichier est celui de `maquettes/` (ajouter `.dc.html`). Préfixe `Tel` : iPhone.

**Cadre** — `Nav`, `NavRepliee`, `Recherche`, `RechercheEditorial`, `TabBar`, `TelAjouter`, `TelPlus`, `TelPlusCoupee`.

**Priorité 1 (le quotidien)**

| Écran | Mac | iPhone | À retenir |
| :--- | :--- | :--- | :--- |
| Aujourd'hui | `Aujourdhui` | `TelAujourdhui` | Prochaine séance en tête ; la journée en frise ; À traiter trié du plus pressé au moins pressé. Une ligne n'entre que si elle attend un geste, mène à un seul écran, et disparaît quand le geste est fait. |
| Une séance | `Seance`, `SeanceEntretien`, `SeanceApres` | `TelSeanceAvant`, `TelSeanceEntretien`, `TelSeance` | Trois moments. Notes : un seul texte Markdown, pré-rempli de trois titres (*Séance*, *Travail personnel*, *Idées pour la suite*), enregistré pendant la frappe. « Terminer la séance » en trois étapes : réalisée, encaissement, poser le suivant. |
| Agenda | `Agenda`, `AgendaMois`, `FermerJours` | `TelAgenda`, `TelAgendaMois`, `TelFermerJours` | Les jours fermés se voient. Chaque jour dit ses créneaux libres. |
| Rendez-vous | `RendezVous`, `RendezVousDeplacer` | `TelRendezVous` | Une seule fenêtre pour poser et déplacer. Un chevauchement est refusé, et le message dit avec qui. |
| Clients | `Clients`, `NouvelleFiche`, `Fiche` | `TelClients`, `TelNouvelleFiche`, `TelFiche` | Le champ de recherche a le focus à l'ouverture. Les fiches semblables s'affichent dès la saisie. |

**Priorité 2** — `Questionnaire`, `QuestionnaireRelu`, `Rattacher`, `Paiements`, `Encaisses`, `TelPaiements`, `Stages`, `Stage`, `StageInfos`.

**Priorité 3** — `Contenus`, `Idees`, `Publies`, `Contenu`, `TelIdee`, `TelIdeeNotee`, `Corpus`, `CorpusDocuments`, `CorpusARanger`, `CorpusCarte`, `Professionnels`, `Professionnel`, `Reglages`, `ReglagesTypes`, `Psychedeliques`.

**États** (vide, chargement, refus, erreur, base non reliée) — `EtatsAujourdhui`, `EtatsSeance`, `EtatsAgendaClients`, `EtatsP2`, `EtatsP3`. **Composants** — `Composants`.

## 6. Ce qui ne doit pas changer

- **L'éditorial garde sa logique.** Contenus (Conversations, Idées, Publiés) et le contenu ouvert (bandeau, plan de la série, le fil, la matière, sélecteur d'étape) fonctionnent comme aujourd'hui. Seuls la navigation, les jetons et les composants changent. `Contenu.dc.html` montre l'habillage, pas un nouveau comportement.
- **Psychédéliques** : les calculs et les textes existants. La dose reste l'information la plus grande de l'écran.
- **Les données et les règles métier** : aucune migration n'est demandée par cette refonte.

## 7. Ordre de construction proposé

Un lot = une demande de fusion, testée sur la recette avant la suivante.

1. **Socle** : jetons (`tokens.css`), polices, thème clair/sombre, composants de base (bouton, champ, pastille, carte, onglets, section repliable, fenêtre, témoin d'enregistrement). Sans toucher aux écrans.
2. **Cadre** : barre latérale, barre du bas de l'iPhone, « Plus », le « + », ligne d'état de la réception, règle du second niveau. Les écrans existants s'y logent tels quels.
3. **Aujourd'hui** (nouvel écran) et ouverture de la console dessus.
4. **Une séance** et **Poser / déplacer un rendez-vous**.
5. **Agenda** et **Fermer des jours**.
6. **Clients** : liste, nouvelle fiche, fiche.
7. **Rechercher (⌘K)**, avec la règle de confidentialité.
8. **Priorité 2** : questionnaire, rattacher, paiements, stages.
9. **Priorité 3** : habillage de l'éditorial, Corpus, Professionnels, Réglages réordonnés, Psychédéliques.

Pour chaque lot : les états de la planche correspondante, les deux thèmes, Mac et iPhone, navigation au clavier.

## 8. Ce qui n'est pas décidé — demande avant de trancher

1. **Semaine de l'agenda** : la maquette pose des colonnes de cartes, sans grille horaire. Florent n'a pas tranché entre cela et une grille horaire.
2. **Vocabulaire des contenus** : les scripts de Florent disent parfois « en cabinet ». La règle du §4 vaut pour l'interface ; pour les contenus eux-mêmes, à lui demander.
3. **Couleurs du LSD et de la MDMA** dans Psychédéliques : seule celle des champignons (ambre) est fixée. Reprendre celles de l'existant.
4. **À venir, non construit** : dépôt de l'enregistrement d'un entretien (transcription, résumé proposé à côté des notes), modèles de messages. La mise en page leur réserve une place ; ne pas les développer dans cette refonte.
5. **iPhone** : pas de maquette pour Stages, Professionnels, Corpus, Réglages, Psychédéliques ni le contenu ouvert. Appliquer les mêmes composants en une colonne, et montrer le résultat avant de généraliser.
6. **Calendly et l'agenda Google** : tant qu'ils servent, les gestes d'agenda le rappellent en une ligne. Le texte disparaît le jour où ils sont remplacés.

## 9. Données d'exemple à ne pas reprendre

Tout ce qui est entre crochets (`[MONTANT]`, `[TOTAL]`, `[PRIX]`, `[CONTENU DU DOCUMENT]`) et toutes les personnes sont fictifs. Sont aussi inventés : les intitulés du questionnaire de santé, les six professionnels, deux des trois stages, les titres d'idées et de contenus publiés, les documents du corpus et le tableau de la Carte, les fenêtres de réservation des types de rendez-vous, les limites de poids du calculateur.

Deux corrections à faire en construisant, les maquettes ne les portant pas : une séance individuelle dure **1 h 30** et coûte **80 €** ; le breathwork holotropique individuel dure **1 h 45** (plus 30 min de suivi à distance) et coûte **140 €** ; l'entretien préalable de 20 min est offert. Les maquettes montrent des séances d'une heure : c'est une erreur d'exemple, pas une règle.

## 10. Recette de chaque lot

- Les deux thèmes, sans texte sous le contraste AA.
- Mac à 1440 px et à 1100 px ; iPhone à 390 px. Rien ne déborde, aucun défilement horizontal de page.
- Tout le parcours au clavier, focus visible.
- Les états de la planche : vide, chargement, refus, erreur, base non reliée.
- Aucune liste ne montre le contenu d'une note, d'un questionnaire ou de la personne de confiance.
- La recherche depuis l'éditorial ne renvoie aucune personne.
