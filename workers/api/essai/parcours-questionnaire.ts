/**
 * Le parcours d'essai d'un questionnaire (SPEC §14.11, réception de S2a) :
 * un questionnaire FICTIF envoyé deux fois, par la fonction — pas par une
 * adresse, la porte n'existe qu'en S2b.
 *
 * Ce module ne fait que jouer et compter ; `questionnaire.ts` le branche sur la
 * base locale du poste. La suite de tests le joue sur les vraies migrations
 * (test/essai.test.ts).
 */
import { questionnaire } from '../src/clients/portes/publique';
import { etatDesPortes, poserInterrupteur, type EtatDesPortes } from '../src/clients/portes/etat';
import { baseClients } from '../src/clients/base';
import type { Env } from '../src/env';
import type { Reponse } from '@luminose/contrat';

/** Un questionnaire fictif : une identité du jeu d'essai, des réponses qui disent qu'elles sont d'essai. */
export const envoiDEssai = (cle: string) => ({
  cle,
  contexte: 'seance',
  version: 'complet',
  version_formulaire: 'essai',
  identite: { prenom: 'Œnone', nom: 'Roux', email: 'oenone.roux@example.org', telephone: '+33 6 39 98 00 07' },
  coordonnees: { civilite: 'Mme', ville: 'Ville d’essai' },
  reponses: [{ cle: 'essai.question', libelle: 'Question d’essai', reponse: 'non' }],
  informations: 'Texte d’essai.',
  declaration: true,
  accord: { accepte: true, version: 1 },
});

export type Rapport = {
  premiere: Reponse;
  seconde: Reponse;
  /** Les lignes que cet envoi a laissées : un questionnaire, un ordre prévu. */
  questionnaires: number;
  ordres: { etat: string }[];
  etat: EtatDesPortes;
  /** Ce qu'un envoi reçoit, porte coupée. */
  porteCoupee: Reponse;
};

export const essayerUnQuestionnaire = async (env: Env, maintenant: number): Promise<Rapport> => {
  const db = baseClients(env);
  const cle = `essai-${maintenant.toString(36)}-questionnaire`;
  const envoi = envoiDEssai(cle);

  const premiere = await questionnaire(env, envoi, maintenant);
  await premiere.suite();
  const seconde = await questionnaire(env, structuredClone(envoi), maintenant + 1);

  const [compte, ordres] = await db.batch([
    db.prepare('SELECT COUNT(*) AS n FROM questionnaires WHERE envoi_id = ?1').bind(cle),
    db.prepare(`SELECT etat FROM ordres WHERE objet_type = 'questionnaire'
                AND objet_id IN (SELECT id FROM questionnaires WHERE envoi_id = ?1)`).bind(cle),
  ]);
  const etat = await etatDesPortes(db, maintenant);

  // Couper, essayer, puis remettre l'interrupteur comme il était.
  await poserInterrupteur(db, false, maintenant);
  let porteCoupee: Reponse;
  try {
    porteCoupee = (await questionnaire(env, envoiDEssai(`${cle}-coupee`), maintenant + 2)).reponse;
  } finally {
    await poserInterrupteur(db, etat.ouverte, maintenant);
  }

  return {
    premiere: premiere.reponse,
    seconde: seconde.reponse,
    questionnaires: Number((compte.results?.[0] as { n: number } | undefined)?.n ?? 0),
    ordres: (ordres.results ?? []) as { etat: string }[],
    etat,
    porteCoupee,
  };
};
