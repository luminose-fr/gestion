/**
 * Recevoir un questionnaire (SPEC §14.6.1 ; règles 4, 5, 6, 7) — sur des
 * identités fictives. La fonction ne sait rien du transport : elle reçoit un
 * envoi, rend une réponse du contrat et ce qui reste à faire après (`suite`).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { TestD1 } from './helpers/d1';
import { compter, MAINTENANT, HEURE } from './helpers/clients';
import {
  envPortes, executer, ficheEssai, seanceEssai, jetonDe, nouvelleCle, envoiComplet, envoiSuivi, espionner,
} from './helpers/portes';
import { questionnaire } from '../src/clients/portes/publique';
import { purgerLesCommandes } from '../src/clients/commandes';

let env: any;
let base: TestD1;
beforeEach(() => ({ env, base } = envPortes()));

const recevoir = (envoi: unknown, maintenant = MAINTENANT, crochets = {}) => questionnaire(env, envoi, maintenant, crochets);
const repondre = async (envoi: unknown, maintenant = MAINTENANT) => (await recevoir(envoi, maintenant)).reponse;
const ligneQ = (where = '1 = 1', ...p: unknown[]) => base.query(`SELECT * FROM questionnaires WHERE ${where}`, ...p)[0] as any;
const fiche = (id: string) => ({ ...base.query('SELECT * FROM clients WHERE id = ?', id)[0] });
const alertes = () => base.query('SELECT sorte, objet_type FROM alertes ORDER BY sorte').map((r) => `${r.sorte}:${r.objet_type}`);
const tout = () => ({
  commandes: compter(base, 'commandes'), questionnaires: compter(base, 'questionnaires'),
  ordres: compter(base, 'ordres'), alertes: compter(base, 'alertes'),
});

describe('le chemin qui enregistre', () => {
  it('référence valable : rattaché à la séance et à sa fiche, un accusé prévu, aucune alerte', async () => {
    ficheEssai(base, 'c1');
    seanceEssai(base, 's1', 'c1');
    const envoi = envoiComplet({ reference: await jetonDe('s1') });
    expect(await repondre(envoi)).toEqual({ ok: true });
    const q = ligneQ();
    expect(q).toMatchObject({
      envoi_id: envoi.cle, client_id: 'c1', seance_id: 's1', rattachement: 'fait', a_revoir: 0, nb_oui: 1,
      autorisation_parentale: 'sans_objet', declaration: 1, accord_conservation: 1, accord_texte: 'Texte d\'essai de l\'accord.',
      accord_le: MAINTENANT, source: 'site', fiche_completee_le: null,
    });
    expect(q.envoi_empreinte).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.parse(q.reponses).questions).toHaveLength(2);
    expect(base.query('SELECT questionnaire_id FROM seances WHERE id = ?', 's1')[0].questionnaire_id).toBe(q.id);
    expect(base.query('SELECT sorte, modele_cle, objet_type, objet_id, etat, cle_unicite, prevu_le FROM ordres')).toEqual([{
      sorte: 'message.email', modele_cle: 'questionnaire_accuse', objet_type: 'questionnaire', objet_id: q.id,
      etat: 'prevu', cle_unicite: `accuse:${q.id}`, prevu_le: MAINTENANT,
    }]);
    expect(alertes()).toEqual([]);
    expect(base.query('SELECT porte, sorte, objet_type, objet_id, recu FROM commandes')).toEqual([
      { porte: 'publique', sorte: 'questionnaire', objet_type: 'questionnaire', objet_id: q.id, recu: '{"ok":true}' },
    ]);
  });

  it('sans référence : enregistré « à rapprocher », sans séance ni fiche, avec son alerte', async () => {
    ficheEssai(base, 'c1');
    expect(await repondre(envoiComplet())).toEqual({ ok: true });
    expect(ligneQ()).toMatchObject({ client_id: null, seance_id: null, rattachement: 'a_rapprocher' });
    expect(alertes()).toEqual(['a_rapprocher:questionnaire']);
    expect(compter(base, 'ordres')).toBe(1);
  });

  it.each([
    ['fausse', async () => 'pas-un-jeton.signature'],
    ['échue', async () => jetonDe('s1', { echeance: MAINTENANT - 1 })],
    ['révoquée', async () => jetonDe('s1', { version: 0 })],
  ])('référence %s : enregistré « à rapprocher », la séance n’est pas touchée', async (_nom, jeton) => {
    ficheEssai(base, 'c1');
    seanceEssai(base, 's1', 'c1');
    expect(await repondre(envoiComplet({ reference: await jeton() }))).toEqual({ ok: true });
    expect(ligneQ()).toMatchObject({ client_id: null, seance_id: null, rattachement: 'a_rapprocher' });
    expect(base.query('SELECT questionnaire_id FROM seances')[0].questionnaire_id).toBeNull();
  });

  it('séance qui a déjà son questionnaire : le second est à part, avec sa séance d’origine, et une alerte', async () => {
    ficheEssai(base, 'c1');
    seanceEssai(base, 's1', 'c1');
    const reference = await jetonDe('s1');
    await repondre(envoiComplet({ reference }));
    const premier = ligneQ().id;
    expect(await repondre(envoiComplet({ reference }))).toEqual({ ok: true });
    const second = ligneQ('id <> ?', premier);
    expect(second).toMatchObject({ seance_id: 's1', client_id: null, rattachement: 'a_rapprocher' });
    expect(base.query('SELECT questionnaire_id FROM seances')[0].questionnaire_id).toBe(premier);
    expect(alertes()).toEqual(['a_rapprocher:questionnaire', 'second_questionnaire:questionnaire']);
  });

  it('une journée chez un organisateur : rattachée à l’évènement s’il existe, sinon à rapprocher', async () => {
    base.query(`INSERT INTO evenements (id, nom, debut, created_at, updated_at) VALUES ('evt-ailleurs', 'Journée d''essai', 0, 0, 0)`);
    base.query(`INSERT INTO evenements (id, nom, debut, created_at, updated_at, deleted_at) VALUES ('evt-retire', 'Retirée', 0, 0, 0, 1)`);
    await repondre(envoiComplet({ contexte: 'journee_externe', evenement: 'evt-ailleurs' }));
    await repondre(envoiComplet({ contexte: 'journee_externe', evenement: 'evt-retire' }));
    await repondre(envoiComplet({ contexte: 'journee_externe', evenement: 'evt-inconnu' }));
    expect(base.query('SELECT evenement_id, rattachement, client_id FROM questionnaires ORDER BY created_at, rowid')).toEqual([
      { evenement_id: 'evt-ailleurs', rattachement: 'fait', client_id: null },
      { evenement_id: null, rattachement: 'a_rapprocher', client_id: null },
      { evenement_id: null, rattachement: 'a_rapprocher', client_id: null },
    ]);
  });

  it('un suivi : à revoir sans questionnaire complet connu du client ; pas avec', async () => {
    ficheEssai(base, 'c1');
    seanceEssai(base, 's1', 'c1');
    seanceEssai(base, 's2', 'c1', MAINTENANT + 200 * HEURE);
    await repondre(envoiSuivi({ reference: await jetonDe('s1') }));
    expect(ligneQ("seance_id = 's1'").a_revoir).toBe(1);
    expect(alertes()).toEqual(['a_revoir:questionnaire']);
    executer(base, `UPDATE questionnaires SET version = 'complet'`);
    await repondre(envoiSuivi({ reference: await jetonDe('s2') }));
    expect(ligneQ("seance_id = 's2'").a_revoir).toBe(0);
    // Sans client : toujours à revoir.
    await repondre(envoiSuivi());
    expect(ligneQ('seance_id IS NULL').a_revoir).toBe(1);
  });

  it('jamais de rattachement par l’identité déclarée', async () => {
    ficheEssai(base, 'c1', { cle_client: 'emilie.martin@example.org emilie martin' });
    await repondre(envoiComplet());
    expect(ligneQ().client_id).toBeNull();
  });
});

describe('les refus', () => {
  it('le champ piège rempli : invalide sans champ, rien d’écrit', async () => {
    expect(await repondre(envoiComplet({ site_web: 'https://example.org' }))).toEqual({ ok: false, motif: 'invalide', champs: [] });
    expect(tout()).toEqual({ commandes: 0, questionnaires: 0, ordres: 0, alertes: 0 });
  });

  it('un envoi hors contrat : les noms des champs, rien d’écrit', async () => {
    expect(await repondre({ ...envoiComplet(), declaration: false })).toEqual({ ok: false, motif: 'invalide', champs: ['declaration'] });
    expect(tout()).toEqual({ commandes: 0, questionnaires: 0, ordres: 0, alertes: 0 });
  });

  it('une version d’accord inconnue : invalide (accord.version), rien d’écrit', async () => {
    expect(await repondre(envoiComplet({ accord: { accepte: true, version: 2 } })))
      .toEqual({ ok: false, motif: 'invalide', champs: ['accord.version'] });
    expect(tout()).toEqual({ commandes: 0, questionnaires: 0, ordres: 0, alertes: 0 });
  });

  it('sans secret, ou sans base : une panne, et rien d’écrit', async () => {
    await expect(questionnaire({ ...env, PORTES_SECRET: undefined }, envoiComplet(), MAINTENANT)).rejects.toThrow(/portes_secret_absent/);
    await expect(questionnaire({ PORTES_SECRET: 'x' } as any, envoiComplet(), MAINTENANT)).rejects.toThrow(/base_non_reliee/);
    expect(tout()).toEqual({ commandes: 0, questionnaires: 0, ordres: 0, alertes: 0 });
  });
});

describe('NORMATIF — règle 5 : un envoi rejoué ne crée rien en double', () => {
  it('le même questionnaire deux fois : une commande, un questionnaire, un ordre, le même reçu', async () => {
    const envoi = envoiComplet();
    const r1 = await repondre(envoi);
    const r2 = await repondre(structuredClone(envoi));
    expect(r2).toEqual(r1);
    expect(tout()).toEqual({ commandes: 1, questionnaires: 1, ordres: 1, alertes: 1 });
  });

  it('la même clé avec un autre contenu : invalide, rien d’écrit', async () => {
    const envoi = envoiComplet();
    await repondre(envoi);
    expect(await repondre({ ...envoi, informations: 'autre chose' })).toEqual({ ok: false, motif: 'invalide', champs: [] });
    expect(tout()).toEqual({ commandes: 1, questionnaires: 1, ordres: 1, alertes: 1 });
  });

  it('deux envois simultanés de la même clé : un seul objet', async () => {
    const envoi = envoiComplet();
    const reponses = await Promise.all([repondre(envoi), repondre(structuredClone(envoi))]);
    expect(reponses).toEqual([{ ok: true }, { ok: true }]);
    expect(tout()).toEqual({ commandes: 1, questionnaires: 1, ordres: 1, alertes: 1 });
  });

  it('deux contenus différents en même temps sous la même clé : une réussite et un invalide, jamais deux', async () => {
    const envoi = envoiComplet();
    const reponses = await Promise.all([repondre(envoi), repondre({ ...envoi, informations: 'autre chose' })]);
    expect(reponses.map((r) => r.ok).sort()).toEqual([false, true]);
    expect(reponses.find((r) => !r.ok)).toEqual({ ok: false, motif: 'invalide', champs: [] });
    expect(tout()).toEqual({ commandes: 1, questionnaires: 1, ordres: 1, alertes: 1 });
  });
});

describe('NORMATIF — règle 6 : tout ou rien', () => {
  it('une erreur au milieu du lot l’annule en entier', async () => {
    const envoi = envoiComplet();
    await expect(recevoir(envoi, MAINTENANT, { avantLeLot: async () => executer(base, 'ALTER TABLE alertes RENAME TO alertes_ailleurs') }))
      .rejects.toThrow();
    executer(base, 'ALTER TABLE alertes_ailleurs RENAME TO alertes');
    expect(tout()).toEqual({ commandes: 0, questionnaires: 0, ordres: 0, alertes: 0 });
    // Et le même envoi passe ensuite, une fois.
    expect(await repondre(envoi)).toEqual({ ok: true });
    expect(tout()).toEqual({ commandes: 1, questionnaires: 1, ordres: 1, alertes: 1 });
  });

  it('après la purge : même clé et même contenu → ok sans rien écrire ; autre contenu → invalide', async () => {
    const envoi = envoiComplet();
    await repondre(envoi);
    const plusTard = MAINTENANT + 721 * HEURE;
    expect(await purgerLesCommandes(env.CLIENTS, plusTard)).toBe(1);
    expect(await repondre(envoi, plusTard)).toEqual({ ok: true });
    expect(await repondre({ ...envoi, informations: 'autre' }, plusTard)).toEqual({ ok: false, motif: 'invalide', champs: [] });
    expect(tout()).toEqual({ commandes: 0, questionnaires: 1, ordres: 1, alertes: 1 });
  });

  it('une clé purgée qui arrive entre la lecture et le lot : pas de panne sur l’index unique', async () => {
    const envoi = envoiComplet();
    await repondre(envoi);
    await purgerLesCommandes(env.CLIENTS, MAINTENANT + 721 * HEURE);
    // La lecture voit la mémoire de l'envoi : rien d'écrit, la même réponse.
    expect(await repondre(envoi, MAINTENANT + 722 * HEURE)).toEqual({ ok: true });
    expect(compter(base, 'questionnaires')).toBe(1);
  });
});

describe('NORMATIF — entre la lecture et le lot, c’est l’état du moment qui vaut', () => {
  const avecChangement = async (changement: string) => {
    ficheEssai(base, 'c1', { telephone: null, ville: null });
    seanceEssai(base, 's1', 'c1');
    const avant = fiche('c1');
    const { reponse, suite } = await recevoir(envoiComplet({ reference: await jetonDe('s1') }), MAINTENANT, {
      avantLeLot: async () => executer(base, changement),
    });
    await suite();
    expect(reponse).toEqual({ ok: true });
    return { avant };
  };

  it.each([
    ['séance annulée', `UPDATE seances SET statut = 'annulee' WHERE id = 's1'`],
    ['lien révoqué', `UPDATE seances SET liens_version = 2 WHERE id = 's1'`],
  ])('%s : à rapprocher, séance intacte, fiche non complétée', async (_nom, changement) => {
    const { avant } = await avecChangement(changement);
    expect(ligneQ()).toMatchObject({ client_id: null, seance_id: null, rattachement: 'a_rapprocher' });
    expect(base.query('SELECT questionnaire_id FROM seances')[0].questionnaire_id).toBeNull();
    expect(fiche('c1')).toEqual(avant);
  });

  it('premier questionnaire rattaché entre-temps : le second à part, la séance garde le premier', async () => {
    const { avant } = await avecChangement(`
      INSERT INTO questionnaires (id, contexte, created_at, updated_at) VALUES ('q-premier', 'seance', 0, 0);
      UPDATE seances SET questionnaire_id = 'q-premier' WHERE id = 's1';`);
    expect(ligneQ("id <> 'q-premier'")).toMatchObject({ client_id: null, seance_id: 's1', rattachement: 'a_rapprocher' });
    expect(base.query('SELECT questionnaire_id FROM seances')[0].questionnaire_id).toBe('q-premier');
    expect(fiche('c1')).toEqual(avant);
    expect(alertes()).toContain('second_questionnaire:questionnaire');
  });
});

describe('NORMATIF — règle 4 : la porte n’apprend rien sur personne', () => {
  /** Chaque chemin, dans une base neuve : la réponse, et les instructions préparées avant elle. */
  const chemins: [string, (b: TestD1) => Promise<Record<string, unknown>>][] = [
    ['référence valable', async (b) => { ficheEssai(b, 'c1'); seanceEssai(b, 's1', 'c1'); return envoiComplet({ reference: await jetonDe('s1') }); }],
    ['sans référence', async () => envoiComplet()],
    ['référence fausse', async () => envoiComplet({ reference: 'abc.def' })],
    ['référence échue', async (b) => { seanceEssai(b, 's1', null); return envoiComplet({ reference: await jetonDe('s1', { echeance: 1 }) }); }],
    ['référence révoquée', async (b) => { seanceEssai(b, 's1', null); return envoiComplet({ reference: await jetonDe('s1', { version: 9 }) }); }],
    ['séance qui a déjà un questionnaire', async (b) => {
      seanceEssai(b, 's1', null);
      executer(b, `INSERT INTO questionnaires (id, contexte, created_at, updated_at) VALUES ('q0', 'seance', 0, 0);
                   UPDATE seances SET questionnaire_id = 'q0';`);
      return envoiComplet({ reference: await jetonDe('s1') });
    }],
    ['suivi avec un complet', async (b) => {
      ficheEssai(b, 'c1'); seanceEssai(b, 's1', 'c1');
      executer(b, `INSERT INTO questionnaires (id, contexte, version, client_id, created_at, updated_at) VALUES ('q0', 'seance', 'complet', 'c1', 0, 0)`);
      return envoiSuivi({ reference: await jetonDe('s1') });
    }],
    ['suivi sans complet', async (b) => { ficheEssai(b, 'c1'); seanceEssai(b, 's1', 'c1'); return envoiSuivi({ reference: await jetonDe('s1') }); }],
    ['personne connue, sans lien', async (b) => { ficheEssai(b, 'c1', { cle_client: 'emilie.martin@example.org emilie martin' }); return envoiComplet(); }],
    ['personne inconnue', async () => envoiComplet({ identite: { prenom: 'Ève', nom: 'Dupont', email: 'eve.dupont@example.org' } })],
  ];

  it.each(chemins)('%s : { ok: true }, et 11 instructions avant la réponse', async (_nom, preparer) => {
    const envoi = await preparer(base);
    const avant = base.query('SELECT * FROM clients');
    const preparees = espionner(env.CLIENTS);
    const { reponse } = await recevoir(envoi);
    expect(reponse).toEqual({ ok: true });
    expect(JSON.stringify(reponse)).toBe('{"ok":true}');
    // La lecture groupée (4) et le lot (7), sur tous les chemins.
    expect(preparees).toHaveLength(11);
    // Aucune fiche n'a bougé avant la réponse.
    expect(base.query('SELECT * FROM clients')).toEqual(avant);
  });
});

describe('NORMATIF — la fiche se complète après la réponse, sans rien toucher de rempli', () => {
  it('les champs vides sont remplis par suite, pas avant ; les remplis ne bougent jamais', async () => {
    ficheEssai(base, 'c1', { telephone: '+33 6 39 98 00 77', ville: 'Albi', civilite: null, profession: '' });
    seanceEssai(base, 's1', 'c1');
    const avant = fiche('c1');
    const { suite } = await recevoir(envoiComplet({ reference: await jetonDe('s1') }));
    expect(fiche('c1')).toEqual(avant);
    await suite();
    const apres = fiche('c1');
    expect(apres).toMatchObject({
      telephone: '+33 6 39 98 00 77', ville: 'Albi', email: 'emilie.martin@example.org', prenom: 'Émilie',
      civilite: 'Mme', profession: 'Profession d’essai', date_naissance: '1988-04-12', adresse: '1 rue de l’Exemple', code_postal: '31000',
      updated_at: MAINTENANT,
    });
    expect(ligneQ().fiche_completee_le).toBe(MAINTENANT);
    // Un autre téléphone, une autre ville : l'écart s'ouvre sur le questionnaire, sans valeur.
    expect(alertes()).toEqual(['ecart_fiche:questionnaire']);
    expect(base.query('SELECT prenom, nom, telephone FROM clients_confiance WHERE client_id = ?', 'c1'))
      .toEqual([{ prenom: 'Paul', nom: 'Martin', telephone: '+33 6 39 98 00 09' }]);
  });

  it('suite jouée deux fois ne change rien', async () => {
    ficheEssai(base, 'c1');
    seanceEssai(base, 's1', 'c1');
    const { suite } = await recevoir(envoiComplet({ reference: await jetonDe('s1') }));
    await suite();
    const une = { fiche: fiche('c1'), confiance: base.query('SELECT * FROM clients_confiance'), alertes: alertes() };
    await suite();
    expect({ fiche: fiche('c1'), confiance: base.query('SELECT * FROM clients_confiance'), alertes: alertes() }).toEqual(une);
  });

  it('une personne de confiance déjà là reste telle quelle', async () => {
    ficheEssai(base, 'c1');
    seanceEssai(base, 's1', 'c1');
    base.query(`INSERT INTO clients_confiance (id, client_id, prenom, telephone, created_at, updated_at) VALUES ('cc', 'c1', 'Jeanne', '+33 6 39 98 00 50', 0, 0)`);
    const { suite } = await recevoir(envoiComplet({ reference: await jetonDe('s1') }));
    await suite();
    expect(base.query('SELECT prenom, telephone FROM clients_confiance')).toEqual([{ prenom: 'Jeanne', telephone: '+33 6 39 98 00 50' }]);
    expect(alertes()).toEqual(['ecart_fiche:questionnaire']);
  });

  it('identique à la fiche : aucun écart, et updated_at n’avance pas', async () => {
    ficheEssai(base, 'c1', {
      civilite: 'Mme', date_naissance: '1988-04-12', profession: 'Profession d’essai', adresse: '1 rue de l’Exemple',
      code_postal: '31000', ville: 'Toulouse', telephone: '+33 6 39 98 00 01',
    });
    seanceEssai(base, 's1', 'c1');
    const { suite } = await recevoir(envoiSuivi({ reference: await jetonDe('s1') }));
    await suite();
    expect(fiche('c1').updated_at).toBe(0);
    expect(alertes()).toEqual(['a_revoir:questionnaire']);
  });
});

describe('la minorité, à la réception', () => {
  it('date de naissance dans l’envoi : moins de 18 ans → à obtenir', async () => {
    await repondre(envoiComplet({ coordonnees: { date_naissance: '2010-06-01' } }));
    expect(ligneQ().autorisation_parentale).toBe('a_obtenir');
  });

  it('dix-huit ans la veille : sans objet', async () => {
    await repondre(envoiComplet({ coordonnees: { date_naissance: '2008-11-30' } }));
    expect(ligneQ().autorisation_parentale).toBe('sans_objet');
  });

  it('date lue sur la fiche désignée, pour un suivi sans coordonnées', async () => {
    ficheEssai(base, 'c1', { date_naissance: '2012-03-04' });
    seanceEssai(base, 's1', 'c1');
    await repondre(envoiSuivi({ reference: await jetonDe('s1') }));
    expect(ligneQ().autorisation_parentale).toBe('a_obtenir');
  });

  it('âge inconnu : sans objet', async () => {
    await repondre(envoiSuivi());
    expect(ligneQ().autorisation_parentale).toBe('sans_objet');
  });
});

describe('les bornes et l’interrupteur', () => {
  const borner = (n: number) => executer(base, `UPDATE reglages SET valeur = ${n} WHERE cle = 'commandes_questionnaire_max_jour'`);
  const couper = () => executer(base, `UPDATE reglages SET valeur = 0 WHERE cle = 'porte_publique_ouverte'`);

  it('coupée : ferme, y compris pour une clé déjà vue ; rien d’écrit', async () => {
    const envoi = envoiComplet();
    await repondre(envoi);
    couper();
    expect(await repondre(envoi)).toEqual({ ok: false, motif: 'ferme' });
    expect(await repondre(envoiComplet())).toEqual({ ok: false, motif: 'ferme' });
    expect(tout()).toEqual({ commandes: 1, questionnaires: 1, ordres: 1, alertes: 1 });
  });

  it('au-delà de la borne : trop_de_demandes, l’alerte une seule fois, rien d’autre d’écrit', async () => {
    borner(1);
    await repondre(envoiComplet());
    expect(await repondre(envoiComplet())).toEqual({ ok: false, motif: 'trop_de_demandes' });
    expect(await repondre(envoiComplet())).toEqual({ ok: false, motif: 'trop_de_demandes' });
    expect(base.query("SELECT sorte, objet_type, objet_id FROM alertes WHERE sorte = 'borne_atteinte'"))
      .toEqual([{ sorte: 'borne_atteinte', objet_type: 'reglage', objet_id: 'commandes_questionnaire_max_jour' }]);
    expect(compter(base, 'commandes')).toBe(1);
    expect(compter(base, 'questionnaires')).toBe(1);
  });

  it('la dernière place de la borne demandée deux fois en même temps : une seule commande', async () => {
    borner(1);
    const reponses = await Promise.all([repondre(envoiComplet()), repondre(envoiComplet())]);
    expect(reponses.map((r) => (r.ok ? 'ok' : r.motif)).sort()).toEqual(['ok', 'trop_de_demandes']);
    expect(compter(base, 'commandes')).toBe(1);
    expect(compter(base, 'questionnaires')).toBe(1);
  });
});

describe('NORMATIF — règle 7 : rien de personnel dans les journaux, les réponses, les tables de service', () => {
  const REPERES = ['Zéphyrine', 'Repèrenom', 'zephyrine.repere@example.org', '+33 6 39 98 12 34', 'réponse-repère-unique'];
  let journaux: ReturnType<typeof vi.spyOn>[];
  beforeEach(() => {
    journaux = (['error', 'warn', 'log', 'info', 'debug'] as const).map((n) => vi.spyOn(console, n).mockImplementation(() => {}));
  });
  afterEach(() => { for (const j of journaux) j.mockRestore(); });

  it('réussite, refus et panne : les repères ne sortent nulle part', async () => {
    seanceEssai(base, 's1', null);
    const jeton = await jetonDe('s1');
    const envoi = envoiComplet({
      reference: jeton,
      identite: { prenom: REPERES[0], nom: REPERES[1], email: REPERES[2], telephone: REPERES[3] },
      reponses: [{ cle: 'q1', libelle: 'Question', reponse: REPERES[4] }],
    });
    const sorties: unknown[] = [];
    sorties.push((await recevoir(envoi)).reponse);
    sorties.push((await recevoir({ ...envoi, informations: 'x' })).reponse);            // même clé, autre contenu
    sorties.push((await recevoir({ ...envoi, cle: nouvelleCle(), [REPERES[0]]: REPERES[2] })).reponse); // clé inconnue
    sorties.push((await recevoir({ ...envoi, cle: nouvelleCle(), identite: { ...envoi.identite, email: REPERES[0] } })).reponse);
    try { await questionnaire({ ...env, PORTES_SECRET: '' }, envoi, MAINTENANT); } catch (e) { sorties.push(String(e)); }
    executer(base, `UPDATE reglages SET valeur = 0 WHERE cle = 'porte_publique_ouverte'`);
    sorties.push((await recevoir(envoi)).reponse);

    const texte = JSON.stringify(sorties)
      + JSON.stringify(journaux.map((j) => j.mock.calls))
      + JSON.stringify(base.query('SELECT * FROM commandes'))
      + JSON.stringify(base.query('SELECT * FROM ordres'))
      + JSON.stringify(base.query('SELECT * FROM alertes'));
    for (const repere of [...REPERES, jeton]) expect(texte, repere).not.toContain(repere);
    // Et ce qu'il fallait garder est bien là : sur la ligne reçue.
    expect(ligneQ().identite).toContain(REPERES[0]);
  });
});
