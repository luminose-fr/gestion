/**
 * Des réponses fictives des routes des clients (SPEC §15.3), pour monter les
 * écrans sans Worker. Identités du jeu d'essai, en `@example.org`.
 */
import { vi } from 'vitest';
import * as Clients from '../../services/clientsService';
import { ErreurClients } from '../../services/clientsService';
import type { Fiche, Seance, SeanceDetaillee, NotesSeance, Reservation } from '../../types-clients';

export const SEANCE: Seance = {
  id: 'seance-1', debut: '2027-01-11T09:30:00+01:00', fin: '2027-01-11T11:00:00+01:00', occupeJusqua: '2027-01-11T11:00:00+01:00',
  dureeMin: 90, revision: 0, statut: 'prevue', etatPaiement: 'a_payer', montantCentimes: 8000, mode: 'sur_place',
  listeAttente: false, agendaEtat: 'a_ecrire', origine: 'console',
  type: { id: 'type-seance', cle: 'seance', libelle: 'Séance' }, libelleImporte: null,
  personne: { clientId: 'fiche-1', prenom: 'Émilie', nom: 'Martin' },
};

export const FICHE: Fiche = {
  id: 'fiche-1', civilite: 'Mme', prenom: 'Émilie', nom: 'Martin', email: 'emilie.martin@example.org', telephone: '+33 6 39 98 00 01',
  dateNaissance: '1988-04-12', age: 38, profession: null, adresse: null, codePostal: null, ville: 'Ville d’essai', pays: 'FR',
  origine: 'Internet', motCleGoogleAds: null, viaProfessionnel: null, viaClient: null, couple: null, aRecommande: [],
  creeeLe: '2026-11-01T10:00:00+01:00', modifieeLe: '2026-11-01T10:00:00+01:00',
  seances: [{ id: 'seance-1', numero: 1, debut: SEANCE.debut, dureeMin: 90, type: SEANCE.type, libelleImporte: null, statut: 'prevue', etatPaiement: 'a_payer', montantCentimes: 8000, mode: 'sur_place' }],
  inscriptions: [], listeQuestionnaires: [{ id: 'q-1', date: '2026-11-02T10:00:00+01:00', version: 'complet', relu: false, aRevoir: true }],
};

export const SEANCE_DETAILLEE: SeanceDetaillee = {
  ...SEANCE, creeeLe: '2026-11-01T10:00:00+01:00',
  mouvements: [{ id: 'm1', nature: 'creee', par: 'florent', ancienDebut: null, nouveauDebut: SEANCE.debut, revision: 0, le: '2026-11-01T10:00:00+01:00' }],
};

export const NOTES: NotesSeance = {
  texte: '## Séance\n\nTexte d’essai\n\n## Réponse SMS\n\nTexte d’essai — SMS',
  version: 1795777200000, importNotion: null, reponses: [],
};

export const RESERVATION: Reservation = {
  types: [{ id: 'type-seance', cle: 'seance', libelle: 'Séance', nature: 'seance', dureeMin: 90, margeApresMin: 0, pasMin: 90, lieu: 'sur_place',
    montantCentimes: 8000, etatPaiementDefaut: 'a_payer', questionnaireRequis: false, conditionsAnnulation: true, listeAttenteProposee: true,
    fenetreDebutH: 504, fenetreFinH: 4392, reservableEnLigne: true, actif: true, ordre: 3 }],
  semaine: [], dates: [], reglages: {},
};

export const NON_RELIEE = new ErreurClients("La base des clients n'est pas reliée à cet environnement.", 409);

/** Toutes les lectures, chargées. */
export const routesChargees = () => {
  vi.spyOn(Clients, 'rechercherFiches').mockResolvedValue({ fiches: [{ id: 'fiche-1', prenom: 'Émilie', nom: 'Martin', ville: 'Ville d’essai', nbSeances: 1, derniereSeance: null, prochaineSeance: SEANCE.debut }], page: 0, suite: false });
  vi.spyOn(Clients, 'fichesSemblables').mockResolvedValue({ fiches: [] });
  vi.spyOn(Clients, 'lireFiche').mockResolvedValue(FICHE);
  vi.spyOn(Clients, 'lireConfiance').mockResolvedValue({ confiance: null });
  vi.spyOn(Clients, 'lireNoteFiche').mockResolvedValue({ texte: 'Texte d’essai', version: 1 });
  vi.spyOn(Clients, 'listeProfessionnels').mockResolvedValue({ professionnels: [] });
  vi.spyOn(Clients, 'lireSeance').mockResolvedValue(SEANCE_DETAILLEE);
  vi.spyOn(Clients, 'lireNotesSeance').mockResolvedValue(NOTES);
  vi.spyOn(Clients, 'seancesDeLaPeriode').mockResolvedValue({ seances: [SEANCE] });
  vi.spyOn(Clients, 'disponibilites').mockResolvedValue({ jours: [], agendaLu: true });
  // Les heures libres de la fenêtre des rendez-vous (retours du 28/11, §5) : deux, le lundi 11 janvier.
  vi.spyOn(Clients, 'creneauxLibres').mockResolvedValue({ creneaux: ['2027-01-11T09:30:00+01:00', '2027-01-11T14:00:00+01:00'], agendaLu: true });
  vi.spyOn(Clients, 'lireReservation').mockResolvedValue(RESERVATION);
  vi.spyOn(Clients, 'listeEvenements').mockResolvedValue({ evenements: [] });
};

/** Toutes les lectures répondent « base non reliée ». */
export const routesNonReliees = () => {
  for (const nom of ['rechercherFiches', 'fichesSemblables', 'lireFiche', 'lireConfiance', 'lireNoteFiche', 'listeProfessionnels',
    'lireSeance', 'lireNotesSeance', 'seancesDeLaPeriode', 'disponibilites', 'lireReservation', 'listeEvenements'] as const) {
    vi.spyOn(Clients, nom).mockRejectedValue(NON_RELIEE);
  }
};

import type { EvenementDetaille, Professionnel } from '../../types-clients';

export const EVENEMENT: EvenementDetaille = {
  id: 'ev-1', nom: 'Journée d’essai — complète', type: 'respiration-holotropique', debut: '2027-01-16T10:00:00+01:00', fin: '2027-01-16T17:00:00+01:00',
  ville: 'Ville d’essai', placesTotales: 2, placesOccupees: 2, placesLibres: 0, prixCentimes: 9000, questionnaireRequis: true,
  urlInscription: null, publie: false, metaDescription: null, htmlPermalink: null, htmlProgramme: null, htmlPrix: null,
  htmlLieuAdresse: null, htmlLieuInstructions: null,
  inscriptions: [{ id: 'ins-1', statut: 'confirmee', modePaiement: null, retenueJusqua: null, montantCentimes: 9000, origine: 'console', le: '2026-11-01T10:00:00+01:00', personne: { clientId: 'fiche-1', prenom: 'Émilie', nom: 'Martin' } }],
};

export const PROFESSIONNEL: Professionnel = {
  id: 'pro-1', nom: 'Cabinet d’essai', categories: ['Médecin généraliste'], specialisation: null, adresse: null, codePostal: null,
  ville: 'Ville d’essai', telephone: '+33 6 39 98 00 90', email: 'cabinet@example.org', siteWeb: null, note: null, connu: true,
  courriers: ['Mai 2025'], personnesRecues: 1, modifieLe: '2026-11-01T10:00:00+01:00',
};

export const routesChargeesC2b = () => {
  routesChargees();
  const { inscriptions: _, metaDescription: __, htmlPermalink: ___, htmlProgramme: ____, htmlPrix: _____, htmlLieuAdresse: ______, htmlLieuInstructions: _______, ...liste } = EVENEMENT;
  vi.spyOn(Clients, 'listeEvenements').mockResolvedValue({ evenements: [liste] });
  vi.spyOn(Clients, 'lireEvenement').mockResolvedValue(EVENEMENT);
  vi.spyOn(Clients, 'listeProfessionnels').mockResolvedValue({ professionnels: [PROFESSIONNEL] });
  vi.spyOn(Clients, 'lireReservation').mockResolvedValue({ ...RESERVATION, semaine: [{ id: 'h1', jour: 1, debut: '09:30', fin: '11:30' }], reglages: { liste_attente_personnes_max: 8 } });
};
