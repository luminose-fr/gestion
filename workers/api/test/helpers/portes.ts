/**
 * De quoi exercer les portes dans un test — identités fictives seulement.
 * Les tests sont hors du contrôle de la règle 3 : ils nomment les tables
 * sensibles.
 */
import { TestD1, MIGRATIONS_CLIENTS } from './d1';
import { signerJeton } from '../../src/clients/jetons';
import { MAINTENANT, HEURE, TYPES, LUNDI_9H30, MINUTE } from './clients';

export const SECRET = 'secret-des-portes-de-test';

/** Un environnement avec la base des clients et le secret des portes. */
export const envPortes = (extra: Record<string, unknown> = {}) => {
  const base = new TestD1(MIGRATIONS_CLIENTS);
  // Le texte de l'accord, factice, comme le jeu d'essai le pose.
  (base as any).db.exec(`INSERT INTO textes_versions (id, cle, version, texte, en_vigueur_le, created_at, updated_at)
    VALUES ('t1', 'accord_conservation', 1, 'Texte d''essai de l''accord.', 0, 0, 0)`);
  const env = { CLIENTS: base as unknown as D1Database, PORTES_SECRET: SECRET, ...extra } as any;
  return { env, base };
};

export const executer = (base: TestD1, sql: string) => (base as any).db.exec(sql);

/** Une fiche fictive. */
export const ficheEssai = (base: TestD1, id: string, champs: Record<string, string | null> = {}) => {
  const ligne = { prenom: 'Émilie', nom: 'Martin', nom_recherche: 'emilie martin', email: 'emilie.martin@example.org', ...champs };
  const cols = Object.keys(ligne);
  base.query(`INSERT INTO clients (id, ${cols.join(', ')}, created_at, updated_at) VALUES (?, ${cols.map(() => '?').join(', ')}, 0, 0)`,
    id, ...Object.values(ligne));
};

/** Une séance prévue, pour une fiche ou sans. */
export const seanceEssai = (base: TestD1, id: string, clientId: string | null, debut = LUNDI_9H30) =>
  base.query(`INSERT INTO seances (id, client_id, type_seance_id, debut, duree_min, occupe_jusqua, statut, etat_paiement, origine, created_at, updated_at)
    VALUES (?, ?, ?, ?, 90, ?, 'prevue', 'a_payer', 'console', 0, 0)`, id, clientId, TYPES.seance, debut, debut + 90 * MINUTE);

/** Le jeton du lien de questionnaire d'une séance. */
export const jetonDe = (seanceId: string, options: { version?: number; echeance?: number } = {}) =>
  signerJeton({ PORTES_SECRET: SECRET }, {
    usage: 'questionnaire', objet: seanceId, echeance: options.echeance ?? MAINTENANT + 72 * HEURE, version: options.version ?? 1,
  });

let compteur = 0;
/** Une clé d'envoi neuve. */
export const nouvelleCle = () => `cle-essai-${String(++compteur).padStart(8, '0')}-xyz`;

/** Un questionnaire complet fictif. */
export const envoiComplet = (champs: Record<string, unknown> = {}) => ({
  cle: nouvelleCle(),
  contexte: 'seance',
  version: 'complet',
  version_formulaire: '2026-12',
  identite: { prenom: 'Émilie', nom: 'Martin', email: 'emilie.martin@example.org', telephone: '+33 6 39 98 00 01' },
  coordonnees: { civilite: 'Mme', date_naissance: '1988-04-12', profession: 'Profession d’essai', adresse: '1 rue de l’Exemple', code_postal: '31000', ville: 'Toulouse' },
  confiance: { civilite: 'M.', prenom: 'Paul', nom: 'Martin', telephone: '+33 6 39 98 00 09', email: null },
  reponses: [
    { cle: 'sante.cardio', libelle: 'Question d’essai 1', reponse: 'non' },
    { cle: 'sante.autre', libelle: 'Question d’essai 2', reponse: 'Oui' },
  ],
  informations: '',
  declaration: true,
  accord: { accepte: true, version: 1 },
  ...champs,
});

/** Un suivi fictif : sans coordonnées ni personne de confiance. */
export const envoiSuivi = (champs: Record<string, unknown> = {}) => {
  const { coordonnees: _c, confiance: _p, ...reste } = envoiComplet({ version: 'suivi', ...champs });
  return reste;
};

/** Compte les instructions préparées sur une base, sans en changer le comportement. */
export const espionner = (base: D1Database) => {
  const preparees: string[] = [];
  const prepare = base.prepare.bind(base);
  (base as any).prepare = (sql: string) => { preparees.push(sql); return prepare(sql); };
  return preparees;
};
