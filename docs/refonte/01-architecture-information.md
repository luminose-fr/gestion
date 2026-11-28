# Console gestion.luminose.fr — architecture d'information

Étape 1 sur 3 (architecture → usage → brief Claude Design). **Version 3 du 27/11/2026** : relue par l'Expert UX, contre-expertisée par GPT, complétée des réponses de Florent du même soir (partie 4).

Sources lues : `apps/manager/components/Layout/Sidebar.tsx`, `MobileSubTabs.tsx`, `Settings/*.tsx`, `Corpus/sections.ts`, `Contenus/listes.ts`, `Clients/*.tsx`, SPEC §3.8, §13.8-13.9, §14, §15 et annexe C (état de `main` au 27/11/2026).

---

## 1. Ce qui existe aujourd'hui

### La barre de gauche

Un rail de 64 px, **en icônes seules** : le nom d'un espace n'apparaît qu'au survol sur le Mac, et jamais sur l'iPhone. Dans l'ordre :

1. **Contenus** — l'écran d'ouverture ; un panneau à côté : Conversations · Idées · Publiés
2. **Clients** — les fiches ; pas de panneau
3. **Séances** — le planning (Semaine · Mois · Calendly, en haut de l'écran) ; une séance et ses notes
4. **Évènements** — stages et journées, leurs inscrits ; pas de panneau
5. **Professionnels** — prescripteurs, prospection, courriers ; pas de panneau
6. *(séparateur)* **Psychédéliques** — le calculateur de doses
7. **Corpus** — ce qui nourrit l'IA ; un panneau : État · Documents (et un troisième panneau de six blocs) · Inbox · Carte
8. *(en bas)* **Réglages** — un panneau de huit sections

Trois espaces ont un panneau, quatre n'en ont pas et rangent leur second niveau chacun à sa façon.

### Réglages, tel quel

| Section | Contenu | Domaine réel |
| :--- | :--- | :--- |
| Modèles IA | le catalogue, par fournisseur | rédaction IA |
| Modèles par famille | quel modèle sert quel travail | rédaction IA |
| Mesures | coût et durée de chaque action IA | rédaction IA |
| **Quotas Cloudflare** | la consommation du jour, **plus** « Base des clients » (reliée ou non), **plus** « Porte publique » : l'interrupteur qui coupe **tout ce que le site envoie** (réservations, questionnaires de santé, inscriptions, paiements), ses compteurs, les liens d'essai de la recette | hébergement **et** pilotage de la pratique |
| Clés des fournisseurs | les clés, en écriture seule | rédaction IA |
| Personas | les prompts des rôles IA, en lecture | documentation de l'IA |
| Réservation | types de rendez-vous ; semaine type ; dates d'exception ; rappels, retenue d'une place, liste d'attente ; garde-fous techniques repliés | la pratique, agenda et règles mêlés |
| Sauvegarde | export JSON de la partie éditoriale | données |

### Ce que la base sait déjà, sans endroit à l'écran

Les alertes ; les séances et inscriptions « à rapprocher » (reçues du site sans fiche reconnue) ; les ordres confiés à Make (e-mails, SMS) ; les questionnaires à relire (visibles seulement depuis la fiche) ; les modèles de messages. À venir : paiements, liste d'attente, rappels, agenda Google, effacement d'une personne.

---

## 2. Diagnostic

1. **On ne lit pas la navigation.** Sept pictogrammes sans texte, et rien sur l'iPhone : il faut se souvenir de ce que chaque icône veut dire.
2. **Le second niveau n'a pas de règle.** Panneau ici, contrôle en haut de l'écran là, rien ailleurs.
3. **L'ordre ne suit pas la fréquence.** Les séances (tous les jours) sont en troisième ; les contenus (quelques fois par mois) en premier et à l'ouverture.
4. **Aucun écran ne dit « ce qui m'attend ».** Notes à écrire, séance à marquer réalisée, questionnaire à relire, ligne à rapprocher, alerte : dispersés ou invisibles.
5. **Les deux métiers s'entrelacent.** La pratique (personnes, séances, stages) et l'éditorial (contenus, corpus, IA) ne partagent ni base ni usage, et le rail les mélange.
6. **Réglages est rangé par technique.** Cinq sections sur huit ne servent que l'IA ; la seule section de la pratique mêle un geste courant (fermer des dates pour des vacances) et des règles qu'on pose une fois.
7. **L'interrupteur d'urgence est sous un compteur**, avec un nom technique (« Porte publique ») et un emplacement (« Quotas Cloudflare ») qui ne disent pas ce qu'il fait. Il n'est visible que si la base est reliée, et son état ne se voit nulle part ailleurs.
8. **Les libellés parlent de la technique** : Quotas Cloudflare, Porte publique, Modèles par famille, Inbox, Personas.

---

## 3. Proposition

### Les règles

1. **Une barre de gauche à libellés visibles**, avec deux titres de groupe. Sur le Mac, elle peut se replier en icônes, mais elle s'ouvre dépliée.
2. **Un groupe n'existe qu'à partir de deux entrées.**
3. **L'ordre suit la fréquence**, dans chaque groupe.
4. **Le second niveau est toujours au même endroit** : des onglets en haut de l'écran pour quatre vues au plus ; une liste à gauche, dans l'écran, au-delà (Réglages, documents du Corpus). Plus de panneau qui apparaît ou disparaît selon l'espace.
5. **L'agenda porte ce qui change une date** ; Réglages ne porte que ce qu'on pose une fois.
6. **Chaque information a un seul écran qui la montre**, et les autres y mènent.

### La barre de gauche

```
Aujourd'hui

PRATIQUE
  Agenda              Semaine · Mois       (+ Calendly tant qu'il sert)
  Clients
  Paiements           À encaisser · Encaissés
  Stages              À venir · Passés
  Professionnels
  Psychédéliques      (le calculateur, en dernier)

ÉDITORIAL
  Contenus            Conversations · Idées · Publiés
  Corpus              État · Documents · À ranger · Carte

—— en bas ——
  Rechercher   ⌘K
  Réglages
  (une ligne d'état : « Réception du site : ouverte »)
```

### Aujourd'hui — l'écran d'ouverture

**Règle d'admission, écrite une fois pour toutes.** Une ligne n'y entre que si elle attend un geste de Florent, si elle mène à un seul écran où ce geste se fait, et si elle disparaît quand le geste est fait. Pas de compteur, pas d'information « pour savoir ». Quand rien n'attend, l'écran le dit.

Trois blocs :
1. **Les séances du jour** — heure, personne, type ; toucher ouvre la séance et ses notes. Pour un entretien préalable, la ligne dit aussi **d'où vient la personne** (« Google Ads · mot-clé : hypnose arrêt tabac ») : c'est ce que Florent veut savoir en commençant l'échange. Le soir, le lendemain matin s'y ajoute. (L'Agenda n'a donc pas de vue « Jour » : ce serait la même liste à deux endroits.)
2. **À traiter** — chaque ligne dit le geste, l'objet, et l'échéance quand il y en a une. **Première version, limitée à ce que la base sait déjà** : notes non écrites d'une séance passée ; séance passée encore « prévue » ; questionnaire à relire avant une séance ; séance ou inscription « à rapprocher » ; alerte ouverte. Les autres sortes (paiement à encaisser, message en échec, place retenue qui expire) entrent chacune avec la phase qui les rend réelles.
3. **Une ligne d'état**, toujours présente et discrète : « Réception du site : ouverte », avec le geste pour la couper. Coupée, elle passe en tête de l'écran.

**Tant que la base des clients n'est pas reliée** (la production, jusqu'à la phase S4), la console s'ouvre sur Contenus, comme aujourd'hui.

### Pratique

- **Agenda** (ex-Séances). Semaine et Mois. **Les dates d'exception se font sur le calendrier** : sélectionner un jour ou une plage, « Fermer ces jours » ou « Ouvrir ce jour » ; les jours fermés se voient dans les deux vues. « Poser un rendez-vous » est l'action principale. Demain : la liste d'attente et les créneaux libérés y vivront aussi.
- **Clients.** La recherche a le focus à l'ouverture ; « Nouvelle fiche » est l'action principale (l'écran de l'entretien de 20 minutes). La provenance (origine, mot-clé Google Ads) est en tête de la fiche et de la séance d'entretien, pas dans une carte repliée. La fiche reste le centre : séances, inscriptions, questionnaires, notes, et « Poser un rendez-vous » avec la personne déjà choisie.
- **Paiements.** Ce qui reste à encaisser — séances réalisées non payées, inscriptions à un stage non réglées —, du plus ancien au plus récent, avec le geste « Marquer payé ». L'état de paiement d'une séance existe déjà en base ; la liste ne fait que le rassembler. Quand Stripe et Stancer arriveront, les paiements en ligne s'y marqueront seuls.
- **Stages** (ex-Évènements). Même contenu. « Stages » est le mot du site.
- **Professionnels.** Inchangé (« Réseau » se lirait « réseaux sociaux » à deux lignes de l'éditorial).
- **Psychédéliques.** En dernier dans Pratique : un outil personnel, d'usage ponctuel.

### Éditorial

- **Contenus.** Inchangé. Il quitte l'ouverture et la première place.
- **Corpus.** État · Documents · **À ranger** (ex-Inbox) · Carte. **Les rôles IA** (ex-Réglages → Personas) rejoignent la Carte, qui répond déjà à « que reçoit le modèle ? » : la Carte montre le chemin, un rôle montre ce qu'il reçoit en entier.

### Les actions de partout

| Action | Sur le Mac | Sur l'iPhone |
| :--- | :--- | :--- |
| Rechercher | ⌘K, en bas de la barre : aller à un écran, lancer une action, trouver une personne ou un contenu. **La recherche reste dans le métier où l'on est** : depuis l'éditorial, elle ne montre aucune personne. Aucune « recherche récente » gardée par le navigateur. | en haut d'Agenda et de Clients |
| Poser un rendez-vous | Agenda, fiche, ⌘K | Agenda, fiche |
| Nouvelle fiche | Clients, ⌘K | Clients |
| Noter une idée | Contenus, ⌘K | le bouton « + » de la barre du bas |

### Réglages

```
PRATIQUE
  Réception du site        ouverte / coupée, avec la liste de ce qui s'arrête ;
                           ce qui a été reçu ce jour ; limites de sécurité (repliées)
  Types de rendez-vous     durée, marge, montant, fenêtre, en ligne ou non
  Horaires habituels       la semaine type (ex-Réservation)
  Règles                   rappels, retenue d'une place, liste d'attente
  Messages                 les modèles d'e-mail et de SMS (quand ils arrivent)

RÉDACTION IA
  Modèles                  le catalogue, par fournisseur
  Modèle par usage         ex-« Modèles par famille »
  Coûts et durées          ex-« Mesures »
  Clés des fournisseurs

DONNÉES ET FONCTIONNEMENT
  État                     base des clients reliée ou non ; envois à Make ; journal des incidents (lecture seule)
  Hébergement              ex-« Quotas Cloudflare »
  Export éditorial         ex-« Sauvegarde » (le nom dit ce qu'il contient)
```

- **« Réception du site »** remplace « Porte publique » : le nom dit ce qui s'arrête, et la confirmation le liste (réservations, questionnaires de santé, inscriptions, paiements). Pour une seule date, c'est l'Agenda ; pour tout couper, c'est ici ou depuis la ligne d'état.
- **Les limites de sécurité** (questionnaires acceptés par jour, e-mails confiés à Make, garde des reçus, relances) sont des réglages chiffrés : elles vont sous Réception du site, repliées. État reste en lecture.
- **Un incident se lit là où il a une conséquence** : l'envoi d'un rappel sur la séance, celui d'une confirmation sur l'inscription ; l'échec dans À traiter ; le journal complet dans État.
- **Les liens d'essai** (recette seulement) restent sous Réception du site, et disparaissent quand la fiche de séance saura les fabriquer.

### Sur l'iPhone

Une barre en bas : **Aujourd'hui · Agenda · + · Clients · Plus**. Le « + » central ouvre trois gestes : Noter une idée, Nouvelle fiche, Poser un rendez-vous. Plus ouvre le reste, avec les libellés. C'est l'usage du §15.1 : consulter une fiche, compléter un texte oublié.

### Une fonction à venir : l'enregistrement de l'entretien

Demandée par Florent le 27/11/2026. Aujourd'hui, il fait transcrire l'audio de l'entretien de 20 minutes (Whisper Transcription), puis demande un résumé à Claude, qu'il recopie dans les notes de la séance. Demain : **déposer le fichier audio sur la séance**, et gestion transcrit, résume et range le résumé dans les notes.

- **Sa place** : sur l'écran d'une séance, au-dessus des notes, un geste « Déposer l'enregistrement » (glisser le fichier sur le Mac, choisir un fichier sur l'iPhone). Le résumé arrive **dans les notes, comme une proposition** à garder, retoucher ou effacer — jamais écrit par-dessus ce que Florent a tapé. La transcription complète se lit, repliée, sous les notes. Pendant le traitement, la séance le dit ; Aujourd'hui → À traiter porte « Résumé prêt à relire » quand il est fait.
- **Ce qu'elle demande avant d'exister** : une décision écrite. La SPEC interdit aujourd'hui que les données sensibles passent par l'IA (§14.2, règle 3), et un entretien est une donnée de santé. Il faudra choisir le fournisseur de transcription et de résumé (hébergement européen, contrat de traitement, pas de conservation ni d'entraînement), dire ce que devient le fichier audio (effacé après transcription ?), et recueillir l'accord de la personne pour l'enregistrement. C'est une phase à part, avec son chapitre de SPEC.
- **Choix de Florent (27/11/2026, 22 h 15)** : la transcription d'abord (un outil de reconnaissance vocale, pas un grand modèle) ; puis le nom, le prénom, le téléphone, l'e-mail et l'adresse sont retirés de la transcription avant qu'un modèle la résume. Il ne demandera pas d'accord formel. Réserves notées pour la phase : le texte sans identifiants reste une donnée de santé (le récit identifie souvent la personne), donc fournisseurs européens sans conservation ni entraînement, transcription locale si possible ; et une information de la personne (une phrase dans la confirmation ou en début d'appel) reste recommandée au regard de l'article 226-1 du Code pénal et du RGPD — à faire vérifier. **Décidé par Florent à 22 h 17** : une phrase d'information sera ajoutée à l'e-mail de confirmation de l'entretien préalable.

### Ce qui n'a pas de place, volontairement

- **La publicité.** Florent l'analyse avec Claude, qui interroge Google Ads par le serveur MCP de gestion. La console n'en a pas d'écran ; elle montre seulement, à l'entretien et sur la fiche, si la personne vient d'une annonce et par quel mot-clé.

### Correspondance de l'existant

| Aujourd'hui | Devient |
| :--- | :--- |
| Contenus (1er, ouverture) | Éditorial → Contenus |
| Clients | Pratique → Clients |
| Séances | Pratique → Agenda |
| Évènements | Pratique → Stages |
| Professionnels | Pratique → Professionnels |
| — (l'état de paiement, séance par séance) | Pratique → Paiements |
| Psychédéliques | Pratique → Psychédéliques |
| Corpus (Inbox) | Éditorial → Corpus (À ranger) |
| Réglages → Personas | Corpus → Carte |
| Réglages → Modèles IA, Modèles par famille, Mesures, Clés | Réglages → Rédaction IA |
| Réglages → Quotas Cloudflare : quotas | Réglages → Données et fonctionnement → Hébergement |
| Réglages → Quotas Cloudflare : Base des clients | Réglages → Données et fonctionnement → État |
| Réglages → Quotas Cloudflare : Porte publique | Réglages → Pratique → Réception du site, et la ligne d'état |
| Réglages → Réservation : types | Réglages → Pratique → Types de rendez-vous |
| Réglages → Réservation : semaine type | Réglages → Pratique → Horaires habituels |
| Réglages → Réservation : dates d'exception | Agenda, sur le calendrier |
| Réglages → Réservation : rappels, retenue, liste d'attente | Réglages → Pratique → Règles |
| Réglages → Réservation : garde-fous techniques | Réglages → Pratique → Réception du site (limites, repliées) |
| Réglages → Sauvegarde | Réglages → Données et fonctionnement → Export éditorial |
| — | Aujourd'hui ; Rechercher (⌘K) ; la ligne d'état |
| — (Whisper + Claude, hors console) | Séance → Déposer l'enregistrement (phase à venir) |

Toutes les adresses actuelles gardent une redirection.

---

## 4. Réponses de Florent (27/11/2026, 22 h)

1. L'écran du Mac n'est pas visible de la personne pendant une séance : l'accueil peut afficher des noms, sans geste pour le masquer.
2. « Stages », le terme du site.
3. Le calculateur sert de temps en temps, pour lui ; sa place en fin de Pratique lui convient.
4. Il note des idées de contenu depuis l'iPhone : « Noter une idée » a sa place directe sur le téléphone.
5. Il veut suivre dans la console ce qui reste à encaisser : d'où l'entrée Paiements.
6. Publicité : à l'entretien de 20 minutes, il veut savoir si la personne vient d'un mot-clé, et lequel. L'analyse des campagnes se fait avec Claude par le serveur MCP.
