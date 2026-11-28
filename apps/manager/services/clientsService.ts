/**
 * Les routes de la console des clients (SPEC §15.3) : une fonction par route.
 *
 * **Ni cache, ni stockage** (§15.2, règle 5) : rien de ce qui passe ici n'est
 * écrit dans `localStorage`, `sessionStorage`, IndexedDB ni un cache de
 * service. L'état vit dans la mémoire de la page, chez l'écran qui l'a demandé.
 *
 * Un refus arrive en `ErreurClients` : son statut, et le message de la route
 * (`error`), qu'un écran affiche tel quel — « Ce créneau chevauche un autre
 * rendez-vous. », « Cette note a été modifiée ailleurs… ». Un 409 sur une note
 * se reconnaît à son statut : l'écran garde le texte saisi.
 *
 * Une recherche de personne part dans le corps d'un `POST`, jamais dans une
 * adresse (§15.2, règle 3).
 */
import { WORKER_URL } from '../constants';
import { getSessionToken } from '../auth';
import type {
  PageFiches, FicheSemblable, ChampsFiche, Fiche, NoteFiche, Confiance,
  Seance, SeanceDetaillee, NotesSeance, PoseRendezVous, ModificationSeance,
  Evenement, EvenementDetaille, ChampsEvenement, Professionnel, ChampsProfessionnel,
  Reservation, ChampsType, PlageHoraire, Aujourdhui,
} from '../types-clients';

/** Un refus ou une panne d'une route des clients. `champs` : les champs en défaut d'une entrée invalide. */
export class ErreurClients extends Error {
  constructor(message: string, readonly statut: number, readonly champs: string[] = []) {
    super(message);
    this.name = 'ErreurClients';
  }
  /** La base des clients n'est pas reliée à cet environnement. */
  get nonReliee(): boolean { return this.statut === 409 && /n'est pas reliée/.test(this.message); }
}

const appel = async <T>(chemin: string, methode = 'GET', corps?: unknown): Promise<T> => {
  const res = await fetch(`${WORKER_URL}/api${chemin}`, {
    method: methode,
    credentials: 'same-origin',
    cache: 'no-store',
    signal: AbortSignal.timeout(30_000),
    headers: { 'Content-Type': 'application/json', 'X-Session-Token': getSessionToken() ?? '' },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  });
  const texte = await res.text();
  let donnees: any = null;
  try { donnees = texte ? JSON.parse(texte) : null; } catch { /* réponse non-JSON */ }
  if (!res.ok) throw new ErreurClients(donnees?.error ?? `Erreur ${res.status}`, res.status, donnees?.champs ?? []);
  return donnees as T;
};

const id = (valeur: string) => encodeURIComponent(valeur);

// ── Les fiches ───────────────────────────────────────────────────────────

export const rechercherFiches = (q: string, page = 0) => appel<PageFiches>('/clients/recherche', 'POST', { q, page });
export const fichesSemblables = (saisie: { prenom: string; nom: string; email: string }) =>
  appel<{ fiches: FicheSemblable[] }>('/clients/semblables', 'POST', saisie);
export const creerFiche = (champs: ChampsFiche & { prenom: string }) => appel<{ id: string }>('/clients', 'POST', champs);
export const lireFiche = (ficheId: string) => appel<Fiche>(`/clients/${id(ficheId)}`);
export const modifierFiche = (ficheId: string, champs: ChampsFiche) => appel<{ id: string }>(`/clients/${id(ficheId)}`, 'PATCH', champs);
export const lireNoteFiche = (ficheId: string) => appel<NoteFiche>(`/clients/${id(ficheId)}/notes`);
/** `version` : celle reçue à la lecture. Un 409 dit que la note a changé ailleurs. */
export const ecrireNoteFiche = (ficheId: string, texte: string, version: number | null) =>
  appel<{ version: number }>(`/clients/${id(ficheId)}/notes`, 'PUT', { texte, version });
export const lireConfiance = (ficheId: string) => appel<{ confiance: Confiance | null }>(`/clients/${id(ficheId)}/confiance`);
export const ecrireConfiance = (ficheId: string, confiance: Omit<Confiance, 'misAJourLe'>) =>
  appel<{ id: string }>(`/clients/${id(ficheId)}/confiance`, 'PUT', confiance);

// ── Les séances ──────────────────────────────────────────────────────────

/** `du`, `au` : `AAAA-MM-JJ`, 62 jours au plus. Des dates, pas des personnes : elles vont dans l'adresse. */
export const seancesDeLaPeriode = (du: string, au: string) =>
  appel<{ seances: Seance[] }>(`/seances?du=${encodeURIComponent(du)}&au=${encodeURIComponent(au)}`);
export const lireSeance = (seanceId: string) => appel<SeanceDetaillee>(`/seances/${id(seanceId)}`);
/** L'écran Aujourd'hui : la journée, la prochaine séance, À traiter — une lecture. */
export const lireAujourdhui = () => appel<Aujourdhui>('/seances/aujourdhui');
export const lireNotesSeance = (seanceId: string) => appel<NotesSeance>(`/seances/${id(seanceId)}/notes`);
export const ecrireNotesSeance = (seanceId: string, texte: string | null, version: number | null) =>
  appel<{ version: number }>(`/seances/${id(seanceId)}/notes`, 'PUT', { texte, version });
export const poserRendezVous = (pose: PoseRendezVous) => appel<{ id: string }>('/seances', 'POST', pose);
export const deplacerSeance = (seanceId: string, debut: string, revision: number) =>
  appel<{ id: string }>(`/seances/${id(seanceId)}/deplacer`, 'POST', { debut, revision });
/** `fait: false` : la séance n'était plus prévue — rien n'a changé. */
export const annulerSeance = (seanceId: string) => appel<{ id: string; fait: boolean }>(`/seances/${id(seanceId)}/annuler`, 'POST');
export const remettreAPrevue = (seanceId: string) => appel<{ id: string }>(`/seances/${id(seanceId)}/prevoir`, 'POST');
export const modifierSeance = (seanceId: string, champs: ModificationSeance) =>
  appel<{ id: string }>(`/seances/${id(seanceId)}`, 'PATCH', champs);

// ── Les évènements et les inscriptions ───────────────────────────────────

export const listeEvenements = () => appel<{ evenements: Evenement[] }>('/evenements');
export const lireEvenement = (evenementId: string) => appel<EvenementDetaille>(`/evenements/${id(evenementId)}`);
export const creerEvenement = (champs: ChampsEvenement & { nom: string; debut: string }) => appel<{ id: string }>('/evenements', 'POST', champs);
export const modifierEvenement = (evenementId: string, champs: ChampsEvenement) =>
  appel<{ id: string }>(`/evenements/${id(evenementId)}`, 'PATCH', champs);
export const supprimerEvenement = (evenementId: string) => appel<{ id: string }>(`/evenements/${id(evenementId)}`, 'DELETE');
export const inscrire = (evenementId: string, clientId: string) =>
  appel<{ id: string }>(`/evenements/${id(evenementId)}/inscriptions`, 'POST', { clientId });
export const changerStatutInscription = (inscriptionId: string, statut: 'annulee' | 'deconseillee' | 'confirmee') =>
  appel<{ id: string }>(`/inscriptions/${id(inscriptionId)}`, 'PATCH', { statut });

// ── Les professionnels ───────────────────────────────────────────────────

export const listeProfessionnels = () => appel<{ professionnels: Professionnel[] }>('/professionnels');
export const creerProfessionnel = (champs: ChampsProfessionnel & { nom: string }) => appel<{ id: string }>('/professionnels', 'POST', champs);
export const modifierProfessionnel = (proId: string, champs: ChampsProfessionnel) =>
  appel<{ id: string }>(`/professionnels/${id(proId)}`, 'PATCH', champs);
export const supprimerProfessionnel = (proId: string) => appel<{ id: string }>(`/professionnels/${id(proId)}`, 'DELETE');

// ── Les réglages de la réservation ───────────────────────────────────────

export const lireReservation = () => appel<Reservation>('/reservation');
export const modifierType = (typeId: string, champs: ChampsType) => appel<{ id: string }>(`/reservation/types/${id(typeId)}`, 'PATCH', champs);
export const remplacerSemaine = (plages: ({ jour: number } & PlageHoraire)[]) =>
  appel<{ plages: number }>('/reservation/semaine', 'PUT', { plages });
/** Une liste vide ferme la journée. */
export const poserDate = (date: string, plages: PlageHoraire[]) =>
  appel<{ date: string; fermee: boolean }>(`/reservation/dates/${encodeURIComponent(date)}`, 'PUT', { plages });
export const rendreDateALaSemaine = (date: string) => appel<{ date: string }>(`/reservation/dates/${encodeURIComponent(date)}`, 'DELETE');
export const modifierReglages = (valeurs: Record<string, number>) => appel<{ reglages: number }>('/reservation/reglages', 'PATCH', valeurs);

// ── L'agenda Google (SPEC §14.12) ────────────────────────────────────────

export type EtatAgenda = { clientPose: boolean; relie: boolean; compte: string | null };
export const lireAgenda = () => appel<EtatAgenda>('/agenda');
export const poserClientAgenda = (clientId: string, clientSecret: string) => appel<EtatAgenda>('/agenda/client', 'PUT', { clientId, clientSecret });
export type AgendaGoogle = { id: string; nom: string; principal: boolean; ecriture: boolean };
export type ChoixAgendas = { agendas: AgendaGoogle[]; lecture: string[]; ecriture: string };
export const lireAgendas = () => appel<ChoixAgendas>('/agenda/agendas');
export const choisirAgendas = (lecture: string[], ecriture: string) => appel<{ lecture: string[]; ecriture: string }>('/agenda/agendas', 'PUT', { lecture, ecriture });
export const oublierAgenda = () => appel<{ relie: false }>('/agenda', 'DELETE');
/** Une navigation, pas un appel : Google affiche sa page d'autorisation, puis revient. */
export const adresseConnexionAgenda = () => `${WORKER_URL}/api/agenda/connexion`;

