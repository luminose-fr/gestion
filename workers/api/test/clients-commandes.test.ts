/**
 * Les commandes (SPEC §14.6 ; règles 5 et 6) : une clé ne décide qu'une fois,
 * la borne du jour se compte dans la même instruction, et la purge respecte
 * la durée de garde. Le parcours complet du questionnaire est dans
 * clients-questionnaire.test.ts.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { TestD1 } from './helpers/d1';
import { baseClients, compter, HEURE, MAINTENANT } from './helpers/clients';
import {
  formeCanonique, empreinteDe, decisionCommande, lireCommande, reponseAuRejeu, purgerLesCommandes, type NouvelleCommande,
} from '../src/clients/commandes';

const ENV = { PORTES_SECRET: 'secret-de-test' };
let base: TestD1;
let db: D1Database;
beforeEach(() => { base = baseClients(); db = base as unknown as D1Database; });

const commande = (cle: string, empreinte = 'e1', borne: string | null = 'commandes_questionnaire_max_jour'): NouvelleCommande => ({
  id: crypto.randomUUID(), porte: 'publique', cle, sorte: 'questionnaire', objetType: null, objetId: null,
  empreinte, recu: { ok: true }, borne,
});
const decider = async (c: NouvelleCommande, maintenant = MAINTENANT) => (await decisionCommande(db, c, maintenant).run()).meta.changes;

describe('l’empreinte d’un envoi', () => {
  it('ne dépend ni de l’ordre des clés ni de la clé d’envoi', async () => {
    const a = { cle: 'cle-a-0000000000000', b: { y: 1, x: [2, { d: 1, c: 2 }] }, a: 'v' };
    const b = { a: 'v', b: { x: [2, { c: 2, d: 1 }], y: 1 }, cle: 'cle-b-0000000000000' };
    expect(formeCanonique(a)).toBe(formeCanonique(b));
    expect(await empreinteDe(ENV, a)).toBe(await empreinteDe(ENV, b));
  });

  it('change avec le contenu, et avec le secret ; ne laisse rien lire du contenu', async () => {
    const e = await empreinteDe(ENV, { a: 'Repère' });
    expect(e).not.toBe(await empreinteDe(ENV, { a: 'Repere' }));
    expect(e).not.toBe(await empreinteDe({ PORTES_SECRET: 'autre' }, { a: 'Repère' }));
    expect(e).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('NORMATIF — une clé ne décide qu’une fois (règle 5)', () => {
  it('la même clé deux fois : une seule ligne ; une autre porte peut la réutiliser', async () => {
    expect(await decider(commande('cle-0000000000000001'))).toBe(1);
    expect(await decider(commande('cle-0000000000000001'))).toBe(0);
    expect(await decider({ ...commande('cle-0000000000000001', 'e', null), porte: 'service', sorte: 'confirmation' })).toBe(1);
    expect(compter(base, 'commandes')).toBe(2);
  });

  it('au rejeu : le même reçu pour la même empreinte, invalide sans champs sinon', async () => {
    await decider(commande('cle-0000000000000001', 'e1'));
    const vue = (await lireCommande(db, 'publique', 'cle-0000000000000001').first()) as any;
    expect(reponseAuRejeu(vue, 'e1')).toEqual({ ok: true });
    expect(reponseAuRejeu(vue, 'e2')).toEqual({ ok: false, motif: 'invalide', champs: [] });
  });
});

describe('NORMATIF — la borne du jour se décide dans l’instruction (règle 6)', () => {
  const borner = (n: number) => base.prepare(`UPDATE reglages SET valeur = ? WHERE cle = 'commandes_questionnaire_max_jour'`).bind(n).run();

  it('au-delà de la borne, rien ne s’écrit ; sur 24 heures glissantes', async () => {
    await borner(2);
    expect(await decider(commande('cle-0000000000000001'), MAINTENANT - 25 * HEURE)).toBe(1);
    expect(await decider(commande('cle-0000000000000002'))).toBe(1);
    expect(await decider(commande('cle-0000000000000003'))).toBe(1);
    expect(await decider(commande('cle-0000000000000004'))).toBe(0);
    expect(compter(base, 'commandes')).toBe(3);
  });

  it('la dernière place demandée deux fois en même temps : une seule commande', async () => {
    await borner(1);
    const issues = await Promise.all([decider(commande('cle-0000000000000001')), decider(commande('cle-0000000000000002'))]);
    expect(issues.sort()).toEqual([0, 1]);
    expect(compter(base, 'commandes')).toBe(1);
  });

  it('un réglage de borne absent vaut zéro', async () => {
    await base.prepare(`DELETE FROM reglages WHERE cle = 'commandes_questionnaire_max_jour'`).run();
    expect(await decider(commande('cle-0000000000000001'))).toBe(0);
  });
});

describe('la purge des reçus', () => {
  it('retire ce qui dépasse la garde, dans la limite, et rien d’autre', async () => {
    const vieux = MAINTENANT - 721 * HEURE;
    for (let i = 0; i < 3; i++) await decider(commande(`cle-vieille-00000000${i}`, 'e', null), vieux + i);
    await decider(commande('cle-recente-000000000', 'e', null), MAINTENANT - 719 * HEURE);
    expect(await purgerLesCommandes(db, MAINTENANT, 2)).toBe(2);
    expect(await purgerLesCommandes(db, MAINTENANT, 2)).toBe(1);
    expect(await purgerLesCommandes(db, MAINTENANT, 2)).toBe(0);
    expect(compter(base, 'commandes')).toBe(1);
  });
});
