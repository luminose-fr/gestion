/**
 * Le jeu de VOLUME de la recette (demande de Florent du 28/11/2026) : 1 000
 * personnes accompagnées, une à huit séances chacune, et 200 professionnels —
 * de quoi voir la console chargée, avec des données réalistes et FICTIVES.
 *
 *   npm run essai -w workers/api -- --recette --volume
 *   npm run essai -w workers/api -- --local --volume
 *
 * Mêmes garanties que le jeu d'essai (donnees.ts) : des identités fictives
 * (adresses en `@example.org`, téléphones de la plage `+33 6 39 98 …`), des
 * identifiants préfixés `essai-vol-`, rien qui lise l'horloge — un tirage
 * pseudo-aléatoire à graine fixe : deux chargements à la même date écrivent le
 * même contenu. `charger.ts` refuse toute base qui n'est ni locale ni la recette.
 *
 * **Un agenda plausible.** Florent reçoit en semaine, sur cinq plages par jour
 * (9 h, 11 h, 14 h, 16 h, 18 h — deux heures, le plus long rendez-vous, marge
 * comprise). Chaque plage ne sert qu'une fois :
 * aucune séance ne se chevauche. La première séance d'une personne est souvent
 * l'entretien préalable (offert) ; les suivantes, des séances. Le passé
 * remonte sur quatre ans ; l'avenir ne commence qu'à J+15, pour laisser libres
 * les créneaux du jeu d'essai de la semaine prochaine.
 */
import { cleClient, nomRecherche, normaliserEmail, normaliserNom } from '@luminose/pratique';
import { aParis, GABARITS, lireDate, TYPES, type CleType, type JeuDEssai } from './donnees.ts';

type Ligne = Record<string, string | number | null>;

const MINUTE = 60_000;
const JOUR = 24 * 60 * MINUTE;

export const VOLUME = { clients: 1000, professionnels: 200, seancesMin: 1, seancesMax: 8 } as const;

/** Un tirage reproductible (mulberry32) : la même graine donne la même suite. */
const tirage = (graine: number) => () => {
  graine |= 0; graine = (graine + 0x6D2B79F5) | 0;
  let t = Math.imul(graine ^ (graine >>> 15), 1 | graine);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const PRENOMS_F = ['Camille', 'Léa', 'Manon', 'Chloé', 'Sarah', 'Julie', 'Pauline', 'Marie', 'Laura', 'Émilie', 'Claire', 'Anaïs', 'Inès', 'Lucie', 'Mathilde', 'Céline', 'Nathalie', 'Sophie', 'Isabelle', 'Valérie', 'Aurélie', 'Élodie', 'Marion', 'Charlotte', 'Hélène', 'Agnès', 'Nadia', 'Fatima', 'Sandrine', 'Christine'];
const PRENOMS_M = ['Thomas', 'Nicolas', 'Julien', 'Maxime', 'Antoine', 'Pierre', 'Alexandre', 'Kevin', 'Romain', 'Mathieu', 'Florian', 'Guillaume', 'Hugo', 'Lucas', 'Louis', 'Benoît', 'Sébastien', 'Olivier', 'Laurent', 'Philippe', 'Marc', 'Yann', 'Karim', 'Mehdi', 'Jérôme', 'Damien', 'Arnaud', 'François', 'Christophe', 'Bruno'];
const NOMS = ['Martin', 'Bernard', 'Dubois', 'Thomas', 'Robert', 'Richard', 'Petit', 'Durand', 'Leroy', 'Moreau', 'Simon', 'Laurent', 'Lefebvre', 'Michel', 'Garcia', 'David', 'Bertrand', 'Roux', 'Vincent', 'Fournier', 'Morel', 'Girard', 'André', 'Mercier', 'Dupont', 'Lambert', 'Bonnet', 'François', 'Martinez', 'Legrand', 'Garnier', 'Faure', 'Rousseau', 'Blanc', 'Guerin', 'Muller', 'Henry', 'Roussel', 'Nicolas', 'Perrin', 'Morin', 'Mathieu', 'Clément', 'Gauthier', 'Dumont', 'Lopez', 'Fontaine', 'Chevalier', 'Robin', 'Masson', 'Sanchez', 'Gérard', 'Nguyen', 'Boyer', 'Denis', 'Lemaire', 'Duval', 'Joly', 'Gautier', 'Roger', 'Roche', 'Roy', 'Noel', 'Meyer', 'Lucas', 'Meunier', 'Jean', 'Perez', 'Marchand', 'Dufour', 'Blanchard', 'Marie', 'Barbier', 'Brun', 'Dumas', 'Brunet', 'Schmitt', 'Leroux', 'Colin', 'Fernandez', 'Pierre', 'Renard', 'Arnaud', 'Rolland', 'Caron', 'Aubert', 'Giraud', 'Leclerc', 'Vidal', 'Bourgeois', 'Renaud', 'Lemoine', 'Picard', 'Gaillard', 'Philippe', 'Leclercq', 'Lacroix', 'Fabre', 'Dupuis', 'Olivier'];
const VILLES = [
  ['Villefranche-de-Lauragais', '31290'], ['Toulouse', '31000'], ['Castanet-Tolosan', '31320'], ['Revel', '31250'],
  ['Castelnaudary', '11400'], ['Baziège', '31450'], ['Ayguesvives', '31450'], ['Montgiscard', '31450'],
  ['Labège', '31670'], ['Ramonville-Saint-Agne', '31520'], ['Nailloux', '31560'], ['Caraman', '31460'],
  ['Escalquens', '31750'], ['Saint-Orens-de-Gameville', '31650'], ['Avignonet-Lauragais', '31290'], ['Muret', '31600'],
] as const;
const PROFESSIONS = ['Infirmière', 'Enseignante', 'Comptable', 'Agriculteur', 'Commercial', 'Ingénieur', 'Aide-soignante', 'Retraité', 'Étudiante', 'Artisan', 'Cadre', 'Chef de projet', 'Assistante', 'Éducateur', 'Pharmacienne', 'Développeur', 'Vendeuse', 'Chauffeur', null, null];
const ORIGINES = ['Publicité - Google', 'Publicité - Google', 'Publicité - Google', 'Internet', 'Internet', 'Bouche à oreilles', 'Bouche à oreilles', 'Professionnel de santé', 'Doctolib', 'Flyer', 'Salon bien-être', 'Plaque signalétique'];
const MOTS_CLES = ['hypnose arrêt tabac', 'hypnose toulouse', 'hypnose stress', 'hypnothérapeute lauragais', 'breathwork toulouse', 'respiration holotropique', 'hypnose sommeil', 'hypnose phobie', 'hypnose confiance en soi', 'hypnose perte de poids'];
const CATEGORIES = ['Médecin généraliste', 'Psychologue', 'Psychiatre', 'Kinésithérapeute', 'Ostéopathe', 'Sage-femme', 'Infirmière', 'Sophrologue', 'Naturopathe', 'Diététicienne', 'Orthophoniste', 'Acupuncteur', 'Pharmacie', 'Centre médical', 'Psychomotricienne'];
const SPECIALISATIONS = ['Douleur chronique', 'Périnatalité', 'Addictions', 'Troubles du sommeil', 'Enfants et adolescents', 'Gestion du stress', 'Oncologie', 'Sport', null, null, null];
const COURRIERS = ['Mai 2025', 'Octobre 2025', 'Janvier 2026', 'Septembre 2026'];

/** Les cinq plages d'une journée de semaine, à l'heure de Paris. */
const PLAGES = ['09:00', '11:00', '14:00', '16:00', '18:00'];

export const jeuDeVolume = (dateReference: string): JeuDEssai => {
  const jour = lireDate(dateReference);
  const maintenant = aParis(jour, '12:00');
  const t = { created_at: maintenant, updated_at: maintenant };
  const hasard = tirage(20261128);
  const un = <T,>(liste: readonly T[]): T => liste[Math.floor(hasard() * liste.length)];
  const entre = (min: number, max: number) => min + Math.floor(hasard() * (max - min + 1));
  const pc = (n: number) => hasard() < n / 100;
  const num = (i: number, chiffres = 4) => String(i).padStart(chiffres, '0');
  // Une plage du téléphone fictif par ligne : +33 6 39 98 xx xx.
  const telephone = (i: number) => `+33 6 39 98 ${num(Math.floor(i / 100) % 100, 2)} ${num(i % 100, 2)}`;

  // ─── Les professionnels ────────────────────────────────────────────────
  const professionnels: Ligne[] = [];
  for (let i = 1; i <= VOLUME.professionnels; i++) {
    const [ville, cp] = un(VILLES);
    const titre = pc(50) ? 'Dr' : '';
    const nom = `${titre ? 'Dr ' : ''}${un([...PRENOMS_F, ...PRENOMS_M])} ${un(NOMS)}`;
    const categories = [un(CATEGORIES), ...(pc(20) ? [un(CATEGORIES)] : [])];
    professionnels.push({
      id: `essai-vol-pro-${num(i, 3)}`, nom, categories: JSON.stringify([...new Set(categories)]),
      specialisation: un(SPECIALISATIONS), adresse: `${entre(1, 120)} rue de l’Essai`, code_postal: cp, ville,
      telephone: telephone(9000 + i), email: pc(70) ? `pro${num(i, 3)}@example.org` : null,
      site_web: pc(40) ? `https://example.org/pro${num(i, 3)}` : null, note: pc(30) ? 'Note d’essai.' : null,
      connu: pc(30) ? 1 : 0, courriers: JSON.stringify(pc(60) ? COURRIERS.slice(0, entre(1, COURRIERS.length)) : []),
      ...t, deleted_at: null,
    });
  }

  // ─── Les plages libres, passées et à venir ─────────────────────────────
  // Le passé : quatre ans de semaines ; l'avenir : de J+15 à J+60.
  const plages = (du: number, au: number) => {
    const liste: number[] = [];
    for (let j = du; j <= au; j += JOUR) {
      const jourSemaine = new Date(j).getUTCDay();
      if (jourSemaine === 0 || jourSemaine === 6) continue;
      for (const h of PLAGES) liste.push(aParis(j, h));
    }
    return liste;
  };
  const passees = plages(jour - 4 * 365 * JOUR, jour - JOUR);
  const avenir = plages(jour + 15 * JOUR, jour + 60 * JOUR);
  /** Prend une plage au hasard dans la fenêtre [de, a] d'une liste triée, et la retire. */
  const prendre = (liste: number[], de: number, a: number): number | null => {
    const candidates: number[] = [];
    for (let i = 0; i < liste.length; i++) if (liste[i] >= de && liste[i] <= a) candidates.push(i);
    if (!candidates.length) return null;
    const i = candidates[Math.floor(hasard() * candidates.length)];
    return liste.splice(i, 1)[0];
  };

  // ─── Les personnes et leurs séances ────────────────────────────────────
  const clients: Ligne[] = [];
  const seances: Ligne[] = [];
  const mouvements: Ligne[] = [];
  const notes: Ligne[] = [];
  for (let i = 1; i <= VOLUME.clients; i++) {
    const femme = pc(65);
    const prenom = normaliserNom(un(femme ? PRENOMS_F : PRENOMS_M));
    const nom = normaliserNom(un(NOMS));
    const email = pc(92) ? normaliserEmail(`${prenom}.${nom}.${num(i)}@example.org`.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9.@-]/g, '')) : null;
    const [ville, cp] = un(VILLES);
    const origine = un(ORIGINES);
    const id = `essai-vol-client-${num(i)}`;
    clients.push({
      id, civilite: femme ? 'Mme' : 'M.', prenom, nom, nom_recherche: nomRecherche(prenom, nom),
      cle_client: cleClient(email, prenom, nom), email, telephone: telephone(i),
      date_naissance: `${entre(1950, 2008)}-${num(entre(1, 12), 2)}-${num(entre(1, 28), 2)}`,
      profession: un(PROFESSIONS), adresse: pc(70) ? `${entre(1, 200)} chemin de l’Essai` : null,
      code_postal: cp, ville, pays: 'FR', origine,
      mot_cle_google_ads: origine === 'Publicité - Google' ? un(MOTS_CLES) : null, clic_annonce: null, clic_date: null,
      via_professionnel_id: origine === 'Professionnel de santé' ? `essai-vol-pro-${num(entre(1, VOLUME.professionnels), 3)}` : null,
      via_client_id: null, couple_client_id: null, stancer_customer_id: null, qonto_client_id: null,
      brevo_ajoute_le: null, compta_wlu_ajoute_le: null, ...t,
    });

    // Une à huit séances. Un parcours : il commence quelque part dans les
    // quatre ans, et s'étale sur des semaines ; 12 % des personnes ont encore
    // une séance à venir.
    const n = entre(VOLUME.seancesMin, VOLUME.seancesMax);
    const aVenir = pc(12);
    const debutParcours = jour - entre(20, 4 * 365) * JOUR;
    let curseur = debutParcours;
    for (let k = 1; k <= n; k++) {
      const derniere = k === n;
      const futur = derniere && aVenir;
      const cle: CleType = k === 1 && pc(60) ? 'rencontre'
        : pc(8) ? 'seance_breathwork' : pc(6) ? 'seance_distance' : 'seance';
      const debut = futur
        ? prendre(avenir, jour + 15 * JOUR, jour + 60 * JOUR)
        : prendre(passees, curseur, Math.min(curseur + 30 * JOUR, jour - JOUR));
      if (debut === null) break;
      curseur = debut + entre(7, 28) * JOUR;
      const g = GABARITS[cle];
      const recente = debut > jour - 45 * JOUR;
      const statut = futur ? 'prevue' : pc(5) ? 'annulee' : pc(3) ? 'absent' : 'realisee';
      const paiement = statut === 'prevue' ? g.etat
        : g.montant === 0 ? 'offerte'
          : statut === 'annulee' ? 'annulee'
            : statut === 'absent' ? (pc(50) ? 'payee' : 'a_payer')
              : recente && pc(15) ? 'a_payer' : 'payee';
      const sid = `${id}-s${k}`;
      seances.push({
        id: sid, client_id: id, type_seance_id: TYPES[cle], identite_recue: null, debut, duree_min: g.duree,
        occupe_jusqua: debut + (g.duree + g.marge) * MINUTE, revision: 0, statut, etat_paiement: paiement,
        montant_centimes: g.montant, mode: g.mode, visio_url: null, agenda_evenement_id: null, agenda_etat: 'a_ecrire',
        liens_version: 1, liste_attente: 0, conditions_acceptees_le: null, conditions_version: null, questionnaire_id: null,
        origine: pc(40) ? 'site' : 'console', clic_annonce: null,
        provenance: cle === 'rencontre' && origine === 'Publicité - Google'
          ? JSON.stringify({ clic: { type: 'gclid', id: `essai-${num(i)}`, date: new Date(debut).toISOString().slice(0, 10) } }) : null,
        conversion_importee_le: null, conversion_retiree_le: null, libelle_importe: null, ...t,
      });
      mouvements.push({
        id: `${sid}-creee`, seance_id: sid, nature: 'creee', par: 'florent', ancien_debut: null, nouveau_debut: debut, revision: 0, ...t,
      });
      // Les notes d'une séance réalisée : presque toujours écrites, et jamais
      // plus qu'une phrase d'essai. Celles des quinze derniers jours manquent
      // parfois, pour qu'Aujourd'hui ait de quoi montrer « Écrire les notes ».
      if (statut === 'realisee' && (debut < jour - 15 * JOUR ? pc(95) : pc(60))) {
        notes.push({ id: `${sid}-notes`, seance_id: sid, seance: '## Séance\n\nNotes d’essai — texte fictif.', ...t });
      }
    }
  }

  return [
    { table: 'professionnels', lignes: professionnels },
    { table: 'clients', lignes: clients },
    { table: 'seances', lignes: seances },
    { table: 'seances_mouvements', lignes: mouvements },
    { table: 'seances_notes', lignes: notes },
  ];
};
