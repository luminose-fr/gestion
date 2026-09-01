/**
 * La synthèse des mesures d'appels (migration 0006, route `/api/mesures`).
 *
 * Ce qui est vérifié ici n'est pas qu'une moyenne se calcule : c'est qu'elle
 * ne mente pas. Un échec ne doit peser sur aucune moyenne, et un débit doit
 * valoir « on ne sait pas » plutôt qu'un nombre inventé quand le fournisseur
 * n'a rien déclaré — c'est sur cette colonne que se décideront les budgets.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import app from '../src/index';
import { createSessionToken } from '../src/auth';
import { makeEnv } from './helpers/d1';

let env: ReturnType<typeof makeEnv>;
let token: string;
let compteur = 0;

const lire = async () => {
  const res = await app.fetch(new Request('https://api.test/api/mesures', {
    headers: { 'X-Session-Token': token },
  }), env as any);
  return { res, mesures: ((await res.json()) as any).mesures as any[] };
};

const seed = async (m: {
  action?: string | null;
  format?: string | null;
  modelLabel?: string;
  provider?: string;
  entree?: number | null;
  sortie?: number | null;
  cout?: number | null;
  dureeMs?: number;
  feuilleCar?: number;
  ok?: boolean;
  erreur?: string | null;
}) => {
  // `??` confondrait `null` (le fournisseur n'a rien déclaré) et `undefined`
  // (le test s'en remet au défaut) — or c'est précisément la distinction que
  // ces mesures ont pour métier de garder.
  const ou = <T,>(v: T | undefined, defaut: T): T => (v === undefined ? defaut : v);

  await (env.DB as any).prepare(
    `INSERT INTO mesures_ia (id, action, format, model_id, model_label, provider,
                             prompt_tokens, completion_tokens, cost_usd,
                             duree_ms, feuille_car, ok, erreur, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    `mes-${compteur++}`, ou(m.action, 'DRAFT_CONTENT'), ou(m.format, 'Article (long/SEO)'),
    'm-1', ou(m.modelLabel, 'Kimi K3'), ou(m.provider, 'openrouter'),
    ou(m.entree, 16264), ou(m.sortie, 18073), ou(m.cout, 0.32),
    ou(m.dureeMs, 594_000), ou(m.feuilleCar, 24178), m.ok === false ? 0 : 1,
    ou(m.erreur, null), Date.now(),
  ).run();
};

beforeEach(async () => {
  env = makeEnv();
  token = await createSessionToken(env);
  compteur = 0;
});

describe('synthèse des mesures', () => {
  it('agrège par action, format et modèle', async () => {
    await seed({});
    await seed({});
    await seed({ action: 'COACH_CHAT', format: null, sortie: 900, dureeMs: 30_000 });

    const { res, mesures } = await lire();
    expect(res.status).toBe(200);
    expect(mesures).toHaveLength(2);

    const redaction = mesures.find(m => m.action === 'DRAFT_CONTENT');
    expect(redaction.appels).toBe(2);
    expect(redaction.sortieMoy).toBe(18073);
    expect(redaction.modelLabel).toBe('Kimi K3');
    expect(redaction.coutTotal).toBeCloseTo(0.64, 5);
  });

  /**
   * Le débit est la raison d'être de cet écran : 18 073 jetons en 594 secondes
   * font 30 jetons/s, et c'est ce chiffre — pas la durée seule — qui dit si le
   * problème vient du modèle ou de l'hébergeur.
   */
  it('calcule le débit en jetons par seconde', async () => {
    await seed({});
    const { mesures } = await lire();
    expect(mesures[0].jetonsParSeconde).toBeCloseTo(30.4, 1);
  });

  /**
   * NORMATIF — un échec ne pèse sur aucune moyenne.
   *
   * Sans cette exclusion, un refus rendu en trois secondes ferait passer un
   * modèle lent pour un modèle rapide. L'échec doit se voir, mais dans sa
   * propre colonne.
   */
  it('exclut les échecs des moyennes et les compte à part — NORMATIF', async () => {
    await seed({ dureeMs: 594_000 });
    await seed({ ok: false, entree: null, sortie: null, cout: null, dureeMs: 3_000, erreur: 'crédits épuisés' });

    const { mesures } = await lire();
    expect(mesures).toHaveLength(1);
    expect(mesures[0].appels).toBe(2);
    expect(mesures[0].echecs).toBe(1);
    // La moyenne reste celle du seul appel abouti : 594 s, et non 298 s.
    expect(mesures[0].dureeMoyMs).toBe(594_000);
    expect(mesures[0].sortieMoy).toBe(18073);
  });

  /**
   * 1min.ai ne rend aucun décompte. `null` veut dire « on ne sait pas », jamais
   * « zéro » (0004) — et un débit qu'on ne sait pas calculer ne s'invente pas.
   */
  it('rend un débit nul quand le fournisseur ne compte pas', async () => {
    await seed({ provider: 'onemin', modelLabel: 'Modèle muet', entree: null, sortie: null, cout: null });

    const { mesures } = await lire();
    expect(mesures[0].sortieMoy).toBeNull();
    expect(mesures[0].jetonsParSeconde).toBeNull();
    expect(mesures[0].coutTotal).toBeNull();
    // La durée, elle, est toujours connue : elle se mesure de notre côté.
    expect(mesures[0].dureeMoyMs).toBe(594_000);
  });

  it('rend une liste vide tant qu’aucun appel n’a été mesuré', async () => {
    const { res, mesures } = await lire();
    expect(res.status).toBe(200);
    expect(mesures).toEqual([]);
  });

  it('exige un jeton de session', async () => {
    const res = await app.fetch(new Request('https://api.test/api/mesures'), env as any);
    expect(res.status).toBe(401);
  });
});
