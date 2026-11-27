/**
 * Les entrées nommées de gestion (SPEC §14.3) : elles enveloppent les fonctions
 * de S2a sans rien y changer. Le routage réel d'une liaison de service vers une
 * entrée ne se voit qu'en recette ; ici, `WorkerEntrypoint` est le substitut de
 * test/cloudflare-workers.ts.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MAINTENANT } from './helpers/clients';
import { envPortes, ficheEssai, seanceEssai, jetonDe, envoiComplet } from './helpers/portes';
import worker, { PortePublique, PorteService } from '../src/index';
import { makeEnv } from './helpers/d1';

const REPERES = ['Émilie', 'emilie.martin@example.org', '+33 6 39 98 00 01', 'Question d’essai 2', 'Bearer repere-jeton-make'];

let env: any;
let base: any;
let attentes: Promise<unknown>[];
let ctx: ExecutionContext;
beforeEach(() => {
  ({ env, base } = envPortes());
  attentes = [];
  ctx = { waitUntil: (p: Promise<unknown>) => { attentes.push(p); }, passThroughOnException: () => {} } as unknown as ExecutionContext;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(MAINTENANT);
});
afterEach(() => { vi.useRealTimers(); });

describe('PortePublique.questionnaire', () => {
  /** Retient la complétion de la fiche (le troisième lot) jusqu'à ce qu'on la libère. */
  const retenirLaSuite = () => {
    let liberer!: () => void;
    const porte = new Promise<void>((r) => { liberer = r; });
    const batch = env.CLIENTS.batch.bind(env.CLIENTS);
    let appels = 0;
    env.CLIENTS.batch = async (...a: unknown[]) => { if (++appels === 3) await porte; return batch(...a); };
    return liberer;
  };

  it('confie la complétion de la fiche à waitUntil, et rend la réponse sans l’attendre', async () => {
    ficheEssai(base, 'c1');
    seanceEssai(base, 's1', 'c1');
    const liberer = retenirLaSuite();
    const reponse = await new PortePublique(ctx, env).questionnaire(envoiComplet({ reference: await jetonDe('s1') }));
    expect(reponse).toEqual({ ok: true });
    expect(attentes).toHaveLength(1);
    // La réponse est rendue ; la fiche attend encore sa complétion.
    expect(base.query("SELECT telephone FROM clients WHERE id = 'c1'")[0].telephone).toBeNull();
    liberer();
    await Promise.all(attentes);
    expect(base.query("SELECT telephone FROM clients WHERE id = 'c1'")[0].telephone).toBe('+33 6 39 98 00 01');
  });

  it('une suite qui échoue se journalise par un code, sans rien de l’envoi, et ne change pas la réponse', async () => {
    const journal = vi.spyOn(console, 'error').mockImplementation(() => {});
    ficheEssai(base, 'c1');
    seanceEssai(base, 's1', 'c1');
    const batch = env.CLIENTS.batch.bind(env.CLIENTS);
    let appels = 0;
    env.CLIENTS.batch = async (...a: unknown[]) => { if (++appels === 3) throw new Error(REPERES.join(' ')); return batch(...a); };
    expect(await new PortePublique(ctx, env).questionnaire(envoiComplet({ reference: await jetonDe('s1') }))).toEqual({ ok: true });
    await Promise.all(attentes);
    expect(journal.mock.calls).toEqual([['porte.suite']]);
  });

  it.each([
    ['base non reliée', () => { delete env.CLIENTS; }, 'porte.non_reliee'],
    ['secret absent', () => { delete env.PORTES_SECRET; }, 'porte.non_configuree'],
    ['panne de la base', () => { env.CLIENTS.batch = async () => { throw new Error(`SQLITE: ${REPERES.join(' ')}`); }; }, 'porte.panne'],
  ])('%s : lève un code fixe, et ne journalise que lui', async (_nom, casser, code) => {
    const journal = vi.spyOn(console, 'error').mockImplementation(() => {});
    casser();
    await expect(new PortePublique(ctx, env).questionnaire(envoiComplet())).rejects.toThrow(new RegExp(`^${code.replace('.', '\\.')}$`));
    expect(journal.mock.calls).toEqual([[code]]);
  });
});

describe('PortePublique.lienQuestionnaire', () => {
  it('enveloppe la vérification de S2a', async () => {
    seanceEssai(base, 's1', null);
    const entree = new PortePublique(ctx, env);
    expect(await entree.lienQuestionnaire({ reference: await jetonDe('s1') })).toEqual({ ok: true });
    expect(await entree.lienQuestionnaire({ reference: await jetonDe('s1', { version: 4 }) })).toEqual({ ok: false, motif: 'lien_invalide' });
  });
});

describe('PorteService.confirmation', () => {
  it('sans autorisation valable : { autorisation: "refusee" }', async () => {
    const entree = new PorteService(ctx, { ...env, SERVICE_JETON_EMPREINTE: 'a'.repeat(64) });
    expect(await entree.confirmation(null, {})).toEqual({ autorisation: 'refusee' });
    expect(await entree.confirmation('Bearer repere-jeton-make', {})).toEqual({ autorisation: 'refusee' });
  });

  it('une panne lève un code fixe', async () => {
    const journal = vi.spyOn(console, 'error').mockImplementation(() => {});
    const jeton = 'jeton-make-de-test';
    const empreinte = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(jeton)))]
      .map((o) => o.toString(16).padStart(2, '0')).join('');
    const entree = new PorteService(ctx, { ...env, CLIENTS: undefined, SERVICE_JETON_EMPREINTE: empreinte });
    await expect(entree.confirmation(`Bearer ${jeton}`, { ordre: 'o1', issue: 'fait' })).rejects.toThrow(/^porte\.non_reliee$/);
    expect(journal.mock.calls).toEqual([['porte.non_reliee']]);
  });
});

describe('aucune adresse ne mène aux entrées (SPEC §14.3)', () => {
  it('l’export par défaut ne change pas : fetch et scheduled, et rien d’autre', () => {
    expect(Object.keys(worker).sort()).toEqual(['fetch', 'scheduled']);
  });

  it.each(['/v1/questionnaires', '/v1/questionnaires/lien', '/service/v1/confirmations', '/v1/essai', '/api/essai', '/api/portes/questionnaire'])(
    'POST %s sur gestion : 401 ou 404, jamais une entrée', async (chemin) => {
      const r = await worker.fetch(new Request(`https://gestion-recette.luminose.fr${chemin}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      }), makeEnv({ clients: true }) as never, ctx);
      expect([401, 404]).toContain(r.status);
    });
});
