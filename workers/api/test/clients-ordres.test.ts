/**
 * Les ordres vers Make, leurs confirmations, et le passage planifié
 * (SPEC §14.6, §14.7 ; règle 9). `fetch` est simulé : aucun appel réseau.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TestD1 } from './helpers/d1';
import { compter, MAINTENANT, MINUTE, HEURE } from './helpers/clients';
import { envPortes, executer, ficheEssai, seanceEssai, jetonDe, envoiComplet } from './helpers/portes';
import { questionnaire } from '../src/clients/portes/publique';
import { releverLesOrdres, composer, EN_TETE_SECRET_MAKE } from '../src/clients/ordres';
import { confirmation } from '../src/clients/portes/service';
import { passer } from '../src/clients/passage';
import { DECLENCHEURS } from '../src/declencheurs';
import { resoudre } from '../scripts/configuration';
import worker from '../src/index';

const WEBHOOK = 'https://hook.example.org/essai-message-email';
const DETOURNEMENT = 'detournement.recette@example.org';
const JETON_MAKE = 'jeton-de-service-de-test';
const empreinte = async (t: string) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))].map((o) => o.toString(16).padStart(2, '0')).join('');

let env: any;
let base: TestD1;
let appels: { url: string; init: RequestInit; corps: any }[];

beforeEach(async () => {
  ({ env, base } = envPortes({
    ENVIRONNEMENT: 'recette', MAKE_WEBHOOK_MESSAGE_EMAIL: WEBHOOK, MAKE_SECRET: 'secret-make-de-test',
    DETOURNEMENT_EMAIL: DETOURNEMENT, SERVICE_JETON_EMPREINTE: await empreinte(JETON_MAKE),
  }));
  executer(base, `INSERT INTO messages_modeles (id, cle, canal, version, objet, corps, created_at, updated_at)
    VALUES ('m1', 'questionnaire_accuse', 'email', 1, 'Accusé d''essai pour {{prenom}}', 'Texte d''essai — accusé de réception, {{prenom}}.

Second paragraphe <d''essai>.', 0, 0)`);
  appels = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    appels.push({ url: String(url), init, corps: JSON.parse(String(init.body)) });
    return new Response('Accepted', { status: 200 });
  }));
});
afterEach(() => vi.unstubAllGlobals());

/** Un questionnaire reçu : un ordre `prevu`. Rend l'identifiant de l'ordre. */
const unOrdre = async (identite?: Record<string, unknown>) => {
  await questionnaire(env, envoiComplet(identite ? { identite } : {}), MAINTENANT);
  return String(base.query('SELECT id FROM ordres ORDER BY created_at DESC, rowid DESC')[0].id);
};
const ordre = (id: string) => base.query('SELECT * FROM ordres WHERE id = ?', id)[0] as any;
const alertes = (sorte: string) => compter(base, 'alertes', 'sorte = ?', sorte);
const relever = (e = env, maintenant = MAINTENANT, limite?: number) => releverLesOrdres(e, maintenant, limite);

describe('remettre : ce qu’il faut avant tout appel', () => {
  it.each([
    ['sans webhook', { MAKE_WEBHOOK_MESSAGE_EMAIL: undefined }, 'webhook_absent'],
    ['sans secret Make', { MAKE_SECRET: '' }, 'secret_absent'],
    ['hors production sans détournement', { DETOURNEMENT_EMAIL: undefined }, 'detournement_absent'],
    ['détournement qui n’est pas une adresse', { DETOURNEMENT_EMAIL: 'florent' }, 'detournement_absent'],
    ['détournement qui n’est pas unique', { DETOURNEMENT_EMAIL: `${DETOURNEMENT}, autre@example.org` }, 'detournement_absent'],
  ])('%s : l’ordre reste prévu, rien n’est appelé', async (_nom, manque, raison) => {
    const id = await unOrdre();
    expect(await relever({ ...env, ...manque })).toMatchObject({ examines: 0, remis: 0, attente: raison });
    expect(appels).toEqual([]);
    expect(ordre(id)).toMatchObject({ etat: 'prevu', tentatives: 0 });
  });
});

describe('remettre : le message composé au départ, et détourné hors production', () => {
  it('recette : le destinataire transmis est celui du détournement, l’objet préfixé, le secret en en-tête', async () => {
    const id = await unOrdre({ prenom: 'Zoé', nom: 'Essai', email: 'zoe.essai@example.org' });
    expect(await relever()).toMatchObject({ examines: 1, remis: 1 });
    expect(appels).toHaveLength(1);
    const [{ url, init, corps }] = appels;
    expect(url).toBe(WEBHOOK);
    expect((init.headers as Record<string, string>)[EN_TETE_SECRET_MAKE]).toBe('secret-make-de-test');
    expect(corps).toEqual({
      ordre: id, type: 'message.email',
      destinataire: { nom: 'Zoé Essai', email: DETOURNEMENT },
      objet: "[Recette] Accusé d'essai pour Zoé",
      texte: "Texte d'essai — accusé de réception, Zoé.\n\nSecond paragraphe <d'essai>.",
      html: "<p>Texte d&#39;essai — accusé de réception, Zoé.</p><p>Second paragraphe &lt;d&#39;essai&gt;.</p>",
      pieces: [],
    });
    expect(JSON.stringify(corps)).not.toContain('zoe.essai@example.org');
    expect(ordre(id)).toMatchObject({ etat: 'confie_a_make', tentatives: 1, confie_le: MAINTENANT, premiere_remise_le: MAINTENANT });
  });

  it('ENVIRONNEMENT absent : on détourne', async () => {
    await unOrdre();
    await relever({ ...env, ENVIRONNEMENT: undefined });
    expect(appels[0].corps.destinataire.email).toBe(DETOURNEMENT);
  });

  it('production : le vrai destinataire, sans préfixe', async () => {
    await unOrdre();
    await relever({ ...env, ENVIRONNEMENT: 'production', DETOURNEMENT_EMAIL: undefined });
    expect(appels[0].corps.destinataire).toEqual({ nom: 'Émilie Martin', email: 'emilie.martin@example.org' });
    expect(appels[0].corps.objet).not.toMatch(/Recette/);
  });

  it('une valeur insérée est échappée dans le HTML', () => {
    expect(composer({ objet: 'O', corps: 'Bonjour {{prenom}}' }, { prenom: '<b>Zoé</b>' }).html).toBe('<p>Bonjour &lt;b&gt;Zoé&lt;/b&gt;</p>');
  });

  it('sans modèle : l’ordre reste prévu, une alerte modele_absent, une seule', async () => {
    executer(base, 'DELETE FROM messages_modeles');
    const id = await unOrdre();
    await relever();
    await relever();
    expect(appels).toEqual([]);
    expect(ordre(id).etat).toBe('prevu');
    expect(base.query("SELECT objet_type, objet_id FROM alertes WHERE sorte = 'modele_absent'")).toEqual([{ objet_type: 'modele', objet_id: 'questionnaire_accuse' }]);
  });

  it('l’objet a disparu : l’ordre est annulé, rien n’est appelé', async () => {
    const id = await unOrdre();
    executer(base, 'DELETE FROM questionnaires');
    await relever();
    expect(appels).toEqual([]);
    expect(ordre(id)).toMatchObject({ etat: 'annule', motif: 'objet_absent' });
  });
});

describe('remettre : une fois, puis relancer, puis renoncer', () => {
  it('non confirmé : représenté après le délai, pas avant ; puis en échec à la borne, avec son alerte', async () => {
    const id = await unOrdre();
    await relever();
    await relever(env, MAINTENANT + 14 * MINUTE);
    expect(appels).toHaveLength(1);
    let t = MAINTENANT;
    for (let i = 2; i <= 5; i++) {
      t += 15 * MINUTE;
      await relever(env, t);
      expect(ordre(id).tentatives).toBe(i);
    }
    expect(appels).toHaveLength(5);
    expect(ordre(id).premiere_remise_le).toBe(MAINTENANT);
    await relever(env, t + 15 * MINUTE);
    expect(appels).toHaveLength(5);
    expect(ordre(id)).toMatchObject({ etat: 'echec', motif: 'sans_confirmation' });
    expect(alertes('message_echec')).toBe(1);
  });

  it('deux passages simultanés : un seul appel, à la première remise comme à la relance', async () => {
    const id = await unOrdre();
    await Promise.all([relever(), relever()]);
    expect(appels).toHaveLength(1);
    await Promise.all([relever(env, MAINTENANT + 15 * MINUTE), relever(env, MAINTENANT + 15 * MINUTE)]);
    expect(appels).toHaveLength(2);
    expect(ordre(id).tentatives).toBe(2);
    expect(alertes('borne_atteinte')).toBe(0);
  });

  it('un Make injoignable : l’ordre reste pris, et sera représenté ; un code dans les journaux, rien d’autre', async () => {
    const journal = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error(`réseau coupé vers ${WEBHOOK}`); }));
    const id = await unOrdre();
    await relever();
    expect(ordre(id).etat).toBe('confie_a_make');
    expect(journal.mock.calls).toEqual([['incident: remise_make_echouee']]);
    journal.mockRestore();
  });

  it('la limite d’un passage est tenue', async () => {
    for (let i = 0; i < 4; i++) await unOrdre();
    expect(await relever(env, MAINTENANT, 3)).toMatchObject({ examines: 3, remis: 3 });
    expect(await relever(env, MAINTENANT, 3)).toMatchObject({ examines: 1, remis: 1 });
  });
});

describe('la borne des e-mails du jour', () => {
  beforeEach(() => executer(base, `UPDATE reglages SET valeur = 2 WHERE cle = 'emails_max_jour'`));

  it('compte les premières remises, pas les relances ; au-delà, l’ordre attend avec une alerte', async () => {
    const ids = [await unOrdre(), await unOrdre(), await unOrdre()];
    await relever();
    expect(appels).toHaveLength(2);
    // Lequel attend dépend de l'ordre de relève ; il en reste un, et un seul.
    const [c] = ids.filter((id) => ordre(id).etat === 'prevu');
    const [a, b] = ids.filter((id) => id !== c);
    expect(ordre(c)).toMatchObject({ etat: 'prevu', tentatives: 0 });
    expect(alertes('borne_atteinte')).toBe(1);
    // Les relances de a et b passent, la borne ne bouge pas pour elles.
    await relever(env, MAINTENANT + 15 * MINUTE);
    expect(ordre(a).tentatives).toBe(2);
    expect(ordre(b).tentatives).toBe(2);
    expect(ordre(c).etat).toBe('prevu');
    // Vingt-quatre heures plus tard, c part.
    await relever(env, MAINTENANT + 24 * HEURE + MINUTE);
    expect(ordre(c).etat).toBe('confie_a_make');
  });

  it('sa dernière place ne se prend pas à deux', async () => {
    executer(base, `UPDATE reglages SET valeur = 1 WHERE cle = 'emails_max_jour'`);
    await unOrdre();
    await unOrdre();
    await Promise.all([relever(), relever()]);
    expect(appels).toHaveLength(1);
    expect(compter(base, 'ordres', 'premiere_remise_le IS NOT NULL')).toBe(1);
  });
});

describe('confirmer (contrat §4.2)', () => {
  const confirmer = (envoi: unknown, autorisation: string | null = `Bearer ${JETON_MAKE}`) => confirmation(env, autorisation, envoi, MAINTENANT + MINUTE);
  const confie = async () => { const id = await unOrdre(); await relever(); return id; };

  it('fait → fait, le résultat gardé, la commande de service écrite', async () => {
    const id = await confie();
    expect(await confirmer({ ordre: id, issue: 'fait', resultat: { identifiant_externe: 'essai-envoi-1' } })).toEqual({ ok: true });
    expect(ordre(id)).toMatchObject({ etat: 'fait', termine_le: MAINTENANT + MINUTE, resultat: '{"identifiant_externe":"essai-envoi-1"}' });
    expect(base.query("SELECT porte, cle, sorte, objet_id FROM commandes WHERE porte = 'service'")).toEqual([
      { porte: 'service', cle: id, sorte: 'confirmation', objet_id: id },
    ]);
  });

  it('en double : sans effet', async () => {
    const id = await confie();
    await confirmer({ ordre: id, issue: 'fait' });
    const avant = ordre(id);
    expect(await confirmer({ ordre: id, issue: 'fait' })).toEqual({ ok: true });
    expect(ordre(id)).toEqual(avant);
    expect(compter(base, 'commandes', "porte = 'service'")).toBe(1);
    expect(compter(base, 'alertes')).toBe(1); // le questionnaire à rapprocher, et lui seul
  });

  it('contraire : une alerte, l’ordre inchangé, { ok: true }', async () => {
    const id = await confie();
    await confirmer({ ordre: id, issue: 'fait' });
    expect(await confirmer({ ordre: id, issue: 'echec', motif: 'adresse_refusee' })).toEqual({ ok: true });
    expect(ordre(id).etat).toBe('fait');
    expect(alertes('confirmation_contraire')).toBe(1);
  });

  it('un échec : l’ordre en échec, son motif, son alerte', async () => {
    const id = await confie();
    expect(await confirmer({ ordre: id, issue: 'echec', motif: 'adresse_refusee' })).toEqual({ ok: true });
    expect(ordre(id)).toMatchObject({ etat: 'echec', motif: 'adresse_refusee' });
    expect(alertes('message_echec')).toBe(1);
  });

  it('un échec sans motif : invalide', async () => {
    const id = await confie();
    expect(await confirmer({ ordre: id, issue: 'echec' })).toEqual({ ok: false, motif: 'invalide', champs: ['motif'] });
    expect(ordre(id).etat).toBe('confie_a_make');
  });

  it('un ordre jamais confié, ou annulé : invalide, et sa clé n’est pas consommée', async () => {
    const id = await unOrdre();
    expect(await confirmer({ ordre: id, issue: 'fait' })).toEqual({ ok: false, motif: 'invalide', champs: ['ordre'] });
    expect(compter(base, 'commandes', "porte = 'service'")).toBe(0);
    await relever();
    expect(await confirmer({ ordre: id, issue: 'fait' })).toEqual({ ok: true });
    executer(base, `UPDATE ordres SET etat = 'annule' WHERE id = '${id}'`);
    const autre = await unOrdre();
    executer(base, `UPDATE ordres SET etat = 'annule' WHERE id = '${autre}'`);
    expect(await confirmer({ ordre: autre, issue: 'fait' })).toEqual({ ok: false, motif: 'invalide', champs: ['ordre'] });
    expect(await confirmer({ ordre: 'ordre-inconnu', issue: 'fait' })).toEqual({ ok: false, motif: 'invalide', champs: ['ordre'] });
  });

  it('le jeton de service : absent, faux, sans empreinte posée → refusé, et rien n’est lu', async () => {
    const id = await confie();
    const avant = ordre(id);
    expect(await confirmer({ ordre: id, issue: 'fait' }, null)).toEqual({ autorisation: 'refusee' });
    expect(await confirmer({ ordre: id, issue: 'fait' }, 'Bearer faux')).toEqual({ autorisation: 'refusee' });
    expect(await confirmer({ ordre: id, issue: 'fait' }, JETON_MAKE)).toEqual({ autorisation: 'refusee' });
    expect(await confirmation({ ...env, SERVICE_JETON_EMPREINTE: undefined }, `Bearer ${JETON_MAKE}`, { ordre: id, issue: 'fait' }, MAINTENANT))
      .toEqual({ autorisation: 'refusee' });
    expect(ordre(id)).toEqual(avant);
  });
});

describe('le passage planifié', () => {
  it('sans CLIENTS : ne fait rien, ne lève rien', async () => {
    expect(await passer({ PORTES_SECRET: 'x' } as any, MAINTENANT)).toBeNull();
  });

  it('relève les ordres, reprend une fiche jamais complétée, purge les vieux reçus', async () => {
    ficheEssai(base, 'c1');
    seanceEssai(base, 's1', 'c1');
    // `suite` n'est jamais jouée : le Worker s'est arrêté.
    await questionnaire(env, envoiComplet({ reference: await jetonDe('s1') }), MAINTENANT);
    expect(base.query('SELECT ville FROM clients')[0].ville).toBeNull();
    const bilan = await passer(env, MAINTENANT + 721 * HEURE);
    expect(bilan).toMatchObject({ ordres: { remis: 1 }, fiches: 1, purgees: 1 });
    expect(base.query('SELECT ville FROM clients')[0].ville).toBe('Toulouse');
    expect(await passer(env, MAINTENANT + 722 * HEURE)).toMatchObject({ fiches: 0, purgees: 0 });
  });

  it('le gestionnaire scheduled distingue ses déclencheurs : la veille ne relève pas les ordres', async () => {
    await unOrdre();
    const attente: Promise<unknown>[] = [];
    const ctx = { waitUntil: (p: Promise<unknown>) => attente.push(p) } as any;
    // Le gestionnaire lit l'horloge : la mettre à l'heure des ordres.
    vi.useFakeTimers({ now: MAINTENANT + MINUTE, toFake: ['Date'] });
    worker.scheduled({ cron: DECLENCHEURS.veille } as any, { ...env, DB: undefined }, { waitUntil: (p: Promise<unknown>) => p.catch(() => {}) } as any);
    expect(appels.filter((a) => a.url === WEBHOOK)).toHaveLength(0);
    worker.scheduled({ cron: DECLENCHEURS.passage } as any, env, ctx);
    await Promise.all(attente);
    vi.useRealTimers();
    expect(appels.filter((a) => a.url === WEBHOOK)).toHaveLength(1);
  });

  it('wrangler.toml ne déclare que des déclencheurs nommés ; la production garde la seule veille', () => {
    const source = readFileSync(join(import.meta.dirname, '..', 'wrangler.toml'), 'utf8');
    const connus = Object.values(DECLENCHEURS) as string[];
    for (const nom of [null, 'recette', 'local']) {
      for (const cron of resoudre(source, nom).crons) expect(connus, `${nom} : ${cron}`).toContain(cron);
    }
    expect(resoudre(source, null).crons).toEqual([DECLENCHEURS.veille]);
    expect(resoudre(source, 'recette').crons).toEqual([DECLENCHEURS.passage]);
  });
});
