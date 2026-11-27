-- Les données de départ de `luminose-clients` : les mêmes dans tous les
-- environnements (production, recette, poste local). Elles se modifieront
-- depuis la console ; cette migration ne se rejoue pas.
--
-- Identifiants fixes, pour qu'une même ligne porte le même identifiant partout.
-- Horodatage : le 26/11/2026, jour où Florent a relu ces valeurs dans Calendly.

-- ─── Types de séance ────────────────────────────────────────────────────────
-- Durées en minutes, montants en centimes, fenêtre en heures écoulées
-- (12 h ; 504 h = 21 jours ; 4392 h = 183 jours). Les questions arrivent avec
-- la réservation : vides pour tous.
INSERT INTO types_seance (
  id, cle, libelle, nature, duree_min, marge_apres_min, pas_min, lieu,
  montant_centimes, etat_paiement_defaut, questionnaire_requis, conditions_annulation,
  liste_attente_proposee, fenetre_debut_h, fenetre_fin_h, questions,
  reservable_en_ligne, actif, ordre, created_at, updated_at
) VALUES
  ('9941effe-66b6-487a-81a0-b0bf833c17fb', 'rencontre', 'Rencontre', 'rencontre',
   20, 0, 30, 'visio_ou_appel', 0, 'offerte', 0, 0, 0, 12, 4392, '[]', 1, 1, 1, 1795651200000, 1795651200000),
  ('f65f2eda-d19e-47a7-adbc-7382d4507936', 'rencontre_breathwork', 'Rencontre — découvrir le breathwork', 'rencontre',
   20, 0, 30, 'visio', 0, 'offerte', 1, 0, 0, 12, 4392, '[]', 1, 1, 2, 1795651200000, 1795651200000),
  ('4e7e5b6f-2217-4567-b227-14f2ecbc33b9', 'seance', 'Séance', 'seance',
   90, 0, 90, 'sur_place', 8000, 'a_payer', 0, 1, 1, 504, 4392, '[]', 1, 1, 3, 1795651200000, 1795651200000),
  ('62a866c3-35b0-40ec-8a99-848223a207ee', 'seance_distance', 'Séance à distance', 'seance',
   90, 0, 90, 'visio', 8000, 'a_payer', 0, 1, 1, 504, 4392, '[]', 1, 1, 4, 1795651200000, 1795651200000),
  ('66375c3a-ae15-4b90-9ecc-6bb721d7e863', 'seance_enfant', 'Séance enfant', 'seance',
   60, 0, 60, 'sur_place', 6000, 'a_payer', 0, 1, 0, 504, 4392, '[]', 1, 1, 5, 1795651200000, 1795651200000),
  ('96477be8-8460-4874-bc12-723ca512f586', 'seance_breathwork', 'Séance de breathwork holotropique', 'seance',
   105, 15, 60, 'sur_place', 14000, 'a_payer', 1, 1, 0, 504, 4392, '[]', 1, 1, 6, 1795651200000, 1795651200000);

-- ─── Horaires : la semaine type ─────────────────────────────────────────────
-- Lundi (1) et jeudi (4), heure de Paris.
INSERT INTO horaires (id, jour, debut, fin, created_at, updated_at) VALUES
  ('1700deca-df32-42a2-a53e-35ffcaa30c05', 1, '09:30', '11:30', 1795651200000, 1795651200000),
  ('1724c3c8-ab88-48ec-be0e-b0ddcfdf826e', 1, '13:00', '16:00', 1795651200000, 1795651200000),
  ('73ce0be9-d1bd-41e1-8c7e-42a39bc7c500', 1, '16:30', '19:30', 1795651200000, 1795651200000),
  ('09b16aa2-9768-40a7-a5d7-e7d764d6d00d', 4, '09:30', '11:30', 1795651200000, 1795651200000),
  ('60e020e7-8bb0-4e86-a494-72872c78bf8d', 4, '13:00', '16:00', 1795651200000, 1795651200000),
  ('2d05e087-c372-44a7-ba40-99a243d0b0b5', 4, '16:30', '19:30', 1795651200000, 1795651200000);

-- ─── Réglages ───────────────────────────────────────────────────────────────
-- `_h` : une durée écoulée en heures (§14.7). Les bornes de la porte publique
-- arrivent avec elle (S2).
INSERT INTO reglages (cle, valeur, created_at, updated_at) VALUES
  ('rappel_email_avant_h', 72, 1795651200000, 1795651200000),
  ('rappel_sms_avant_h', 48, 1795651200000, 1795651200000),
  ('retenue_carte_h', 1, 1795651200000, 1795651200000),
  ('retenue_virement_h', 168, 1795651200000, 1795651200000),
  -- Liste d'attente : un créneau libéré n'est proposé que s'il commence dans
  -- 48 h ou plus ; une personne n'est prévenue que si sa séance est dans 48 h
  -- ou plus ; huit personnes au plus.
  ('liste_attente_creneau_min_h', 48, 1795651200000, 1795651200000),
  ('liste_attente_seance_min_h', 48, 1795651200000, 1795651200000),
  ('liste_attente_personnes_max', 8, 1795651200000, 1795651200000);

-- `textes_versions` reste vide : les conditions d'annulation et l'accord de
-- conservation arrivent avec les écrans.
