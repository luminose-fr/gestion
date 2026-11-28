# Refonte de la console — le plan, lot par lot

*Rédigé le 28/11/2026 par Claude Code, après lecture de `01` à `04`, des maquettes et de l'existant
(`apps/manager`, `DESIGN.md`, SPEC §13 à §15). Réponse au §1 de `04-passation-code.md` : « propose ton
plan lot par lot ».*

## Le principe

- **Un lot = une branche, testée en recette, puis fusionnée** avant le lot suivant. Rien n'est remplacé
  d'un bloc.
- **Les données et les règles ne bougent pas.** Les routes existantes servent telles quelles ; un lot
  n'ajoute une route que si l'écran l'exige (Aujourd'hui, Rapprocher, Questionnaire), et la dit.
- **`DESIGN.md` change avec le lot 1** : ses échelles deviennent celles de `tokens.css`, et ses commandes
  de fin vérifient les nouvelles. Tant qu'un écran n'est pas refait, il reste conforme à l'ancienne
  échelle : les deux coexistent, et le dernier lot retire l'ancienne.
- **Chaque lot se recette** comme le dit le §10 de `04` : les deux thèmes, 1440, 1100 et 390 px, le
  clavier, les états de la planche, aucune liste qui montre une note, un questionnaire ou la personne
  de confiance.

## Les lots

| Lot | Contenu | Ce qui change à l'écran | Routes nouvelles |
| :--- | :--- | :--- | :--- |
| **1. Socle** | `tokens.css` dans le thème Tailwind (jetons sémantiques : `fond`, `surface`, `bas`, `texte`, `second`, `marque`, sens et fonds teintés) ; thème sombre par `[data-theme]` **et** préférence système ; Figtree et Fraunces **servies par la console** (pas d'appel à Google Fonts) ; composants : bouton (plein, bordé, souligné × 32, 40, 44), champ, pastille (signe + libellé), carte, onglets, section repliable, fenêtre, témoin d'enregistrement ; une page « Composants » en recette, calquée sur `Composants.dc.html` ; `DESIGN.md` réécrit | rien, sauf la page Composants | aucune |
| **2. Cadre** | barre latérale à libellés, deux groupes, repliable ; en bas : Rechercher (le raccourci seulement), Réglages, ligne d'état « Réception du site » (l'interrupteur existant) ; iPhone : barre du bas, « + », « Plus » ; règle du second niveau (onglets en haut, liste dans l'écran au-delà de quatre) ; renommages Séances → Agenda, Évènements → Stages, avec redirections. Les écrans existants s'y logent, recolorés par les nouveaux jetons | toute la navigation | aucune |
| **3. Aujourd'hui** | les séances du jour (et du lendemain le soir), À traiter, la ligne d'état ; ouverture dessus si la base est reliée, sinon Contenus | nouvel écran | `GET /api/aujourdhui` : une lecture groupée, bornée |
| **4. Séance et rendez-vous** | les trois moments (avant, entretien, après), « Terminer la séance » en trois étapes, « Poser le suivant » ; une seule fenêtre pour poser et déplacer, créneaux libres visibles, le chevauchement refusé dit avec qui | Séance, Rendez-vous | le motif d'un chevauchement (qui) |
| **5. Agenda** | Semaine et Mois, jours fermés visibles, créneaux libres par jour, « Fermer des jours… » (les dates d'exception quittent Réglages) | Agenda | créneaux libres d'une période, côté console |
| **6. Clients** | liste (focus dans la recherche), nouvelle fiche, fiche (provenance en tête) | Clients | aucune |
| **7. Rechercher (⌘K)** | écrans, actions, personnes depuis la pratique seulement ; rien de gardé | partout | recherche des personnes (existe en partie) |
| **8. Priorité 2** | Questionnaire (relire, à revoir), Rattacher, Paiements (à encaisser, encaissés), Stages | quatre écrans | lire un questionnaire et le marquer relu ; rattacher ; liste des paiements |
| **9. Priorité 3** | habillage de l'éditorial, Corpus (À ranger, rôles IA dans la Carte), Professionnels, Réglages réordonnés, Psychédéliques ; retrait de l'ancienne échelle | le reste | aucune |

## Ce qui précède le lot 2

La branche `claude/reservation-site-r1` (réservation depuis le site, agenda Google, messages, menu
mobile corrigé) n'est pas encore dans `main`, et touche la barre latérale et Réglages. **Elle doit être
fusionnée avant le lot 2**, sans quoi le cadre se refait sur un code qui va changer. Le lot 1 ne touche
à rien de ce qu'elle modifie : il peut partir de `main` dès maintenant.

## Ce que je tranche, sauf avis contraire

- **Polices servies par la console**, pas par Google Fonts : aucune requête vers un tiers à
  l'ouverture, et rien à déclarer.
- **Le thème** suit le système par défaut ; un réglage permet de le forcer (clair, sombre, système).
- **iPhone sans maquette** (Stages, Professionnels, Corpus, Réglages, Psychédéliques, contenu ouvert) :
  les mêmes composants sur une colonne ; je montre Stages avant de généraliser (§8.5 de `04`).
- **Couleurs du LSD et de la MDMA** : celles de l'existant (§8.3).
- **Calendly et l'agenda Google** : l'agenda Google est déjà écrit par gestion en recette ; les
  mentions « fermez aussi dans Calendly » ne restent que là où Calendly sert encore (§8.6).

## Ce qui attend une décision de Florent

1. **La semaine de l'agenda** (§8.1) : colonnes de cartes, comme la maquette, ou grille horaire ?
   Nécessaire au lot 5.
2. **Le vocabulaire des contenus** (§8.2) : « en cabinet » dans ses scripts. N'arrête aucun lot.
3. **Paiements** (correction 24 de `02`) : une absence y entre-t-elle ? Nécessaire au lot 8.
4. **Le paiement d'une inscription** (correction 4 de `02`) : état distinct ou « Payée » posable depuis
   la console. Nécessaire au lot 8.
