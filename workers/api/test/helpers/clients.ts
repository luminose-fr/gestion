/**
 * De quoi peupler la base des clients dans un test — identités fictives
 * seulement. Les tests sont hors du contrôle de la règle 3 : ils peuvent nommer
 * les tables sensibles.
 */
import { TestD1, MIGRATIONS_CLIENTS } from './d1';

export const MINUTE = 60_000;
export const HEURE = 60 * MINUTE;
/** Un lundi, 9 h 30 à Paris (8 h 30 UTC) : une date fixe, pour des tests qui ne vieillissent pas. */
export const LUNDI_9H30 = Date.UTC(2027, 0, 11, 8, 30);
export const MAINTENANT = Date.UTC(2026, 11, 1, 10, 0);

/** Les identifiants des types de départ (0002_reference.sql). */
export const TYPES = {
  rencontre: '9941effe-66b6-487a-81a0-b0bf833c17fb',
  seance: '4e7e5b6f-2217-4567-b227-14f2ecbc33b9',
  breathwork: '96477be8-8460-4874-bc12-723ca512f586',
} as const;

export const baseClients = () => new TestD1(MIGRATIONS_CLIENTS);

export const ajouterClient = (db: TestD1, id: string, prenom: string, nom: string, email: string | null = null) =>
  db.prepare(`INSERT INTO clients (id, prenom, nom, nom_recherche, email, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, 0, 0)`).bind(id, prenom, nom, `${prenom} ${nom}`.toLowerCase(), email).run();

export const ajouterEvenement = (db: TestD1, id: string, places: number, prix = 5000) =>
  db.prepare(`INSERT INTO evenements (id, nom, type, debut, places_totales, prix_centimes, created_at, updated_at)
              VALUES (?, 'Journée d''essai', 'meditation', ?, ?, ?, 0, 0)`).bind(id, LUNDI_9H30, places, prix).run();

export const compter = (db: TestD1, table: string, where = '1 = 1', ...params: unknown[]): number =>
  Number(db.query(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`, ...params)[0].n);
