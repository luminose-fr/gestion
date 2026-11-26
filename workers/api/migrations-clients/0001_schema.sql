-- La base `luminose-clients` — phase S1 du socle (SPEC §14.4, Annexe C).
--
-- Les tables de la phase, et elles seules : une table arrive avec la phase qui
-- s'en sert. Les commandes, les ordres, les alertes, les modèles de messages
-- (S2), les effacements (S4) et les créneaux libérés (réservation) n'y sont pas.
--
-- Conventions (§14.4) :
--   - identifiants en TEXT : un UUID, ou l'identifiant de la page Notion d'une
--     ligne reprise (l'import se rejoue sans doublon) ;
--   - instants en millisecondes UTC ; une date sans heure en `AAAA-MM-JJ`, une
--     heure d'horaire en `HH:MM`, heure de Paris ;
--   - montants en centimes, entiers ;
--   - choix en minuscules sans accent, contraints par CHECK quand la liste est
--     fermée ;
--   - `deleted_at` SEULEMENT sur les tables sans personne (types de séance,
--     horaires, professionnels, évènements). Effacer une personne retire ses
--     lignes pour de bon (règle 8) : une suppression logique la garderait.
--
-- Les clés étrangères suivent la matrice d'effacement de l'Annexe C. En
-- résumé : supprimer un client retire en cascade tout ce qui est à lui, sauf
-- ses paiements, qui restent détachés ; les liens d'une fiche à l'autre sont
-- remis à vide ; une ligne « à rapprocher » (sans client) n'est atteinte par
-- aucune cascade — c'est l'effacement de la phase S4 qui la traitera.
--
-- D1 applique les clés étrangères d'office. Un renvoi vers une table créée plus
-- bas dans ce fichier est permis : SQLite ne le vérifie qu'à l'écriture.

-- ─── La réservation : types, horaires, réglages ─────────────────────────────

CREATE TABLE types_seance (
  id                      TEXT PRIMARY KEY,
  cle                     TEXT NOT NULL,
  libelle                 TEXT NOT NULL,
  nature                  TEXT NOT NULL CHECK (nature IN ('rencontre', 'seance')),
  duree_min               INTEGER NOT NULL CHECK (duree_min > 0),
  -- Le temps bloqué après la séance : un quart d'heure pour le breathwork.
  marge_apres_min         INTEGER NOT NULL DEFAULT 0 CHECK (marge_apres_min >= 0),
  -- L'écart entre deux débuts proposés : un entretien de 20 minutes se propose
  -- toutes les 30 minutes.
  pas_min                 INTEGER NOT NULL CHECK (pas_min > 0),
  lieu                    TEXT NOT NULL CHECK (lieu IN ('sur_place', 'visio', 'visio_ou_appel')),
  montant_centimes        INTEGER NOT NULL DEFAULT 0 CHECK (montant_centimes >= 0),
  etat_paiement_defaut    TEXT NOT NULL
                          CHECK (etat_paiement_defaut IN ('a_payer', 'attente_especes', 'payee', 'offerte', 'annulee')),
  questionnaire_requis    INTEGER NOT NULL DEFAULT 0 CHECK (questionnaire_requis IN (0, 1)),
  conditions_annulation   INTEGER NOT NULL DEFAULT 0 CHECK (conditions_annulation IN (0, 1)),
  liste_attente_proposee  INTEGER NOT NULL DEFAULT 0 CHECK (liste_attente_proposee IN (0, 1)),
  -- La fenêtre proposée en ligne, en heures écoulées (§14.7) : 504 h = 21 jours.
  fenetre_debut_h         INTEGER NOT NULL CHECK (fenetre_debut_h >= 0),
  fenetre_fin_h           INTEGER NOT NULL CHECK (fenetre_fin_h > fenetre_debut_h),
  -- JSON : les questions posées à la réservation. Vide jusqu'à la réservation.
  questions               TEXT NOT NULL DEFAULT '[]',
  reservable_en_ligne     INTEGER NOT NULL DEFAULT 1 CHECK (reservable_en_ligne IN (0, 1)),
  actif                   INTEGER NOT NULL DEFAULT 1 CHECK (actif IN (0, 1)),
  ordre                   INTEGER NOT NULL DEFAULT 0,
  created_at              INTEGER NOT NULL,
  updated_at              INTEGER NOT NULL,
  deleted_at              INTEGER
);
CREATE UNIQUE INDEX idx_types_seance_cle ON types_seance(cle);

-- La semaine type, un seul horaire pour tous les types (modèle §9, point 5).
CREATE TABLE horaires (
  id          TEXT PRIMARY KEY,
  jour        INTEGER NOT NULL CHECK (jour BETWEEN 1 AND 7),   -- 1 = lundi … 7 = dimanche
  debut       TEXT NOT NULL CHECK (debut GLOB '[0-2][0-9]:[0-5][0-9]'),
  fin         TEXT NOT NULL CHECK (fin GLOB '[0-2][0-9]:[0-5][0-9]'),
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  deleted_at  INTEGER,
  CHECK (debut < fin)
);

-- Les exceptions datées : une ligne par plage. Une date présente remplace la
-- semaine type ce jour-là ; une ligne sans plage (debut et fin vides) ferme la
-- journée.
CREATE TABLE horaires_dates (
  id          TEXT PRIMARY KEY,
  date        TEXT NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
  debut       TEXT CHECK (debut GLOB '[0-2][0-9]:[0-5][0-9]'),
  fin         TEXT CHECK (fin GLOB '[0-2][0-9]:[0-5][0-9]'),
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  deleted_at  INTEGER,
  CHECK ((debut IS NULL AND fin IS NULL) OR (debut IS NOT NULL AND fin IS NOT NULL AND debut < fin))
);
CREATE INDEX idx_horaires_dates_date ON horaires_dates(date);

-- Ce qui se règle sans toucher au code. Une valeur entière : une durée en
-- heures (le suffixe `_h` de la clé le dit) ou un nombre.
CREATE TABLE reglages (
  cle         TEXT PRIMARY KEY,
  valeur      INTEGER NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

-- Les textes qu'une personne accepte. Une modification crée une version ; la
-- séance ou le questionnaire garde la version acceptée.
CREATE TABLE textes_versions (
  id              TEXT PRIMARY KEY,
  cle             TEXT NOT NULL,           -- conditions_annulation | accord_conservation
  version         INTEGER NOT NULL CHECK (version >= 1),
  texte           TEXT NOT NULL,
  en_vigueur_le   INTEGER NOT NULL,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_textes_versions_cle ON textes_versions(cle, version);

-- ─── Références ─────────────────────────────────────────────────────────────

CREATE TABLE professionnels (
  id              TEXT PRIMARY KEY,
  nom             TEXT NOT NULL,
  categories      TEXT NOT NULL DEFAULT '[]',   -- JSON : liste
  specialisation  TEXT,
  adresse         TEXT,
  code_postal     TEXT,
  ville           TEXT,
  telephone       TEXT,
  email           TEXT,
  site_web        TEXT,
  note            TEXT,
  connu           INTEGER NOT NULL DEFAULT 0 CHECK (connu IN (0, 1)),
  courriers       TEXT NOT NULL DEFAULT '[]',   -- JSON : « Mai 2023 »…
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  deleted_at      INTEGER
);

-- ─── Les personnes ──────────────────────────────────────────────────────────

CREATE TABLE clients (
  id                    TEXT PRIMARY KEY,
  civilite              TEXT,                    -- Mme | M.
  prenom                TEXT NOT NULL,
  nom                   TEXT NOT NULL DEFAULT '',
  -- Sans accents, en minuscules : la recherche et l'ordre alphabétique.
  nom_recherche         TEXT NOT NULL,
  -- La clé d'un client (packages/pratique). Indexée, PAS unique : deux fiches
  -- peuvent la partager, et c'est le cas « à rapprocher » (§14.4). Vide pour
  -- une fiche sans adresse, qui ne se rattache jamais d'elle-même.
  cle_client            TEXT,
  email                 TEXT,
  telephone             TEXT,
  date_naissance        TEXT CHECK (date_naissance GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
  profession            TEXT,
  adresse               TEXT,
  code_postal           TEXT,
  ville                 TEXT,
  pays                  TEXT,                    -- code : FR
  -- Texte libre : la liste des origines bouge.
  origine               TEXT,
  mot_cle_google_ads    TEXT,
  clic_annonce          TEXT,
  clic_date             INTEGER,
  via_professionnel_id  TEXT REFERENCES professionnels(id) ON DELETE SET NULL,
  via_client_id         TEXT REFERENCES clients(id) ON DELETE SET NULL,
  couple_client_id      TEXT REFERENCES clients(id) ON DELETE SET NULL,
  stancer_customer_id   TEXT,
  qonto_client_id       TEXT,
  brevo_ajoute_le       INTEGER,
  compta_wlu_ajoute_le  INTEGER,
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL
);
CREATE INDEX idx_clients_cle ON clients(cle_client);
CREATE INDEX idx_clients_nom_recherche ON clients(nom_recherche);
CREATE INDEX idx_clients_via_professionnel ON clients(via_professionnel_id);
CREATE INDEX idx_clients_via_client ON clients(via_client_id);
CREATE INDEX idx_clients_couple ON clients(couple_client_id);

-- ★ La personne de confiance : une par fiche.
CREATE TABLE clients_confiance (
  id                TEXT PRIMARY KEY,
  client_id         TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  civilite          TEXT,
  prenom            TEXT,
  nom               TEXT,
  telephone         TEXT,
  email             TEXT,
  mis_a_jour_le     INTEGER,
  questionnaire_id  TEXT REFERENCES questionnaires(id) ON DELETE SET NULL,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_clients_confiance_client ON clients_confiance(client_id);
CREATE INDEX idx_clients_confiance_questionnaire ON clients_confiance(questionnaire_id);

-- ★ Le texte libre de la fiche : un par fiche.
CREATE TABLE clients_notes (
  id          TEXT PRIMARY KEY,
  client_id   TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  texte       TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_clients_notes_client ON clients_notes(client_id);

-- ─── Les séances ────────────────────────────────────────────────────────────

CREATE TABLE seances (
  id                      TEXT PRIMARY KEY,
  -- Vide tant que la séance est « à rapprocher » : elle garde alors l'identité
  -- reçue. Aucune cascade ne l'atteint.
  client_id               TEXT REFERENCES clients(id) ON DELETE CASCADE,
  -- Vide sur une séance ancienne dont le type n'est pas reconnu.
  type_seance_id          TEXT REFERENCES types_seance(id),
  -- JSON : prénom, nom, e-mail et téléphone tels qu'envoyés.
  identite_recue          TEXT,
  debut                   INTEGER NOT NULL,
  duree_min               INTEGER NOT NULL CHECK (duree_min > 0),
  -- début + durée + marge du type : écrit à la création et à chaque
  -- déplacement, par l'instruction même qui décide (clients/decisions.ts).
  -- L'intervalle occupé est [debut, occupe_jusqua[.
  occupe_jusqua           INTEGER NOT NULL CHECK (occupe_jusqua > debut),
  -- Avance à chaque déplacement : c'est elle qui distinguera les rappels de
  -- l'ancienne date de ceux de la nouvelle.
  revision                INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  statut                  TEXT NOT NULL CHECK (statut IN ('prevue', 'realisee', 'annulee', 'absent')),
  etat_paiement           TEXT NOT NULL
                          CHECK (etat_paiement IN ('a_payer', 'attente_especes', 'payee', 'offerte', 'annulee')),
  montant_centimes        INTEGER NOT NULL DEFAULT 0 CHECK (montant_centimes >= 0),
  mode                    TEXT CHECK (mode IN ('sur_place', 'visio', 'appel')),
  visio_url               TEXT,
  agenda_evenement_id     TEXT,
  agenda_etat             TEXT NOT NULL DEFAULT 'a_ecrire' CHECK (agenda_etat IN ('a_ecrire', 'ecrit', 'echec')),
  -- La changer révoque les liens déjà envoyés pour cette séance (§14.5).
  liens_version           INTEGER NOT NULL DEFAULT 1 CHECK (liens_version >= 1),
  liste_attente           INTEGER NOT NULL DEFAULT 0 CHECK (liste_attente IN (0, 1)),
  conditions_acceptees_le INTEGER,
  conditions_version      INTEGER,
  questionnaire_id        TEXT REFERENCES questionnaires(id) ON DELETE SET NULL,
  origine                 TEXT NOT NULL CHECK (origine IN ('site', 'console', 'import')),
  clic_annonce            TEXT,
  provenance              TEXT,                    -- JSON : source, campagne, mot-clé
  conversion_importee_le  INTEGER,
  conversion_retiree_le   INTEGER,
  libelle_importe         TEXT,
  created_at              INTEGER NOT NULL,
  updated_at              INTEGER NOT NULL
);
CREATE INDEX idx_seances_debut ON seances(debut);
CREATE INDEX idx_seances_client_debut ON seances(client_id, debut);
CREATE INDEX idx_seances_type ON seances(type_seance_id);
CREATE INDEX idx_seances_questionnaire ON seances(questionnaire_id);

-- L'histoire d'un rendez-vous : créé, déplacé, annulé, rétabli ; par qui.
CREATE TABLE seances_mouvements (
  id             TEXT PRIMARY KEY,
  seance_id      TEXT NOT NULL REFERENCES seances(id) ON DELETE CASCADE,
  nature         TEXT NOT NULL CHECK (nature IN ('creee', 'deplacee', 'annulee', 'retablie')),
  -- florent : depuis la console ; personne : la personne elle-même (une
  -- réservation, un créneau libéré pris) ; import : la reprise de Notion.
  par            TEXT NOT NULL CHECK (par IN ('florent', 'personne', 'import')),
  ancien_debut   INTEGER,
  nouveau_debut  INTEGER,
  -- La révision de la séance après le mouvement.
  revision       INTEGER NOT NULL,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);
CREATE INDEX idx_seances_mouvements_seance ON seances_mouvements(seance_id, created_at);

-- ★ La trame des notes d'une séance : une par séance.
CREATE TABLE seances_notes (
  id                 TEXT PRIMARY KEY,
  seance_id          TEXT NOT NULL REFERENCES seances(id) ON DELETE CASCADE,
  demande            TEXT,
  objectif           TEXT,
  seance             TEXT,
  travail_personnel  TEXT,
  idees_suite        TEXT,
  reponse_sms        TEXT,
  -- La copie brute de la page Notion d'origine, gardée entière.
  import_notion      TEXT,
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_seances_notes_seance ON seances_notes(seance_id);

-- ★ Les réponses aux questions posées à la réservation.
CREATE TABLE seances_reponses (
  id          TEXT PRIMARY KEY,
  seance_id   TEXT NOT NULL REFERENCES seances(id) ON DELETE CASCADE,
  rang        INTEGER NOT NULL,
  question    TEXT NOT NULL,
  reponse     TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_seances_reponses_rang ON seances_reponses(seance_id, rang);

-- ─── Les évènements ─────────────────────────────────────────────────────────

CREATE TABLE evenements (
  id                      TEXT PRIMARY KEY,         -- page Notion pour les anciens, UUID ensuite
  nom                     TEXT NOT NULL,
  type                    TEXT,                     -- meditation | hypnose | respiration-holotropique
  debut                   INTEGER NOT NULL,
  fin                     INTEGER,
  ville                   TEXT,
  places_totales          INTEGER CHECK (places_totales >= 0),
  prix_centimes           INTEGER CHECK (prix_centimes >= 0),
  questionnaire_requis    INTEGER NOT NULL DEFAULT 0 CHECK (questionnaire_requis IN (0, 1)),
  -- Renseignée : l'inscription se fait ailleurs ; vide : sur le site.
  url_inscription         TEXT,
  publie                  INTEGER NOT NULL DEFAULT 0 CHECK (publie IN (0, 1)),
  publie_le               INTEGER,
  publication_empreinte   TEXT,
  meta_description        TEXT,
  html_permalink          TEXT,
  html_programme          TEXT,
  html_prix               TEXT,
  html_lieu_adresse       TEXT,
  html_lieu_instructions  TEXT,
  created_at              INTEGER NOT NULL,
  updated_at              INTEGER NOT NULL,
  deleted_at              INTEGER
);
CREATE INDEX idx_evenements_debut ON evenements(debut);

CREATE TABLE inscriptions (
  id                TEXT PRIMARY KEY,
  -- Un évènement n'est jamais retiré pour de bon (suppression logique) : le
  -- lien est restreint, il ne se vide pas.
  evenement_id      TEXT NOT NULL REFERENCES evenements(id),
  -- Vide tant que l'inscription est « à rapprocher ». Aucune cascade ne l'atteint.
  client_id         TEXT REFERENCES clients(id) ON DELETE CASCADE,
  statut            TEXT NOT NULL
                    CHECK (statut IN ('retenue', 'payee', 'confirmee', 'expiree', 'annulee', 'deconseillee')),
  retenue_jusqua    INTEGER,
  mode_paiement     TEXT CHECK (mode_paiement IN ('carte', 'virement')),
  montant_centimes  INTEGER CHECK (montant_centimes >= 0),
  code_promo        TEXT,
  questionnaire_id  TEXT REFERENCES questionnaires(id) ON DELETE SET NULL,
  -- Tirée au hasard, sans signification : c'est elle que la page de paiement
  -- présente pour suivre une inscription.
  reference         TEXT NOT NULL,
  identite_recue    TEXT,                           -- JSON, comme sur une séance
  liens_version     INTEGER NOT NULL DEFAULT 1 CHECK (liens_version >= 1),
  provenance        TEXT,
  origine           TEXT NOT NULL CHECK (origine IN ('site', 'console', 'import')),
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL,
  -- Une retenue sans mode ni échéance échapperait au compte des places : la
  -- dernière place (§14.4) ne sait la compter que par l'un ou par l'autre.
  CHECK (statut <> 'retenue' OR (mode_paiement IS NOT NULL AND retenue_jusqua IS NOT NULL))
);
CREATE UNIQUE INDEX idx_inscriptions_reference ON inscriptions(reference);
CREATE INDEX idx_inscriptions_evenement_statut ON inscriptions(evenement_id, statut);
CREATE INDEX idx_inscriptions_client ON inscriptions(client_id);
-- Une fiche n'a qu'une inscription vivante par évènement. Deux inscriptions
-- encore « à rapprocher » peuvent venir de la même personne : l'index ne les
-- voit pas, l'alerte de rapprochement les montre ensemble.
CREATE UNIQUE INDEX idx_inscriptions_vivante
  ON inscriptions(evenement_id, client_id)
  WHERE client_id IS NOT NULL AND statut IN ('retenue', 'payee', 'confirmee');

-- ─── Les questionnaires ★ ───────────────────────────────────────────────────

CREATE TABLE questionnaires (
  id                      TEXT PRIMARY KEY,
  -- La clé de la commande qui l'a porté : reçu deux fois, il ne crée qu'une
  -- ligne. Vide pour un ancien questionnaire repris de Drive.
  envoi_id                TEXT,
  contexte                TEXT NOT NULL CHECK (contexte IN ('seance', 'decouverte', 'groupe', 'journee_externe')),
  version                 TEXT CHECK (version IN ('complet', 'suivi')),
  version_formulaire      TEXT,                     -- « 2026-12 »
  -- Vide tant que le questionnaire est « à rapprocher ». Aucune cascade ne l'atteint.
  client_id               TEXT REFERENCES clients(id) ON DELETE CASCADE,
  seance_id               TEXT REFERENCES seances(id) ON DELETE SET NULL,
  inscription_id          TEXT REFERENCES inscriptions(id) ON DELETE SET NULL,
  evenement_id            TEXT REFERENCES evenements(id),
  identite                TEXT,                     -- JSON, tels qu'envoyés
  coordonnees             TEXT,
  confiance               TEXT,
  -- Copie figée : pour chaque question, son libellé tel qu'affiché et la réponse.
  reponses                TEXT,
  nb_oui                  INTEGER,
  autorisation_parentale  TEXT NOT NULL DEFAULT 'sans_objet'
                          CHECK (autorisation_parentale IN ('sans_objet', 'a_obtenir', 'recue')),
  declaration             INTEGER CHECK (declaration IN (0, 1)),
  accord_conservation     INTEGER CHECK (accord_conservation IN (0, 1)),
  accord_texte            TEXT,
  accord_le               INTEGER,
  rattachement            TEXT NOT NULL DEFAULT 'fait' CHECK (rattachement IN ('fait', 'a_rapprocher')),
  a_revoir                INTEGER NOT NULL DEFAULT 0 CHECK (a_revoir IN (0, 1)),
  relu_le                 INTEGER,
  pdf_cle                 TEXT,
  pdf_le                  INTEGER,
  source                  TEXT NOT NULL DEFAULT 'site' CHECK (source IN ('site', 'import_drive')),
  drive_url               TEXT,
  created_at              INTEGER NOT NULL,
  updated_at              INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_questionnaires_envoi ON questionnaires(envoi_id);
CREATE INDEX idx_questionnaires_client ON questionnaires(client_id);
CREATE INDEX idx_questionnaires_seance ON questionnaires(seance_id);
CREATE INDEX idx_questionnaires_inscription ON questionnaires(inscription_id);
CREATE INDEX idx_questionnaires_evenement ON questionnaires(evenement_id);

-- ─── Les paiements ──────────────────────────────────────────────────────────

-- Une ligne par tentative. Ce sont des pièces comptables : effacer une
-- personne les détache (seance_id, inscription_id remis à vide), ne les retire pas.
CREATE TABLE paiements (
  id                TEXT PRIMARY KEY,
  seance_id         TEXT REFERENCES seances(id) ON DELETE SET NULL,
  inscription_id    TEXT REFERENCES inscriptions(id) ON DELETE SET NULL,
  prestataire       TEXT NOT NULL CHECK (prestataire IN ('stancer', 'stripe', 'virement', 'especes')),
  reference         TEXT NOT NULL,
  montant_centimes  INTEGER NOT NULL CHECK (montant_centimes >= 0),
  devise            TEXT NOT NULL DEFAULT 'EUR',
  statut            TEXT NOT NULL CHECK (statut IN ('cree', 'reussi', 'echoue', 'rembourse')),
  -- Un paiement de test (clés de test du prestataire) : jamais confondu avec un réel.
  test              INTEGER NOT NULL DEFAULT 0 CHECK (test IN (0, 1)),
  facture_qonto_id  TEXT,
  reussi_le         INTEGER,
  rembourse_le      INTEGER,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_paiements_reference ON paiements(prestataire, reference);
CREATE INDEX idx_paiements_seance ON paiements(seance_id);
CREATE INDEX idx_paiements_inscription ON paiements(inscription_id);
