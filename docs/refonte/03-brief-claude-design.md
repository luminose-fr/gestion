# Brief — refonte de l'interface de la console Luminose

*À coller tel quel dans Claude Design. Rédigé le 27/11/2026 à partir de l'architecture d'information validée (`01-architecture-information.md`, v3) et du parcours d'usage (`02-parcours-usage.md`).*

---

## 1. Le produit, en une page

**Luminose** est la pratique de Florent Jaouali, **psychopraticien transpersonnel** à Villefranche-de-Lauragais (clarification verbale, hypnose, méditation, breathwork holotropique), en parcours d'accompagnement. La **console** (gestion.luminose.fr) est son outil de travail privé. Il en est le **seul utilisateur**. Elle tourne sur son Mac (bureau, grand écran) et sur son iPhone (en mobilité).

Elle porte deux métiers qui ne se mélangent pas :

- **La pratique** : les personnes qu'il accompagne (« clients » ; jamais « patients »), leurs séances et leurs notes, l'agenda et ses disponibilités, les stages en groupe, les paiements, les professionnels qui lui adressent des personnes. Ce sont des **données de santé**.
- **L'éditorial** : ses publications (posts, carrousels, vidéos, articles) écrites avec une IA, et le « corpus », la base de connaissance qui nourrit cette IA.

**Son rythme**, qui fixe toutes les priorités :

| Activité | Fréquence |
| :--- | :--- |
| Séances individuelles (dont l'entretien préalable gratuit de 20 minutes, au téléphone) | 10 à 20 par semaine, donc **tous les jours** |
| Paiements à suivre | chaque semaine |
| Stages en groupe | 5 à 8 par an, avec plusieurs semaines d'inscriptions |
| Contenus | quelques après-midi par mois |
| Réglages | quelques fois par an |

**Le problème.** Florent juge l'interface actuelle « vraiment merdique ». Le diagnostic, établi avec un expert UX :

- la navigation est une colonne de sept icônes **sans texte** (le nom n'apparaît qu'au survol, jamais sur l'iPhone) ;
- l'ordre ne suit pas la fréquence : la console s'ouvre sur les contenus (mensuels), et les séances (quotidiennes) sont en troisième place ;
- aucun écran ne dit « ce qui m'attend » ;
- le second niveau change de forme d'un espace à l'autre (panneau ici, onglets là, rien ailleurs) ;
- les réglages sont rangés par technique (cinq sections sur huit pour l'IA), avec des noms d'ingénieur (« Quotas Cloudflare », « Porte publique », « Personas »).

**Ce que je te demande** : une nouvelle interface complète, Mac et iPhone, thème clair et thème sombre, qui applique l'architecture ci-dessous. L'organisation, la hiérarchie et les écrans changent. La charte de couleurs et les polices sont ouvertes elles aussi : **la priorité est l'utilisabilité, puis la beauté**.

---

## 2. L'architecture à appliquer (validée)

### La navigation principale

Une **barre latérale à libellés visibles**, ouverte par défaut sur le Mac, repliable en icônes. Deux titres de groupe. Un groupe n'existe qu'à partir de deux entrées.

```
Aujourd'hui

PRATIQUE
  Agenda              Semaine · Mois       (+ Calendly, tant qu'il sert)
  Clients
  Paiements           À encaisser · Encaissés
  Stages              À venir · Passés
  Professionnels
  Psychédéliques      (un calculateur personnel, d'usage ponctuel)

ÉDITORIAL
  Contenus            Conversations · Idées · Publiés
  Corpus              État · Documents · À ranger · Carte

—— en bas ——
  Rechercher   ⌘K
  Réglages
  Ligne d'état : « Réception du site : ouverte »
```

**Règle du second niveau, la même partout** : des onglets en haut de l'écran pour quatre vues au plus ; une liste à gauche, **dans l'écran**, au-delà (Réglages, documents du Corpus). Plus de panneau qui apparaît ou disparaît selon l'espace.

**Sur l'iPhone** : une barre en bas, **Aujourd'hui · Agenda · + · Clients · Plus**. Le « + » central ouvre trois gestes : Noter une idée, Nouvelle fiche, Poser un rendez-vous. « Plus » ouvre le reste, avec les libellés, et la ligne d'état de la réception du site en tête.

**Rechercher (⌘K)** : aller à un écran, lancer une action, trouver une personne (nom, e-mail, téléphone) ou un contenu. **Les personnes ne s'affichent que depuis la pratique** : depuis l'éditorial, la recherche n'en montre aucune. Aucune « recherche récente ». Sans résultat : « Nouvelle fiche », avec le texte tapé reporté.

### Réglages

```
PRATIQUE
  Réception du site        ouverte / coupée ; ce qui a été reçu aujourd'hui ; limites de sécurité (repliées)
  Types de rendez-vous     durée, marge, montant, fenêtre de réservation, en ligne ou non
  Horaires habituels       la semaine type
  Règles                   rappels, retenue d'une place, liste d'attente
  Messages                 modèles d'e-mail et de SMS (à venir)

RÉDACTION IA
  Modèles · Modèle par usage · Coûts et durées · Clés des fournisseurs

DONNÉES ET FONCTIONNEMENT
  État · Hébergement · Export éditorial
```

---

## 3. Les écrans à dessiner

Pour chacun : ce qu'il montre, son action principale (une seule, toujours au même endroit), ses états. Les écrans marqués **priorité 1** sont ceux du quotidien : dessine-les d'abord, sur Mac et sur iPhone.

### 3.1 Aujourd'hui — priorité 1

L'écran d'ouverture. **Règle d'admission** : une ligne n'y entre que si elle attend un geste de Florent, mène à un seul écran où ce geste se fait, et disparaît quand il est fait. Pas de compteurs « pour savoir », pas de graphiques.

1. **Les séances du jour** : heure, personne, type. Pour un entretien préalable : **d'où vient la personne** (« Google Ads · mot-clé : hypnose arrêt tabac », ou « Provenance inconnue »). Une pastille si le questionnaire de santé n'est pas relu. Le soir, le lendemain matin s'ajoute. Toucher une séance l'ouvre.
2. **À traiter** : chaque ligne dit **le geste, l'objet, l'échéance** (« Relire le questionnaire · Camille Martin · séance demain 9 h »). Sortes de lignes : notes non écrites d'une séance passée ; séance passée restée « prévue » ; questionnaire à relire ; réservation à rattacher à une fiche ; paiement à encaisser depuis plus de N jours ; alerte ouverte ; résumé d'entretien prêt à relire (à venir).
3. **La ligne d'état** de la réception du site, discrète. Coupée, elle passe en tête, en couleur d'alerte, avec « Rouvrir ».

États : journée sans séance ; rien à traiter (une phrase calme, pas un vide) ; réception coupée ; chargement ; base non reliée (la console s'ouvre alors sur Contenus).
L'écran n'a pas d'action principale : chaque ligne est un lien.

### 3.2 Une séance — priorité 1

**L'écran de travail de Florent**, qui change selon le moment :

- **Avant** : date, heure, type, personne (qui ouvre sa fiche), statut, paiement, montant. Le questionnaire de santé (« pas reçu », « non relu », « relu ») avec « Voir le questionnaire ». « La dernière fois », replié : les notes de la séance précédente.
- **Entretien préalable** : en tête, la provenance ; un accès direct à la fiche pour la compléter pendant l'appel, avec retour à la séance ; les notes.
- **Après** : les notes, puis **« Terminer la séance »** : marque la séance réalisée et demande explicitement l'encaissement (payée maintenant, par quel moyen ; ou à encaisser). Puis **« Poser le suivant »**, pré-rempli (même personne, même type, sept jours plus tard à la même heure).

**Les notes** : un seul texte Markdown, dans un éditeur simple (gras, italique, titres, listes), pré-rempli de quatre titres que Florent garde ou efface : *Séance*, *Travail personnel*, *Idées pour la suite*, *Réponse SMS*. Il **s'enregistre pendant la frappe** : un témoin discret « Enregistré », l'échec en rouge avec « Réessayer ». Un conflit (la même note modifiée sur le Mac et l'iPhone) arrête l'enregistrement, **garde le texte saisi à l'écran** et montre la version enregistrée à côté. « Copier la réponse SMS » copie le texte sous ce titre (Florent l'envoie depuis son téléphone). Sur l'iPhone, les notes sont juste sous l'en-tête.

**Dessous, en lecture** : les réponses données à la réservation ; l'histoire du rendez-vous (posé, déplacé, rappels envoyés) ; la copie reprise de l'ancien outil, repliée.

**À venir, à prévoir dans la mise en page** : « Déposer l'enregistrement » de l'entretien (glisser un fichier audio). La console transcrit, résume, et le résumé arrive **à côté des notes, comme une proposition** (« Insérer sous Séance » · « Écarter ») : il n'écrit jamais par-dessus le texte de Florent. États : transcription en cours, résumé en cours, prêt, échec.

États de la séance : à venir, passée restée prévue, réalisée, annulée, absente, à rattacher, sans type. Actions secondaires : Déplacer, Annuler, Remettre à « prévue ».

### 3.3 Agenda — priorité 1

Semaine (par défaut) et Mois ; sur l'iPhone, la semaine devient une liste de jours. Chaque séance : heure, personne, type, deux pastilles (statut, paiement). Précédente, suivante, aujourd'hui. **Les jours fermés se voient** dans les deux vues.

Action principale : **Poser un rendez-vous**. Action visible : **Fermer des jours…** (une fenêtre : du … au … ; la liste des séances déjà prévues dans la période, chacune avec « Déplacer » ; « Fermer ces jours »). Sur un jour fermé : « Ouvrir ce jour ».

Tant que Calendly et l'agenda Google ne sont pas remplacés, les gestes d'agenda le disent en une ligne (« Pensez à fermer aussi ces jours dans Calendly »).

### 3.4 Poser ou déplacer un rendez-vous — priorité 1

**Une seule fenêtre** pour les deux. La personne (déjà choisie, ou une recherche), le type, la date, **les créneaux libres du jour** et les séances déjà prévues ; repliés : durée, mode (« en séance, à Villefranche-de-Lauragais » ou « en visio »), montant. Un chevauchement est refusé, et le message le dit. Pour « Poser le suivant », la date proposée est sept jours plus tard.

### 3.5 Clients — priorité 1

**Liste** : un champ de recherche large, qui a le focus à l'ouverture (nom, e-mail, téléphone) ; chaque ligne : nom, ville, nombre de séances, dernière ou prochaine séance. Action principale : **Nouvelle fiche**.

**Nouvelle fiche** (l'écran de l'entretien de 20 minutes, au clavier) : prénom, nom, e-mail, téléphone d'abord ; puis le reste. Dès la saisie, **les fiches semblables** (« Ouvrir cette fiche ») : c'est là que se décide de ne pas créer de doublon. « Enregistrer » ou « Enregistrer et poser un rendez-vous ».

**Une fiche** : en tête, nom, âge, téléphone et e-mail touchables, **et la provenance** (origine, mot-clé). Des cartes en lecture, chacune avec « Modifier » : Identité et coordonnées ; Provenance et liens (venu par un professionnel, par une personne, couple) ; Personne de confiance ; Notes de la fiche. À droite sur le Mac (dessous sur l'iPhone) : les séances, de la plus récente à la plus ancienne ; les inscriptions aux stages ; les questionnaires, chacun cliquable. Action principale : **Poser un rendez-vous**.

### 3.6 Questionnaire de santé — priorité 2 (nouveau)

Les réponses de la personne, les contre-indications déclarées mises en évidence. Actions : **Marquer relu** (principale), « À revoir avec la personne ». États : non relu ; relu (le …) ; à revoir ; second envoi (les deux versions côte à côte). S'ouvre depuis la séance, la fiche, l'inscription à un stage et Aujourd'hui.

### 3.7 Rattacher une réservation — priorité 2 (nouveau)

Une réservation, une inscription ou un questionnaire arrivé du site sans fiche reconnue, ou avec plusieurs fiches possibles. À gauche ce qui a été reçu, à droite les fiches candidates, avec les indices qui concordent ou non. Actions : **Rattacher à cette fiche** (principale), « Créer une fiche », « Plus tard ». En cas d'écart (téléphone différent) : « Garder la fiche » ou « Prendre la valeur reçue ».

### 3.8 Paiements — priorité 2

Onglets **À encaisser** et **Encaissés**. Un total en tête. Chaque ligne : personne, date, séance (type) ou stage, montant, ancienneté ; **« Marquer payé »** (avec le moyen : carte, espèces, virement, chèque), puis « Annuler » quelques secondes. État vide : « Rien à encaisser ».

### 3.9 Stages — priorité 2

**Liste** : à venir, puis passés ; nom, dates, ville, places libres sur places totales.
**Un stage** s'ouvre sur l'onglet **Inscrits** : un résumé en tête (inscrits, places, questionnaires à relire ou non reçus, non réglés) ; par inscrit : statut, paiement, questionnaire. Action principale : **Inscrire une personne** (avec « Créer la fiche » si la recherche ne trouve personne ; grisé avec sa raison quand le stage est complet). Onglet **Le stage** : les champs (nom, type, dates, lieu, places, prix) et les textes de présentation.

### 3.10 Professionnels — priorité 3

Un tableau : nom, catégories, ville, téléphone, « connu », nombre de personnes adressées. Un filtre de texte. Une fenêtre pour créer et modifier, courriers de prospection compris.

### 3.11 Réglages — priorité 3

La liste à gauche dans l'écran, en trois groupes (voir §2). À dessiner en priorité : **Réception du site** (un grand interrupteur ouvert / coupé ; la confirmation de coupure liste ce qui s'arrête — réservations, questionnaires de santé, inscriptions, paiements — et ce qui ne s'arrête pas ; « Rouvrir » sans confirmation ; ce qui a été reçu aujourd'hui ; les limites de sécurité repliées) et **Types de rendez-vous** (une ligne par type, « Modifier » ; après enregistrement, dire à partir de quand le changement s'applique).

### 3.12 L'éditorial — priorité 3

**Contenus** garde son fonctionnement, récent et apprécié : trois listes (Conversations, Idées, Publiés), et un contenu ouvert dans un cadre plein écran (un bandeau avec retour, titre et sélecteur d'étape ; à gauche « le fil », la conversation avec l'IA en bulles de messagerie ; à droite la matière). Applique-lui la nouvelle navigation et la cohérence d'ensemble, **sans changer sa logique**. **Corpus** : État · Documents (six blocs : Socle, Voix, Stratégie, Canaux, Répertoire, Outils) · À ranger · Carte (qui montre aussi ce que chaque rôle IA reçoit).

**Noter une idée** (iPhone, depuis le « + ») : une feuille, le texte, le format pré-choisi (modifiable), « Ajouter » ; retour « Idée notée » sans quitter l'écran d'origine.

### 3.13 Psychédéliques — priorité 3

Le calculateur de doses existant. La dose est l'information que l'écran existe pour donner : elle reste très grande, lisible d'un coup d'œil. Chaque substance garde sa couleur d'identification.

---

## 4. Identité et système visuel

**Ouvert : la charte de couleurs et les polices.** Florent préfère un outil très utilisable et beau à la fidélité à l'existant. Propose ta charte, en restant dans l'univers de Luminose (des violets, une chaleur retenue, rien de clinique ni de criard), et montre-la à côté de l'actuelle pour qu'il compare. Une police nouvelle doit être disponible pour le web avec une licence claire (Google Fonts, par exemple).

**L'existant, pour référence** :
- polices : **Futura LT** pour l'interface (à défaut Futura, Century Gothic), **Abril Display** pour les titres d'écran et le titre d'un contenu ouvert (à défaut Georgia) ;
- couleurs : violet-bleu `#6163A5` (principal), violet `#60407F` (survol), fond clair `#F9F5FF`, bordure `#E8DEF6`, fond du fil `#F1EBF8`, survol de ligne `#FCFAFF` ; le site public emploie aussi `#613F7F` comme violet principal ;
- thème sombre : fond `#20122E`, surface `#3F2258`, texte `#BB95DD`, bordure `#613F7F` ;
- couleurs de sens : succès `#047857` (sombre `#6EE7B7`), alerte `#B45309` (sombre `#FCD34D`), erreur `#B91C1C` (sombre `#FCA5A5`).

**Ce qui ne se négocie pas** : un thème clair et un thème sombre ; trois couleurs de sens au plus (succès, alerte, erreur), distinctes de la couleur de marque ; un contraste AA (4,5:1 pour le texte) dans les deux thèmes ; des pastilles toujours lisibles sans la couleur.

**Le socle actuel des échelles, comme point de départ** (tu peux proposer mieux si tu le justifies, à condition que les échelles restent courtes et fermées) :
- typographie à quatre rôles : étiquette 11 px (capitales espacées pour les sur-titres), secondaire 12 px, courant 14 px (le corps de l'application), titre 18 px ; trois graisses ;
- espacements en multiples de 4 ;
- boutons en trois hauteurs (30, 38, 40 px) et trois intentions (principale pleine, secondaire bordée, discrète soulignée) ; jamais de bouton rond ;
- rayons : 8 px (bouton, champ), 12 px (carte), plein pour les pastilles ;
- deux ombres seulement : carte posée (très légère), menu et fenêtre ;
- deux largeurs de zone de travail : liste (≈ 1150 px) et travail (≈ 770 px) ;
- mouvements courts (120 à 220 ms), retirés si l'utilisateur réduit les animations.

**L'esprit** : un outil calme, dense sans être chargé, qui se lit d'un coup d'œil entre deux séances. Chaleur sobre, pas de décoration. **Jamais d'emoji.** Une pastille porte toujours son libellé, jamais la couleur seule.

---

## 5. Règles à respecter

**Vocabulaire.**
- « Clients », « les personnes que j'accompagne », « consultant » : jamais « patient ».
- Florent n'est pas professionnel de santé : pas de « mon cabinet », « diagnostic », « clinique » dont il serait le sujet. Dire « en séance, à Villefranche-de-Lauragais ».
- « Breathwork holotropique » (pas « respiration holotropique ») dans l'interface. « Entretien préalable », « accompagnement », « parcours », « stage ».
- Des libellés d'usage, pas d'ingénieur : « Réception du site », pas « Porte publique ».
- Français soigné, phrases courtes ; un bouton dit ce qu'il fait (« Marquer payé », pas « Valider »).

**Confidentialité (elle a des conséquences visuelles).**
- Les **listes** (Aujourd'hui, Agenda, Clients, Paiements, Stages) ne montrent jamais le contenu d'une note, d'un questionnaire ou de la personne de confiance : seulement leur état (« non relu », « notes à écrire »). Le contenu s'ouvre sur son écran.
- La recherche depuis l'éditorial ne montre aucune personne.

**Accessibilité.** Contraste AA dans les deux thèmes ; cibles de 44 px sur l'iPhone ; focus visible ; tout se fait au clavier sur le Mac (l'entretien de 20 minutes se tient au téléphone, mains sur le clavier).

**Données d'exemple.** Uniquement des personnes fictives (Camille Martin, Julien Roux, Nadia Benali…), à Villefranche-de-Lauragais, Toulouse, Castelnaudary. Types de séance : Entretien préalable (20 min, offert), Séance d'accompagnement, Séance d'hypnose, Breathwork holotropique individuel. Un stage : « Stage de breathwork holotropique, 14-15 mars, Villefranche-de-Lauragais, 12 places ».

---

## 6. Ce que j'attends

0. **Une proposition de charte** (couleurs, polices, échelles), présentée à côté de l'actuelle, avant de l'appliquer aux écrans.
1. **Le cadre de l'application** (barre latérale, ⌘K, barre du bas de l'iPhone, ligne d'état), en clair et en sombre.
2. **Les écrans de priorité 1**, sur Mac et sur iPhone, en clair et en sombre : Aujourd'hui, Une séance (ses trois moments), Agenda (semaine et mois, fermer des jours), Poser ou déplacer un rendez-vous, Clients (liste, nouvelle fiche, une fiche).
3. **Les écrans de priorité 2** sur Mac, et l'iPhone pour Paiements.
4. **Les écrans de priorité 3**, au moins une vue chacun.
5. Pour chaque écran : ses **états** (vide, chargement, refus, erreur, base non reliée) sur une planche à part.
6. Une page de **composants** : boutons, champs, pastilles de statut et de paiement, ligne d'À traiter, carte, onglets, fenêtre, témoin d'enregistrement.

**Hors sujet** : l'aspect public du site luminose.fr, les visuels publiés (slides, vidéos), le logo.
