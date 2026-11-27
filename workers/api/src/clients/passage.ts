/**
 * Le passage planifié des portes (SPEC §14.6, §14.7) : relever les ordres,
 * reprendre les fiches à compléter, purger les reçus, réécrire dans l'agenda
 * les séances dont l'écriture a échoué — chacun dans une limite,
 * le reste au passage suivant.
 *
 * Sans `CLIENTS` — la production jusqu'à la phase S4 —, il ne fait rien et ne
 * lève rien. Une étape qui échoue n'empêche pas les suivantes ; elle se
 * journalise par un code fixe, jamais par son exception (règle 7).
 */
import type { Env } from '../env';
import { baseClients, clientsReliee } from './base';
import { releverLesOrdres, type Bilan } from './ordres';
import { purgerLesCommandes } from './commandes';
import { questionnairesAReprendre } from './sensible';
import { completerLaFiche } from './portes/publique';
import { reprendreLesAgendas } from './agenda-seances';

/** Combien de fiches un passage reprend au plus : un lot chacune. */
const FICHES_PAR_PASSAGE = 5;

export type BilanPassage = { ordres: Bilan | null; fiches: number; purgees: number; agendas: number } | null;

export const passer = async (env: Env, maintenant: number): Promise<BilanPassage> => {
  if (!clientsReliee(env)) return null;
  const db = baseClients(env);
  const bilan = { ordres: null as Bilan | null, fiches: 0, purgees: 0, agendas: 0 };

  try {
    bilan.ordres = await releverLesOrdres(env, maintenant);
  } catch {
    console.error('incident: passage_ordres');
  }
  try {
    for (const id of await questionnairesAReprendre(db, FICHES_PAR_PASSAGE)) {
      await completerLaFiche(db, id, maintenant);
      bilan.fiches += 1;
    }
  } catch {
    console.error('incident: passage_fiches');
  }
  try {
    bilan.purgees = await purgerLesCommandes(db, maintenant);
  } catch {
    console.error('incident: passage_purge');
  }
  try {
    bilan.agendas = await reprendreLesAgendas(env);
  } catch {
    console.error('incident: passage_agendas');
  }
  return bilan;
};
