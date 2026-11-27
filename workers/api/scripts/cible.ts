#!/usr/bin/env node
/**
 * La cible résolue d'un déploiement de recette, pour scripts/deploy.sh.
 *
 *   node workers/api/scripts/cible.ts recette          # l'api (workers/api/wrangler.toml)
 *   node workers/api/scripts/cible.ts recette porte    # la porte (workers/porte/wrangler.toml)
 *
 * Écrit sur la sortie des affectations shell (`CLE='valeur'`) que deploy.sh
 * évalue ; écrit les écarts sur la sortie d'erreur, et sort en 2 s'il y en a.
 * Ne touche à rien : il lit wrangler.toml, c'est tout. Le compte Cloudflare,
 * lui, est vérifié par deploy.sh, qui seul appelle wrangler.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resoudre, ecartsRecette, ecartsPorteRecette, RECETTE, PORTE_RECETTE } from './configuration.ts';

const [environnement, worker = 'api'] = process.argv.slice(2);
if (environnement !== 'recette') {
  console.error(`cible.ts : seule la recette se résout ici (reçu « ${environnement ?? ''} »).`);
  process.exit(1);
}
const citer = (v: string) => `'${v.replace(/'/g, `'\\''`)}'`;

// `node workers/api/scripts/cible.ts recette porte` : la porte de recette
// (workers/porte/wrangler.toml). À part de celle de l'api : un écart de la porte
// ne doit pas pouvoir arrêter un déploiement qui ne la vise pas.
if (worker === 'porte') {
  const source = readFileSync(join(import.meta.dirname, '..', '..', 'porte', 'wrangler.toml'), 'utf8');
  const r = resoudre(source, 'recette');
  const valeurs: Record<string, string> = {
    CIBLE_PORTE_WORKER: r.name,
    CIBLE_PORTE_DOMAINE: PORTE_RECETTE.domaine,
    CIBLE_PORTE_ESSAI: PORTE_RECETTE.domaineEssai,
    CIBLE_PORTE_SERVICES: r.services.map((s) => `${s.binding} → ${s.service}#${s.entrypoint ?? ''}`).join(', '),
  };
  for (const [cle, v] of Object.entries(valeurs)) console.log(`${cle}=${citer(v)}`);
  const ecarts = ecartsPorteRecette(source);
  for (const e of ecarts) console.error(e);
  process.exit(ecarts.length > 0 ? 2 : 0);
}
if (worker !== 'api') {
  console.error(`cible.ts : Worker « ${worker} » inconnu (api, porte).`);
  process.exit(1);
}

const source = readFileSync(join(import.meta.dirname, '..', 'wrangler.toml'), 'utf8');
const r = resoudre(source, 'recette');
const base = (binding: string) => r.d1.find((b) => b.binding === binding);

const valeurs: Record<string, string> = {
  CIBLE_WORKER: r.name,
  CIBLE_DOMAINE: RECETTE.domaine,
  CIBLE_PAGES_PROJET: RECETTE.pagesProjet,
  CIBLE_PAGES_BRANCHE: RECETTE.pagesBranche,
  CIBLE_DB_NOM: base('DB')?.databaseName ?? '',
  CIBLE_DB_ID: base('DB')?.databaseId ?? '',
  CIBLE_CLIENTS_NOM: base('CLIENTS')?.databaseName ?? '',
  CIBLE_CLIENTS_ID: base('CLIENTS')?.databaseId ?? '',
};
for (const [cle, v] of Object.entries(valeurs)) console.log(`${cle}=${citer(v)}`);

const ecarts = ecartsRecette(source);
for (const e of ecarts) console.error(e);
process.exit(ecarts.length > 0 ? 2 : 0);
