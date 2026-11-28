/**
 * Un questionnaire de santé vu de la console (refonte, lot 8) — `/api/sante`.
 * Les réponses, les contre-indications à regarder, relu et à revoir ; l'alerte
 * « à revoir » se résout avec le relu.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import app from '../src/index';
import { createSessionToken } from '../src/auth';
import { makeEnv, type TestD1 } from './helpers/d1';
import { ajouterClient } from './helpers/clients';

let env: ReturnType<typeof makeEnv>;
let base: TestD1;
const appeler = async (methode: string, chemin: string, e = env) => app.fetch(new Request(`https://api.test${chemin}`, {
  method: methode, headers: { 'X-Session-Token': await createSessionToken(e) },
}), e as any);

beforeEach(async () => {
  env = makeEnv({ clients: true });
  base = env.CLIENTS as unknown as TestD1;
  await ajouterClient(base, 'client-a', 'Émilie', 'Martin');
  const reponses = JSON.stringify({ questions: [
    { cle: 'cardio', libelle: 'Antécédents cardiovasculaires', reponse: 'Oui, une arythmie' },
    { cle: 'epilepsie', libelle: 'Épilepsie', reponse: 'Non' },
  ], informations: 'Rien d’autre.' });
  await base.prepare(`INSERT INTO questionnaires (id, contexte, version, client_id, reponses, a_revoir, created_at, updated_at)
    VALUES ('q', 'seance', 'complet', 'client-a', ?, 1, 1, 1)`).bind(reponses).run();
  await base.prepare(`INSERT INTO alertes (id, sorte, objet_type, objet_id, created_at, updated_at) VALUES ('al', 'a_revoir', 'questionnaire', 'q', 1, 1)`).run();
});

describe('un questionnaire de santé', () => {
  it('se lit : la personne, les réponses, les « oui » à regarder', async () => {
    const res = await appeler('GET', '/api/sante/q');
    expect(res.status).toBe(200);
    const q = await res.json() as any;
    expect(q.personne).toEqual({ prenom: 'Émilie', nom: 'Martin' });
    expect(q.questions.map((r: any) => [r.libelle, r.aRegarder])).toEqual([['Antécédents cardiovasculaires', true], ['Épilepsie', false]]);
    expect(q.informations).toBe('Rien d’autre.');
    expect(q.aRevoir).toBe(true);
  });

  it('relu : la date, « à revoir » retombe, l’alerte se résout', async () => {
    expect((await appeler('POST', '/api/sante/q/relu')).status).toBe(200);
    const q = await (await appeler('GET', '/api/sante/q')).json() as any;
    expect(q.reluLe).not.toBeNull();
    expect(q.aRevoir).toBe(false);
    expect(base.query('SELECT resolue_le FROM alertes WHERE id = ?', 'al')[0].resolue_le).not.toBeNull();
  });

  it('à revoir : il n’est plus relu', async () => {
    await appeler('POST', '/api/sante/q/relu');
    expect((await appeler('POST', '/api/sante/q/a-revoir')).status).toBe(200);
    const q = await (await appeler('GET', '/api/sante/q')).json() as any;
    expect([q.reluLe, q.aRevoir]).toEqual([null, true]);
  });

  it('absent : 404 ; sans la base : 409', async () => {
    expect((await appeler('GET', '/api/sante/absent')).status).toBe(404);
    expect((await appeler('POST', '/api/sante/absent/relu')).status).toBe(404);
    expect((await appeler('GET', '/api/sante/q', makeEnv())).status).toBe(409);
  });
});
