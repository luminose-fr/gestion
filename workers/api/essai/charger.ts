#!/usr/bin/env node
/**
 * Charge le jeu d'essai dans la base des clients (SPEC §14.8).
 *
 *   npm run essai -w workers/api -- --local
 *   npm run essai -w workers/api -- --recette
 *   npm run essai -w workers/api -- --recette --date 2026-12-01
 *   npm run essai -w workers/api -- --recette --volume   # 1 000 personnes, 200 professionnels (volume.ts)
 *
 * Vérifie d'abord la base visée — nom et identifiant, lus dans wrangler.toml
 * résolu, et en recette sur le compte lui-même — et refuse tout ce qui n'est
 * pas la base locale ou `luminose-clients-recette`. Puis écrit les lignes
 * `essai-`, et elles seules. Rejouable : deux chargements à la même date
 * donnent le même contenu.
 *
 * Les migrations doivent être appliquées avant : `npm run dev:api` le fait en
 * local, `scripts/deploy.sh --env recette` en recette.
 */
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { jeuDEssai, enSql, aujourdhui, EFFECTIFS, seancesQuiAttendentUnQuestionnaire } from './donnees.ts';
import { jeuDeVolume } from './volume.ts';
import { lireCible, baseVisee, lireConfiguration, verifierSurLeCompte, wrangler, optionsCible } from './cible.ts';

const args = process.argv.slice(2);
try {
  const cible = lireCible(args);
  const iDate = args.indexOf('--date');
  const date = iDate >= 0 ? args[iDate + 1] ?? '' : aujourdhui();

  const base = baseVisee(lireConfiguration(), cible);
  if (cible === 'recette') verifierSurLeCompte(base);
  console.log(`Base visée : ${base.nom} (${base.id}), ${cible === 'local' ? 'sur ce poste' : 'distante'}.`);

  const volume = args.includes('--volume');
  const jeu = volume ? jeuDeVolume(date) : jeuDEssai(date);
  const sql = enSql(jeu);
  const dossier = mkdtempSync(join(tmpdir(), 'essai-clients-'));
  const fichier = join(dossier, 'essai.sql');
  writeFileSync(fichier, sql);
  try {
    const r = wrangler(['d1', 'execute', 'CLIENTS', ...optionsCible(cible), '--file', fichier, '--yes']);
    if (!r.ok) throw new Error(`wrangler a échoué :\n${r.sortie}`);
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }

  console.log(`${volume ? 'Jeu de volume' : 'Jeu d\'essai'} chargé, date de référence ${date}.`);
  const effectifs = volume ? Object.fromEntries(jeu.map((t) => [t.table, t.lignes.length])) : EFFECTIFS;
  for (const [table, n] of Object.entries(effectifs)) if (n > 0) console.log(`  ${table.padEnd(20)} ${n}`);
  if (volume) process.exit(0);
  // De quoi essayer la page d'essai (phase S2b) : Réglages → Porte publique → Lien d'essai.
  console.log('Séances qui attendent un questionnaire (Réglages → Porte publique → Lien d’essai) :');
  for (const id of seancesQuiAttendentUnQuestionnaire(jeu)) console.log(`  ${id}`);
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
