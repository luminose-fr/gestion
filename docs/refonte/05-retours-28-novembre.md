# Passation à Claude Code — retours du 28/11/2026 sur la recette

*Complète `04-passation-code.md`. Les maquettes de `maquettes/` ont été mises à jour en conséquence ; quand elles divergent de la recette actuelle, ce sont elles qui font foi.*

Lis d'abord ce document, puis compare la recette aux maquettes citées. Propose ton plan avant de coder. Un lot par point, testé sur la recette.

## 1. Système (s'applique à tous les écrans)

**1.1 Boutons secondaires sans bordure.** Le bouton bordé est jugé lourd à l'usage. Il devient un bouton **doux** : fond `--doux`, aucune bordure, texte `--marque`, graisse 600 ; survol `--douxh`. Le bouton discret (tertiaire) devient du texte `--marque` **sans soulignement**, avec un fond `--survol` au survol. Le bouton plein ne change pas.
Un choix sélectionné (créneau, moyen de paiement, filtre) passe en plein (`--marque`, texte `--sur`, coche ✓). Un choix non sélectionné reste doux.
Jetons ajoutés dans `tokens.css` : `--doux`, `--doux-survol`. Contraste du texte : 7,2:1 (clair), 7,0:1 (sombre).

**1.2 Liens non soulignés.** Hors d'un paragraphe de texte, un lien n'est plus souligné : couleur `--marque`, graisse 600, soulignement au survol seulement. Un nom de personne dans une liste reste en couleur de texte, souligné au survol (toute la ligne est cliquable). Dans un paragraphe, le lien reste souligné.

**1.3 Champs plus légers.** Bordure `--champ-bord` (claire), fond `--champ-fond` ; au survol la bordure passe à `--champ` ; au focus, bordure et contour `--marque`, fond `--surface`. Libellés en 13 px, 500, `--second`.
Contrepartie assumée : la bordure seule n'atteint plus 3:1 sur le fond ; le champ reste identifiable par son libellé toujours visible, son fond teinté et son focus. À vérifier avec Florent si un contrôle d'accessibilité est prévu.

**1.4 Onglets dans la barre du haut.** Partout, les vues d'un même écran sont des onglets **dans la barre du haut**, juste après le titre, avec leur compteur : Agenda (Semaine · Mois), Paiements (À encaisser · Encaissés), Stages (À venir · Passés), un stage (Inscrits · Le stage), Contenus (Conversations · Idées · Publiés), Corpus (État · Documents · À ranger · Carte). L'onglet actif est souligné de 2 px par `--marque`, posé sur la bordure basse de la barre. L'action principale de l'écran est à droite dans la même barre.
Sur une page de détail, la barre porte le fil : « Stages › » suivi du nom en titre. Plus de pastilles « À venir · 3 / Passés · 0 », plus d'onglets dans le contenu.
**Tous les écrans du Mac ont ce bandeau blanc**, onglets ou pas : Aujourd'hui (avec la date), Clients, Nouvelle fiche, une fiche, une séance (nom, type et actions dans le bandeau), Professionnels, Psychédéliques, Questionnaire, Rattacher, Réglages. Les liens « ‹ Retour » en haut du contenu disparaissent au profit du fil dans le bandeau.
Le sélecteur de modèle IA n'a de sens que dans l'éditorial : le retirer de la barre des écrans de la pratique et des réglages.

**1.5 Durées et heures.** Une seule fonction de formatage, partout (listes, résumés, champs, e-mails) :
- durée < 60 min : `20 min`, `45 min` ;
- durée ≥ 60 min : `1 h`, `1 h 15`, `1 h 30`, `1 h 45`, `2 h` (jamais `60 min`, `90 min`, `1h30`) ;
- heure : `9 h 30`, `13 h` dans le choix des créneaux (comme sur le site), `09:30` dans les listes et l'agenda ;
- délai en heures stocké, affiché en unité lisible : `72 h` → `3 jours`, `168 h` → `1 semaine` (ou `7 jours` pour une retenue), `720 h` → `30 jours`, `0,5 jour` → `12 heures`, `183 jours` → `6 mois`.
Montant nul : `offert` (ou « Offerte » en pastille), jamais `0 €`.

## 2. Réglages (maquettes `Reglages`, `ReglagesTypes`, `ReglagesRegles`, `ReglagesReglesModifie`)

**2.1 Liste de gauche.** Supprimer le sur-titre « RÉGLAGES » au-dessus de « PRATIQUE » (le titre de l'écran le dit déjà). Le groupe « Données et fonctionnement » passait sur deux lignes, et « Console » n'avait qu'une entrée (contraire à la règle : un groupe n'existe qu'à partir de deux entrées). Les deux fusionnent en **Console** : État · Hébergement · Export éditorial · Apparence. Largeur de la liste : 216 px, titres de groupe sur une ligne.

**2.2 Formulaires en phrases.** Pour les délais et les seuils, un champ placé au bout d'une ligne de 1 300 px oblige l'œil à traverser l'écran. Les règles s'écrivent en phrases, le champ dans la phrase : « Un SMS de rappel part [2 jours ▾] avant la séance. » Zone de travail : 770 px au plus.

**2.3 Listes déroulantes plutôt que nombres libres**, quand les valeurs utiles sont peu nombreuses. Options proposées :
- rappels : pas de rappel, 12 heures, 1 jour, 2 jours, 3 jours, 1 semaine ;
- retenue par carte : 1 heure, 2 heures, 6 heures, 12 heures, 1 jour ; par virement : 1, 2, 3, 5, 7, 14 jours ;
- liste d'attente : 12 heures, 1 jour, 2 jours, 3 jours, 1 semaine ;
- relance d'un ordre : 5, 10, 15, 30 min, 1 h ; garde des reçus : 7, 14, 30, 90 jours ;
- durée d'un type : 20, 30, 45 min, 1 h, 1 h 15, 1 h 30, 1 h 45, 2 h, 2 h 30, 3 h ; temps libre après : aucun, 5, 10, 15, 30 min ; créneaux : toutes les 15, 20, 30, 45 min, 1 h ;
- délai minimum de réservation : 2, 6, 12 heures, 1, 2 jours, 1, 2, 3 semaines ; horizon : 1, 2, 3, 6 mois, 1 an.
**Règle de reprise** : si la valeur enregistrée n'est pas dans la liste, l'afficher telle quelle comme option sélectionnée (« 36 heures ») plutôt que de la remplacer. Les valeurs restent stockées dans leur unité actuelle.
Les compteurs (quotas, nombre de personnes prévenues, tentatives) deviennent un champ court avec − et +, au lieu de la flèche native.
Les listes déroulantes ont la hauteur des champs (40 px) et une flèche dessinée, pas la flèche native.

**2.4 Enregistrer.** Plus de bouton « Enregistrer » grisé en haut de carte. Quand quelque chose change, une barre apparaît en bas, collée au bas de l'écran : « 1 modification non enregistrée · Annuler · Enregistrer ». Le champ modifié porte un contour `--marque`. Quitter l'écran avec des changements non enregistrés demande confirmation.

**2.5 Réception du site.** Le statut (Ouverte · Coupée) est un sélecteur à deux positions ; « Coupée » ouvre la confirmation déjà décrite. Les compteurs des 24 dernières heures passent en cinq tuiles cliquables ; les alertes ouvertes en couleur d'alerte. « Limites de sécurité » et « Tester la réception » (identifiant de séance, lien d'essai, révoquer) sont repliées par défaut.

**2.6 Types de rendez-vous.** La modification se fait **dans la ligne** (elle s'ouvre sous le nom), plus dans un formulaire séparé au-dessus de la liste. Le rang devient une poignée de glisser-déposer (avec ⌥↑ ⌥↓ au clavier). Lieu : un sélecteur à trois positions. Les cases « Réservable en ligne » et « Actif » deviennent un seul choix « Où ce type est proposé » : sur le site et dans la console · dans la console seulement · archivé. La section « Réservation sur le site » n'apparaît que pour le premier choix. Montant : champ court suffixé « € », avec « 0 € s'affiche « offert » ».
Incohérence relevée : la liste affiche « En visio » pour la Rencontre, le formulaire « Visio ou téléphone ». Un seul libellé.

**2.7 Corpus › Documents, comme les Réglages.** Plus de trois colonnes (blocs · documents · lecteur) : une seule liste à gauche, dans l'écran, avec les six blocs en sur-titre et leur nombre de documents, chaque document en dessous ; le statut n'apparaît qu'en pastille quand il n'est pas « actif » (suspendu, terminé, candidat). À droite, le document en lecture : bloc en sur-titre, titre, statut, profils, taille, date de modification, puis le texte. Rappel en bas : le corpus se modifie dans Git, pas ici.

## 3. Fiche client (maquette `Fiche`)

- Les titres de carte (Identité et coordonnées, Séances, Stages…) passent en **sur-titre** : 12 px, capitales, `--second`. Ils ne doivent plus ressembler aux titres d'éléments.
- Une séance se lit par sa **date** : « lun. 7 déc. · 09:30 » en 600, puis « Séance · sur place · 1 h 30 » en secondaire ; pastilles et montant à droite. Le numéro « Séance 6 » disparaît du titre. Les séances se rangent sous « À venir » puis « Passées ».
- Les lignes d'identité : libellé à gauche, valeur alignée à gauche dans une seconde colonne de 150 px (plus de valeurs collées au bord droit). Les champs vides ne s'affichent pas : un seul « Compléter : naissance, profession » à la place des « — ».
- En-tête : supprimer le « · » orphelin quand l'âge est inconnu. Téléphone et e-mail en liens `--marque`, sans soulignement.

## 4. Stages (maquettes `Stages`, `Stage`, `StageInfos`, `StageEdition`)

- **Séparer les inscrits et les réglages** : deux onglets dans la barre, « Inscrits » (par défaut) et « Le stage ».
- **Inscrits** : quatre tuiles de résumé, puis une ligne par personne : nom, détail du paiement, **une seule** pastille de statut, la pastille du questionnaire, et à droite « Encaisser » (menu : carte, espèces, virement) et « ··· » (changer le statut, désinscrire). Le menu déroulant de statut, qui répétait la pastille, disparaît. « Inscrire une personne » devient l'action principale de la barre.
- **Le stage**, en lecture : trois cartes (Le stage · Inscriptions · Pour les moteurs de recherche), et « Modifier » dans la barre.
- **Modifier** : nom ; type et ville ; « Quand » en lignes jour + heure de début + heure de fin, avec « + Ajouter un jour » (remplace « Date de fin (si autre jour) ») ; places avec − et + (jamais moins que le nombre d'inscrits) ; prix suffixé « € » ; questionnaire de santé ; description avec compteur de signes ; « Inscriptions prises ailleurs » et « Contenus de la page du site » repliés ; « Supprimer le stage… » en bas à gauche, en rouge, avec confirmation.
- Vocabulaire : « Respiration holotropique » → **« Breathwork holotropique »**. Accord : « 1 place libre », « 2 places libres ».

## 5. Poser ou déplacer un rendez-vous (maquettes `RendezVous`, `RendezVousDeplacer`, `TelRendezVous`)

Même choix de créneau que la page de réservation du site (elle-même calquée sur Calendly), pour que Florent retrouve le geste qu'il connaît :
- à gauche, le mois : les jours qui ont des heures libres sont en gras sur un rond teinté `--doux` ; les autres sont en gris, non cliquables ; le jour choisi est plein `--marque` ; mois précédent et suivant ;
- à droite, le jour choisi et ses heures libres, une par ligne (`9 h 30`, `13 h`) ; choisir une heure la remplit et fait apparaître à côté « Poser à cette heure » (ou « Déplacer ici »), comme le « Suivant » du site ;
- en dessous : « Autre heure… » pour poser hors des créneaux (Florent peut le faire, le site non), puis « Déjà prévu ce jour » ;
- au-dessus : la personne et le type (la liste déroulante affiche durée et montant : « Séance · 1 h 30 · 80 € ») ; en dessous, « Durée, lieu et montant » replié ;
- pour « Poser le suivant », le jour proposé est sept jours plus tard, et l'heure de la séance précédente est présélectionnée ;
- sur l'iPhone, comme sur le site : le calendrier, puis le jour choisi avec « ‹ Autre jour » et ses heures.
Les jours et les heures libres viennent du même calcul que le site (horaires habituels, jours fermés, règles, séances déjà posées), pour que la console et le site ne se contredisent jamais.

## 6. Paiements

Le total « Reste à encaisser 0 € · 0 séance » affiché au-dessus de quatre stages à encaisser est contradictoire : le total compte les séances **et** les stages. Les boutons « Espèces » et « Virement » de chaque ligne deviennent doux (§1.1).

## 7. Recette de ces lots

- Aucun bouton bordé ni lien souligné hors des paragraphes.
- Les deux thèmes ; contraste AA du texte.
- Toutes les durées au format du §1.5 (chercher `min` ≥ 60 et `0 €` dans l'interface).
- Une valeur de réglage hors liste reste affichée et conservée.
- Les heures libres de la fenêtre de rendez-vous sont identiques à celles du site pour le même jour et le même type.
