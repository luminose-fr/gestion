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

type Reponse = { data?: unknown; errors?: unknown[]; status?: number };

/**
 * La route fait DEUX appels — consommation et stockage vivent dans des
 * datasets distincts. Le stub répond donc selon la requête envoyée, ce qui
 * permet d'en faire échouer un seul.
 */
const stubCloudflare = (consommation: Reponse, stockageRep: Reponse = { data: null }, autres: Record<string, Reponse> = {}) =>
  vi.stubGlobal('fetch', async (_url: string, init: any) => {
    const query = String(JSON.parse(init.body).query);
    // Chaque jeu de données a sa requête : R2 et Workers AI se reconnaissent à leur nom.
    const autre = Object.keys(autres).find(nom => query.includes(nom));
    const r = autre ? autres[autre] : query.includes('d1StorageAdaptiveGroups') ? stockageRep : consommation;
    return new Response(
      JSON.stringify({ data: r.data ?? null, ...(r.errors ? { errors: r.errors } : {}) }),
      { status: r.status ?? 200 },
    );
  });

const COMPTE = (workers: unknown, d1: unknown) => ({
  viewer: { accounts: [{ workersInvocationsAdaptive: workers, d1AnalyticsAdaptiveGroups: d1 }] },
});

const STOCKAGE_VIDE = { viewer: { accounts: [{ d1StorageAdaptiveGroups: [] }] } };

const STOCKAGE = (octets: number) => ({
  viewer: { accounts: [{ d1StorageAdaptiveGroups: [{ max: { databaseSizeBytes: octets } }] }] },
});

beforeEach(async () => {
  env = { ...makeEnv(), CLOUDFLARE_ANALYTICS_TOKEN: 'jeton-cf', CLOUDFLARE_ACCOUNT_ID: 'compte-cf' };
  token = await createSessionToken(env);
});

describe('quotas Cloudflare', () => {
  it('compose les quatre postes à partir des deux jeux de données', async () => {
    stubCloudflare(
      { data: COMPTE(
        [{ sum: { requests: 1200 } }, { sum: { requests: 300 } }],
        [{ sum: { rowsRead: 40_000, rowsWritten: 900 } }],
      ) },
      { data: STOCKAGE(12_500_000) },
    );

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
    stubCloudflare({ data: COMPTE([], []) }, { data: STOCKAGE_VIDE });

    const { body } = await lire();
    for (const poste of body.postes) expect(poste.valeur).toBeNull();
  });

  /**
   * L'API GraphQL sert ses refus en 200 avec un tableau `errors` — un échec
   * déguisé en succès. Sans cette lecture, l'écran afficherait quatre postes à
   * « — » en laissant croire à une consommation nulle.
   */
  it('traite un refus GraphQL servi en 200 comme un échec', async () => {
    stubCloudflare({ errors: [{ message: 'not entitled to access this dataset' }] });

    const { res, body } = await lire();
    expect(res.status).toBe(502);
    expect(body.error).toContain('not entitled');
  });

  /**
   * NORMATIF — le stockage tombe SEUL.
   *
   * Le 01/09/2026, `unknown field "max"` a vidé les quatre postes d'un coup :
   * la taille de la base était demandée dans le dataset des requêtes, et son
   * refus emportait toute la requête. Un dataset qui change de forme, ou qu'un
   * compte n'a pas, ne doit coûter que son propre poste — et ce poste doit dire
   * ce qui lui manque au lieu de se lire comme un zéro.
   */
  it('perd le seul poste de stockage quand son dataset refuse — NORMATIF', async () => {
    stubCloudflare(
      { data: COMPTE([{ sum: { requests: 1200 } }], [{ sum: { rowsRead: 40_000, rowsWritten: 900 } }]) },
      { errors: [{ message: 'unknown field "max"' }] },
    );

    const { res, body } = await lire();
    expect(res.status).toBe(200);

    const par = Object.fromEntries(body.postes.map((p: any) => [p.id, p]));
    expect(par['workers-requetes'].valeur).toBe(1200);
    expect(par['d1-lignes-lues'].valeur).toBe(40_000);
    expect(par['d1-stockage'].valeur).toBeNull();
    expect(par['d1-stockage'].note).toContain('unknown field');
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

  /**
   * R2 et Workers AI (SPEC §12.4.2) : R2 FACTURE au-delà de son gratuit, il
   * se surveille au mois ; Workers AI refuse au-delà, il se surveille au jour.
   */
  describe('R2 et Workers AI', () => {
    const CONSO = { data: COMPTE([{ sum: { requests: 10 } }], [{ sum: { rowsRead: 1, rowsWritten: 1 } }]) };
    const R2_OPS = { data: { viewer: { accounts: [{ r2OperationsAdaptiveGroups: [
      { sum: { requests: 40 }, dimensions: { actionType: 'UploadPart' } },
      { sum: { requests: 2 }, dimensions: { actionType: 'CompleteMultipartUpload' } },
      { sum: { requests: 900 }, dimensions: { actionType: 'GetObject' } },
      { sum: { requests: 7 }, dimensions: { actionType: 'DeleteObject' } },
      { sum: { requests: 3 }, dimensions: { actionType: 'OperationInconnue' } },
    ] }] } } };
    const R2_STOCKAGE = { data: { viewer: { accounts: [{ r2StorageAdaptiveGroups: [
      { max: { payloadSize: 2_000_000_000, metadataSize: 1000 }, dimensions: { bucketName: 'luminose-montage' } },
      { max: { payloadSize: 500_000_000, metadataSize: 0 }, dimensions: { bucketName: 'autre' } },
    ] }] } } };
    const IA = { data: { viewer: { accounts: [{ aiInferenceAdaptiveGroups: [
      { sum: { totalNeurons: 140 } }, { sum: { totalNeurons: 93.5 } },
    ] }] } } };

    it('classe les opérations, additionne les buckets et les neurones', async () => {
      stubCloudflare(CONSO, { data: STOCKAGE(1) }, {
        r2OperationsAdaptiveGroups: R2_OPS, r2StorageAdaptiveGroups: R2_STOCKAGE, aiInferenceAdaptiveGroups: IA,
      });
      const { res, body } = await lire();
      expect(res.status).toBe(200);
      const par = Object.fromEntries(body.postes.map((p: any) => [p.id, p]));
      // Une opération inconnue compte en classe A : le plafond le plus bas, l'erreur qui ne rassure pas.
      expect(par['r2-classe-a']).toMatchObject({ valeur: 45, seuil: 1_000_000, periode: 'mois', service: 'R2' });
      // Les opérations gratuites (DeleteObject) ne comptent nulle part.
      expect(par['r2-classe-b']).toMatchObject({ valeur: 900, seuil: 10_000_000, periode: 'mois' });
      // Le gratuit est celui du compte : tous les buckets s'additionnent.
      expect(par['r2-stockage']).toMatchObject({ valeur: 2_500_001_000, seuil: 10_000_000_000, periode: 'total', unite: 'octets' });
      expect(par['ia-neurones']).toMatchObject({ valeur: 233.5, seuil: 10_000, periode: 'jour', unite: 'neurones' });
      // Les plafonds relevés à part portent leur propre date.
      expect(par['r2-stockage'].releveLe).toBe('2026-10-04');
      expect(par['workers-requetes'].releveLe).toBeUndefined();
    });

    it('perd ses seuls postes quand un jeu de données refuse — et le dit', async () => {
      stubCloudflare(CONSO, { data: STOCKAGE(1) }, {
        r2OperationsAdaptiveGroups: { errors: [{ message: 'not entitled to r2' }] },
        r2StorageAdaptiveGroups: R2_STOCKAGE,
        aiInferenceAdaptiveGroups: { errors: [{ message: 'unknown field "totalNeurons"' }] },
      });
      const { res, body } = await lire();
      expect(res.status).toBe(200);
      const par = Object.fromEntries(body.postes.map((p: any) => [p.id, p]));
      expect(par['r2-classe-a'].valeur).toBeNull();
      expect(par['r2-classe-a'].note).toContain('not entitled to r2');
      expect(par['ia-neurones'].valeur).toBeNull();
      expect(par['ia-neurones'].note).toContain('totalNeurons');
      expect(par['r2-stockage'].valeur).toBe(2_500_001_000);
      expect(par['workers-requetes'].valeur).toBe(10);
    });

    it('interroge les opérations de R2 depuis le 1er du mois, UTC', async () => {
      const requetes: string[] = [];
      vi.stubGlobal('fetch', async (_url: string, init: any) => {
        requetes.push(String(JSON.parse(init.body).query));
        return new Response(JSON.stringify({ data: COMPTE([], []) }), { status: 200 });
      });
      await lire();
      const r2 = requetes.find(q => q.includes('r2OperationsAdaptiveGroups'))!;
      const maintenant = new Date();
      const premier = new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), 1)).toISOString();
      expect(r2).toContain(premier);
    });
  });

  it('exige un jeton de session', async () => {
    const res = await app.fetch(new Request('https://api.test/api/quotas'), env as any);
    expect(res.status).toBe(401);
  });
});
