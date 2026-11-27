/**
 * Les jetons des liens (SPEC §14.5) : un jeton n'ouvre que son usage, sur son
 * objet, jusqu'à son échéance ; tout le reste rend le même `null`.
 */
import { describe, it, expect } from 'vitest';
import { signerJeton, verifierJeton, empreinteHmac, type ContenuJeton } from '../src/clients/jetons';

const ENV = { PORTES_SECRET: 'secret-des-portes-de-test' };
const MAINTENANT = Date.UTC(2026, 11, 1, 10, 0);
const CONTENU: ContenuJeton = { usage: 'questionnaire', objet: 'seance-essai', echeance: MAINTENANT + 3_600_000, version: 1 };

describe('les jetons des liens', () => {
  it('un jeton signé se vérifie, et rend son contenu', async () => {
    const jeton = await signerJeton(ENV, CONTENU);
    expect(jeton).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(await verifierJeton(ENV, jeton, 'questionnaire', MAINTENANT)).toEqual(CONTENU);
  });

  it('faux, tronqué, échu, d’un autre usage, contenu modifié, autre secret : null', async () => {
    const jeton = await signerJeton(ENV, CONTENU);
    const [charge, signature] = jeton.split('.');
    const modifie = Buffer.from(JSON.stringify({ u: 'questionnaire', o: 'autre-seance', e: CONTENU.echeance, v: 1 })).toString('base64url');
    const autreUsage = await signerJeton(ENV, { ...CONTENU, usage: 'creneau' as any });
    const cas = [
      'pas-un-jeton',
      '',
      jeton.slice(0, -3),
      charge,
      `${charge}.${signature}.x`,
      `${modifie}.${signature}`,
      `${charge}.${signature.slice(0, -1)}A`,
      autreUsage,
    ];
    for (const c of cas) expect(await verifierJeton(ENV, c, 'questionnaire', MAINTENANT), c).toBeNull();
    expect(await verifierJeton(ENV, jeton, 'questionnaire', CONTENU.echeance)).toBeNull();
    expect(await verifierJeton({ PORTES_SECRET: 'un-autre-secret' }, jeton, 'questionnaire', MAINTENANT)).toBeNull();
    expect(await verifierJeton({}, jeton, 'questionnaire', MAINTENANT)).toBeNull();
  });

  it('sans secret, rien ne se signe : une panne', async () => {
    await expect(signerJeton({}, CONTENU)).rejects.toThrow();
    await expect(signerJeton({ PORTES_SECRET: '  ' }, CONTENU)).rejects.toThrow();
    await expect(empreinteHmac({}, 'x')).rejects.toThrow();
  });

  it('les deux emplois du secret ne se confondent pas', async () => {
    const jeton = await signerJeton(ENV, CONTENU);
    const [charge, signature] = jeton.split('.');
    const empreinte = await empreinteHmac(ENV, charge);
    expect(Buffer.from(signature, 'base64url').toString('hex')).not.toBe(empreinte);
    expect(await empreinteHmac(ENV, 'a')).toBe(await empreinteHmac(ENV, 'a'));
    expect(await empreinteHmac(ENV, 'a')).not.toBe(await empreinteHmac({ PORTES_SECRET: 'autre' }, 'a'));
  });
});
