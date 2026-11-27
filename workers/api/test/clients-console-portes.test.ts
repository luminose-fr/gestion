/**
 * Les portes vues de la console (SPEC §14.5) : la ligne d'état en une
 * instruction, l'interrupteur, la liaison facultative, et la fermeture au
 * serveur MCP comme au jeton de service.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import app from '../src/index';
import { createSessionToken } from '../src/auth';
import { MESSAGE_NON_RELIEE } from '../src/clients/base';
import { makeEnv, MIGRATIONS_CLIENTS, TestD1 } from './helpers/d1';
import { espionner, envoiComplet, executer } from './helpers/portes';
import { questionnaire } from '../src/clients/portes/publique';

const JETON = 'jeton-de-test-des-portes';
const empreinte = async (t: string) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))].map((o) => o.toString(16).padStart(2, '0')).join('');

const appeler = async (env: any, chemin: string, init: RequestInit = {}, entetes?: Record<string, string>) =>
  app.fetch(new Request(`https://api.test${chemin}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(entetes ?? { 'X-Session-Token': await createSessionToken(env) }) },
  }), env);

let journaux: ReturnType<typeof vi.spyOn>[];
beforeEach(() => {
  journaux = (['error', 'warn', 'log', 'info', 'debug'] as const).map((n) => vi.spyOn(console, n).mockImplementation(() => {}));
});
afterEach(() => { for (const j of journaux) j.mockRestore(); });

const avecClients = () => {
  const env: any = { ...makeEnv(), CLIENTS: new TestD1(MIGRATIONS_CLIENTS), PORTES_SECRET: 'secret-de-test' };
  executer(env.CLIENTS, `INSERT INTO textes_versions (id, cle, version, texte, en_vigueur_le, created_at, updated_at)
    VALUES ('t1', 'accord_conservation', 1, 'Texte d''essai.', 0, 0, 0)`);
  return env;
};

describe('/api/portes', () => {
  it('sans liaison : 409 sur la lecture comme sur l’interrupteur, et rien n’est journalisé', async () => {
    const env = makeEnv();
    for (const [chemin, init] of [['/api/portes', {}], ['/api/portes/interrupteur', { method: 'PUT', body: '{"ouverte":false}' }]] as const) {
      const res = await appeler(env, chemin, init);
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: MESSAGE_NON_RELIEE });
    }
    for (const j of journaux) expect(j).not.toHaveBeenCalled();
  });

  it('la ligne d’état : ouverte, les compteurs, en une seule instruction', async () => {
    const env = avecClients();
    await questionnaire(env, envoiComplet(), Date.now());
    await questionnaire(env, envoiComplet(), Date.now());
    const preparees = espionner(env.CLIENTS);
    const res = await appeler(env, '/api/portes');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ouverte: true, commandesDuJour: 2, ordres: { prevu: 2, confieAMake: 0, echec: 0 }, alertesOuvertes: 2,
    });
    expect(preparees).toHaveLength(1);
  });

  it('l’interrupteur coupe et rouvre ; coupée, la porte répond ferme', async () => {
    const env = avecClients();
    const coupe = await appeler(env, '/api/portes/interrupteur', { method: 'PUT', body: JSON.stringify({ ouverte: false }) });
    expect(coupe.status).toBe(200);
    expect(await coupe.json()).toMatchObject({ ouverte: false });
    expect((await questionnaire(env, envoiComplet(), Date.now())).reponse).toEqual({ ok: false, motif: 'ferme' });
    const rouvre = await appeler(env, '/api/portes/interrupteur', { method: 'PUT', body: JSON.stringify({ ouverte: true }) });
    expect(await rouvre.json()).toMatchObject({ ouverte: true });
    expect((await questionnaire(env, envoiComplet(), Date.now())).reponse).toEqual({ ok: true });
  });

  it('un interrupteur mal formé : 400', async () => {
    const env = avecClients();
    expect((await appeler(env, '/api/portes/interrupteur', { method: 'PUT', body: '{"ouverte":"non"}' })).status).toBe(400);
    expect((await appeler(env, '/api/portes/interrupteur', { method: 'PUT', body: '{"ouverte":true,"autre":1}' })).status).toBe(400);
  });

  it.each([false, true])('NORMATIF — le serveur MCP : 403 sur chaque route, liaison présente : %s, sans rien lire', async (lie) => {
    const env: any = { ...(lie ? avecClients() : makeEnv()), MCP_JETON_EMPREINTE: await empreinte(JETON) };
    const lues = env.CLIENTS ? espionner(env.CLIENTS) : [];
    for (const [chemin, init] of [['/api/portes', {}], ['/api/portes/interrupteur', { method: 'PUT', body: '{"ouverte":false}' }]] as const) {
      expect((await appeler(env, chemin, init, { Authorization: `Bearer ${JETON}` })).status).toBe(403);
    }
    expect(lues).toEqual([]);
  });

  it('le jeton de service de Make n’ouvre rien de la console', async () => {
    const env: any = { ...avecClients(), SERVICE_JETON_EMPREINTE: await empreinte(JETON) };
    const res = await appeler(env, '/api/portes', {}, { Authorization: `Bearer ${JETON}` });
    expect(res.status).toBe(401);
  });
});
