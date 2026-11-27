/**
 * Relier l'agenda Google (SPEC §14.12) : les routes de la console, et le
 * retour de Google, hors session, authentifié par son état signé.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import app from '../src/index';
import { createSessionToken } from '../src/auth';
import { makeEnv } from './helpers/d1';

let env: ReturnType<typeof makeEnv>;

const appeler = async (methode: string, chemin: string, corps?: unknown, avecSession = true) =>
  app.fetch(new Request(`https://gestion-recette.luminose.fr${chemin}`, {
    method: methode,
    redirect: 'manual',
    headers: { 'Content-Type': 'application/json', ...(avecSession ? { 'X-Session-Token': await createSessionToken(env) } : {}) },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  }), env as any);

const CLIENT = { clientId: 'client-essai.apps.googleusercontent.com', clientSecret: 'secret-essai-0123456789' };

beforeEach(() => { env = makeEnv(); vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('l’agenda Google : relier', () => {
  it('l’état ne dit que « posé » et le compte, jamais le secret ni le jeton', async () => {
    expect(await (await appeler('GET', '/api/agenda')).json()).toEqual({ clientPose: false, relie: false, compte: null });
    expect((await appeler('PUT', '/api/agenda/client', CLIENT)).status).toBe(200);
    const texte = await (await appeler('GET', '/api/agenda')).text();
    expect(JSON.parse(texte)).toEqual({ clientPose: true, relie: false, compte: null });
    expect(texte).not.toContain('secret-essai');
    // L'export ne les emporte pas non plus.
    expect(await (await appeler('GET', '/api/export')).text()).not.toContain('secret-essai');
  });

  it('se connecter : vers Google, avec l’adresse de retour de cet environnement et un état signé', async () => {
    expect((await appeler('GET', '/api/agenda/connexion')).status).toBe(409);
    await appeler('PUT', '/api/agenda/client', CLIENT);
    const r = await appeler('GET', '/api/agenda/connexion');
    expect(r.status).toBe(302);
    const vers = new URL(r.headers.get('Location')!);
    expect(vers.origin).toBe('https://accounts.google.com');
    expect(vers.searchParams.get('redirect_uri')).toBe('https://gestion-recette.luminose.fr/api/agenda/retour');
    expect(vers.searchParams.get('access_type')).toBe('offline');
    expect(vers.searchParams.get('scope')).toContain('calendar.events');
    expect(vers.searchParams.get('state')!.split('.')).toHaveLength(3);
  });

  it('le retour de Google, sans session : un état faux ne pose rien ; un état signé pose l’autorisation', async () => {
    await appeler('PUT', '/api/agenda/client', CLIENT);
    const faux = await appeler('GET', '/api/agenda/retour?code=x&state=1.a.b', undefined, false);
    expect(faux.status).toBe(302);
    expect(faux.headers.get('Location')).toContain('agenda=lien_echu');

    const etat = new URL((await appeler('GET', '/api/agenda/connexion')).headers.get('Location')!).searchParams.get('state')!;
    const charge = btoa(JSON.stringify({ email: 'florent@luminose.fr' })).replace(/=+$/, '');
    vi.stubGlobal('fetch', async () => Response.json({ refresh_token: 'renouvellement-essai', id_token: `x.${charge}.y` }));
    const bon = await appeler('GET', `/api/agenda/retour?code=code-essai&state=${encodeURIComponent(etat)}`, undefined, false);
    expect(bon.headers.get('Location')).toBe('https://gestion-recette.luminose.fr/#reglages/agenda?agenda=relie');
    vi.unstubAllGlobals();
    const etatFinal = await (await appeler('GET', '/api/agenda')).text();
    expect(JSON.parse(etatFinal)).toEqual({ clientPose: true, relie: true, compte: 'florent@luminose.fr' });
    expect(etatFinal).not.toContain('renouvellement-essai');
  });

  it('les autres routes de l’agenda exigent la session', async () => {
    expect((await appeler('GET', '/api/agenda', undefined, false)).status).toBe(401);
    expect((await appeler('GET', '/api/agenda/connexion', undefined, false)).status).toBe(401);
  });

  it('oublier l’autorisation', async () => {
    await appeler('PUT', '/api/agenda/client', CLIENT);
    await env.DB.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES ('provider_key:google_agenda_renouvellement', 'r', 0)").run();
    expect(((await (await appeler("GET", "/api/agenda")).json()) as any).relie).toBe(true);
    await appeler('DELETE', '/api/agenda');
    expect(((await (await appeler("GET", "/api/agenda")).json()) as any).relie).toBe(false);
  });
});
