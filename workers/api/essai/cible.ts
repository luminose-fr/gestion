/**
 * La base que le jeu d'essai va écrire, vérifiée AVANT d'écrire (SPEC §14.8).
 *
 * Deux cibles, et aucune autre : la base locale du poste, ou
 * `luminose-clients-recette`. Le nom ET l'identifiant sont lus dans la
 * configuration résolue de wrangler.toml (scripts/configuration.ts) — pas dans
 * une variable d'environnement, qu'un `export` oublié dans un terminal suffirait
 * à fausser. Il n'existe aucun moyen de forcer une autre cible : c'est voulu.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { resoudre, ecartsRecette, RECETTE } from '../scripts/configuration.ts';

export type Cible = 'local' | 'recette';

/** Les identifiants FICTIFS de la base locale (wrangler.toml, [env.local]) : jamais une base distante. */
export const LOCAL = { nom: 'luminose-clients-local', id: '00000000-0000-4000-8000-000000000002' } as const;

export const DOSSIER_API = join(import.meta.dirname, '..');

export const lireCible = (args: string[]): Cible => {
  const local = args.includes('--local');
  const recette = args.includes('--recette');
  if (local === recette) {
    throw new Error('Préciser la cible, et une seule : --local ou --recette. Aucune autre base ne s’écrit d’ici.');
  }
  return local ? 'local' : 'recette';
};

/** Le nom et l'identifiant de la base des clients de la cible, ou une erreur qui dit pourquoi non. */
export const baseVisee = (source: string, cible: Cible): { nom: string; id: string } => {
  const r = resoudre(source, cible);
  const base = r.d1.find((b) => b.binding === 'CLIENTS');
  if (!base) throw new Error(`[env.${cible}] ne déclare pas CLIENTS.`);
  const idsProduction = resoudre(source, null).d1.map((b) => b.databaseId);
  if (idsProduction.includes(base.databaseId)) throw new Error('CLIENTS porte l’identifiant d’une base de la production : refusé.');
  if (cible === 'local') {
    if (base.databaseName !== LOCAL.nom || base.databaseId !== LOCAL.id) {
      throw new Error(`La base locale attendue est ${LOCAL.nom} (${LOCAL.id}) ; wrangler.toml déclare ${base.databaseName} (${base.databaseId}).`);
    }
  } else {
    if (base.databaseName !== RECETTE.clients) {
      throw new Error(`La base de recette attendue est ${RECETTE.clients} ; wrangler.toml déclare ${base.databaseName}.`);
    }
    const ecarts = ecartsRecette(source);
    if (ecarts.length > 0) throw new Error(`[env.recette] n’est pas conforme :\n  ${ecarts.join('\n  ')}`);
  }
  return { nom: base.databaseName, id: base.databaseId };
};

export const lireConfiguration = () => readFileSync(join(DOSSIER_API, 'wrangler.toml'), 'utf8');

/** wrangler, depuis workers/api : la sortie est rendue, l'issue aussi. */
export const wrangler = (args: string[]) => {
  const r = spawnSync('npx', ['wrangler', ...args], { cwd: DOSSIER_API, encoding: 'utf8' });
  return { ok: r.status === 0, sortie: `${r.stdout ?? ''}${r.stderr ?? ''}` };
};

/**
 * En recette, la base doit exister SUR LE COMPTE, sous ce nom et cet
 * identifiant à la fois. C'est aussi ce qui prouve que wrangler est connecté au
 * compte de Luminose et pas à un autre.
 */
export const verifierSurLeCompte = (base: { nom: string; id: string }) => {
  const r = spawnSync('npx', ['wrangler', 'd1', 'list', '--json'], { cwd: DOSSIER_API, encoding: 'utf8' });
  let bases: { uuid?: string; name?: string }[] = [];
  try { bases = JSON.parse(r.stdout); } catch { /* le message ci-dessous suffit */ }
  if (!bases.some((b) => b.uuid === base.id && b.name === base.nom)) {
    throw new Error(`La base ${base.nom} (${base.id}) n’est pas visible sur ce compte. Sur la VM : source ~/.cf-luminose.`);
  }
};

/** Les options de wrangler qui visent la cible : la section, et local ou distant. */
export const optionsCible = (cible: Cible) => ['--env', cible, cible === 'local' ? '--local' : '--remote'];
