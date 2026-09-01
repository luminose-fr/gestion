/**
 * Les quotas Cloudflare (route `/api/quotas`).
 *
 * Deux points valent le détour, et ce sont ceux qui trompent : l'API GraphQL
 * de Cloudflare sert ses refus en 200 avec un tableau `errors`, et un poste
 * dont elle ne dit rien ne doit jamais s'afficher « zéro » — sur un écran de
 * quotas, cette confusion-là se lit exactement à l'envers du danger.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import app from '../src/index';
import { createSessionToken } from '../src/auth';
import { makeEnv } from './helpers/d1';

let env: ReturnType<typeof makeEnv> & {
  CLOUDFLARE_ANALYTICS_TOKEN?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
};
let token: string;

const lire = async () => {
  const res = await app.fetch(new Request('https://api.test/api/quotas', {
    headers: { 'X-Session-Token': token },
  }), env as any);
  return { res, body: (await res.json()) as any };
};

/** La forme que rend Cloudflare, réduite à ce que la route lit. */
const stubCloudflare = (donnees: unknown, options: { errors?: unknown[]; status?: number } = {}) =>
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify({
    data: donnees,
    ...(options.errors ? { errors: options.errors } : {}),
  }), { status: options.status ?? 200 }));

const COMPTE = (workers: unknown, d1: unknown) => ({
  viewer: { accounts: [{ workersInvocationsAdaptive: workers, d1AnalyticsAdaptiveGroups: d1 }] },
});

beforeEach(async () => {
  env = { ...makeEnv(), CLOUDFLARE_ANALYTICS_TOKEN: 'jeton-cf', CLOUDFLARE_ACCOUNT_ID: 'compte-cf' };
  token = await createSessionToken(env);
});

describe('quotas Cloudflare', () => {
  it('compose les quatre postes à partir des deux jeux de données', async () => {
    stubCloudflare(COMPTE(
      [{ sum: { requests: 1200 } }, { sum: { requests: 300 } }],
      [{ sum: { rowsRead: 40_000, rowsWritten: 900 }, max: { databaseSizeBytes: 12_500_000 } }],
    ));

    const { res, body } = await lire();
    expect(res.status).toBe(200);

    const par = Object.fromEntries(body.postes.map((p: any) => [p.id, p]));
    // Les groupes se somment : Cloudflare en rend un par tranche horaire.
    expect(par['workers-requetes'].valeur).toBe(1500);
    expect(par['workers-requetes'].seuil).toBe(100_000);
    expect(par['d1-lignes-lues'].valeur).toBe(40_000);
    expect(par['d1-lignes-ecrites'].valeur).toBe(900);
    // Le stockage est un maximum, pas une somme : c'est une taille, pas un flux.
    expect(par['d1-stockage'].valeur).toBe(12_500_000);
    expect(par['d1-stockage'].periode).toBe('total');
  });

  /**
   * NORMATIF — un poste que Cloudflare ne renseigne pas vaut `null`, jamais 0.
   *
   * Zéro se lirait « je ne consomme rien », c'est-à-dire l'inverse exact de
   * « je ne sais pas ce que je consomme ». Sur cet écran, l'erreur rassure.
   */
  it('rend null, et jamais zéro, quand Cloudflare ne dit rien — NORMATIF', async () => {
    stubCloudflare(COMPTE([], []));

    const { body } = await lire();
    for (const poste of body.postes) expect(poste.valeur).toBeNull();
  });

  /**
   * L'API GraphQL sert ses refus en 200 avec un tableau `errors` — un échec
   * déguisé en succès. Sans cette lecture, l'écran afficherait quatre postes à
   * « — » en laissant croire à une consommation nulle.
   */
  it('traite un refus GraphQL servi en 200 comme un échec', async () => {
    stubCloudflare(null, { errors: [{ message: 'not entitled to access this dataset' }] });

    const { res, body } = await lire();
    expect(res.status).toBe(502);
    expect(body.error).toContain('not entitled');
  });

  it('remonte une panne de Cloudflare en 502, avec son message', async () => {
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 503 }));
    const { res, body } = await lire();
    expect(res.status).toBe(502);
    expect(body.error).toContain('503');
  });

  /**
   * Sans jeton, ce n'est pas une panne : c'est quelque chose que Florent peut
   * corriger, et le message doit dire quoi taper. Même règle que pour les clés
   * de fournisseurs.
   */
  it('refuse clairement, et dit quoi faire, quand le jeton manque', async () => {
    env.CLOUDFLARE_ANALYTICS_TOKEN = undefined;
    const { res, body } = await lire();
    expect(res.status).toBe(409);
    expect(body.error).toContain('CLOUDFLARE_ANALYTICS_TOKEN');
  });

  it('distingue le jeton manquant de l’identifiant de compte manquant', async () => {
    env.CLOUDFLARE_ACCOUNT_ID = undefined;
    const { res, body } = await lire();
    expect(res.status).toBe(409);
    expect(body.error).toContain('CLOUDFLARE_ACCOUNT_ID');
  });

  /** NORMATIF — un refus ne s'écrit pas dans les journaux (CLAUDE.md). */
  it('un refus de quota ne réveille personne — NORMATIF', async () => {
    const cri = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      env.CLOUDFLARE_ANALYTICS_TOKEN = undefined;
      const { res } = await lire();
      expect(res.status).toBeLessThan(500);
      expect(cri).not.toHaveBeenCalled();
    } finally {
      cri.mockRestore();
    }
  });

  it('exige un jeton de session', async () => {
    const res = await app.fetch(new Request('https://api.test/api/quotas'), env as any);
    expect(res.status).toBe(401);
  });
});
