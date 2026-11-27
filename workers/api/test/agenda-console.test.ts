/**
 * L'agenda suit la console (SPEC §14.12) : poser, déplacer, annuler, remettre à
 * « prévue », changer de mode — et un évènement supprimé à la main se réécrit.
 * Google est simulé ; la synchronisation part après la réponse.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import app from '../src/index';
import { createSessionToken } from '../src/auth';
import { makeEnv, type TestD1 } from './helpers/d1';
import { ajouterClient, TYPES, HEURE } from './helpers/clients';

let env: ReturnType<typeof makeEnv>;
let base: TestD1;
type Appel = { methode: string; url: string; corps: any };
let appels: Appel[];
let evenements: Map<string, any>;

const LUNDI = '2027-01-11T09:30:00+01:00';
const appeler = async (methode: string, chemin: string, corps?: unknown) =>
  app.fetch(new Request(`https://gestion-recette.luminose.fr${chemin}`, {
    method: methode,
    headers: { 'Content-Type': 'application/json', 'X-Session-Token': await createSessionToken(env) },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  }), env as any);
const seance = (id: string) => base.query('SELECT statut, agenda_etat, agenda_evenement_id, visio_url FROM seances WHERE id = ?', id)[0];
const attendre = (verif: () => void) => vi.waitFor(verif, { timeout: 2000, interval: 10 });

beforeEach(async () => {
  env = makeEnv({ clients: true });
  (env as any).ENVIRONNEMENT = 'recette';
  base = env.CLIENTS as unknown as TestD1;
  for (const [k, v] of [
    ['provider_key:google_agenda_client_id', 'client-essai.apps.googleusercontent.com'],
    ['provider_key:google_agenda_client_secret', 'secret-essai-0123456789'],
    ['provider_key:google_agenda_renouvellement', 'renouvellement-essai'],
  ]) await env.DB.prepare('INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, 0)').bind(k, v).run();
  await ajouterClient(base, 'c1', 'Émilie', 'Martin');
  appels = [];
  evenements = new Map();
  let n = 0;
  vi.stubGlobal('fetch', async (entree: string, init: RequestInit = {}) => {
    const url = String(entree);
    const methode = init.method ?? 'GET';
    const corps = typeof init.body === 'string' && init.body.startsWith('{') ? JSON.parse(init.body) : null;
    appels.push({ methode, url, corps });
    if (url.startsWith('https://oauth2.googleapis.com/token')) return Response.json({ access_token: 'acces-essai' });
    const m = /\/events\/([^?]+)/.exec(url);
    if (methode === 'POST' && url.includes('/events?')) {
      const id = `ev-${++n}`;
      evenements.set(id, corps);
      return Response.json({ id, hangoutLink: corps.conferenceData ? `https://meet.google.com/${id}` : undefined });
    }
    if (methode === 'PATCH' && m) {
      if (!evenements.has(m[1])) return new Response('', { status: 404 });
      evenements.set(m[1], { ...evenements.get(m[1]), ...corps });
      return Response.json({ id: m[1], hangoutLink: corps.conferenceData ? `https://meet.google.com/${m[1]}-2` : undefined });
    }
    if (methode === 'DELETE' && m) { evenements.delete(m[1]); return new Response(null, { status: 204 }); }
    return new Response('', { status: 404 });
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('l’agenda suit la console', () => {
  it('poser, déplacer, annuler, remettre à « prévue »', async () => {
    const r = await appeler('POST', '/api/seances', { clientId: 'c1', typeSeanceId: TYPES.seance, debut: LUNDI });
    const { id } = await r.json() as { id: string };
    await attendre(() => expect(seance(id).agenda_etat).toBe('ecrit'));
    const ev = String(seance(id).agenda_evenement_id);
    expect(evenements.get(ev).summary).toBe('[Recette] Séance — Émilie Martin');
    expect(evenements.get(ev).description).toContain('Posée dans gestion');

    const { revision } = base.query('SELECT revision FROM seances WHERE id = ?', id)[0] as { revision: number };
    await appeler('POST', `/api/seances/${id}/deplacer`, { debut: '2027-01-11T13:00:00+01:00', revision });
    await attendre(() => expect(evenements.get(ev).start.dateTime).toBe('2027-01-11T12:00:00.000Z'));
    expect(seance(id).agenda_evenement_id).toBe(ev);

    await appeler('POST', `/api/seances/${id}/annuler`);
    await attendre(() => expect(evenements.has(ev)).toBe(false));
    await attendre(() => expect(seance(id).agenda_evenement_id).toBeNull());

    await appeler('POST', `/api/seances/${id}/prevoir`);
    await attendre(() => expect(seance(id).agenda_evenement_id).not.toBeNull());
    expect(evenements.size).toBe(1);
  });

  it('passer en visio : un lien Meet est créé et noté', async () => {
    const { id } = await (await appeler('POST', '/api/seances', { clientId: 'c1', typeSeanceId: TYPES.seance, debut: LUNDI })).json() as { id: string };
    await attendre(() => expect(seance(id).agenda_etat).toBe('ecrit'));
    expect(seance(id).visio_url).toBeNull();
    await appeler('PATCH', `/api/seances/${id}`, { mode: 'visio' });
    await attendre(() => expect(String(seance(id).visio_url)).toContain('meet.google.com'));
  });

  it('un évènement supprimé à la main : la synchronisation suivante le réécrit', async () => {
    const { id } = await (await appeler('POST', '/api/seances', { clientId: 'c1', typeSeanceId: TYPES.seance, debut: LUNDI })).json() as { id: string };
    await attendre(() => expect(seance(id).agenda_etat).toBe('ecrit'));
    evenements.clear();
    await appeler('PATCH', `/api/seances/${id}`, { dureeMin: 60 });
    await attendre(() => expect(evenements.size).toBe(1));
    expect(seance(id).agenda_evenement_id).not.toBe('ev-1');
  });

  it('Google en panne : la console répond quand même, et la séance attend en « echec »', async () => {
    vi.stubGlobal('fetch', async () => new Response('', { status: 503 }));
    const r = await appeler('POST', '/api/seances', { clientId: 'c1', typeSeanceId: TYPES.seance, debut: LUNDI });
    expect(r.status).toBe(201);
    const { id } = await r.json() as { id: string };
    await attendre(() => expect(seance(id).agenda_etat).toBe('echec'));
    expect(HEURE).toBeGreaterThan(0);
  });
});
