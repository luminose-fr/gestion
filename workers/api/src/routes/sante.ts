/**
 * Un questionnaire de santé, vu de la console (refonte, lot 8 — maquettes
 * Questionnaire, QuestionnaireRelu) : `/api/sante` — un nom qui ne désigne pas la table (règle 3 du §14.2).
 *
 * Le seul endroit qui rend les réponses — à Florent, sur l'écran du
 * questionnaire. Ni l'IA, ni le serveur MCP (sa liste fermée ne l'ouvre pas),
 * ni l'export, ni les journaux. Les lectures et écritures passent par
 * `clients/sensible.ts`, le seul module qui nomme la table.
 */
import { baseClients } from '../clients/base';
import { Refus } from '../refus';
import { z } from 'zod';
import { lireQuestionnaire, marquerQuestionnaireARevoir, marquerQuestionnaireRelu, rattacherQuestionnaire } from '../clients/sensible';
import { corps, famille, identifiant, iso } from './clients-commun';

export const sante = famille();

const INTROUVABLE = 'Ce questionnaire n’existe pas.';

/** Une réponse qui commence par « oui » est une contre-indication déclarée, à regarder. */
const estUnOui = (reponse: string) => /^oui\b/i.test(reponse.trim());

sante.get('/:id', async (c) => {
  const q = await lireQuestionnaire(baseClients(c.env), c.req.param('id'));
  if (!q) throw new Refus(INTROUVABLE, 404);
  return c.json({
    id: q.id, recuLe: iso(q.recuLe), contexte: q.contexte, version: q.version,
    clientId: q.clientId, seanceId: q.seanceId, evenementId: q.evenementId,
    personne: { prenom: q.prenom, nom: q.nom },
    questions: q.questions.map((r) => ({ ...r, aRegarder: estUnOui(r.reponse) })),
    informations: q.informations,
    reluLe: iso(q.reluLe), aRevoir: q.aRevoir, aRapprocher: q.aRapprocher,
  });
});

sante.post('/:id/relu', async (c) => {
  if (!(await marquerQuestionnaireRelu(baseClients(c.env), c.req.param('id'), Date.now()))) throw new Refus(INTROUVABLE, 404);
  return c.json({ id: c.req.param('id') });
});

sante.post('/:id/a-revoir', async (c) => {
  if (!(await marquerQuestionnaireARevoir(baseClients(c.env), c.req.param('id'), Date.now()))) throw new Refus(INTROUVABLE, 404);
  return c.json({ id: c.req.param('id') });
});

sante.post('/:id/rattacher', async (c) => {
  const { clientId } = await corps(c, z.strictObject({ clientId: identifiant }));
  if (await rattacherQuestionnaire(baseClients(c.env), c.req.param('id'), clientId, Date.now())) return c.json({ id: c.req.param('id') });
  throw new Refus('Rien à rattacher : le questionnaire est déjà rattaché, ou l’un des deux n’existe pas.', 409);
});
