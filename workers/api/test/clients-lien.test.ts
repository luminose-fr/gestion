/**
 * Vérifier le lien d'un questionnaire à l'ouverture (SPEC §14.5, §14.6.1,
 * point 1 — décision du 27/11/2026), sur des identités fictives.
 *
 * Ce que ces tests protègent : une page qui dirait « valable » à un lien que
 * l'envoi traiterait « à rapprocher », ou l'inverse ; une vérification qui
 * écrirait ; des cas invalides qui se distingueraient par leur chemin.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { TestD1 } from './helpers/d1';
import { MAINTENANT, HEURE } from './helpers/clients';
import { envPortes, executer, ficheEssai, seanceEssai, jetonDe, envoiComplet, espionner } from './helpers/portes';
import { questionnaire, verifierLienQuestionnaire } from '../src/clients/portes/publique';

let env: any;
let base: TestD1;
beforeEach(() => {
  ({ env, base } = envPortes());
  ficheEssai(base, 'c1');
  seanceEssai(base, 's1', 'c1');
});

const verifier = (envoi: unknown, maintenant = MAINTENANT) => verifierLienQuestionnaire(env, envoi, maintenant);
const lienDe = async (...a: Parameters<typeof jetonDe>) => ({ reference: await jetonDe(...a) });
/** Toutes les tables de la base des clients, et le nombre de leurs lignes. */
const instantane = () => Object.fromEntries(
  base.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name")
    .map((t: any) => [t.name, base.query(`SELECT * FROM "${t.name}"`)]),
);

describe('le lien', () => {
  it('valable : { ok: true }', async () => {
    expect(await verifier(await lienDe('s1'))).toEqual({ ok: true });
  });

  it('après révocation (liens_version avancée) : lien_invalide', async () => {
    const lien = await lienDe('s1');
    executer(base, "UPDATE seances SET liens_version = liens_version + 1 WHERE id = 's1'");
    expect(await verifier(lien)).toEqual({ ok: false, motif: 'lien_invalide' });
  });

  it('une séance qui a déjà son questionnaire : le lien reste valable, et l’ouvrir ne le consomme pas', async () => {
    const lien = await lienDe('s1');
    await questionnaire(env, envoiComplet(lien), MAINTENANT);
    expect(base.query("SELECT questionnaire_id FROM seances WHERE id = 's1'")[0].questionnaire_id).not.toBeNull();
    expect(await verifier(lien)).toEqual({ ok: true });
    expect(await verifier(lien)).toEqual({ ok: true });
  });

  it('valable à l’ouverture, échu avant l’envoi : l’envoi rend { ok: true }, et il est « à rapprocher »', async () => {
    const echeance = MAINTENANT + HEURE;
    const lien = await lienDe('s1', { echeance });
    expect(await verifier(lien, MAINTENANT)).toEqual({ ok: true });
    const { reponse } = await questionnaire(env, envoiComplet(lien), echeance + 1);
    expect(reponse).toEqual({ ok: true });
    expect(base.query('SELECT seance_id, rattachement FROM questionnaires')).toEqual([{ seance_id: null, rattachement: 'a_rapprocher' }]);
  });

  it('le même prédicat que le rattachement : ce que la page dit valable, l’envoi le rattache', async () => {
    const lien = await lienDe('s1');
    expect(await verifier(lien)).toEqual({ ok: true });
    await questionnaire(env, envoiComplet(lien), MAINTENANT);
    expect(base.query('SELECT seance_id, rattachement FROM questionnaires')).toEqual([{ seance_id: 's1', rattachement: 'fait' }]);
  });

  it('porte coupée : ferme', async () => {
    executer(base, "UPDATE reglages SET valeur = 0 WHERE cle = 'porte_publique_ouverte'");
    expect(await verifier(await lienDe('s1'))).toEqual({ ok: false, motif: 'ferme' });
  });

  it.each([
    [{}, ['reference']],
    [{ reference: 'a b' }, ['reference']],
    [{ reference: 'x'.repeat(513) }, ['reference']],
    [{ reference: 'abc', prenom: 'Émilie' }, ['champ_inconnu']],
    ['pas un objet', []],
  ])('forme fausse : invalide, les noms des champs seulement (%#)', async (envoi, champs) => {
    expect(await verifier(envoi)).toEqual({ ok: false, motif: 'invalide', champs });
  });
});

describe('NORMATIF — règle 4 : faux, échu, révoqué, séance annulée → même réponse, mêmes instructions', () => {
  const cas: [string, () => Promise<unknown>][] = [
    ['faux', async () => ({ reference: 'pas-un-jeton.signature' })],
    ['mal signé', async () => ({ reference: `${(await jetonDe('s1')).split('.')[0]}.${'B'.repeat(43)}` })],
    ['échu', async () => lienDe('s1', { echeance: MAINTENANT - 1 })],
    ['révoqué', async () => lienDe('s1', { version: 7 })],
    ['séance inconnue', async () => lienDe('s-inconnue')],
    ['séance annulée', async () => {
      executer(base, "UPDATE seances SET statut = 'annulee' WHERE id = 's1'");
      return lienDe('s1');
    }],
  ];

  it.each(cas)('%s : lien_invalide, après 2 instructions, en un aller-retour', async (_nom, preparer) => {
    const envoi = await preparer();
    const preparees = espionner(env.CLIENTS);
    expect(await verifier(envoi)).toEqual({ ok: false, motif: 'lien_invalide' });
    expect(preparees).toHaveLength(2);
  });

  it('valable : les mêmes 2 instructions', async () => {
    const envoi = await lienDe('s1');
    const preparees = espionner(env.CLIENTS);
    expect(await verifier(envoi)).toEqual({ ok: true });
    expect(preparees).toHaveLength(2);
  });
});

describe('une lecture, pas une commande', () => {
  it('rien n’est écrit, dans aucune table, quel que soit le cas', async () => {
    const avant = instantane();
    await verifier(await lienDe('s1'));
    await verifier(await lienDe('s1', { version: 9 }));
    await verifier({ reference: 'faux.faux' });
    await verifier({});
    expect(instantane()).toEqual(avant);
  });
});

describe('les pannes', () => {
  it('sans PORTES_SECRET : panne, un code et rien d’autre', async () => {
    delete env.PORTES_SECRET;
    await expect(verifier({ reference: 'abc' })).rejects.toThrow(/^incident: portes_secret_absent$/);
  });

  it('base non reliée : panne', async () => {
    delete env.CLIENTS;
    await expect(verifier({ reference: 'abc' })).rejects.toThrow(/^incident: base_non_reliee$/);
  });
});
