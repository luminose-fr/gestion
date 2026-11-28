/**
 * Les types de la console des clients (SPEC §15.3), tels que les routes les
 * rendent. Une date avec heure voyage avec son décalage
 * (`2026-12-17T09:30:00+01:00`) ; une date sans heure, `AAAA-MM-JJ` ; un
 * montant, en centimes.
 *
 * Rien de ce qui est typé ici n'est gardé par le navigateur (§15.2, règle 5).
 */

export type StatutSeance = 'prevue' | 'realisee' | 'annulee' | 'absent';
export type EtatPaiement = 'a_payer' | 'attente_especes' | 'payee' | 'offerte' | 'annulee';
export type ModeSeance = 'sur_place' | 'visio' | 'appel';
export type StatutInscription = 'retenue' | 'payee' | 'confirmee' | 'expiree' | 'annulee' | 'deconseillee';
export type LieuType = 'sur_place' | 'visio' | 'visio_ou_appel';

/** Une personne liée : par sa fiche, ou par ce qu'elle a envoyé (« à rapprocher », `clientId` vide). */
export type PersonneVue = { clientId: string | null; prenom: string | null; nom: string | null };
export type FicheLiee = { id: string; prenom: string; nom: string };
export type TypeVu = { id: string; cle: string; libelle: string };

export type LigneFiche = {
  id: string; prenom: string; nom: string; ville: string | null;
  nbSeances: number; derniereSeance: string | null; prochaineSeance: string | null;
};
export type PageFiches = { fiches: LigneFiche[]; page: number; suite: boolean };
export type FicheSemblable = { id: string; prenom: string; nom: string; ville: string | null };

/** Ce qu'une création ou une modification de fiche accepte, et rien d'autre (§15.3). */
export type ChampsFiche = Partial<{
  civilite: string | null; prenom: string; nom: string | null; email: string | null; telephone: string | null;
  dateNaissance: string | null; profession: string | null; adresse: string | null; codePostal: string | null;
  ville: string | null; pays: string | null; origine: string | null; motCleGoogleAds: string | null;
  viaProfessionnelId: string | null; viaClientId: string | null; coupleClientId: string | null;
}>;

export type SeanceDeFiche = {
  id: string; numero: number | null; debut: string; dureeMin: number; type: TypeVu | null; libelleImporte: string | null;
  statut: StatutSeance; etatPaiement: EtatPaiement; montantCentimes: number; mode: ModeSeance | null;
};
export type InscriptionDeFiche = {
  id: string; statut: StatutInscription; modePaiement: 'carte' | 'virement' | null; retenueJusqua: string | null;
  montantCentimes: number | null; evenement: { id: string; nom: string; debut: string };
};
/** D'un questionnaire, la fiche ne dit que de quoi le retrouver (§15.2, règle 4). */
export type QuestionnaireDeFiche = { id: string; date: string; version: 'complet' | 'suivi' | null; relu: boolean; aRevoir: boolean };

export type Fiche = {
  id: string; civilite: string | null; prenom: string; nom: string; email: string | null; telephone: string | null;
  dateNaissance: string | null; age: number | null; profession: string | null; adresse: string | null;
  codePostal: string | null; ville: string | null; pays: string | null; origine: string | null; motCleGoogleAds: string | null;
  viaProfessionnel: { id: string; nom: string } | null; viaClient: FicheLiee | null; couple: FicheLiee | null;
  aRecommande: FicheLiee[]; creeeLe: string; modifieeLe: string;
  seances: SeanceDeFiche[]; inscriptions: InscriptionDeFiche[];
  /** Nommée ainsi parce que le pluriel du mot est réservé à `sensible.ts` (§14.2, règle 3). */
  listeQuestionnaires: QuestionnaireDeFiche[];
};

/** `version` : la date de la dernière écriture, ou `null` pour une note qui n'existe pas. Elle se renvoie telle quelle. */
export type NoteFiche = { texte: string; version: number | null };
export type Confiance = {
  civilite: string | null; prenom: string | null; nom: string | null; telephone: string | null; email: string | null;
  misAJourLe: string | null;
};

export type Seance = {
  id: string; debut: string; fin: string; occupeJusqua: string; dureeMin: number; revision: number;
  statut: StatutSeance; etatPaiement: EtatPaiement; montantCentimes: number; mode: ModeSeance | null;
  listeAttente: boolean; agendaEtat: 'a_ecrire' | 'ecrit' | 'echec'; origine: 'site' | 'console' | 'import';
  type: TypeVu | null; libelleImporte: string | null; personne: PersonneVue;
};
export type MouvementSeance = {
  id: string; nature: 'creee' | 'deplacee' | 'annulee' | 'retablie'; par: 'florent' | 'personne' | 'import';
  ancienDebut: string | null; nouveauDebut: string | null; revision: number; le: string;
};
export type SeanceDetaillee = Seance & {
  creeeLe: string; mouvements: MouvementSeance[];
  /** Refonte, lot 4 : ce qui change l'écran selon le moment. */
  nature?: 'rencontre' | 'seance' | null;
  provenance?: string | null;
  questionnaire?: 'relu' | 'non_relu' | 'pas_recu' | null;
  /** La dernière séance réalisée de la même personne. */
  precedente?: { id: string; debut: string } | null;
  questionnaireId?: string | null;
};

/**
 * Une séance vue d'Aujourd'hui (refonte, lot 3) : l'état d'une note et d'un
 * questionnaire, jamais leur contenu ; la provenance pour un entretien seulement.
 */
export type SeanceDuJour = Seance & {
  nature: 'rencontre' | 'seance' | null;
  provenance: string | null;
  questionnaire: 'relu' | 'non_relu' | 'pas_recu' | null;
  /** `null` quand la lecture ne le dit pas (la prochaine séance, À traiter). */
  notesEcrites: boolean | null;
  questionnaireId: string | null;
};
/** Un jour de l'Agenda (refonte, lot 5). `libres` : les créneaux de séance libres dans les horaires. */
export type JourAgenda = { date: string; ferme: 'exception' | 'habitude' | null; exception: boolean; libres: number | null };
export type ATraiter = { sorte: 'clore' | 'notes' | 'questionnaire' | 'rattacher'; seance: SeanceDuJour };

/** Un questionnaire de santé, sur son écran seulement (refonte, lot 8). */
export type QuestionnaireSante = {
  id: string; recuLe: string; contexte: string; version: 'complet' | 'suivi' | null;
  clientId: string | null; seanceId: string | null; evenementId: string | null;
  personne: { prenom: string | null; nom: string | null };
  questions: { cle: string; libelle: string; reponse: string; aRegarder: boolean }[];
  informations: string;
  reluLe: string | null; aRevoir: boolean; aRapprocher: boolean;
};
export type Aujourdhui = {
  maintenant: string;
  jour: string;
  /** Le soir : la date du lendemain, dont la matinée s'ajoute à la journée. */
  lendemainMatin: string | null;
  journee: SeanceDuJour[];
  prochaine: SeanceDuJour | null;
  aTraiter: ATraiter[];
};

/** Les notes d'une séance : un seul texte Markdown (retour de Florent du 27/11/2026). */
export type NotesSeance = {
  texte: string | null;
  version: number | null;
  importNotion: string | null;
  reponses: { rang: number; question: string; reponse: string }[];
};

export type PoseRendezVous = {
  clientId: string; typeSeanceId: string; debut: string; dureeMin?: number; mode?: ModeSeance; montantCentimes?: number;
};
export type ModificationSeance = Partial<{
  statut: 'realisee' | 'absent'; etatPaiement: EtatPaiement; montantCentimes: number; mode: ModeSeance | null;
  listeAttente: boolean; typeSeanceId: string | null; dureeMin: number;
}>;

export type Evenement = {
  id: string; nom: string; type: string | null; debut: string; fin: string | null; ville: string | null;
  placesTotales: number | null; placesOccupees: number; placesLibres: number | null; prixCentimes: number | null;
  questionnaireRequis: boolean; urlInscription: string | null; publie: boolean;
};
export type InscriptionVue = {
  id: string; statut: StatutInscription; modePaiement: 'carte' | 'virement' | null; retenueJusqua: string | null;
  montantCentimes: number | null; origine: 'site' | 'console' | 'import'; le: string; personne: PersonneVue;
  /** Le paiement réussi, s'il y en a un (refonte, lot 8). */
  paiement?: { moyen: 'stancer' | 'stripe' | 'virement' | 'especes'; le: string | null } | null;
};
/** Une inscription à encaisser, sur l'écran Paiements. */
export type InscriptionAEncaisser = {
  id: string; statut: StatutInscription; modePaiement: 'carte' | 'virement' | null; retenueJusqua: string | null;
  montantCentimes: number; stage: { id: string; nom: string; debut: string }; personne: PersonneVue;
};
export type EvenementDetaille = Evenement & {
  metaDescription: string | null; htmlPermalink: string | null; htmlProgramme: string | null; htmlPrix: string | null;
  htmlLieuAdresse: string | null; htmlLieuInstructions: string | null; inscriptions: InscriptionVue[];
};
export type ChampsEvenement = Partial<{
  nom: string; type: string | null; debut: string; fin: string | null; ville: string | null;
  placesTotales: number | null; prixCentimes: number | null; questionnaireRequis: boolean; urlInscription: string | null;
  metaDescription: string | null; htmlPermalink: string | null; htmlProgramme: string | null; htmlPrix: string | null;
  htmlLieuAdresse: string | null; htmlLieuInstructions: string | null;
}>;

export type Professionnel = {
  id: string; nom: string; categories: string[]; specialisation: string | null; adresse: string | null;
  codePostal: string | null; ville: string | null; telephone: string | null; email: string | null; siteWeb: string | null;
  note: string | null; connu: boolean; courriers: string[]; personnesRecues: number; modifieLe: string;
};
export type ChampsProfessionnel = Partial<Omit<Professionnel, 'id' | 'personnesRecues' | 'modifieLe'>>;

export type TypeReservation = {
  id: string; cle: string; libelle: string; nature: 'rencontre' | 'seance'; dureeMin: number; margeApresMin: number;
  pasMin: number; lieu: LieuType; montantCentimes: number; etatPaiementDefaut: EtatPaiement;
  questionnaireRequis: boolean; conditionsAnnulation: boolean; listeAttenteProposee: boolean;
  fenetreDebutH: number; fenetreFinH: number; reservableEnLigne: boolean; actif: boolean; ordre: number;
};
export type PlageHoraire = { debut: string; fin: string };
export type Reservation = {
  types: TypeReservation[];
  semaine: ({ id: string; jour: number } & PlageHoraire)[];
  /** Une date fermée a une liste vide. */
  dates: { date: string; plages: PlageHoraire[] }[];
  reglages: Record<string, number>;
};
export type ChampsType = Partial<Pick<TypeReservation,
  'libelle' | 'dureeMin' | 'margeApresMin' | 'pasMin' | 'lieu' | 'montantCentimes' | 'fenetreDebutH' | 'fenetreFinH' | 'reservableEnLigne' | 'actif' | 'ordre'>>;
