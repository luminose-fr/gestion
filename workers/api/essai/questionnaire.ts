#!/usr/bin/env node
/**
 * Un questionnaire fictif envoyé deux fois à la base LOCALE (SPEC §14.11,
 * réception de la phase S2a) — par la fonction, pas par une adresse.
 *
 *   npm run essai:questionnaire -w workers/api -- --local
 *
 * Avant : les migrations locales appliquées (`npm run dev:api` le fait) et le
 * jeu d'essai chargé (`npm run essai -w workers/api -- --local`), qui pose le
 * texte de l'accord et le modèle de l'accusé. Attendu : deux `{ ok: true }`,
 * un questionnaire, un ordre `prevu`, et `ferme` porte coupée.
 *
 * Le poste local seulement : en recette, le même essai passera par la porte
 * (S2b). Sans `PORTES_SECRET` dans `.dev.vars`, un secret jetable est tiré pour
 * la durée de l'essai — il ne sert qu'à cette exécution et ne s'écrit nulle part.
 */
import { lireCible } from './cible.ts';
import { essayerUnQuestionnaire } from './parcours-questionnaire.ts';

try {
  if (lireCible(process.argv.slice(2)) !== 'local') {
    throw new Error('Cet essai ne vise que le poste local : en recette, il passera par la porte (phase S2b).');
  }
  // Après la vérification de la cible : rien ne s'ouvre avant elle.
  const { getPlatformProxy } = await import('wrangler');
  const proxy = await getPlatformProxy<Record<string, unknown>>({ environment: 'local' });
  try {
    const env = { ...proxy.env, PORTES_SECRET: (proxy.env.PORTES_SECRET as string | undefined) || crypto.randomUUID() } as any;
    const r = await essayerUnQuestionnaire(env, Date.now());
    console.log(`Premier envoi  : ${JSON.stringify(r.premiere)}`);
    console.log(`Second envoi   : ${JSON.stringify(r.seconde)}`);
    console.log(`Questionnaires : ${r.questionnaires} (attendu : 1)`);
    console.log(`Ordres         : ${r.ordres.map((o) => o.etat).join(', ') || 'aucun'} (attendu : prevu)`);
    console.log(`Porte coupée   : ${JSON.stringify(r.porteCoupee)} (attendu : ferme)`);
    console.log(`Réglages       : ${JSON.stringify(r.etat)}`);
    const conforme = r.premiere.ok && r.seconde.ok && r.questionnaires === 1 && r.ordres.length === 1
      && r.ordres[0].etat === 'prevu' && !r.porteCoupee.ok && r.porteCoupee.motif === 'ferme';
    console.log(conforme ? 'Conforme.' : 'NON CONFORME.');
    if (!conforme) process.exitCode = 1;
  } finally {
    await proxy.dispose();
  }
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(/no such table/.test(message)
    ? 'La base locale n’a pas les migrations de la phase : lancez `npm run dev:api` une fois, puis le jeu d’essai.'
    : message);
  process.exit(1);
}
