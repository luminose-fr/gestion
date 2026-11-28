# Console gestion.luminose.fr — parcours d'usage

Étape 2 sur 3 (architecture → usage → brief Claude Design). Cognitive walkthrough (Wharton, Rieman, Lewis, Polson) de l'architecture **v3 du 27/11/2026** (`01-architecture-information.md`), comparée à l'existant de `main` au 27/11/2026 (commit `861981f`). Rédigé le 27/11/2026.

Sources vérifiées, en lecture seule : SPEC §14.4–14.7, §14.11, §15 et annexe C ; `Clients/SeanceView.tsx`, `FicheView.tsx`, `NouvelleFicheView.tsx`, `PoserRendezVous.tsx`, `PlanningView.tsx`, `EvenementsView.tsx`, `ChoixFiche.tsx`, `commun.tsx` ; `Settings/PortePublique.tsx`, `ReservationReglages.tsx`, `sections.ts` ; `Layout/Sidebar.tsx`, `MobileSubTabs.tsx` ; `Contenus/IdeesView.tsx` ; les routes de `workers/api/src/routes/`.

---

## 1. Synthèse

**Ce qui marche.** La barre à libellés, l'ordre par fréquence et l'écran Aujourd'hui raccourcissent les gestes de tous les jours (notes après une séance, notes oubliées sur l'iPhone). Couper la réception du site depuis l'iPhone passe de six gestes, sous des noms techniques, à deux. Paiements donne enfin une liste à ce qui n'en avait pas.

**Ce qui casse.** Trois tâches butent sur un écran qui n'existe ni aujourd'hui ni dans la v3 : lire un questionnaire et le marquer relu (T1, T8), rattacher une réservation à une fiche (T14), marquer payée une inscription à un stage (T7, T8). Aujourd'hui promet d'y mener : il n'y a rien au bout. Le mot-clé à l'entretien n'a pas encore de source : la base a un champ, aucune route ne le lit.

**Ce qui coûte.** La séance n'est pas encore l'écran de travail qu'elle devrait être : ni provenance ni fiche à l'entretien (T2), pas de « rendez-vous suivant » en fin de séance (T4). Fermer des vacances en sélectionnant des jours sur un calendrier ne se devine pas (T6). Une personne inconnue au téléphone ne se cherche pas par son numéro (T5). Le résumé de l'entretien enregistré (T15) est bien placé, mais attend une décision écrite : la SPEC interdit aujourd'hui que ces données passent par l'IA.

**À corriger dans l'architecture.** Ajouter deux écrans (Questionnaire, Rapprochement) et un geste (« Marquer payée » une inscription). Faire de la séance l'écran de travail : préparer, mener l'entretien, terminer, poser le suivant. Donner à l'Agenda un bouton visible « Fermer des jours ». Dire, sur chaque geste d'agenda, ce que la transition ne couvre pas encore : Calendly, l'agenda Google, les messages.

---

## 2. Tableau récapitulatif

Les gestes comptent les touchers, les clics et les choix dans une liste ; la saisie du texte n'est pas comptée. Ce sont des estimations faites sur le code et la proposition, pas des mesures.

| Tâche | Appareil | Fréquence | Gestes aujourd'hui | Gestes v3 | Gestes v3 corrigée | Verdict sur la v3 |
| :--- | :--- | :--- | --: | --: | --: | :--- |
| T1 Voir la journée, préparer une séance au questionnaire non relu | Mac | chaque jour | 3, puis impasse | 1, puis impasse | 3 | **Casse** : aucun écran pour lire un questionnaire |
| T2 Entretien préalable : provenance, compléter la fiche | Mac | plusieurs fois par semaine | 6 à 7 | 6 | 2 | Tient mal : la provenance est promise sans source, la fiche est à deux écrans |
| T3 Après une séance : notes, réalisée, payée, réponse SMS | Mac | 10 à 20 fois par semaine | 7 | 6 | 3 | **Tient** |
| T4 Poser le rendez-vous suivant | Mac | presque à chaque séance | 7 à 8 | 7 à 8 | 2 à 4 | Tient, mais coûteux : aucun gain sur le geste le plus répété |
| T5 Appel imprévu : chercher, créer la fiche, poser le rendez-vous | Mac ou iPhone | chaque semaine | 9 à 11 | 8 à 10 | 6 à 8 | Tient avec risque de doublon (pas de recherche par téléphone) |
| T6 Fermer une semaine de vacances | Mac | 3 à 5 fois par an | 14 à 23 | 9 environ | 6 à 8 | Tient mal : le geste de sélection ne se devine pas |
| T7 Voir et régler ce qui reste à encaisser | Mac | chaque semaine | 4 par séance, plus la recherche | 1 + 1 par ligne | 1 + 1 par ligne | **Casse** pour les inscriptions : aucun moyen de les marquer payées |
| T8 Stage à trois semaines : inscrits, places, questionnaires, paiements ; inscrire | Mac | 5 à 8 fois par an | 2 + 2 par inscrit, puis impasse | idem | 3 à 5 | **Casse** : l'état des questionnaires n'est pas sur le stage |
| T9 Envois suspects : tout couper | iPhone | rare, urgent | 5 à 6, à deviner | 2 à 3 | 2 | **Tient** |
| T10 Noter une idée dans la rue | iPhone | quelques fois par mois | 4 à 5 | 4 à 5 | 3 | Tient |
| T11 Après-midi de contenus | Mac | une fois par mois | 0 pour arriver | 1 pour arriver | 1 | Tient |
| T12 Rappel non reçu | Mac ou iPhone | rare | impossible | 3, à venir | 3 | Dépend des phases à venir ; la v3 place bien le bloc |
| T13 Changer durée ou prix d'un type | Mac | quelques fois par an | 4 | 4 | 4 | Tient, retour à préciser |
| T14 Réservation sans fiche reconnue : la rattacher | Mac | rare | impasse | 1, puis impasse | 3 | **Casse** : aucun écran, aucune route pour rattacher |
| T15 (demandée le 27/11) Après l'entretien préalable : le résumé de l'entretien dans les notes | Mac, ou iPhone | plusieurs fois par semaine | 11 à 13, dans trois applications | 5 à 6, à venir | 4 à 5 | Bien placée ; **dépend d'une décision** (SPEC §14.2, règle 3) et d'une phase à venir |
| T16 (ajoutée) Déplacer une séance à la demande, au téléphone | iPhone | chaque semaine | 7 à 9 | 6 à 8 | 5 à 6 | Tient, mais à l'aveugle (aucun créneau montré) |
| T17 (ajoutée) Compléter des notes oubliées | iPhone | chaque semaine | 4 à 6 | 2 à 3 | 2 | **Tient** |

**Ce que ce parcours suppose.** La base des clients reliée et la réservation du site en service. Aujourd'hui, en production, la base n'est pas reliée (phase S4), la porte publique n'est pas déployée (SPEC §14.6.2, point 5) et les réservations passent encore par Calendly, Make et Notion ; la console des clients ne sert qu'en local et en recette, sur des données fictives (SPEC §15.1). Chaque tâche signale ce qui dépend d'une phase non livrée.

**Ce qui me manque sur le personnage** (non inventé, à confirmer par Florent) : d'où il envoie le SMS de fin de séance (iPhone, ou Messages sur le Mac) ; comment il est payé aujourd'hui (espèces, chèque, virement, carte sur place) et s'il veut le noter ; si une absence sans prévenir se facture ; s'il note aujourd'hui ses vacances dans Google Agenda, dans Calendly ou dans les deux ; s'il reçoit les appels imprévus surtout au bureau ou en mobilité ; comment il enregistre l'entretien téléphonique, et comment il recueille l'accord de la personne.

---

## 3. Détail par tâche

Pour chaque étape, les quatre questions : **Q1** Florent cherchera-t-il à faire ce geste ? **Q2** verra-t-il le moyen de le faire ? **Q3** reliera-t-il ce moyen à son intention ? **Q4** comprendra-t-il le retour ? Seuls les « non » et les « peut-être » sont détaillés.

### T1. Lundi 8 h 30 : voir la journée, préparer la première séance (questionnaire non relu)

**Chemin v3 (Mac).**
1. Ouvrir la console : Aujourd'hui s'affiche. Séances du jour, À traiter, ligne d'état. Quatre fois oui.
2. Dans À traiter, toucher « Relire le questionnaire de Claire M. avant la séance de 9 h ». Q1 oui. Q2 oui. Q3 oui. **Q4 non** : la règle d'admission veut que la ligne « mène à un seul écran où ce geste se fait », mais aucun écran ne montre les réponses d'un questionnaire, ni dans l'existant ni dans la v3. Il n'existe pas de route pour les lire ni pour poser « relu » (constaté : `GET /api/clients/:id` ne rend que date, version, relu, à revoir, SPEC §15.2 règle 4 ; aucune route `questionnaires` dans `workers/api/src/routes/`). Sur la fiche, la liste des questionnaires affiche « Non relu », sans lien (constaté dans `FicheView.tsx`).
3. Marquer le questionnaire relu. **Q2 non** : le geste n'existe pas. La ligne ne peut donc jamais quitter À traiter.
4. Revenir à la séance de 9 h, relire ce qui avait été prévu. **Q2 peut-être** : l'écran de séance ne montre que les notes de cette séance (constaté dans `SeanceView.tsx`). Les « Idées pour la suite » de la séance précédente demandent d'ouvrir la fiche, puis la séance précédente : trois gestes de plus, que Florent fera chaque matin.

**Gestes.** Aujourd'hui : Séances, la séance, la personne, la fiche, puis impasse (3 gestes). V3 : 1 geste, puis impasse. Corrigée : 3 (la ligne, « Marquer relu », la séance).

**Échecs probables.**
- **Bloquant.** Aucun écran Questionnaire. *Correction (architecture)* : un écran « Questionnaire », ouvert depuis la séance, la fiche, l'inscription à un stage et À traiter. Il montre les réponses, les contre-indications déclarées mises en évidence, et deux gestes : « Marquer relu » et « À revoir avec la personne ». Il a sa route, sensible (règle 4).
- **Gêne.** Préparer une séance oblige à remonter à la précédente. *Correction (écran)* : sur la séance, un encart repliable « La dernière fois » : Idées pour la suite et Travail personnel de la séance précédente, en lecture.
- **Gêne.** Sur la ligne de la séance du jour, rien ne dit que le questionnaire n'est pas relu ; l'information vit dans un autre bloc. *Correction (écran)* : une pastille « questionnaire non relu » sur la ligne de la séance, qui mène au même écran.

**À vérifier.** Aujourd'hui suppose une lecture groupée (alertes, séances à rapprocher, notes manquantes, questionnaires non relus) que l'API n'offre pas aujourd'hui : aucune route ne liste les alertes ni les ordres (constaté). C'est à écrire, avec un nombre de requêtes borné (SPEC §3.6).

### T2. Entretien préalable de 20 minutes au téléphone : d'où vient la personne, compléter la fiche

La personne a réservé sur le site : sa fiche existe déjà, créée dans le lot de la réservation (SPEC §14.4, « Désigner un client »). L'écran « Nouvelle fiche », que la v3 appelle « l'écran de l'entretien de 20 minutes », ne sert donc pas dans le cas courant.

**Chemin v3 (Mac).**
1. Sur Aujourd'hui, lire la ligne de l'entretien : « Google Ads · mot-clé : hypnose arrêt tabac ». Q1 oui. Q2 oui. Q3 oui. **Q4 peut-être** : la donnée n'a pas encore de source. La séance a une colonne `provenance` (JSON : source, campagne, mot-clé, annexe C) qu'aucune route ne rend (constaté : `GET /api/seances/:id` ne la porte pas). Les champs `origine` et `mot_cle_google_ads` de la fiche se saisissent à la main ou viennent de l'import de Notion ; la réservation du site ne les remplit pas (SPEC §14.6.1, point 10 : seuls civilité, date de naissance, profession, adresse, code postal, ville, téléphone). Reste à établir comment le site obtiendrait le mot-clé : un clic d'annonce (`gclid`) ne donne le mot-clé qu'après une interrogation de Google Ads, que la console ne fait pas.
2. Toucher la ligne : la séance s'ouvre. Q3 oui. **Q4 peut-être** : la v3 dit que la provenance est « en tête de la séance d'entretien », mais l'écran de séance ne montre aujourd'hui ni provenance ni coordonnées (constaté dans `SeanceView.tsx`).
3. Compléter la fiche pendant l'appel. **Q2 non** : les champs sont sur la fiche, pas sur la séance. Il faut toucher le nom, puis « Modifier » sur la carte Identité, saisir, « Enregistrer », puis « Modifier » sur la carte Provenance, saisir, « Enregistrer » (constaté dans `FicheView.tsx`). Pendant un appel, quatre gestes et deux changements de mode.
4. Prendre des notes de l'entretien. **Q2 peut-être** : les notes sont sur la séance, que Florent vient de quitter pour la fiche. Il va et vient entre deux écrans pendant 20 minutes.

**Gestes.** Aujourd'hui : 6 à 7. V3 : 6. Corrigée : 2 (la ligne, puis saisie directe).

**Échecs probables.**
- **Bloquant pour ce besoin.** Le mot-clé est le seul usage de la publicité dans la console, et rien ne l'alimente. *Correction (architecture)* : écrire d'où vient la provenance (ce que le site transmet à la réservation, et qui résout le mot-clé), la recopier sur la fiche quand la fiche n'en a pas, et la rendre dans la lecture de la séance. À défaut, afficher « Provenance inconnue » plutôt qu'une ligne vide.
- **Coûteux.** L'entretien demande trois choses à la fois (provenance, fiche, notes) et la v3 les laisse sur deux écrans. *Correction (architecture)* : une séance de type « entretien préalable » s'ouvre en **mode entretien** : provenance en tête, champs de la fiche directement en saisie (enregistrés pendant la frappe, comme les notes), fiches semblables, notes dessous. Nouvelle fiche ne garde que le cas de la personne inconnue (T5).
- **Gêne.** La règle 6 de la v3 (« chaque information a un seul écran qui la montre ») et la provenance affichée à trois endroits (Aujourd'hui, fiche, séance) se contredisent. *Correction (architecture)* : « un seul écran où elle se **modifie** ; les autres la montrent et y mènent ».

**Dépend de** la phase de réservation (la porte en production) pour toute séance venue du site.

### T3. Juste après une séance : notes, réalisée, payée, réponse SMS

**Chemin v3 (Mac).**
1. Sur Aujourd'hui, toucher la séance qui vient de finir. Oui partout.
2. Écrire les notes dans le texte pré-rempli. Oui partout. « Enregistré » s'affiche après un court délai (constaté : 1,2 s après la dernière frappe).
3. Statut : choisir « Réalisée » dans la liste. Q2 oui. Q3 oui. **Q4 peut-être** : le changement part aussitôt et l'écran se recharge, sans message (constaté). La pastille change, et c'est tout : acceptable, mais la séance passée « prévue » quitte À traiter sans que Florent le voie.
4. Paiement : choisir « Payée ». Même remarque. **Q3 peut-être** : la liste propose aussi « En attente d'espèces » ; si la personne paie en espèces sur place, laquelle choisir ? Le libellé ne dit pas si « Payée » couvre les espèces reçues.
5. « Copier la réponse SMS ». Q2 **peut-être** : le bouton n'apparaît que lorsque le texte sous le titre « Réponse SMS » n'est pas vide (constaté) ; avant d'écrire, Florent ne sait pas qu'il viendra. Q4 oui (« Copiée »).

**Gestes.** Aujourd'hui : 7 (Séances, la séance, deux fois deux pour les listes, Copier). V3 : 6. Corrigée : 3.

**Échecs probables.**
- **Gêne.** Deux listes déroulantes pour le geste le plus répété de la semaine. *Correction (écran)* : un bouton « Terminer la séance » qui pose « Réalisée » et l'état de paiement du type (« Payée » par défaut), avec la liste en second pour les autres cas ; le retour dit « Séance réalisée et payée ».
- **Gêne.** Le SMS est copié sur le Mac ; s'il part de l'iPhone, il faut que le presse-papiers suive. *À vérifier* avec Florent. Aucun message ne part de la console (SPEC §15.1).

### T4. En fin de séance : poser le rendez-vous suivant

**Chemin v3 (Mac).** La v3 offre « Poser un rendez-vous » depuis l'Agenda, la fiche et ⌘K, pas depuis la séance.
1. Depuis la séance ouverte, chercher « rendez-vous suivant ». **Q2 non** : l'écran de séance n'a que Déplacer, Annuler, Remettre à « prévue » (constaté). Florent doit comprendre qu'il faut passer par la fiche.
2. Toucher le nom de la personne, puis « Poser un rendez-vous » sur la fiche. Q3 peut-être (détour).
3. Dans la fenêtre : le type (par défaut « séance », constaté), la date (par défaut **aujourd'hui**, constaté), l'heure (par défaut 9 h 30). **Q3 peut-être** : rien ne propose « même jour, même heure, dans une semaine », qui est le cas ordinaire d'un parcours.
4. Lire les séances déjà prévues ce jour-là. **Q4 peut-être** : la fenêtre montre les séances du jour, pas les créneaux libres ni les horaires d'ouverture (constaté dans `PoserRendezVous.tsx`) ; avec la personne en face, Florent calcule de tête.
5. « Poser » : la séance s'ouvre. Q4 oui ; la fenêtre rappelle que rien n'est écrit dans l'agenda Google et qu'aucun message ne part (SPEC §15.4).

**Gestes.** Aujourd'hui : 7 à 8. V3 : 7 à 8. Corrigée : 2 à 4.

**Échecs probables.**
- **Coûteux.** Le geste qui suit presque chaque séance n'est pas là où Florent se trouve. *Correction (architecture)* : « Poser le suivant » sur la séance, avec la personne, le type, et la date proposée sept jours plus tard à la même heure ; les créneaux libres de ce jour visibles et touchables.
- **Coûteux, transition.** Tant que la console n'écrit pas dans l'agenda Google et que Calendly sert encore, un rendez-vous posé ici n'occupe pas le créneau pour Calendly : une autre personne peut le réserver. *Correction (écran)* : le rappel de la fenêtre le dit en ces termes, pas seulement « pas écrit dans l'agenda Google ».

**Dépend de** l'écriture dans l'agenda Google et des messages (confirmation à la personne).

### T5. Un appel imprévu d'une personne inconnue qui veut un rendez-vous

**Chemin v3 (Mac).**
1. ⌘K, taper le nom. Q1 oui. **Q2 peut-être** : ⌘K est en bas de la barre ; sa découverte demande un premier usage. Sinon : Clients, la recherche a le focus. Oui.
2. Constater qu'aucune fiche ne correspond. **Q3 peut-être** : la recherche porte sur le nom, le prénom et l'adresse e-mail, **pas le téléphone** (constaté, SPEC §15.3). Une personne qui appelle donne souvent d'abord son prénom ; le numéro affiché par le téléphone serait le meilleur indice. Les « fiches semblables » ne comparent pas non plus le téléphone.
3. « Nouvelle fiche ». Q2 oui (action principale de Clients, et dans ⌘K). **Q4 peut-être** : rien ne dit que ⌘K reporte le nom tapé dans le formulaire ; s'il ne le fait pas, Florent retape.
4. Saisir prénom, nom, e-mail, téléphone ; regarder les fiches semblables. Oui partout (constaté dans `NouvelleFicheView.tsx`).
5. « Enregistrer » : la fiche s'ouvre. Q4 oui.
6. « Poser un rendez-vous » ; choisir le type « entretien préalable ». **Q3 peut-être** : le type par défaut est « séance » (constaté) ; pour une personne inconnue, le parcours commence par l'entretien préalable, que Florent doit penser à choisir.
7. « Poser ». Q4 oui.
8. Lui faire remplir le questionnaire de santé. **Q2 non** : la console sait fabriquer le lien d'une séance (`POST /api/seances/:id/lien-questionnaire`, constaté), mais seulement depuis Réglages, en recette, pour l'essai (constaté dans `PortePublique.tsx`). La v3 dit que la fiche de séance « saura les fabriquer », sans dire où.

**Chemin v3 (iPhone).** « + » puis « Nouvelle fiche » : la recherche n'est pas passée avant. Les fiches semblables rattrapent le doublon si le nom ou l'adresse correspondent ; pas si seul le numéro est connu.

**Gestes.** Aujourd'hui : 9 à 11. V3 : 8 à 10. Corrigée : 6 à 8.

**Échecs probables.**
- **Coûteux.** Doublon de fiche, faute de recherche par téléphone. *Correction (écran et route)* : chercher aussi dans le téléphone, normalisé, dans le corps de la requête comme le reste (règle 3) ; le comparer dans les fiches semblables.
- **Gêne.** Deux écrans pour un seul geste mental. *Correction (écran)* : sur Nouvelle fiche, « Enregistrer et poser un rendez-vous », qui ouvre la fenêtre avec la personne et le type « entretien préalable » choisis.
- **Coûteux.** Le questionnaire d'un rendez-vous posé par Florent n'a pas de geste. *Correction (architecture)* : sur une séance dont le type demande un questionnaire et qui n'en a pas, une ligne « Questionnaire de santé : pas reçu » et « Copier le lien à envoyer », tant que la console n'envoie rien.
- **Gêne.** Pendant la transition, Florent peut préférer envoyer un lien Calendly (vue Calendly de l'Agenda) : la v3 garde cette vue, c'est bien.

**Dépend de** l'agenda Google, des messages, et de la porte en production pour que le lien de questionnaire serve.

### T6. Fermer une semaine de vacances en février

**Chemin v3 (Mac).**
1. Agenda, vue Mois. Q1 **peut-être** : Florent a appris (aujourd'hui) que les dates d'exception sont dans Réglages → Réservation ; la v3 les déplace. La v3 le justifie bien (règle 5), mais il faut que le premier essai réussisse.
2. Avancer de trois mois. Oui.
3. Sélectionner du lundi au dimanche. **Q2 non**, **Q3 peut-être** : une sélection par glissé ou par clics successifs sur une grille ne se voit pas ; rien ne l'annonce. Sur l'iPhone, la vue Mois est une grille serrée où le glissé fait défiler.
4. « Fermer ces jours ». Q4 **peut-être** : que deviennent les séances déjà prévues ces jours-là ? La v3 ne le dit pas. La route ferme une date sans toucher aux séances (constaté, SPEC §15.3, `PUT /api/reservation/dates/:date`).
5. Voir les jours fermés. Q4 oui si la vue les marque (la v3 le prévoit ; aujourd'hui, le planning ne montre aucun jour fermé, constaté dans `PlanningView.tsx`).

**Gestes.** Aujourd'hui : 14 à 23 (Réglages, Réservation, puis pour chaque jour : choisir la date, « Fermer cette date », constaté dans `ReservationReglages.tsx`). V3 : 9 environ. Corrigée : 6 à 8.

**Échecs probables.**
- **Coûteux.** Le geste de sélection ne se devine pas. *Correction (écran)* : un bouton visible « Fermer des jours… » sur l'Agenda, qui ouvre une fenêtre « du … au … » ; la sélection sur la grille reste un raccourci qui pré-remplit cette fenêtre.
- **Coûteux.** Des séances prévues dans la période restent prévues sans avertissement. *Correction (écran)* : la fenêtre liste les séances prévues dans la période, chacune avec « Déplacer » ; la fermeture n'annule rien seule.
- **Coûteux, transition.** Fermer ici ne ferme ni Calendly ni l'agenda Google, d'où les personnes réservent encore. *Correction (écran)* : tant que Calendly sert, la fenêtre le dit (« Calendly reste ouvert ces jours-là : fermez-les aussi dans Calendly »). *À vérifier* : où Florent pose ses vacances aujourd'hui.
- **À noter pour le brief technique** : la route est par date ; une semaine fait sept écritures. Un lot unique est préférable (bornes D1 sans souci à cette taille).

### T7. Vendredi : voir ce qui reste à encaisser et le régler

**Chemin v3 (Mac).**
1. Paiements, onglet « À encaisser ». Q1 oui. Q2 oui (libellé visible). Q3 oui.
2. Lire la liste, du plus ancien au plus récent. **Q4 peut-être** : la v3 ne dit pas ce qui y entre. En base, une séance porte « À payer », « En attente d'espèces », « Payée », « Offerte » ou « Annulée » (constaté dans `commun.tsx`). Entrent sans doute « À payer » et « En attente d'espèces » d'une séance réalisée. Et une absence ? *À préciser par Florent.*
3. « Marquer payé » sur une séance. Oui partout ; la ligne passe dans « Encaissés ».
4. « Marquer payé » sur une inscription à un stage. **Q2 non** : une inscription n'a pas d'état de paiement séparé ; son statut va de « Retenue » à « Payée » ou « Confirmée », et la console ne peut poser que « Confirmée », « Annulée », « Déconseillée » (constaté : `PATCH /api/inscriptions/:id`, `EvenementsView.tsx`). Une inscription faite depuis la console est « Confirmée » d'emblée : impossible de savoir si elle est réglée. Le mode de paiement ne connaît que « carte » et « virement » (annexe C).

**Gestes.** Aujourd'hui : il n'y a pas de liste ; semaine après semaine, ouvrir chaque séance « À payer », changer la liste, revenir (4 gestes par séance) ; les inscriptions ne se règlent pas. V3 : 1, plus 1 par ligne. Corrigée : idem, inscriptions comprises.

**Échecs probables.**
- **Bloquant pour les stages.** *Correction (architecture et base)* : une décision sur le paiement d'une inscription (un état de paiement distinct du statut, ou « Payée » posable depuis la console), à écrire avec la phase des paiements ; d'ici là, Paiements ne liste que les séances et le dit.
- **Gêne.** Un total en tête (« Reste à encaisser : 340 € ») répond à la question de Florent sans compter les lignes. Il est sur Paiements, pas sur Aujourd'hui : la règle d'admission tient.
- **Gêne.** « Marquer payé » ne dit pas comment. *À vérifier* : Florent veut-il noter le moyen (espèces, chèque, virement) ? La séance n'a pas de champ pour cela (`mode` dit sur place, visio, téléphone).

**Dépend de** Stripe et Stancer pour les paiements en ligne, qui « se marqueront seuls ».

### T8. Trois semaines avant un stage : inscrits, places, questionnaires, paiements ; inscrire quelqu'un qui appelle

**Chemin v3 (Mac).**
1. Stages, « À venir », le stage. Oui partout ; la liste montre les places libres sur le total (constaté).
2. Voir les inscrits. **Q2 peut-être** : l'écran met d'abord le formulaire du stage (champs, contenus HTML) à gauche, les inscrits à droite (constaté) ; sur l'iPhone, en une colonne, les inscrits viennent après tout le formulaire.
3. Voir qui a envoyé son questionnaire et s'il est relu. **Q2 non** : la lecture d'un stage ne rend pas l'état du questionnaire de chaque inscription (constaté : `GET /api/evenements/:id`). Il faut ouvrir chaque fiche, et la fiche ne dit pas à quel stage se rapporte un questionnaire.
4. Voir qui a payé. **Q4 peut-être** : « Par carte », « Par virement » ou « Sans paiement en ligne », plus le statut (constaté) ; pour une inscription « Confirmée », rien ne dit si elle est réglée (voir T7).
5. Inscrire la personne qui appelle : chercher sa fiche dans « Inscrire une personne ». Oui si elle existe. **Q2 non** si elle n'existe pas : le champ ne cherche que les fiches existantes (constaté dans `ChoixFiche.tsx`). Il faut quitter le stage, créer la fiche, revenir.
6. « Inscrire ». Q4 oui ; complet, le bouton est grisé et dit pourquoi (constaté).

**Gestes.** Aujourd'hui et v3 : 2, plus 2 par inscrit pour les questionnaires, puis impasse ; 6 de plus pour une personne sans fiche. Corrigée : 3 à 5.

**Échecs probables.**
- **Bloquant.** Les contre-indications d'un stage reposent sur le questionnaire, et son état n'est pas sur le stage. *Correction (architecture et route)* : pour chaque inscrit, une pastille questionnaire (« pas reçu », « non relu », « relu », « à revoir ») qui ouvre l'écran Questionnaire (T1) ; un résumé en tête : « 9 inscrits sur 12 · 2 questionnaires à relire · 1 non reçu · 3 non réglés ».
- **Coûteux.** *Correction (écran)* : le stage s'ouvre sur ses inscrits ; les champs et contenus HTML passent dans un second onglet (« Le stage », « Inscrits »).
- **Gêne.** *Correction (écran)* : dans « Inscrire une personne », quand la recherche ne trouve rien, « Créer la fiche » sur place (les quatre champs essentiels et les fiches semblables), puis l'inscription.
- Le questionnaire d'une personne inscrite par Florent n'a pas de geste, comme en T5.

**Dépend de** la publication d'un stage sur le site, des messages et des paiements en ligne.

### T9. Le soir, sur l'iPhone : des envois suspects arrivent du site ; tout couper

**Chemin v3 (iPhone).**
1. Ouvrir la console : Aujourd'hui. Oui.
2. Trouver « Réception du site : ouverte ». **Q2 peut-être** : la ligne est « discrète », sous les séances du jour (qui, le soir, comprennent le lendemain) et À traiter ; sur un téléphone, elle peut être sous le pli. Q3 oui : le libellé dit ce qu'il coupe.
3. « Couper », puis confirmer. Q4 oui si la confirmation liste ce qui s'arrête (la v3 le prévoit). **Q4 peut-être** sur ce qui continue : les ordres déjà confiés à Make pour des envois acceptés (rappels, accusés) partent-ils encore ? La SPEC dit seulement que toute commande reçoit `ferme` (§14.5, §14.6.1 point 9). *À vérifier.*
4. Voir l'état coupé : la ligne passe en tête d'Aujourd'hui. Oui.

**Gestes.** Aujourd'hui : 5 à 6 (menu, l'icône de Réglages sans libellé, faire défiler les onglets jusqu'à « Quotas Cloudflare », descendre sous la consommation et la base jusqu'à « Porte publique », Couper, confirmer ; constaté dans `PortePublique.tsx` et `MobileSubTabs.tsx`). V3 : 2 à 3. Corrigée : 2.

**Échecs probables.**
- **Coûteux.** *Correction (écran)* : sur l'iPhone, la ligne d'état reste visible sans défiler (en tête d'Aujourd'hui, ou fixée au-dessus de la barre du bas), et figure en tête de « Plus ».
- **Coûteux, transition.** Couper la porte ne coupe ni Calendly ni les formulaires que le site envoie encore à Make. Tant que la porte n'est pas déployée en production (§14.6.2, point 5), ce geste n'a rien à couper en production. *Correction (écran)* : la confirmation dit ce qu'elle ne couvre pas, tant que c'est vrai.
- **Gêne.** « Envois suspects » : Florent les découvre par une alerte (`trop_de_demandes`, §14.5) qui entre dans À traiter. Il faut qu'elle mène à Réception du site, avec ce qui a été reçu ce jour.

### T10. Dans la rue, sur l'iPhone : noter une idée de post

**Chemin v3 (iPhone).**
1. « + » au centre de la barre du bas, puis « Noter une idée ». Oui partout.
2. Taper l'idée. Oui.
3. Choisir un format. **Q1 peut-être** : dans la rue, Florent ne sait pas toujours si ce sera un post ou un carrousel. Le bouton d'ajout reste grisé tant qu'aucun format n'est choisi (constaté dans `IdeesView.tsx`).
4. « Ajouter ». Q4 **peut-être** : la v3 ne dit pas ce que montre le retour (rester sur Aujourd'hui avec « Idée notée », ou ouvrir la liste Idées).

**Gestes.** Aujourd'hui : 4 à 5 (la console s'ouvre sur Contenus : onglet Idées, saisie, format, Ajouter). V3 : 4 à 5. Corrigée : 3.

**Échecs probables.**
- **Gêne.** *Correction (écran)* : le format pré-choisi (le dernier utilisé), modifiable ; le retour « Idée notée », sans quitter l'écran d'où Florent est parti. *À vérifier* : si le format peut rester indécis dans le modèle (`FORMAT_REGISTRY`), ce qui serait plus juste.

### T11. Une après-midi de contenus par mois

**Chemin v3 (Mac).** Éditorial → Contenus, onglet Conversations ; reprendre une conversation ; publier depuis le cadre du contenu (SPEC §13.8–13.9, inchangé). Quatre fois oui à chaque étape.

**Gestes.** Un de plus pour arriver (la console ne s'ouvre plus sur Contenus). Le reste est inchangé.

**Échecs probables.** Aucun qui tienne à l'architecture. **Gêne** légère : la recherche ⌘K « reste dans le métier où l'on est » ; ouverte depuis Aujourd'hui (Pratique), elle ne trouve pas un contenu par son titre. *Correction (écran)* : depuis Aujourd'hui, ⌘K propose les écrans des deux métiers, mais ne cherche les personnes que depuis la Pratique — la règle protège les noms, pas la navigation.

### T12. Une personne dit n'avoir pas reçu son rappel

**Chemin v3 (Mac ou iPhone).**
1. Chercher la personne, ouvrir sa fiche, puis la séance concernée. Oui.
2. Lire l'envoi du rappel « sur la séance ». **Q2 non aujourd'hui** : la console n'envoie aucun message (SPEC §15.1) ; les rappels partent de Calendly ou de Make, hors de la console. La v3 place bien le bloc pour demain.
3. Comprendre ce qui s'est passé. **Q4 peut-être** : un ordre ne porte « ni adresse, ni numéro, ni texte » (§14.6) ; l'écran pourra dire « confié à Make le …, confirmé le … » ou « en échec », mais pas à quel numéro il est parti. Or la cause fréquente est un numéro erroné.

**Gestes.** Aujourd'hui : impossible. V3 : 3, à venir.

**Échecs probables.**
- **Coûteux, à venir.** *Correction (écran)* : un bloc « Messages » sur la séance (confirmation, rappels : canal, prévu à, confié, confirmé, en échec), à côté du téléphone et de l'e-mail **actuels** de la fiche, et d'un écart reçu s'il y en a un (`ecart_fiche`). Un échec entre dans À traiter.
- Pas de « Renvoyer » avant la phase des messages.

**Dépend de** la phase des messages.

### T13. Changer la durée ou le prix d'un type de rendez-vous

**Chemin v3 (Mac).** Réglages → Pratique → Types de rendez-vous → « Modifier » sur le type → durée, montant → « Enregistrer ». Q1 à Q3 oui : les libellés disent ce qu'ils contiennent (mieux que « Réservation » aujourd'hui).

**Q4 peut-être.** Le changement vaut-il pour les rendez-vous déjà posés ? Durée et montant viennent du type au moment de poser (SPEC §15.3) : les séances existantes gardent les leurs. Rien ne le dit à l'écran.

**Gestes.** 4 aujourd'hui, 4 en v3.

**Échecs probables.**
- **Gêne.** *Correction (écran)* : le retour dit « S'applique aux rendez-vous posés à partir de maintenant. Les 12 séances déjà prévues gardent leur durée et leur montant. » ; et, tant que c'est vrai, que les tarifs affichés sur le site et les types de Calendly ne changent pas avec. *À vérifier* : où le site affiche ses tarifs.

### T14. Une réservation est arrivée du site sans fiche reconnue : la rattacher

Cas réel : deux fiches partagent la clé de la personne, rien n'a été rattaché, une alerte est levée (SPEC §14.4) ; ou un questionnaire est arrivé par un lien révoqué ou en double (§14.6.1).

**Chemin v3 (Mac).**
1. Sur Aujourd'hui, À traiter : « Rattacher la réservation de Marie D. (mardi 10 h) ». Oui.
2. Toucher la ligne. **Q4 non** : aucun écran ne fait ce geste. La séance s'ouvre avec « · à rapprocher » à côté du nom, sans aucune action (constaté dans `SeanceView.tsx`) ; aucune route ne rattache une séance, une inscription ou un questionnaire à une fiche (constaté : `PATCH /api/seances/:id` n'accepte pas de fiche).
3. Choisir entre les deux fiches candidates. **Q2 non.** Et pour décider, Florent a besoin de l'adresse e-mail reçue, que la règle 13 retire des listes : il faut un écran à part, avec sa route.

**Gestes.** Aujourd'hui : impasse. V3 : 1, puis impasse. Corrigée : 3 (la ligne, la fiche choisie, « Rattacher »).

**Échecs probables.**
- **Bloquant.** *Correction (architecture)* : un écran **Rapprochement**, destination unique des lignes « à rapprocher » et des alertes `a_rapprocher`, `second_questionnaire`, `ecart_fiche`. Il montre ce qui a été reçu (identité complète, sur sa route sensible), les fiches candidates côte à côte, et les gestes : « Rattacher à cette fiche », « Créer une fiche », et pour un écart « Garder la fiche » ou « Prendre la valeur reçue ». La fusion de deux fiches en double est une décision à part, à signaler.
- **Coûteux.** Plus largement, chaque sorte d'alerte doit avoir son écran d'arrivée et son geste qui la ferme, sans quoi la règle d'admission d'Aujourd'hui ne tient pas. *Correction (architecture)* : une table, sorte par sorte (annexe C : `a_rapprocher`, `a_revoir`, `ecart_fiche`, `second_questionnaire`, `message_echec`…), de l'écran et du geste.

### T15 (demandée par Florent le 27/11/2026). Après l'entretien préalable : mettre le résumé de l'entretien dans les notes de la séance

Fonction à venir, décrite dans l'architecture (« Une fonction à venir : l'enregistrement de l'entretien »). **Elle dépend d'une phase à venir et d'une décision écrite** : la SPEC §14.2, règle 3, interdit aujourd'hui que les données sensibles — dont `seances_notes` — sortent par l'IA, et le CLAUDE.md de gestion interdit à tout module IA d'importer `workers/api/src/clients/`. Le moteur de transcription qui existe déjà (Whisper, Deepgram, pour les vidéos : SPEC v2.16, `routes/transcription.ts`) est un module éditorial : il ne peut pas servir tel quel.

**Chemin d'aujourd'hui (Mac), le détour.**
1. Ouvrir Whisper Transcription, y déposer le fichier audio, lancer la transcription, la copier (4 gestes). Q1 à Q4 oui : Florent le fait déjà.
2. Ouvrir Claude, coller la transcription et demander un résumé, copier le résumé (3 à 4 gestes). Oui.
3. Dans la console : Séances, la séance, placer le curseur sous « Séance », coller (3 à 4 gestes). **Q2 peut-être** : retrouver la bonne séance dans la semaine, sans lien depuis l'endroit où il était.

Trois applications, 11 à 13 gestes, et une recopie où une erreur de séance passe inaperçue. **À signaler** : dans ce détour, l'entretien passe déjà par un service d'IA, hors des garanties que la SPEC donne à la console. La décision à écrire porte donc aussi sur la pratique actuelle.

**Chemin v3 (Mac, ou iPhone).**
1. Depuis Aujourd'hui, ouvrir la séance d'entretien qui vient de finir. Oui.
2. « Déposer l'enregistrement », au-dessus des notes ; glisser le fichier (Mac) ou le choisir (iPhone). Q1 oui. Q2 oui. Q3 oui. **Q4 peut-être** : la v3 dit que « la séance le dit » pendant le traitement, sans dire si Florent peut quitter l'écran, ni combien de temps attendre.
3. Plus tard, À traiter : « Résumé prêt à relire ». Oui ; la ligne obéit à la règle d'admission si elle disparaît quand le résumé est gardé ou écarté.
4. Garder, retoucher ou effacer le résumé « dans les notes, comme une proposition ». **Q3 peut-être** : les notes sont un seul texte Markdown, enregistré pendant la frappe (constaté dans `SeanceView.tsx`). Une proposition placée dans ce texte serait enregistrée comme le reste, donc déjà gardée ; placée à côté, elle n'est plus « dans les notes ». Et si Florent a déjà tapé des notes pendant l'appel, où va-t-elle ? Le geste de « garder » n'est pas défini.
5. Lire la transcription complète, repliée sous les notes. Oui.

**Gestes.** Aujourd'hui : 11 à 13, dans trois applications. V3 : 5 à 6. Corrigée : 4 à 5.

**Échecs probables.**
- **Bloquant, par construction.** Sans la décision écrite (fournisseur, hébergement européen, contrat de traitement, ni conservation ni entraînement, sort du fichier audio, accord de la personne), la fonction n'existe pas. L'architecture le dit ; c'est juste.
- **Coûteux.** La proposition et le texte unique des notes se contredisent. *Correction (écran)* : le résumé arrive dans un encart au-dessus des notes, avec « Insérer sous Séance » et « Écarter » ; seul « Insérer » l'écrit dans les notes, par la même écriture versionnée (règle 7), à l'endroit choisi, sans rien remplacer.
- **Coûteux.** L'accord de la personne n'a pas de place. *Correction (architecture)* : une case « accord pour l'enregistrement », datée, sur la séance d'entretien, demandée avant le dépôt ; sans elle, le dépôt est grisé et dit pourquoi.
- **Gêne.** *Correction (écran)* : pendant le traitement, la séance dit l'étape (« Transcription en cours », « Résumé en cours ») et que Florent peut partir ; un échec entre dans À traiter avec « Réessayer ».
- **À vérifier** : comment l'appel de 20 minutes est enregistré (sur l'iPhone ? par quelle application ?), donc d'où vient le fichier et sur quel appareil il se dépose ; et que l'effacement d'une personne (phase S4, matrice d'effacement) emporte l'audio, la transcription et le résumé.

### T16 (ajoutée). Une personne appelle pour déplacer sa séance de jeudi ; Florent est sur l'iPhone

Tâche ajoutée parce qu'elle revient chaque semaine et qu'aucune des tâches données ne la couvre.

**Chemin v3 (iPhone).**
1. Agenda dans la barre du bas ; la semaine en liste de jours. Oui. Ou la recherche en haut de l'Agenda, puis la fiche, puis la séance : oui.
2. Toucher la séance, puis « Déplacer ». Oui (constaté).
3. Choisir la nouvelle date et l'heure. **Q4 peut-être** : la fenêtre de déplacement n'a que deux champs, sans les séances du jour ni les créneaux libres (constaté dans `SeanceView.tsx`), à la différence de « Poser un rendez-vous ». Au téléphone, Florent ne peut pas proposer deux créneaux.
4. « Déplacer ». Q4 oui : un chevauchement est refusé et dit pourquoi.

**Gestes.** Aujourd'hui : 7 à 9 (le menu, l'icône des Séances, la semaine, la séance, Déplacer, date, heure, valider). V3 : 6 à 8. Corrigée : 5 à 6.

**Échecs probables.**
- **Coûteux.** *Correction (écran)* : « Déplacer » ouvre la même fenêtre que « Poser un rendez-vous », avec les créneaux libres des jours proposés.
- **Gêne, à venir.** Le créneau libéré n'est proposé à personne (liste d'attente, phase à venir), et la personne ne reçoit pas de confirmation : le retour le dit.

**Dépend de** l'agenda Google, des messages et de la liste d'attente.

### T17 (ajoutée). Sur l'iPhone, compléter les notes d'une séance oubliée

Ajoutée parce que c'est, avec la consultation d'une fiche, l'usage du téléphone écrit au SPEC §15.1.

**Chemin v3 (iPhone).**
1. Aujourd'hui, À traiter : « Écrire les notes de la séance de Paul R. (hier, 17 h) ». Oui.
2. La séance s'ouvre. **Q2 peut-être** : en une colonne, les notes viennent après l'en-tête (statut, paiement, montant, actions) et l'histoire du rendez-vous (constaté : les notes sont la seconde colonne de la grille). Il faut défiler.
3. Écrire. Oui ; « Enregistré » s'affiche.
4. Si la même séance est ouverte sur le Mac : refus « Cette note a été modifiée ailleurs » ; l'écran conseille « Copiez votre texte avant de recharger la page » (constaté). **Q4 peut-être** : copier un long texte sur un iPhone est malaisé.

**Gestes.** Aujourd'hui : 4 à 6. V3 : 2 à 3. Corrigée : 2.

**Échecs probables.**
- **Gêne.** *Correction (écran)* : sur téléphone, les notes juste sous l'en-tête, l'histoire repliée ; en cas de conflit, un bouton « Copier mon texte » et la version enregistrée affichée à côté.

---

## 4. Corrections proposées à l'architecture v3

Classées par gravité. Entre parenthèses, les tâches qui les motivent.

**Bloquant**

1. **Un écran Questionnaire** : les réponses, les contre-indications déclarées mises en évidence, « Marquer relu », « À revoir avec la personne » ; ouvert depuis la séance, la fiche, l'inscription à un stage et À traiter ; une route sensible pour le lire et une pour poser « relu ». Sans lui, la ligne « questionnaire à relire » n'a pas de destination et ne disparaît jamais. (T1, T8)
2. **Un écran Rapprochement**, destination unique des lignes « à rapprocher » et des alertes de rattachement et d'écart : ce qui a été reçu, les fiches candidates, « Rattacher à cette fiche », « Créer une fiche », « Garder la fiche » ou « Prendre la valeur reçue ». Il demande des routes qui n'existent pas. (T14)
3. **Une table des alertes, sorte par sorte** : pour chacune, l'écran d'arrivée et le geste qui la ferme. C'est la condition de la règle d'admission d'Aujourd'hui, qui doit aussi avoir sa lecture groupée, bornée. (T1, T9, T14)
4. **Le paiement d'une inscription** : une décision (état de paiement distinct du statut, ou « Payée » posable depuis la console). Jusque-là, Paiements dit qu'il ne liste que les séances. (T7, T8)
5. **La source de la provenance** : écrire ce que le site transmet à la réservation, qui résout le mot-clé, et la recopier sur la fiche quand elle est vide ; à défaut, afficher « Provenance inconnue ». C'est le seul besoin publicitaire de la console. (T2)
6. **L'état des questionnaires sur le stage** : une pastille par inscrit et un résumé en tête (inscrits, places, questionnaires à relire ou non reçus, non réglés). (T8)

**Coûteux**

7. **La séance devient l'écran de travail**, selon son moment : avant (questionnaire, « La dernière fois »), pendant l'entretien préalable (mode entretien : provenance, fiche en saisie directe, fiches semblables, notes), après (notes, « Terminer la séance », « Poser le suivant »). Nouvelle fiche ne sert plus qu'à la personne inconnue. (T1, T2, T3, T4)
8. **« Poser le suivant » sur la séance**, pré-rempli : même personne, même type, sept jours plus tard à la même heure, créneaux libres visibles. Ajouter la séance à la ligne « Poser un rendez-vous » du tableau des actions de partout. (T4)
9. **Une seule fenêtre pour poser et déplacer**, qui montre les créneaux libres et pas seulement les séances du jour. (T4, T16)
10. **« Fermer des jours… », un bouton visible de l'Agenda** (du … au …), la sélection sur la grille n'étant qu'un raccourci ; la fenêtre liste les séances prévues dans la période, chacune avec « Déplacer ». (T6)
11. **Dire la transition là où elle a une conséquence** : tant que Calendly sert et que l'agenda Google n'est pas écrit, poser, déplacer et fermer des jours le disent en clair (« Calendly peut encore proposer ce créneau », « fermez aussi ces jours dans Calendly ») ; couper la réception dit ce qu'elle ne coupe pas. (T4, T6, T9)
12. **Chercher aussi par téléphone**, dans Clients, ⌘K et les fiches semblables ; ⌘K reporte le nom tapé dans Nouvelle fiche ; « Enregistrer et poser un rendez-vous », avec le type « entretien préalable » proposé. (T5)
13. **Le lien de questionnaire, sur la séance et sur l'inscription** : « Questionnaire de santé : pas reçu — Copier le lien à envoyer », tant que la console n'envoie rien. (T5, T8)
14. **Le stage s'ouvre sur ses inscrits** (onglets « Inscrits », « Le stage ») ; « Créer la fiche » sur place quand l'inscription ne trouve personne. (T8)
15. **La réception du site toujours visible sur l'iPhone**, sans défiler, et en tête de « Plus ». (T9)
16. **Un bloc « Messages » sur la séance et l'inscription**, à côté des coordonnées actuelles de la fiche et d'un écart reçu, quand la phase des messages arrive. (T12)

17. **Le résumé de l'entretien, proposé à côté des notes** : un encart « Insérer sous Séance » / « Écarter », seule l'insertion écrit dans les notes, sans rien remplacer ; l'étape du traitement dite sur la séance, l'échec dans À traiter. À n'ouvrir qu'après la décision écrite qu'exige la SPEC §14.2, règle 3. (T15)
18. **L'accord pour l'enregistrement**, daté, sur la séance d'entretien, avant tout dépôt. (T15)

**Gêne**

19. **« Terminer la séance »** : réalisée et payée en un geste, la liste restant pour les autres cas, avec un retour écrit. (T3)
20. **La règle 6 reformulée** : « chaque information a un seul écran où elle se modifie ; les autres la montrent et y mènent ». (T2)
21. **Notes sur téléphone** : juste sous l'en-tête, l'histoire repliée ; en conflit, « Copier mon texte » et la version enregistrée à côté. (T17)
22. **Noter une idée** : format pré-choisi, modifiable ; retour « Idée notée » sans quitter l'écran. (T10)
23. **Le retour d'un type modifié** : à partir de quand il s'applique, ce qui ne change pas (séances déjà posées, tarifs du site, Calendly). (T13)
24. **Paiements** : ce qui y entre, écrit (absence comprise ou non, à décider par Florent), et un total en tête. (T7)
25. **⌘K depuis Aujourd'hui** propose les écrans des deux métiers ; les personnes ne se cherchent que depuis la Pratique. (T11)

---

## 5. Ce que le brief de design devra spécifier, écran par écran

Pour chaque écran : ses états, son action principale, et ce qu'affiche chaque retour. Les composants et les échelles restent ceux de `DESIGN.md`.

**Aujourd'hui.**
- États : base non reliée (la console s'ouvre sur Contenus) ; journée sans séance ; rien à traiter (une phrase, pas un vide) ; matin, journée, soir (le lendemain ajouté) ; réception coupée (en tête, avec « Rouvrir ») ; chargement ; panne.
- Action principale : aucune ; chaque ligne est un lien vers un seul écran.
- À fixer : l'ordre des blocs sur l'iPhone (la ligne d'état visible sans défiler) ; le gabarit d'une ligne d'À traiter (geste, objet, échéance) ; les pastilles d'une séance du jour (questionnaire non relu, provenance pour un entretien préalable).
- Retours : une ligne traitée ailleurs a disparu au retour ; rien ne disparaît sous les yeux de Florent sans qu'il ait agi.

**Séance** (un écran, trois moments).
- États : à venir ; entretien préalable en cours ; passée « prévue » ; réalisée ; annulée ; absente ; à rapprocher (le lien vers Rapprochement) ; sans type.
- Actions principales : avant, « Voir le questionnaire » ; à l'entretien, la fiche en saisie directe ; après, « Terminer la séance » puis « Poser le suivant ».
- Contenu : provenance en tête pour un entretien préalable ; « La dernière fois », repliable ; notes juste sous l'en-tête sur téléphone ; « Copier la réponse SMS » visible et grisé tant que le titre est vide, avec la raison ; ligne questionnaire (« pas reçu », « non relu », « relu ») ; plus tard, le bloc Messages.
- L'enregistrement de l'entretien (après la décision, T15) : états sans accord (dépôt grisé, raison dite), dépôt en cours, transcription en cours, résumé en cours, résumé prêt (encart « Insérer sous Séance », « Écarter »), échec (« Réessayer »), inséré ; la transcription repliée sous les notes.
- Retours : « Enregistré » des notes, l'échec et le conflit (avec « Copier mon texte ») ; « Séance réalisée et payée » ; le rappel de la transition (agenda Google, messages, Calendly).

**Questionnaire** (nouveau).
- États : non relu ; relu (par qui, le …) ; à revoir ; second envoi (les deux, côte à côte) ; mineur (autorisation parentale à obtenir).
- Actions : « Marquer relu » (principale), « À revoir avec la personne ».
- Retours : la pastille change, la ligne quitte À traiter, l'écran d'origine (séance, stage) le montre au retour.
- Contrainte : route sensible à part (règle 4) ; rien dans le stockage du navigateur (règle 5).

**Rapprochement** (nouveau).
- États : séance, inscription ou questionnaire reçu sans fiche ; plusieurs fiches de même clé ; écart entre ce qui a été reçu et la fiche.
- Actions : « Rattacher à cette fiche » (principale), « Créer une fiche », « Garder la fiche », « Prendre la valeur reçue ».
- Retours : ce qui a été rattaché, à quelle fiche, et l'alerte fermée.

**Fiche.**
- États : lecture ; une carte en saisie ; écart en attente (lien vers Rapprochement).
- Action principale : « Poser un rendez-vous ».
- Contenu : provenance en tête (ou « Provenance inconnue ») ; questionnaires cliquables vers l'écran Questionnaire ; séances ; inscriptions.

**Nouvelle fiche.**
- États : vide ; fiches semblables trouvées (par nom, adresse e-mail ou téléphone) ; refus de la route.
- Actions : « Enregistrer » ; « Enregistrer et poser un rendez-vous » (type « entretien préalable » proposé).
- Retours : la fiche créée, ou la fenêtre de rendez-vous ouverte avec la personne choisie.

**Poser ou déplacer un rendez-vous** (une seule fenêtre).
- États : personne choisie ou à chercher ; date proposée (sept jours plus tard pour « Poser le suivant ») ; créneaux libres du jour, séances prévues, jour fermé ; chevauchement refusé.
- Action principale : « Poser » ou « Déplacer ».
- Retours : la séance ouverte ; le rappel de la transition, en clair.

**Agenda.**
- États : Semaine, Mois (et Calendly tant qu'il sert) ; jours fermés marqués dans les deux vues ; jour d'exception ouvert.
- Actions : « Poser un rendez-vous » (principale) ; « Fermer des jours… » (visible).
- Fenêtre « Fermer des jours » : du … au … ; séances prévues dans la période, chacune avec « Déplacer » ; avertissement Calendly ; « Fermer ces jours ».
- Retours : les jours fermés visibles ; « Ouvrir ce jour » pour revenir sur un jour.

**Paiements.**
- Onglets : À encaisser, Encaissés.
- États : rien à encaisser ; séances seulement (tant que les inscriptions n'ont pas leur état de paiement, et l'écran le dit).
- Contenu : total en tête ; lignes du plus ancien au plus récent (personne, date, type ou stage, montant).
- Action : « Marquer payé » sur chaque ligne ; la ligne passe dans Encaissés, avec « Annuler » quelques secondes.

**Stage.**
- Onglets : Inscrits (à l'ouverture), Le stage.
- Contenu : résumé en tête (inscrits, places, questionnaires à relire ou non reçus, non réglés) ; par inscrit, statut, paiement, questionnaire.
- États : complet (le bouton grisé et sa raison, déjà fait) ; inscription à rapprocher.
- Action principale : « Inscrire une personne », avec « Créer la fiche » quand la recherche ne trouve rien.

**Réception du site** (Réglages et ligne d'état).
- États : ouverte ; coupée ; base non reliée ; porte absente en production.
- Action : « Couper », avec une confirmation qui liste ce qui s'arrête et ce qui ne s'arrête pas ; « Rouvrir » sans confirmation (déjà fait, constaté).
- Contenu : ce qui a été reçu ce jour ; limites de sécurité, repliées.

**Types de rendez-vous.**
- Une ligne par type ; « Modifier » ; « Enregistrer ».
- Retour : à partir de quand le changement s'applique et ce qu'il ne touche pas.

**Noter une idée** (iPhone, depuis « + »).
- Une feuille : le texte, le format pré-choisi, « Ajouter ».
- Retour : « Idée notée », sans quitter l'écran d'origine.

**Rechercher (⌘K).**
- Contenu : les écrans et les actions des deux métiers ; les personnes seulement depuis la Pratique ; recherche par nom, adresse e-mail et téléphone ; aucun historique gardé.
- Action sans résultat : « Nouvelle fiche » avec le texte tapé reporté.

**Partout.** Base non reliée : la phrase de la SPEC §15.4 ; un refus tel que la route l'écrit ; une panne par `ErreurEcran` ; les pastilles toujours avec leur libellé ; chaque écran vu sur téléphone et sur ordinateur, en clair et en sombre.

---

## 6. Contre-expertise de GPT (27/11/2026, 22 h 20)

**Verdict.** La v3 place les séances, les fiches et les encaissements là où Florent en a besoin. Le parcours repère deux lacunes importantes : le geste qui clôt une ligne d'« À traiter », et la prise du rendez-vous suivant depuis la séance. Ses verdicts « casse » et ses gains en gestes sont moins solides : ils mêlent le code actuel, la cible et des habitudes encore à confirmer.

**Réserves de méthode.** Le dépôt sert de témoin de l'existant, pas de preuve qu'une route manque. Certaines tâches agrègent plusieurs buts (T3, T8) ; T11 n'a pas de résultat vérifiable ; les gestes excluent la saisie et la vérification d'identité. Une fin de tâche peut tromper : séance réalisée ne veut pas dire payée ; « relu » ne veut pas dire « rien à revoir ».

**Confidentialité.** « La dernière fois » sur la séance exige une lecture sensible dédiée. « Copier mon texte » en cas de conflit passerait des notes par le presse-papiers partagé entre appareils : préférer garder la saisie à l'écran et résoudre le conflit sur place. Pour l'enregistrement, l'information de la personne vient avant l'enregistrement, pas au dépôt du fichier.

**Corrections contestées ou fusionnées.** La n° 20 est trop large : une destination de référence par information, et une liste des reprises autorisées. La n° 7 (saisir la fiche depuis la séance) crée un second lieu de modification : essayer d'abord un accès direct à la fiche avec retour à l'entretien. Fusionner 8 et 9 (choisir un créneau), 1, 6 et 13 (le cycle du questionnaire), 4, 19 et 24 (l'encaissement), 17 et 18 (la phase audio). La n° 15 : tester la coupure depuis n'importe quel écran plutôt que réserver de la place en permanence.

**Tâches manquantes.** Retrouver la bonne fiche parmi deux homonymes sur l'iPhone pendant un appel ; annuler une séance ou constater une absence, et voir l'effet sur le créneau et le dû ; créer puis ouvrir aux inscriptions un stage ; rouvrir la réception du site après un incident.

**Les huit priorités pour le brief, dans l'ordre.**
1. Clore la séance en distinguant présence et paiement : deux gestes proches, un choix explicite pour l'encaissement, corrigeable.
2. Poser le suivant ou déplacer depuis la séance : la personne gardée, les disponibilités visibles, ce que Calendly peut encore proposer.
3. Achever la relecture d'un questionnaire : l'état seul dans les listes, les réponses à la demande, le suivi « à revoir ».
4. Sécuriser le rapprochement : comparer les indices, pouvoir différer, préserver le premier questionnaire lors d'un second envoi.
5. Définir chaque ligne d'« À traiter » : déclencheur, destination, geste, condition de sortie.
6. Fiabiliser « À encaisser » : séances et inscriptions, place confirmée distincte de somme reçue, traitement des absences tranché.
7. Préparer l'entretien depuis la séance : la provenance, la bonne fiche, les notes retrouvées au retour.
8. Protéger la reprise des notes sur l'iPhone : la zone de saisie directe, l'enregistrement perceptible, le conflit Mac–iPhone résolu sans perdre le brouillon.
