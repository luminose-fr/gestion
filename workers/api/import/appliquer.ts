/**
 * Appliquer — le fichier SQL à une base LOCALE, rangée dans le dossier privé,
 * et à elle seule (SPEC §14.9.1, tâche 5).
 *
 * **Le mode local est écrit en dur.** Il n'existe ni option ni variable pour
 * viser une base distante : le nom et l'identifiant d'une base sont les mêmes
 * en local et à distance, ils ne protègent de rien. Les arguments de wrangler
 * se composent ici, en un seul endroit, et un test vérifie qu'aucun chemin n'y
 * glisse `--remote`.
 *
 * **Tout, ou rien.** `wrangler d1 execute --local --file` joue le fichier dans
 * une transaction : une erreur au milieu laisse la base telle qu'elle était
 * (constaté sur la VM le 27/11/2026, et vérifié par un test quand wrangler est
 * là). Aucun appel réseau : la télémétrie de wrangler est coupée.
 */
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { cheminPrive, dossierPrive } from './prive.ts';
import { TABLES, type Ligne, type Table } from './transformer.ts';
import { baseVisee, lireConfiguration, DOSSIER_API } from '../essai/cible.ts';

/** Le sous-dossier de la base locale, dans le dossier privé. */
export const SOUS_DOSSIER_BASE = 'base';

/**
 * Les arguments qui visent la base : la section `[env.local]` de wrangler.toml
 * (identifiants fictifs), `--local`, et le dossier privé. Rien d'autre.
 */
export const argsLocaux = (dossier: string): string[] =>
  ['--env', 'local', '--local', '--persist-to', join(dossierPrive(dossier), SOUS_DOSSIER_BASE)];

/** L'environnement de wrangler : sans télémétrie, sans vérification de mise à jour, sans jeton de compte. */
export const environnementSansReseau = (): NodeJS.ProcessEnv => {
  const env: NodeJS.ProcessEnv = { ...process.env, WRANGLER_SEND_METRICS: 'false', NO_UPDATE_NOTIFIER: '1', CI: '1' };
  delete env.CLOUDFLARE_API_TOKEN;
  delete env.CLOUDFLARE_ACCOUNT_ID;
  return env;
};

export type Executer = (args: string[]) => { ok: boolean; sortie: string };

/** wrangler, depuis workers/api, sans réseau. */
export const wranglerLocal: Executer = (args) => {
  if (args.includes('--remote')) throw new Error('Refusé : l’import ne vise jamais une base distante.');
  const r = spawnSync('npx', ['wrangler', ...args], { cwd: DOSSIER_API, encoding: 'utf8', env: environnementSansReseau() });
  return { ok: r.status === 0, sortie: `${r.stdout ?? ''}${r.stderr ?? ''}` };
};

/** La base visée est la base locale de wrangler.toml, avec ses identifiants fictifs — vérifié avant d'écrire. */
const verifierCible = () => baseVisee(lireConfiguration(), 'local');

/** Les migrations, puis le fichier : en une transaction. Lève si wrangler échoue. */
export const appliquer = (dossier: string, nomFichier: string, executer: Executer = wranglerLocal) => {
  verifierCible();
  const args = argsLocaux(dossier);
  const migrations = executer(['d1', 'migrations', 'apply', 'CLIENTS', ...args]);
  if (!migrations.ok) throw new Error('Les migrations de la base locale ont échoué. Rien n’a été importé.');
  const r = executer(['d1', 'execute', 'CLIENTS', ...args, '--file', cheminPrive(dossier, nomFichier), '--yes']);
  // La sortie de wrangler peut citer l'instruction fautive, donc des valeurs : elle n'est pas recopiée.
  if (!r.ok) throw new Error('L’application a échoué : la base locale est restée telle qu’elle était. Relancer après correction.');
};

/** Les lignes d'une table de la base locale, telles que wrangler les rend. */
export const lireTable = (dossier: string, table: Table, executer: Executer = wranglerLocal): Ligne[] => {
  const r = executer(['d1', 'execute', 'CLIENTS', ...argsLocaux(dossier), '--command', `SELECT * FROM ${table}`, '--json']);
  if (!r.ok) throw new Error(`Lecture de ${table} impossible dans la base locale.`);
  const debut = r.sortie.indexOf('[');
  return (JSON.parse(r.sortie.slice(debut))[0]?.results ?? []) as Ligne[];
};

export const lireBase = (dossier: string, executer: Executer = wranglerLocal): Record<Table, Ligne[]> =>
  Object.fromEntries(TABLES.map((t) => [t, lireTable(dossier, t, executer)])) as Record<Table, Ligne[]>;
