/**
 * Les messages d'une séance (SPEC §14.12) : inscrits à la révision, composés au
 * départ depuis la séance et la fiche, annulés d'eux-mêmes quand la séance a
 * bougé. Make est simulé ; la recette détourne vers Florent.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { envPortes, executer, ficheEssai } from './helpers/portes';
import { MAINTENANT, LUNDI_9H30, HEURE, TYPES } from './helpers/clients';
import { inscrireMessagesSeance, quand } from '../src/clients/messages-seances';
import { releverLesOrdres } from '../src/clients/ordres';

let env: any;
let base: any;
let remis: any[];

const modeles = () => executer(base, `INSERT INTO messages_modeles (id, cle, canal, version, objet, corps, created_at, updated_at) VALUES
  ('m1', 'seance_confirmation', 'email', 1, '{{seance}} — {{quand}}', 'Bonjour {{prenom}},\n\n{{seance}}, {{quand}}, {{lieu}}.\n\n{{questionnaire}}\n\n{{enregistrement}}', 0, 0),
  ('m2', 'seance_rappel', 'email', 1, 'Rappel', 'Rappel {{prenom}} : {{quand}}.', 0, 0),
  ('m3', 'seance_annulation', 'email', 1, 'Annulé', 'Annulé {{prenom}} : {{quand}}.', 0, 0)`);

const seance = (id: string, champs: Record<string, unknown> = {}) => {
  const l = { id, client_id: 'c1', type_seance_id: TYPES.seance, debut: LUNDI_9H30, duree_min: 90, occupe_jusqua: LUNDI_9H30 + 90 * 60_000,
    statut: 'prevue', etat_paiement: 'a_payer', origine: 'site', mode: 'sur_place', created_at: 0, updated_at: 0, ...champs };
  base.query(`INSERT INTO seances (${Object.keys(l).join(', ')}) VALUES (${Object.keys(l).map(() => '?').join(', ')})`, ...Object.values(l));
};

beforeEach(() => {
  ({ env, base } = envPortes({
    ENVIRONNEMENT: 'recette', MAKE_WEBHOOK_MESSAGE_EMAIL: 'https://hook.example.org/essai', MAKE_SECRET: 'secret-make-essai',
    DETOURNEMENT_EMAIL: 'florent@example.org', ORIGINE_SITE: 'https://recette.luminose.fr',
  }));
  ficheEssai(base, 'c1', { email: 'emilie.martin@example.org' });
  modeles();
  remis = [];
  vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => { remis.push(JSON.parse(String(init.body))); return new Response('{}'); });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('les messages d’une séance', () => {
  it('prévue : la confirmation tout de suite, le rappel 72 h avant ; rejouée, rien de plus', async () => {
    seance('s1');
    expect(await inscrireMessagesSeance(base, 's1', MAINTENANT)).toBe(2);
    expect(await inscrireMessagesSeance(base, 's1', MAINTENANT)).toBe(0);
    const rappel = base.query("SELECT prevu_le FROM ordres WHERE modele_cle = 'seance_rappel'")[0];
    expect(rappel.prevu_le).toBe(LUNDI_9H30 - 72 * HEURE);
  });

  it('la confirmation, composée au départ, détournée en recette : le lieu, la date, le prénom de la fiche', async () => {
    seance('s1');
    await inscrireMessagesSeance(base, 's1', MAINTENANT);
    await releverLesOrdres(env, MAINTENANT);
    expect(remis).toHaveLength(1);
    expect(remis[0].destinataire.email).toBe('florent@example.org');
    expect(remis[0].objet).toBe(`[Recette] Séance — ${quand(LUNDI_9H30)}`);
    expect(remis[0].texte).toContain('Bonjour Émilie,');
    expect(remis[0].texte).toContain('au 2 avenue de Verdun');
    expect(quand(LUNDI_9H30)).toBe('lundi 11 janvier à 9 h 30');
  });

  it('en visio, le lien Meet ; un type qui demande le questionnaire, son lien ; une rencontre, la phrase de l’enregistrement', async () => {
    seance('s1', { mode: 'visio', visio_url: 'https://meet.google.com/abc-defg-hij', type_seance_id: TYPES.breathwork });
    seance('s2', { type_seance_id: TYPES.rencontre, mode: 'visio', debut: LUNDI_9H30 + 24 * HEURE, occupe_jusqua: LUNDI_9H30 + 25 * HEURE });
    await inscrireMessagesSeance(base, 's1', MAINTENANT);
    await inscrireMessagesSeance(base, 's2', MAINTENANT);
    await releverLesOrdres(env, MAINTENANT);
    const [breathwork, rencontre] = [remis.find((m) => m.texte.includes('breathwork')), remis.find((m) => m.texte.includes('Rencontre'))];
    expect(breathwork.texte).toContain('en visio : https://meet.google.com/abc-defg-hij');
    expect(breathwork.texte).toContain('https://recette.luminose.fr/#r=');
    expect(rencontre.texte).toContain('enregistré');
    expect(rencontre.texte).not.toContain('#r=');
  });

  it('déplacée après l’inscription : les messages de l’ancienne révision s’annulent au départ', async () => {
    seance('s1');
    await inscrireMessagesSeance(base, 's1', MAINTENANT);
    executer(base, "UPDATE seances SET revision = 1 WHERE id = 's1'");
    await releverLesOrdres(env, MAINTENANT);
    expect(remis).toHaveLength(0);
    expect(base.query("SELECT etat, motif FROM ordres WHERE modele_cle = 'seance_confirmation'")[0]).toEqual({ etat: 'annule', motif: 'seance_changee' });
  });

  it('annulée : l’annulation ; une séance reprise de Notion : rien', async () => {
    seance('s1', { statut: 'annulee' });
    seance('s2', { origine: 'import', debut: LUNDI_9H30 + 24 * HEURE, occupe_jusqua: LUNDI_9H30 + 25 * HEURE });
    expect(await inscrireMessagesSeance(base, 's1', MAINTENANT)).toBe(1);
    expect(await inscrireMessagesSeance(base, 's2', MAINTENANT)).toBe(0);
    await releverLesOrdres(env, MAINTENANT);
    expect(remis.map((m) => m.objet)).toEqual(['[Recette] Annulé']);
  });
});
