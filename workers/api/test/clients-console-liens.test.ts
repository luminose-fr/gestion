/**
 * Les liens de questionnaire côté console (SPEC §14.5, phase S2b) : fabriquer
 * le lien d'une séance, révoquer ses liens. De quoi essayer la page d'essai
 * avec un lien valable, puis révoqué — c'est aussi le geste qu'aura l'écran de
 * séance (C2).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import app from '../src/index';
import { createSessionToken } from '../src/auth';
import { MESSAGE_NON_RELIEE } from '../src/clients/base';
import { verifierJeton } from '../src/clients/jetons';
import { MESSAGE_SECRET_ABSENT, MESSAGE_SITE_ABSENT } from '../src/routes/seances';
import { verifierLienQuestionnaire } from '../src/clients/portes/publique';
import { makeEnv, MIGRATIONS_CLIENTS, TestD1 } from './helpers/d1';
import { seanceEssai, executer } from './helpers/portes';
import { LUNDI_9H30 } from './helpers/clients';

const SITE = 'https://essai-recette.luminose.fr';
const JETON_MCP = 'jeton-de-test-du-mcp';
const empreinte = async (t: string) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))].map((o) => o.toString(16).padStart(2, '0')).join('');

const appeler = async (env: any, chemin: string, entetes?: Record<string, string>) =>
  app.fetch(new Request(`https://gestion-recette.luminose.fr${chemin}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(entetes ?? { 'X-Session-Token': await createSessionToken(env) }) },
  }), env);

let journal: string[];
beforeEach(() => {
  journal = [];
  for (const n of ['error', 'warn', 'log', 'info', 'debug'] as const) {
    vi.spyOn(console, n).mockImplementation((...a: unknown[]) => { journal.push(a.map(String).join(' ')); });
  }
});
afterEach(() => { vi.restoreAllMocks(); });

const avecClients = (extra: Record<string, unknown> = {}) => {
  const env: any = { ...makeEnv(), CLIENTS: new TestD1(MIGRATIONS_CLIENTS), PORTES_SECRET: 'secret-de-test', ORIGINE_SITE: SITE, ...extra };
  seanceEssai(env.CLIENTS, 's1', null, LUNDI_9H30);
  return env;
};
const jetonDuLien = (lien: string) => lien.slice(`${SITE}/#r=`.length);

describe('POST /api/seances/:id/lien-questionnaire', () => {
  it('rend { lien } : l’origine du site, le jeton après le #, signé pour la séance à sa version, échu à son début', async () => {
    const env = avecClients();
    executer(env.CLIENTS, "UPDATE seances SET liens_version = 4 WHERE id = 's1'");
    const res = await appeler(env, '/api/seances/s1/lien-questionnaire');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const { lien } = await res.json() as { lien: string };
    expect(lien.startsWith(`${SITE}/#r=`)).toBe(true);
    expect(await verifierJeton(env, jetonDuLien(lien), 'questionnaire', LUNDI_9H30 - 1))
      .toEqual({ usage: 'questionnaire', objet: 's1', echeance: LUNDI_9H30, version: 4 });
    expect(await verifierJeton(env, jetonDuLien(lien), 'questionnaire', LUNDI_9H30)).toBeNull();
    // Rangé nulle part, journalisé nulle part.
    expect(journal.join('\n')).not.toContain(jetonDuLien(lien));
  });

  it('le lien rendu est valable à l’ouverture ; après revoquer-liens, il ne l’est plus', async () => {
    const env = avecClients();
    const { lien } = await (await appeler(env, '/api/seances/s1/lien-questionnaire')).json() as { lien: string };
    const reference = jetonDuLien(lien);
    expect(await verifierLienQuestionnaire(env, { reference }, LUNDI_9H30 - 1000)).toEqual({ ok: true });
    const revoque = await appeler(env, '/api/seances/s1/revoquer-liens');
    expect(revoque.status).toBe(200);
    expect(await revoque.json()).toEqual({ revoques: true });
    expect(env.CLIENTS.query("SELECT liens_version FROM seances WHERE id = 's1'")[0].liens_version).toBe(2);
    expect(await verifierLienQuestionnaire(env, { reference }, LUNDI_9H30 - 1000)).toEqual({ ok: false, motif: 'lien_invalide' });
  });

  it('séance inconnue ou annulée : 404', async () => {
    const env = avecClients();
    expect((await appeler(env, '/api/seances/inconnue/lien-questionnaire')).status).toBe(404);
    executer(env.CLIENTS, "UPDATE seances SET statut = 'annulee'");
    expect((await appeler(env, '/api/seances/s1/lien-questionnaire')).status).toBe(404);
  });

  it('sans CLIENTS : 409, rien au journal', async () => {
    const res = await appeler({ ...makeEnv(), PORTES_SECRET: 's', ORIGINE_SITE: SITE }, '/api/seances/s1/lien-questionnaire');
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: MESSAGE_NON_RELIEE });
    expect(journal).toEqual([]);
  });

  it('sans PORTES_SECRET, sans ORIGINE_SITE : un Refus qui dit quoi faire, rien au journal', async () => {
    const sansSecret = await appeler(avecClients({ PORTES_SECRET: undefined }), '/api/seances/s1/lien-questionnaire');
    expect(sansSecret.status).toBe(409);
    expect(await sansSecret.json()).toEqual({ error: MESSAGE_SECRET_ABSENT });
    const sansSite = await appeler(avecClients({ ORIGINE_SITE: undefined }), '/api/seances/s1/lien-questionnaire');
    expect(sansSite.status).toBe(409);
    expect(await sansSite.json()).toEqual({ error: MESSAGE_SITE_ABSENT });
    expect(journal).toEqual([]);
  });

  it('sans session : 401 ; une autre origine : 403', async () => {
    const env = avecClients({ ENVIRONNEMENT: 'recette' });
    expect((await appeler(env, '/api/seances/s1/lien-questionnaire', { 'Content-Type': 'application/json' })).status).toBe(401);
    const autre = await appeler(env, '/api/seances/s1/lien-questionnaire', {
      'Content-Type': 'application/json', 'X-Session-Token': await createSessionToken(env), Origin: 'https://gestion.luminose.fr',
    });
    expect(autre.status).toBe(403);
  });
});

describe('POST /api/seances/:id/revoquer-liens', () => {
  it('séance inconnue : 404 ; sans CLIENTS : 409', async () => {
    expect((await appeler(avecClients(), '/api/seances/inconnue/revoquer-liens')).status).toBe(404);
    expect((await appeler(makeEnv(), '/api/seances/s1/revoquer-liens')).status).toBe(409);
  });
});

describe('NORMATIF — le serveur MCP n’atteint pas les liens', () => {
  it.each(['/api/seances/s1/lien-questionnaire', '/api/seances/s1/revoquer-liens'])('%s : 403, sans rien lire', async (chemin) => {
    const env = { ...avecClients(), MCP_JETON_EMPREINTE: await empreinte(JETON_MCP) };
    const res = await appeler(env, chemin, { 'Content-Type': 'application/json', Authorization: `Bearer ${JETON_MCP}` });
    expect(res.status).toBe(403);
    expect(env.CLIENTS.query("SELECT liens_version FROM seances WHERE id = 's1'")[0].liens_version).toBe(1);
  });
});
