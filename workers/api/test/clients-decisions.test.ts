/**
 * Ce qui ne se décide qu'une fois (SPEC §14.2, règle 6 ; §14.10).
 *
 * Chaque décision est jouée deux fois : une seule aboutit. Un refus à zéro
 * ligne ne laisse rien — ni séance, ni mouvement, ni paiement. Une erreur au
 * milieu du lot l'annule en entier.
 *
 * Ce que `node:sqlite` ne prouve pas : deux requêtes VRAIMENT simultanées.
 * Ici, les deux demandes passent l'une après l'autre ; la simultanéité se
 * constate en phase S2, quand une porte existera.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  creerSeance, deplacerSeance, retablirSeance, prendrePlace, lotCreation, lotInscription,
  type NouvelleSeance, type NouvelleInscription,
} from '../src/clients/decisions';
import type { TestD1 } from './helpers/d1';
import { baseClients, ajouterClient, ajouterEvenement, compter, TYPES, LUNDI_9H30, MAINTENANT, MINUTE, HEURE } from './helpers/clients';

let base: TestD1;
let db: D1Database;
let n = 0;

beforeEach(async () => {
  base = baseClients();
  db = base as unknown as D1Database;
  await ajouterClient(base, 'client-a', 'Émilie', 'Martin', 'emilie.martin@example.org');
  await ajouterClient(base, 'client-b', 'Ève', 'Dupont', 'eve.dupont@example.org');
});

/** Une séance de 90 minutes sans marge, sauf type précisé. */
const seance = (debut: number, champs: Partial<NouvelleSeance> = {}): NouvelleSeance => ({
  id: `seance-${++n}`,
  clientId: 'client-a',
  typeSeanceId: TYPES.seance,
  debut,
  dureeMin: 90,
  etatPaiement: 'a_payer',
  montantCentimes: 8000,
  mode: 'sur_place',
  origine: 'console',
  ...champs,
});

const creer = (s: NouvelleSeance) => creerSeance(db, s, 'florent', MAINTENANT);
const ligne = (id: string) => base.query('SELECT * FROM seances WHERE id = ?', id)[0] as any;
const annuler = (id: string) => base.prepare("UPDATE seances SET statut = 'annulee' WHERE id = ?").bind(id).run();

describe('NORMATIF — entrer dans l’agenda : créer', () => {
  it('le même créneau demandé deux fois : un rendez-vous, puis « créneau pris »', async () => {
    expect(await creer(seance(LUNDI_9H30))).toEqual({ faite: true });
    expect(await creer(seance(LUNDI_9H30, { clientId: 'client-b' }))).toEqual({ faite: false, motif: 'creneau_pris' });
    expect(compter(base, 'seances')).toBe(1);
  });

  it('écrit occupe_jusqua = début + durée + marge du type, et la révision 0', async () => {
    await creer(seance(LUNDI_9H30, { id: 'bw', typeSeanceId: TYPES.breathwork, dureeMin: 105 }));
    expect(ligne('bw').occupe_jusqua).toBe(LUNDI_9H30 + (105 + 15) * MINUTE);
    expect(ligne('bw').revision).toBe(0);
    expect(ligne('bw').agenda_etat).toBe('a_ecrire');
  });

  it('refuse un chevauchement partiel, dans un sens comme dans l’autre', async () => {
    await creer(seance(LUNDI_9H30));
    expect((await creer(seance(LUNDI_9H30 + 60 * MINUTE))).faite).toBe(false);
    expect((await creer(seance(LUNDI_9H30 - 60 * MINUTE))).faite).toBe(false);
    // Englobante, et englobée.
    expect((await creer(seance(LUNDI_9H30 - 30 * MINUTE, { dureeMin: 180 }))).faite).toBe(false);
    expect((await creer(seance(LUNDI_9H30 + 30 * MINUTE, { dureeMin: 20, typeSeanceId: TYPES.rencontre }))).faite).toBe(false);
  });

  it('la marge compte : une séance de breathwork bloque le quart d’heure qui la suit', async () => {
    await creer(seance(LUNDI_9H30, { typeSeanceId: TYPES.breathwork, dureeMin: 105 }));
    const finSansMarge = LUNDI_9H30 + 105 * MINUTE;
    expect((await creer(seance(finSansMarge, { dureeMin: 20, typeSeanceId: TYPES.rencontre }))).faite).toBe(false);
    expect((await creer(seance(finSansMarge + 14 * MINUTE, { dureeMin: 20, typeSeanceId: TYPES.rencontre }))).faite).toBe(false);
    expect((await creer(seance(finSansMarge + 15 * MINUTE, { dureeMin: 20, typeSeanceId: TYPES.rencontre }))).faite).toBe(true);
  });

  it('deux séances qui se touchent sans se chevaucher sont permises', async () => {
    expect((await creer(seance(LUNDI_9H30))).faite).toBe(true);
    expect((await creer(seance(LUNDI_9H30 + 90 * MINUTE))).faite).toBe(true);
    expect((await creer(seance(LUNDI_9H30 - 90 * MINUTE))).faite).toBe(true);
  });

  it('une séance annulée ne bloque rien ; une séance réalisée non plus', async () => {
    await creer(seance(LUNDI_9H30, { id: 'annulee' }));
    await annuler('annulee');
    expect((await creer(seance(LUNDI_9H30))).faite).toBe(true);
  });

  it('une séance sans client (« à rapprocher ») entre dans l’agenda comme une autre, et le bloque', async () => {
    expect((await creer(seance(LUNDI_9H30, { clientId: null, identiteRecue: '{"prenom":"Léo"}', origine: 'site' }))).faite).toBe(true);
    expect((await creer(seance(LUNDI_9H30))).faite).toBe(false);
  });

  it('écrit le mouvement « créée » avec la séance — et rien après un refus', async () => {
    await creer(seance(LUNDI_9H30, { id: 'premiere' }));
    await creer(seance(LUNDI_9H30, { id: 'refusee' }));
    expect(base.query('SELECT seance_id, nature, par, nouveau_debut FROM seances_mouvements').map((r) => ({ ...r })))
      .toEqual([{ seance_id: 'premiere', nature: 'creee', par: 'florent', nouveau_debut: LUNDI_9H30 }]);
    expect(ligne('refusee')).toBeUndefined();
  });

  it('une erreur au milieu du lot l’annule en entier : ni séance, ni mouvement', async () => {
    const lot = lotCreation(db, seance(LUNDI_9H30, { id: 'avortee' }), 'florent', MAINTENANT);
    const enErreur = db.prepare("INSERT INTO seances_mouvements (id, seance_id, nature, par, revision, created_at, updated_at) VALUES ('x', 'avortee', 'inconnue', 'florent', 0, 0, 0)");
    await expect(db.batch([...lot.instructions, enErreur])).rejects.toThrow();
    expect(ligne('avortee')).toBeUndefined();
    expect(compter(base, 'seances_mouvements')).toBe(0);
  });
});

describe('NORMATIF — entrer dans l’agenda : déplacer', () => {
  beforeEach(async () => {
    await creer(seance(LUNDI_9H30, { id: 'a' }));
    await creer(seance(LUNDI_9H30 + 3 * HEURE, { id: 'b', clientId: 'client-b' }));
  });

  it('déplace, recalcule occupe_jusqua, avance la révision et note l’ancien début', async () => {
    const nouveau = LUNDI_9H30 + 7 * 24 * HEURE;
    expect(await deplacerSeance(db, { seanceId: 'a', nouveauDebut: nouveau, revisionAttendue: 0 }, 'florent', MAINTENANT))
      .toEqual({ faite: true });
    expect(ligne('a')).toMatchObject({ debut: nouveau, occupe_jusqua: nouveau + 90 * MINUTE, revision: 1, agenda_etat: 'a_ecrire' });
    expect({ ...base.query("SELECT * FROM seances_mouvements WHERE nature = 'deplacee'")[0] })
      .toMatchObject({ seance_id: 'a', ancien_debut: LUNDI_9H30, nouveau_debut: nouveau, revision: 1, par: 'florent' });
  });

  it('le même déplacement joué deux fois n’aboutit qu’une fois : un seul mouvement', async () => {
    const d = { seanceId: 'a', nouveauDebut: LUNDI_9H30 + 24 * HEURE, revisionAttendue: 0 };
    expect((await deplacerSeance(db, d, 'florent', MAINTENANT)).faite).toBe(true);
    expect(await deplacerSeance(db, d, 'florent', MAINTENANT)).toEqual({ faite: false, motif: 'creneau_pris' });
    expect(ligne('a').revision).toBe(1);
    expect(compter(base, 'seances_mouvements', "nature = 'deplacee'")).toBe(1);
  });

  it('refuse un déplacement sur une heure prise, et ne laisse aucun mouvement', async () => {
    const res = await deplacerSeance(db, { seanceId: 'a', nouveauDebut: LUNDI_9H30 + 2 * HEURE, revisionAttendue: 0 }, 'florent', MAINTENANT);
    expect(res.faite).toBe(false);
    expect(ligne('a')).toMatchObject({ debut: LUNDI_9H30, revision: 0 });
    expect(compter(base, 'seances_mouvements', "nature = 'deplacee'")).toBe(0);
  });

  it('se déplace sur une heure qu’elle occupe déjà en partie : elle est exclue de la comparaison', async () => {
    const res = await deplacerSeance(db, { seanceId: 'a', nouveauDebut: LUNDI_9H30 + 30 * MINUTE, revisionAttendue: 0 }, 'florent', MAINTENANT);
    expect(res.faite).toBe(true);
    expect(ligne('a').occupe_jusqua).toBe(LUNDI_9H30 + 120 * MINUTE);
  });

  it('la marge du type compte aussi au déplacement', async () => {
    await annuler('a');
    await creer(seance(LUNDI_9H30 + 10 * HEURE, { id: 'bw', typeSeanceId: TYPES.breathwork, dureeMin: 105 }));
    // 'b' occupe [12h30, 14h00[ ; le breathwork à 10h30 finirait à 12h15, marge comprise 12h30 : il touche.
    const touche = LUNDI_9H30 + 3 * HEURE - 120 * MINUTE;
    expect((await deplacerSeance(db, { seanceId: 'bw', nouveauDebut: touche, revisionAttendue: 0 }, 'florent', MAINTENANT)).faite).toBe(true);
    expect(ligne('bw').occupe_jusqua).toBe(LUNDI_9H30 + 3 * HEURE);
    // Une minute plus tard, la marge empiète sur 'b'.
    expect((await deplacerSeance(db, { seanceId: 'bw', nouveauDebut: touche + MINUTE, revisionAttendue: 1 }, 'florent', MAINTENANT)).faite).toBe(false);
  });

  it('refuse une révision périmée : la console montrait une séance qui a bougé depuis', async () => {
    const res = await deplacerSeance(db, { seanceId: 'a', nouveauDebut: LUNDI_9H30 + 24 * HEURE, revisionAttendue: 5 }, 'florent', MAINTENANT);
    expect(res.faite).toBe(false);
  });

  it('ne déplace pas une séance annulée', async () => {
    await annuler('a');
    const res = await deplacerSeance(db, { seanceId: 'a', nouveauDebut: LUNDI_9H30 + 24 * HEURE, revisionAttendue: 0 }, 'florent', MAINTENANT);
    expect(res.faite).toBe(false);
  });
});

describe('NORMATIF — entrer dans l’agenda : rétablir', () => {
  beforeEach(async () => {
    await creer(seance(LUNDI_9H30, { id: 'a' }));
    await annuler('a');
  });

  it('rétablit une séance annulée, une seule fois', async () => {
    expect(await retablirSeance(db, 'a', 'florent', MAINTENANT)).toEqual({ faite: true });
    expect(ligne('a').statut).toBe('prevue');
    expect((await retablirSeance(db, 'a', 'florent', MAINTENANT)).faite).toBe(false);
    expect(compter(base, 'seances_mouvements', "nature = 'retablie'")).toBe(1);
  });

  it('ne rétablit pas sur une heure reprise entre-temps, et ne laisse aucun mouvement', async () => {
    await creer(seance(LUNDI_9H30 + 30 * MINUTE, { clientId: 'client-b' }));
    expect(await retablirSeance(db, 'a', 'florent', MAINTENANT)).toEqual({ faite: false, motif: 'creneau_pris' });
    expect(ligne('a').statut).toBe('annulee');
    expect(compter(base, 'seances_mouvements', "nature = 'retablie'")).toBe(0);
  });
});

describe('NORMATIF — la dernière place', () => {
  const inscription = (champs: Partial<NouvelleInscription> = {}): NouvelleInscription => ({
    id: `inscription-${++n}`,
    evenementId: 'journee',
    clientId: 'client-a',
    statut: 'confirmee',
    reference: `REF${n}`,
    origine: 'console',
    ...champs,
  });
  const inscrire = (ins: NouvelleInscription, instant = MAINTENANT) => prendrePlace(db, ins, instant);

  it('places à 1, deux inscriptions : une seule', async () => {
    await ajouterEvenement(base, 'journee', 1);
    expect(await inscrire(inscription())).toEqual({ faite: true });
    expect(await inscrire(inscription({ clientId: 'client-b' }))).toEqual({ faite: false, motif: 'complet' });
    expect(compter(base, 'inscriptions')).toBe(1);
  });

  it('lit le prix sur l’évènement, moins la réduction', async () => {
    await ajouterEvenement(base, 'journee', 3, 5000);
    await inscrire(inscription({ id: 'avec-promo', reductionCentimes: 1000 }));
    expect(base.query("SELECT montant_centimes FROM inscriptions WHERE id = 'avec-promo'")[0].montant_centimes).toBe(4000);
  });

  it('une inscription expirée ou annulée ne compte pas', async () => {
    await ajouterEvenement(base, 'journee', 1);
    await inscrire(inscription({ id: 'x' }));
    await base.prepare("UPDATE inscriptions SET statut = 'expiree' WHERE id = 'x'").run();
    expect((await inscrire(inscription({ id: 'y', clientId: 'client-b' }))).faite).toBe(true);
    await base.prepare("UPDATE inscriptions SET statut = 'annulee' WHERE id = 'y'").run();
    expect((await inscrire(inscription({ id: 'z', clientId: null }))).faite).toBe(true);
  });

  it('une retenue par carte échue ne compte pas, même restée « retenue »', async () => {
    await ajouterEvenement(base, 'journee', 1);
    await inscrire(inscription({ statut: 'retenue', modePaiement: 'carte', retenueJusqua: MAINTENANT + HEURE }));
    // Pendant le délai : la place est prise.
    expect((await inscrire(inscription({ clientId: 'client-b' }), MAINTENANT + 30 * MINUTE)).faite).toBe(false);
    // Délai passé, la tâche planifiée n'est pas encore passée : la place est libre.
    expect((await inscrire(inscription({ clientId: 'client-b' }), MAINTENANT + 2 * HEURE)).faite).toBe(true);
  });

  it('une retenue par virement compte, délai passé ou non', async () => {
    await ajouterEvenement(base, 'journee', 1);
    await inscrire(inscription({ statut: 'retenue', modePaiement: 'virement', retenueJusqua: MAINTENANT + 168 * HEURE }));
    expect((await inscrire(inscription({ clientId: 'client-b' }), MAINTENANT + HEURE)).faite).toBe(false);
    expect((await inscrire(inscription({ clientId: 'client-b' }), MAINTENANT + 400 * HEURE)).faite).toBe(false);
  });

  it('écrit la tentative de paiement avec la place — et rien après un refus', async () => {
    await ajouterEvenement(base, 'journee', 1);
    const carte = { prestataire: 'stripe' as const, test: true };
    await prendrePlace(db, inscription({ id: 'prise', statut: 'retenue', modePaiement: 'carte', retenueJusqua: MAINTENANT + HEURE }), MAINTENANT, { ...carte, reference: 'pi_1' });
    await prendrePlace(db, inscription({ id: 'refusee', clientId: 'client-b' }), MAINTENANT, { ...carte, reference: 'pi_2' });
    expect(base.query('SELECT inscription_id, reference, montant_centimes, statut FROM paiements').map((r) => ({ ...r })))
      .toEqual([{ inscription_id: 'prise', reference: 'pi_1', montant_centimes: 5000, statut: 'cree' }]);
  });

  it('une erreur au milieu du lot l’annule en entier', async () => {
    await ajouterEvenement(base, 'journee', 5);
    const lot = lotInscription(db, inscription({ id: 'avortee' }), MAINTENANT);
    const enErreur = db.prepare("INSERT INTO paiements (id, prestataire, reference, montant_centimes, statut, created_at, updated_at) VALUES ('p', 'cheque', 'r', 0, 'cree', 0, 0)");
    await expect(db.batch([...lot.instructions, enErreur])).rejects.toThrow();
    expect(compter(base, 'inscriptions')).toBe(0);
  });

  it('refuse un évènement retiré, ou sans nombre de places', async () => {
    await ajouterEvenement(base, 'journee', 5);
    await base.prepare("UPDATE evenements SET deleted_at = 1 WHERE id = 'journee'").run();
    expect((await inscrire(inscription())).faite).toBe(false);
    await base.prepare("UPDATE evenements SET deleted_at = NULL, places_totales = NULL WHERE id = 'journee'").run();
    expect((await inscrire(inscription())).faite).toBe(false);
  });
});
