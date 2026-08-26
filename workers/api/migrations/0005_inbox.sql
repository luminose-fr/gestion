-- L'inbox : capturer une décision sans avoir à la ranger.
--
-- Le rangement n'est PAS le geste de la capture. Au moment où une décision se
-- prend, on pense à autre chose ; demander « quel bloc, quel statut, ça
-- supersède quoi ? » à cet instant est exactement la friction qui tue le
-- mécanisme. Trois champs, quelques secondes, et rien d'autre.
--
-- Une capture ne change RIEN au corpus tant qu'elle n'est pas intégrée : elle
-- n'entre dans aucun profil de contexte, aucun prompt. On peut donc y déposer
-- une idée dont on n'est pas sûr, et une note bâclée ne peut pas casser une
-- production.
--
-- Elle vit en D1 et non dans le corpus parce que c'est le SEUL store en
-- écriture de la console : le corpus, lui, est une constante du bundle du
-- Worker. Deux natures, deux emplacements.

CREATE TABLE inbox (
  id            TEXT PRIMARY KEY,

  -- Ce qui a été décidé, dans les mots de Florent. Jamais reformulé.
  decide        TEXT NOT NULL,

  -- Ce que ça rend faux. NULLABLE, et ça compte : NULL veut dire « je ne sais
  -- pas », JAMAIS « rien ». Même distinction que les colonnes de coût du §2.6 —
  -- confondre l'inconnu et le vide ferait passer une incertitude pour une
  -- certitude. Ce champ coûte cinq secondes à la capture et une heure
  -- d'archéologie à l'intégration s'il manque.
  remplace      TEXT,

  -- D'où vient la capture : une conversation, un écran, un script.
  source        TEXT,

  created_at    INTEGER NOT NULL,

  -- NULL = en attente. C'est ce champ, et lui seul, qui fait la différence
  -- entre une note et un fait du corpus.
  integrated_at INTEGER,

  -- Où la capture est partie : chemins touchés, commit. Une capture intégrée
  -- n'est JAMAIS supprimée — elle porte le lien vers ce qui l'a absorbée, et la
  -- chaîne se remonte : le fichier, le commit, la capture, les mots d'origine.
  integration   TEXT,

  -- Pour une capture saisie deux fois ou à côté de la plaque. Une capture
  -- qu'on regrette n'est pas une capture qu'on efface (SPEC §2.1).
  deleted_at    INTEGER
);

-- La liste par défaut : les captures en attente, la plus récente d'abord.
CREATE INDEX idx_inbox_attente ON inbox(integrated_at, created_at DESC) WHERE deleted_at IS NULL;

-- ── Amorce : les captures de la session du 25/08/2026 ────────────────────
-- Elles vivaient dans packages/corpus/content/inbox.md, qui disparaît avec
-- cette migration : deux inbox seraient exactement la maladie qu'on soigne.
-- Les dix sont déjà intégrées — c'est l'historique, pas du travail en attente.

INSERT INTO inbox (id, decide, remplace, source, created_at, integrated_at, integration) VALUES
('cap-2026-08-25-01',
 'On arrête Le Seuil pour l''instant. Programme conçu (parcours 4 mois / 7 étapes) mais pas commercialisé.',
 'Toute présentation du Seuil comme offre active.',
 'Conversation Claude du 25/08', 1756080000000, 1756080000000,
 'strategie/decisions/2026-08-seuil-suspendu.md · socle/offres/le-seuil.md'),
('cap-2026-08-25-02',
 'L''année de méditation en groupe 2025-2026 (9 ateliers de 2 h) est terminée. Motif : la facturation via la MJC était trop déséquilibrée. Le contenu des ateliers est déjà conservé dans un document personnel.',
 'Leur statut d''offre proposable.',
 'Conversation Claude du 25/08', 1756080000000, 1756080000000,
 'strategie/decisions/2026-08-ateliers-archetypes-termines.md · socle/offres/ateliers.md'),
('cap-2026-08-25-03',
 'Je préfère proposer un parcours long en groupe fermé plutôt qu''en individuel.',
 'L''hypothèse implicite que les accompagnements longs se font en individuel.',
 'Conversation Claude du 25/08', 1756080000000, 1756080000000,
 'socle/offres/le-seuil.md § Format de retour'),
('cap-2026-08-25-04',
 'J''ai l''intention de relancer les activités de groupe. Je ne connais pas la forme de ce que je proposerai — c''est à réfléchir.',
 NULL,
 'Conversation Claude du 25/08', 1756080000000, 1756080000000,
 'strategie/hypotheses.md'),
('cap-2026-08-25-05',
 '« Le Souffle des Étoiles » était un nom envisagé pour le centre de Beauteville, mais probablement pas celui qui sera retenu. Le nom reste à trancher.',
 'L''usage du nom comme s''il était acquis.',
 'Conversation Claude du 25/08', 1756080000000, 1756080000000,
 'strategie/hypotheses.md — statut candidat'),
('cap-2026-08-25-06',
 'Le style du site est piloté par une image de référence et la consigne « dans le même style que… ». Le style des illustrations réseaux sociaux n''a pas de règle, et c''est très bien comme ça.',
 NULL,
 'Conversation Claude du 25/08', 1756080000000, 1756080000000,
 'voix/direction-artistique.md — dont une absence volontairement-absent'),
('cap-2026-08-25-07',
 'Transcription et sous-titrage se font avec Whisper, sans filtre particulier, et ce fonctionnement convient.',
 'L''hypothèse (de Claude, pas de Florent) qu''il fallait une règle d''anonymisation.',
 'Conversation Claude du 25/08', 1756080000000, 1756080000000,
 'outils/parc.md — ces cas chargent zéro contexte'),
('cap-2026-08-25-08',
 'Quatre personnes étaient présentes à quasiment chacun des 9 ateliers de l''année, et c''était bien pour elles comme pour moi.',
 NULL,
 'Conversation Claude du 25/08', 1756080000000, 1756080000000,
 'strategie/positionnement-questions.md — posé, pas tranché'),
('cap-2026-08-25-09',
 'Ma clientèle actuelle n''est pas encore assez engagée pour un parcours long, et je ne suis pas assez connu pour que des inconnus viennent d''eux-mêmes.',
 NULL,
 'Conversation Claude du 25/08', 1756080000000, 1756080000000,
 'strategie/positionnement-questions.md — hypothèse RÉFUTÉE le jour même, conservée'),
('cap-2026-08-25-10',
 'reliance.luminose.fr : test d''acquisition ciblant les expatriés français, avec un peu de Google Ads. Aucune touche. En ligne mais promu nulle part, laissé de côté.',
 NULL,
 'Conversation Claude du 25/08', 1756080000000, 1756080000000,
 'strategie/decisions/2026-08-reliance-en-veille.md');
