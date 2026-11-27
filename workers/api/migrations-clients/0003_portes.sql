-- Les portes, côté gestion : ce qu'une porte a reçu, ce que gestion demande à
-- Make, ce qui demande le regard de Florent, et les modèles de messages
-- (SPEC §14.6, phase S2a ; Annexe C).
--
-- `0001` et `0002` ne se modifient pas : cette migration ajoute. Aucune des
-- quatre tables ne porte de valeur personnelle — une commande garde une
-- empreinte et un reçu minimal, un ordre et une alerte désignent un objet sans
-- le décrire. Leurs liens vers l'objet sont polymorphes (`objet_type`,
-- `objet_id`), donc sans clé étrangère : c'est l'effacement de la phase S4 qui
-- les retire avec la personne (Annexe C, matrice d'effacement).

-- ─── Ce qu'une porte a reçu ─────────────────────────────────────────────────

-- Une ligne par commande ACCEPTÉE : les refus d'avant la décision (invalide,
-- ferme, trop_de_demandes) ne s'y écrivent pas (§14.6.1). Le couple
-- (porte, cle) est unique : c'est lui qui fait qu'un envoi rejoué ne crée rien
-- en double (règle 5).
CREATE TABLE commandes (
  id          TEXT PRIMARY KEY,
  porte       TEXT NOT NULL CHECK (porte IN ('publique', 'service')),
  -- Fabriquée par l'appelant (contrat §2) ; pour une confirmation de Make,
  -- l'identifiant de l'ordre.
  cle         TEXT NOT NULL,
  sorte       TEXT NOT NULL CHECK (sorte IN ('questionnaire', 'confirmation')),
  objet_type  TEXT,
  objet_id    TEXT,
  -- HMAC de l'envoi, avec un secret de gestion : elle ne permet pas d'en
  -- deviner le contenu.
  empreinte   TEXT NOT NULL,
  -- JSON : la réponse rendue. Ni identité, ni réponse.
  recu        TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_commandes_cle ON commandes(porte, cle);
-- La purge, et le compte des commandes du jour (la borne).
CREATE INDEX idx_commandes_created ON commandes(created_at);
CREATE INDEX idx_commandes_objet ON commandes(objet_type, objet_id);

-- ─── Ce que gestion demande à Make ──────────────────────────────────────────

-- Ni adresse, ni numéro, ni texte : le message se compose au départ, depuis le
-- modèle et la fiche du moment (§14.6).
CREATE TABLE ordres (
  id                  TEXT PRIMARY KEY,
  -- La liste du contrat, §4.1. Seul `message.email` sert dans la phase S2a.
  sorte               TEXT NOT NULL CHECK (sorte IN (
                        'message.email', 'message.sms', 'conversion.importer', 'conversion.retirer',
                        'contact.brevo', 'client.comptabilite', 'paiement.stancer.creer',
                        'paiement.stancer.verifier', 'facture.qonto.creer', 'notification.florent')),
  -- Pour un message : la clé du modèle (`questionnaire_accuse`…).
  modele_cle          TEXT,
  objet_type          TEXT NOT NULL,
  objet_id            TEXT NOT NULL,
  prevu_le            INTEGER NOT NULL,
  etat                TEXT NOT NULL DEFAULT 'prevu'
                      CHECK (etat IN ('prevu', 'confie_a_make', 'fait', 'echec', 'annule')),
  -- Une clé par effet : `accuse:<questionnaire>`, plus tard
  -- `rappel:<séance>:<canal>:<révision>`.
  cle_unicite         TEXT NOT NULL,
  tentatives          INTEGER NOT NULL DEFAULT 0 CHECK (tentatives >= 0),
  -- Posée une fois, à la première remise : c'est elle qui compte un e-mail
  -- dans la borne du jour, pas ses relances.
  premiere_remise_le  INTEGER,
  confie_le           INTEGER,
  termine_le          INTEGER,
  -- JSON rendu par Make : des identifiants, jamais un texte.
  resultat            TEXT,
  -- Un code court : `objet_absent`, le motif d'un échec rendu par Make…
  motif               TEXT,
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_ordres_cle_unicite ON ordres(cle_unicite);
CREATE INDEX idx_ordres_etat ON ordres(etat, prevu_le);
CREATE INDEX idx_ordres_premiere_remise ON ordres(sorte, premiere_remise_le);

-- ─── Ce qui demande le regard de Florent ────────────────────────────────────

-- Une alerte désigne un objet, elle ne le décrit pas : aucune valeur
-- personnelle ici. L'écart d'une fiche, par exemple, se lit sur la ligne reçue.
CREATE TABLE alertes (
  id          TEXT PRIMARY KEY,
  sorte       TEXT NOT NULL CHECK (sorte IN (
                'a_rapprocher', 'a_revoir', 'ecart_fiche', 'second_questionnaire', 'message_echec',
                'confirmation_contraire', 'borne_atteinte', 'modele_absent')),
  objet_type  TEXT NOT NULL,
  objet_id    TEXT NOT NULL,
  resolue_le  INTEGER,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
-- La même alerte ne s'ouvre pas deux fois tant qu'elle n'est pas résolue.
CREATE UNIQUE INDEX idx_alertes_ouvertes ON alertes(sorte, objet_type, objet_id) WHERE resolue_le IS NULL;
CREATE INDEX idx_alertes_objet ON alertes(objet_type, objet_id);

-- ─── Les modèles de messages ────────────────────────────────────────────────

-- Créée vide : les textes viennent du lot F. Une modification crée une version.
CREATE TABLE messages_modeles (
  id          TEXT PRIMARY KEY,
  cle         TEXT NOT NULL,
  canal       TEXT NOT NULL CHECK (canal IN ('email', 'sms')),
  version     INTEGER NOT NULL CHECK (version >= 1),
  objet       TEXT,
  corps       TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  deleted_at  INTEGER
);
CREATE UNIQUE INDEX idx_messages_modeles_version ON messages_modeles(cle, canal, version);

-- ─── La mémoire d'un envoi, après la purge de sa commande ───────────────────

-- L'empreinte de l'envoi : un rejeu reconnu après la purge de sa commande
-- (§14.6.1). Et la fiche complétée : posée quand la fiche a reçu ce que ce
-- questionnaire pouvait lui apporter — vide, le passage planifié le reprend.
ALTER TABLE questionnaires ADD COLUMN envoi_empreinte TEXT;
ALTER TABLE questionnaires ADD COLUMN fiche_completee_le INTEGER;

-- ─── Réglages de la phase ───────────────────────────────────────────────────
-- Les mêmes dans tous les environnements, modifiables depuis la console.
-- Valeurs de départ choisies par le brief de la phase, à confirmer (§14.6.1).
-- Horodatage : le 27/11/2026.
INSERT INTO reglages (cle, valeur, created_at, updated_at) VALUES
  -- L'interrupteur de la porte publique : 0, toute commande reçoit `ferme`.
  ('porte_publique_ouverte', 1, 1795737600000, 1795737600000),
  -- Sur 24 heures glissantes.
  ('commandes_questionnaire_max_jour', 30, 1795737600000, 1795737600000),
  ('emails_max_jour', 50, 1795737600000, 1795737600000),
  -- La garde d'une commande et de son reçu : 720 h = 30 jours.
  ('recus_garde_h', 720, 1795737600000, 1795737600000),
  -- En minutes : le délai avant de représenter à Make un ordre non confirmé.
  ('ordre_relance_min', 15, 1795737600000, 1795737600000),
  ('ordre_tentatives_max', 5, 1795737600000, 1795737600000);
