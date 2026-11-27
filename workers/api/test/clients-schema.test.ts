/**
 * La base des clients : son schéma et ses données de départ (SPEC §14.4,
 * Annexe C), et ce que devient une personne effacée (règle 8).
 *
 * Les clés étrangères sont actives (comme D1 les applique) ; ce que
 * `node:sqlite` ne prouve pas de D1 se constate sur la base de recette
 * elle-même (scripts/recette-clients.sql).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { TestD1 } from './helpers/d1';
import { baseClients, ajouterClient, ajouterEvenement, compter, TYPES, LUNDI_9H30 } from './helpers/clients';
import { TABLES_SENSIBLES } from '../src/clients/sensible';

const TABLES_S1 = [
  'types_seance', 'horaires', 'horaires_dates', 'reglages', 'textes_versions', 'professionnels', 'clients',
  'clients_confiance', 'clients_notes', 'seances', 'seances_mouvements', 'seances_notes', 'seances_reponses',
  'evenements', 'inscriptions', 'questionnaires', 'paiements',
];
/** Les tables de la phase S2a (0003_portes.sql) : aucune ne porte de personne. */
const TABLES_S2A = ['commandes', 'ordres', 'alertes', 'messages_modeles'];
const TABLES = [...TABLES_S1, ...TABLES_S2A];

let base: TestD1;
beforeEach(() => { base = baseClients(); });

const colonnes = (table: string) => base.query(`PRAGMA table_info(${table})`).map((c) => c.name as string);

describe('NORMATIF — le schéma des phases S1 et S2a', () => {
  it('porte les tables des phases, et elles seules', () => {
    const tables = base.query("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").map((r) => r.name);
    expect(tables).toEqual([...TABLES].sort());
  });

  it('les tables sensibles sont des tables de la phase', () => {
    for (const t of TABLES_SENSIBLES) expect(TABLES_S1).toContain(t);
  });

  it('created_at et updated_at partout ; deleted_at seulement sur les tables sans personne', () => {
    const sansPersonne = ['types_seance', 'horaires', 'horaires_dates', 'professionnels', 'evenements', 'messages_modeles'];
    for (const t of TABLES) {
      expect(colonnes(t), t).toEqual(expect.arrayContaining(['created_at', 'updated_at']));
      expect(colonnes(t).includes('deleted_at'), t).toBe(sansPersonne.includes(t));
    }
  });

  it('aucune table ne recopie l’agenda Google, aucune table de liens', () => {
    const tables = base.query("SELECT name FROM sqlite_master WHERE type = 'table'").map((r) => String(r.name));
    expect(tables.filter((t) => /agenda|^liens?_|jeton/.test(t))).toEqual([]);
  });

  it('refuse une valeur hors liste fermée', async () => {
    await ajouterClient(base, 'c', 'Émilie', 'Martin');
    const seance = (statut: string, etat = 'a_payer', mode = 'sur_place', agenda = 'a_ecrire') => base.prepare(
      `INSERT INTO seances (id, client_id, debut, duree_min, occupe_jusqua, statut, etat_paiement, mode, agenda_etat, origine, created_at, updated_at)
       VALUES (?, 'c', 0, 90, 1, ?, ?, ?, ?, 'console', 0, 0)`).bind(crypto.randomUUID(), statut, etat, mode, agenda).run();
    await expect(seance('reportee')).rejects.toThrow(/CHECK/);
    await expect(seance('prevue', 'rembourse')).rejects.toThrow(/CHECK/);
    await expect(seance('prevue', 'a_payer', 'telephone')).rejects.toThrow(/CHECK/);
    await expect(seance('prevue', 'a_payer', 'sur_place', 'ecrite')).rejects.toThrow(/CHECK/);
    await expect(base.prepare(`INSERT INTO paiements (id, prestataire, reference, montant_centimes, statut, created_at, updated_at)
      VALUES ('p', 'paypal', 'r', 0, 'cree', 0, 0)`).run()).rejects.toThrow(/CHECK/);
    await expect(base.prepare(`INSERT INTO questionnaires (id, contexte, created_at, updated_at) VALUES ('q', 'stage', 0, 0)`).run())
      .rejects.toThrow(/CHECK/);
  });

  it('clients.origine reste un texte libre, et la clé d’un client n’est pas unique', async () => {
    for (const id of ['un', 'deux']) {
      await base.prepare(`INSERT INTO clients (id, prenom, nom, nom_recherche, cle_client, origine, created_at, updated_at)
        VALUES (?, 'Émilie', 'Martin', 'emilie martin', 'emilie.martin@example.org emilie martin', 'Une origine nouvelle', 0, 0)`).bind(id).run();
    }
    expect(compter(base, 'clients')).toBe(2);
  });

  it('les index uniques : référence d’inscription, envoi de questionnaire, référence de paiement, version de texte', async () => {
    await ajouterEvenement(base, 'e', 10);
    const inscription = (id: string, ref: string) => base.prepare(`INSERT INTO inscriptions (id, evenement_id, statut, reference, origine, created_at, updated_at)
      VALUES (?, 'e', 'confirmee', ?, 'console', 0, 0)`).bind(id, ref).run();
    await inscription('i1', 'ABC');
    await expect(inscription('i2', 'ABC')).rejects.toThrow(/UNIQUE/);
    const questionnaire = (id: string) => base.prepare(`INSERT INTO questionnaires (id, envoi_id, contexte, created_at, updated_at)
      VALUES (?, 'envoi-1', 'seance', 0, 0)`).bind(id).run();
    await questionnaire('q1');
    await expect(questionnaire('q2')).rejects.toThrow(/UNIQUE/);
    const paiement = (id: string, prestataire: string) => base.prepare(`INSERT INTO paiements (id, prestataire, reference, montant_centimes, statut, created_at, updated_at)
      VALUES (?, ?, 'pi_1', 100, 'cree', 0, 0)`).bind(id, prestataire).run();
    await paiement('p1', 'stripe');
    await paiement('p2', 'stancer');
    await expect(paiement('p3', 'stripe')).rejects.toThrow(/UNIQUE/);
    const texte = (id: string) => base.prepare(`INSERT INTO textes_versions (id, cle, version, texte, en_vigueur_le, created_at, updated_at)
      VALUES (?, 'conditions_annulation', 1, 'Texte d''essai', 0, 0, 0)`).bind(id).run();
    await texte('t1');
    await expect(texte('t2')).rejects.toThrow(/UNIQUE/);
  });

  it('une fiche n’a qu’une inscription vivante par évènement ; les lignes à rapprocher et les inscriptions closes y échappent', async () => {
    await ajouterEvenement(base, 'e', 10);
    await ajouterClient(base, 'c', 'Émilie', 'Martin');
    const inscrire = (id: string, client: string | null, statut: string) => base.prepare(`INSERT INTO inscriptions
      (id, evenement_id, client_id, statut, retenue_jusqua, mode_paiement, reference, origine, created_at, updated_at)
      VALUES (?, 'e', ?, ?, 1, 'carte', ?, 'site', 0, 0)`).bind(id, client, statut, `R-${id}`).run();
    await inscrire('i1', 'c', 'expiree');
    await inscrire('i2', 'c', 'retenue');
    await expect(inscrire('i3', 'c', 'confirmee')).rejects.toThrow(/UNIQUE/);
    await inscrire('i4', null, 'retenue');
    await inscrire('i5', null, 'retenue');
    expect(compter(base, 'inscriptions')).toBe(4);
  });

  it('refuse une retenue sans mode de paiement ou sans échéance', async () => {
    await ajouterEvenement(base, 'e', 10);
    await expect(base.prepare(`INSERT INTO inscriptions (id, evenement_id, statut, reference, origine, created_at, updated_at)
      VALUES ('i', 'e', 'retenue', 'R', 'site', 0, 0)`).run()).rejects.toThrow(/CHECK/);
  });

  it('refuse un renvoi vers une ligne qui n’existe pas', async () => {
    await expect(base.prepare(`INSERT INTO seances (id, client_id, debut, duree_min, occupe_jusqua, statut, etat_paiement, origine, created_at, updated_at)
      VALUES ('s', 'personne', 0, 90, 1, 'prevue', 'a_payer', 'console', 0, 0)`).run()).rejects.toThrow(/FOREIGN KEY/);
  });
});

describe('les données de départ', () => {
  it('les six types de séance, avec durées, marges, pas, montants et fenêtres de Calendly', () => {
    const types = base.query(`SELECT cle, nature, duree_min, marge_apres_min, pas_min, lieu, montant_centimes, etat_paiement_defaut,
      questionnaire_requis, conditions_annulation, liste_attente_proposee, fenetre_debut_h, fenetre_fin_h, questions,
      reservable_en_ligne, actif, deleted_at FROM types_seance ORDER BY ordre`).map((r) => ({ ...r }));
    const commun = { questions: '[]', reservable_en_ligne: 1, actif: 1, deleted_at: null, fenetre_fin_h: 4392 };
    expect(types).toEqual([
      { cle: 'rencontre', nature: 'rencontre', duree_min: 20, marge_apres_min: 0, pas_min: 30, lieu: 'visio_ou_appel', montant_centimes: 0, etat_paiement_defaut: 'offerte', questionnaire_requis: 0, conditions_annulation: 0, liste_attente_proposee: 0, fenetre_debut_h: 12, ...commun },
      { cle: 'rencontre_breathwork', nature: 'rencontre', duree_min: 20, marge_apres_min: 0, pas_min: 30, lieu: 'visio', montant_centimes: 0, etat_paiement_defaut: 'offerte', questionnaire_requis: 1, conditions_annulation: 0, liste_attente_proposee: 0, fenetre_debut_h: 12, ...commun },
      { cle: 'seance', nature: 'seance', duree_min: 90, marge_apres_min: 0, pas_min: 90, lieu: 'sur_place', montant_centimes: 8000, etat_paiement_defaut: 'a_payer', questionnaire_requis: 0, conditions_annulation: 1, liste_attente_proposee: 1, fenetre_debut_h: 504, ...commun },
      { cle: 'seance_distance', nature: 'seance', duree_min: 90, marge_apres_min: 0, pas_min: 90, lieu: 'visio', montant_centimes: 8000, etat_paiement_defaut: 'a_payer', questionnaire_requis: 0, conditions_annulation: 1, liste_attente_proposee: 1, fenetre_debut_h: 504, ...commun },
      { cle: 'seance_enfant', nature: 'seance', duree_min: 60, marge_apres_min: 0, pas_min: 60, lieu: 'sur_place', montant_centimes: 6000, etat_paiement_defaut: 'a_payer', questionnaire_requis: 0, conditions_annulation: 1, liste_attente_proposee: 0, fenetre_debut_h: 504, ...commun },
      { cle: 'seance_breathwork', nature: 'seance', duree_min: 105, marge_apres_min: 15, pas_min: 60, lieu: 'sur_place', montant_centimes: 14000, etat_paiement_defaut: 'a_payer', questionnaire_requis: 1, conditions_annulation: 1, liste_attente_proposee: 0, fenetre_debut_h: 504, ...commun },
    ]);
    expect(base.query('SELECT libelle FROM types_seance WHERE id = ?', TYPES.breathwork)[0].libelle).toBe('Séance de breathwork holotropique');
  });

  it('la semaine type : lundi et jeudi, trois plages', () => {
    const horaires = base.query('SELECT jour, debut, fin FROM horaires ORDER BY jour, debut').map((r) => `${r.jour} ${r.debut}-${r.fin}`);
    expect(horaires).toEqual([
      '1 09:30-11:30', '1 13:00-16:00', '1 16:30-19:30',
      '4 09:30-11:30', '4 13:00-16:00', '4 16:30-19:30',
    ]);
  });

  it('les réglages, en heures et en nombres ; aucun texte encore', () => {
    const reglages = Object.fromEntries(base.query('SELECT cle, valeur FROM reglages').map((r) => [r.cle, r.valeur]));
    expect(reglages).toEqual({
      rappel_email_avant_h: 72, rappel_sms_avant_h: 48, retenue_carte_h: 1, retenue_virement_h: 168,
      liste_attente_creneau_min_h: 48, liste_attente_seance_min_h: 48, liste_attente_personnes_max: 8,
      // Phase S2a (0003_portes.sql).
      porte_publique_ouverte: 1, commandes_questionnaire_max_jour: 30, emails_max_jour: 50,
      recus_garde_h: 720, ordre_relance_min: 15, ordre_tentatives_max: 5,
    });
    expect(compter(base, 'textes_versions')).toBe(0);
    expect(compter(base, 'horaires_dates')).toBe(0);
  });
});

describe('NORMATIF — effacer une personne (règle 8, Annexe C)', () => {
  /** Deux personnes complètes, liées l'une à l'autre, et des lignes à rapprocher. */
  beforeEach(async () => {
    await base.prepare(`INSERT INTO professionnels (id, nom, created_at, updated_at) VALUES ('pro', 'Cabinet d''essai', 0, 0)`).run();
    await ajouterEvenement(base, 'e', 10);
    for (const id of ['a', 'b']) {
      await ajouterClient(base, id, `Prénom ${id}`, 'Essai');
      await base.prepare(`UPDATE clients SET via_professionnel_id = 'pro' WHERE id = ?`).bind(id).run();
      await base.prepare(`INSERT INTO questionnaires (id, client_id, contexte, created_at, updated_at) VALUES (?, ?, 'seance', 0, 0)`).bind(`q-${id}`, id).run();
      await base.prepare(`INSERT INTO seances (id, client_id, type_seance_id, debut, duree_min, occupe_jusqua, statut, etat_paiement, questionnaire_id, origine, created_at, updated_at)
        VALUES (?, ?, ?, ?, 90, ?, 'prevue', 'a_payer', ?, 'console', 0, 0)`).bind(`s-${id}`, id, TYPES.seance, LUNDI_9H30, LUNDI_9H30 + 1, `q-${id}`).run();
      await base.prepare(`UPDATE questionnaires SET seance_id = ? WHERE id = ?`).bind(`s-${id}`, `q-${id}`).run();
      await base.prepare(`INSERT INTO seances_mouvements (id, seance_id, nature, par, revision, created_at, updated_at) VALUES (?, ?, 'creee', 'florent', 0, 0, 0)`).bind(`m-${id}`, `s-${id}`).run();
      await base.prepare(`INSERT INTO seances_notes (id, seance_id, seance, created_at, updated_at) VALUES (?, ?, 'Texte d''essai', 0, 0)`).bind(`n-${id}`, `s-${id}`).run();
      await base.prepare(`INSERT INTO seances_reponses (id, seance_id, rang, question, reponse, created_at, updated_at) VALUES (?, ?, 1, 'Question d''essai', 'Texte d''essai', 0, 0)`).bind(`r-${id}`, `s-${id}`).run();
      await base.prepare(`INSERT INTO clients_confiance (id, client_id, prenom, questionnaire_id, created_at, updated_at) VALUES (?, ?, 'Confiance', ?, 0, 0)`).bind(`cf-${id}`, id, `q-${id}`).run();
      await base.prepare(`INSERT INTO clients_notes (id, client_id, texte, created_at, updated_at) VALUES (?, ?, 'Texte d''essai', 0, 0)`).bind(`cn-${id}`, id).run();
      await base.prepare(`INSERT INTO inscriptions (id, evenement_id, client_id, statut, reference, questionnaire_id, origine, created_at, updated_at) VALUES (?, 'e', ?, 'confirmee', ?, ?, 'console', 0, 0)`).bind(`i-${id}`, id, `R-${id}`, `q-${id}`).run();
      await base.prepare(`INSERT INTO paiements (id, seance_id, prestataire, reference, montant_centimes, statut, created_at, updated_at) VALUES (?, ?, 'stancer', ?, 8000, 'reussi', 0, 0)`).bind(`ps-${id}`, `s-${id}`, `pi-s-${id}`).run();
      await base.prepare(`INSERT INTO paiements (id, inscription_id, prestataire, reference, montant_centimes, statut, created_at, updated_at) VALUES (?, ?, 'stripe', ?, 5000, 'reussi', 0, 0)`).bind(`pi-${id}`, `i-${id}`, `pi-i-${id}`).run();
    }
    // Les liens d'une fiche à l'autre, une fois les deux fiches écrites.
    for (const [id, autre] of [['a', 'b'], ['b', 'a']]) {
      await base.prepare(`UPDATE clients SET via_client_id = ?, couple_client_id = ? WHERE id = ?`).bind(autre, autre, id).run();
    }
    // À rapprocher : sans client, mais liées aux lignes de « a ».
    await base.prepare(`INSERT INTO seances (id, identite_recue, debut, duree_min, occupe_jusqua, statut, etat_paiement, questionnaire_id, origine, created_at, updated_at)
      VALUES ('s-orpheline', '{"prenom":"Prénom a"}', ?, 20, ?, 'prevue', 'offerte', 'q-a', 'site', 0, 0)`).bind(LUNDI_9H30 + 1e7, LUNDI_9H30 + 2e7).run();
    await base.prepare(`INSERT INTO questionnaires (id, contexte, seance_id, inscription_id, rattachement, created_at, updated_at)
      VALUES ('q-orphelin', 'seance', 's-a', 'i-a', 'a_rapprocher', 0, 0)`).run();
    await base.prepare(`INSERT INTO inscriptions (id, evenement_id, statut, reference, origine, created_at, updated_at) VALUES ('i-orpheline', 'e', 'confirmee', 'R-o', 'site', 0, 0)`).run();

    await base.prepare(`DELETE FROM clients WHERE id = 'a'`).run();
  });

  it('plus aucune ligne de « a » dans les tables de personnes', () => {
    expect(compter(base, 'clients', "id = 'a'")).toBe(0);
    for (const table of ['seances', 'questionnaires', 'inscriptions', 'clients_confiance', 'clients_notes']) {
      expect(compter(base, table, "client_id = 'a'"), table).toBe(0);
    }
    for (const table of ['seances_mouvements', 'seances_notes', 'seances_reponses']) {
      expect(compter(base, table, "seance_id = 's-a'"), table).toBe(0);
    }
  });

  it('ses paiements restent, détachés', () => {
    expect(base.query("SELECT id, seance_id, inscription_id FROM paiements WHERE id IN ('ps-a', 'pi-a') ORDER BY id").map((r) => ({ ...r })))
      .toEqual([{ id: 'pi-a', seance_id: null, inscription_id: null }, { id: 'ps-a', seance_id: null, inscription_id: null }]);
  });

  it('les liens de l’autre fiche vers elle sont remis à vide ; le professionnel reste', () => {
    expect({ ...base.query("SELECT via_client_id, couple_client_id, via_professionnel_id FROM clients WHERE id = 'b'")[0] })
      .toEqual({ via_client_id: null, couple_client_id: null, via_professionnel_id: 'pro' });
    expect(compter(base, 'professionnels')).toBe(1);
  });

  it('une autre personne, ses séances et ses questionnaires sont intacts', () => {
    expect(compter(base, 'clients', "id = 'b'")).toBe(1);
    expect(compter(base, 'seances', "client_id = 'b'")).toBe(1);
    expect(compter(base, 'questionnaires', "client_id = 'b' AND seance_id = 's-b'")).toBe(1);
    expect(compter(base, 'seances_notes', "seance_id = 's-b'")).toBe(1);
    expect(compter(base, 'seances_reponses', "seance_id = 's-b'")).toBe(1);
    expect(compter(base, 'seances_mouvements', "seance_id = 's-b'")).toBe(1);
    expect(compter(base, 'clients_confiance', "client_id = 'b' AND questionnaire_id = 'q-b'")).toBe(1);
    expect(compter(base, 'clients_notes', "client_id = 'b'")).toBe(1);
    expect(compter(base, 'inscriptions', "client_id = 'b'")).toBe(1);
    expect(compter(base, 'paiements', "seance_id = 's-b' OR inscription_id = 'i-b'")).toBe(2);
  });

  it('les lignes à rapprocher ne sont atteintes par aucune cascade : la phase S4 les traitera', () => {
    expect({ ...base.query("SELECT questionnaire_id FROM seances WHERE id = 's-orpheline'")[0] }).toEqual({ questionnaire_id: null });
    expect({ ...base.query("SELECT seance_id, inscription_id FROM questionnaires WHERE id = 'q-orphelin'")[0] })
      .toEqual({ seance_id: null, inscription_id: null });
    expect(compter(base, 'inscriptions', "id = 'i-orpheline'")).toBe(1);
  });
});

describe('NORMATIF — le schéma de la phase S2a (0003_portes.sql)', () => {
  const commande = (porte: string, cle: string, sorte = 'questionnaire') => base.prepare(
    `INSERT INTO commandes (id, porte, cle, sorte, empreinte, recu, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'e', '{"ok":true}', 0, 0)`).bind(crypto.randomUUID(), porte, cle, sorte).run();
  const ordre = (cle: string, sorte = 'message.email', etat = 'prevu') => base.prepare(
    `INSERT INTO ordres (id, sorte, objet_type, objet_id, prevu_le, etat, cle_unicite, created_at, updated_at)
     VALUES (?, ?, 'questionnaire', 'q', 0, ?, ?, 0, 0)`).bind(crypto.randomUUID(), sorte, etat, cle).run();
  const alerte = (sorte: string, objet: string, resolue: number | null = null) => base.prepare(
    `INSERT INTO alertes (id, sorte, objet_type, objet_id, resolue_le, created_at, updated_at)
     VALUES (?, ?, 'questionnaire', ?, ?, 0, 0)`).bind(crypto.randomUUID(), sorte, objet, resolue).run();

  it('une clé par porte : (porte, cle) est unique', async () => {
    await commande('publique', 'cle-0000000000000001');
    await commande('service', 'cle-0000000000000001', 'confirmation');
    await expect(commande('publique', 'cle-0000000000000001')).rejects.toThrow(/UNIQUE/);
    await expect(commande('site', 'cle-0000000000000002')).rejects.toThrow(/CHECK/);
  });

  it('un ordre par effet, une sorte de la liste du contrat', async () => {
    await ordre('accuse:q');
    await expect(ordre('accuse:q')).rejects.toThrow(/UNIQUE/);
    await expect(ordre('autre', 'message.whatsapp')).rejects.toThrow(/CHECK/);
    await expect(ordre('autre', 'message.email', 'parti')).rejects.toThrow(/CHECK/);
  });

  it('la même alerte ne s’ouvre pas deux fois ; résolue, elle peut se rouvrir', async () => {
    await alerte('a_rapprocher', 'q1');
    await expect(alerte('a_rapprocher', 'q1')).rejects.toThrow(/UNIQUE/);
    await base.prepare(`UPDATE alertes SET resolue_le = 1 WHERE objet_id = 'q1'`).run();
    await alerte('a_rapprocher', 'q1');
    await alerte('a_rapprocher', 'q2', 5);
    await expect(alerte('inconnue', 'q3')).rejects.toThrow(/CHECK/);
  });

  it('aucune colonne d’adresse, de numéro ni de texte dans les ordres et les alertes', () => {
    for (const t of ['ordres', 'alertes', 'commandes']) {
      expect(colonnes(t).filter((c) => /email|telephone|adresse|nom|prenom|texte|corps|objet$/.test(c)), t).toEqual([]);
    }
  });

  it('les modèles naissent vides, versionnés par clé et canal', async () => {
    expect(compter(base, 'messages_modeles')).toBe(0);
    const modele = (version: number, canal = 'email') => base.prepare(
      `INSERT INTO messages_modeles (id, cle, canal, version, objet, corps, created_at, updated_at)
       VALUES (?, 'questionnaire_accuse', ?, ?, 'Objet', 'Corps', 0, 0)`).bind(crypto.randomUUID(), canal, version).run();
    await modele(1);
    await modele(1, 'sms');
    await modele(2);
    await expect(modele(1)).rejects.toThrow(/UNIQUE/);
    await expect(modele(1, 'courrier')).rejects.toThrow(/CHECK/);
  });

  it('un questionnaire garde la mémoire de son envoi', () => {
    expect(colonnes('questionnaires')).toEqual(expect.arrayContaining(['envoi_empreinte', 'fiche_completee_le']));
  });
});
