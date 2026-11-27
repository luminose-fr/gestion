#!/usr/bin/env node
/**
 * Ce que `node:sqlite` ne prouve pas, provoqué à la main SUR LA BASE ELLE-MÊME
 * (SPEC §14.10) : D1 refuse une violation de clé étrangère, et l'index partiel
 * refuse un second rattachement vivant de la même personne à la même journée.
 *
 *   npm run essai:contraintes -w workers/api -- --recette
 *
 * Le jeu d'essai doit être chargé : le second contrôle réinscrit une fiche
 * d'essai à une journée d'essai où elle l'est déjà. Les deux écritures doivent
 * ÉCHOUER ; le script vérifie ensuite qu'aucune ligne `essai-controle-` n'est
 * restée. Il ne touche à rien d'autre.
 *
 * La vraie simultanéité de deux réservations se constatera en phase S2, quand
 * une porte existera.
 */
import { lireCible, baseVisee, lireConfiguration, verifierSurLeCompte, wrangler, optionsCible } from './cible.ts';

const CONTROLES = [
  {
    nom: 'une violation de clé étrangère est refusée',
    attendu: /FOREIGN KEY constraint failed/i,
    sql: `INSERT INTO seances_mouvements (id, seance_id, nature, par, revision, created_at, updated_at)
          VALUES ('essai-controle-cle-etrangere', 'essai-controle-seance-absente', 'creee', 'florent', 0, 0, 0)`,
  },
  {
    nom: 'un second rattachement vivant de la même fiche à la même journée est refusé par l’index partiel',
    attendu: /UNIQUE constraint failed/i,
    sql: `INSERT INTO inscriptions (id, evenement_id, client_id, statut, reference, origine, created_at, updated_at)
          VALUES ('essai-controle-index', 'essai-evenement-complet', 'essai-client-jp', 'confirmee', 'ESSAI-CONTROLE', 'console', 0, 0)`,
  },
];

const args = process.argv.slice(2);
try {
  const cible = lireCible(args);
  const base = baseVisee(lireConfiguration(), cible);
  if (cible === 'recette') verifierSurLeCompte(base);
  console.log(`Base visée : ${base.nom} (${base.id}).`);

  const presence = wrangler(['d1', 'execute', 'CLIENTS', ...optionsCible(cible), '--json', '--command',
    "SELECT COUNT(*) AS n FROM inscriptions WHERE id = 'essai-inscription-complet-1' AND statut = 'confirmee'"]);
  if (!presence.ok || !/"n":\s*1/.test(presence.sortie)) {
    throw new Error('Le jeu d’essai n’est pas chargé : npm run essai -w workers/api -- --' + cible);
  }

  let echecs = 0;
  for (const c of CONTROLES) {
    const r = wrangler(['d1', 'execute', 'CLIENTS', ...optionsCible(cible), '--command', c.sql.replace(/\s+/g, ' ')]);
    const tenu = !r.ok && c.attendu.test(r.sortie);
    console.log(`${tenu ? '✓' : '✗'} ${c.nom}`);
    if (!tenu) { echecs++; console.log(r.ok ? '  L’écriture a été ACCEPTÉE.' : `  Refusée, mais pas pour la raison attendue :\n${r.sortie}`); }
  }

  const reste = wrangler(['d1', 'execute', 'CLIENTS', ...optionsCible(cible), '--json', '--command',
    "SELECT (SELECT COUNT(*) FROM seances_mouvements WHERE id LIKE 'essai-controle-%') + (SELECT COUNT(*) FROM inscriptions WHERE id LIKE 'essai-controle-%') AS n"]);
  const propre = reste.ok && /"n":\s*0/.test(reste.sortie);
  console.log(`${propre ? '✓' : '✗'} aucune ligne de contrôle n’est restée`);
  if (!propre) echecs++;
  process.exit(echecs > 0 ? 1 : 0);
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
