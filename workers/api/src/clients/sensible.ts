/**
 * Les données sensibles (SPEC §14.2, règle 3).
 *
 * **Le seul fichier de code qui nomme leurs tables.** Un test parcourt
 * `workers/*\/src`, `packages/*` et `apps/*` et échoue si un autre fichier en
 * écrit une. Les migrations, les tests, le jeu d'essai et la spécification sont
 * hors de ce contrôle.
 *
 * Pourquoi un seul module : ces données ne sortent par aucun chemin — ni le
 * serveur MCP, ni l'IA, ni l'export général, ni les journaux, ni le stockage du
 * navigateur. Tant que leurs noms ne s'écrivent qu'ici, la liste de ce qui les
 * lit se relit en un seul fichier.
 *
 * Chaque phase ajoute ses lectures et ses écritures dans sa section, en fin de
 * fichier : plusieurs branches y travaillent en même temps, et une section par
 * phase les fusionne sans se marcher dessus.
 */
import { ouvrirAlerte } from './alertes';
import { newId } from '../db';
import { seanceAuLienValable } from './portes/lien';
import { texteDesNotes, type ColonnesTrame } from './notes';
export const TABLES_SENSIBLES = [
  'questionnaires',
  'seances_notes',
  'seances_reponses',
  'clients_confiance',
  'clients_notes',
] as const;

export type TableSensible = (typeof TABLES_SENSIBLES)[number];

// ═══ Phase S2a : recevoir un questionnaire (SPEC §14.6, §14.6.1) ═══════════
//
// Ce qui suit écrit et lit le questionnaire reçu, et complète la fiche avec ce
// qu'il apporte. Les instructions sont composées ici, jouées par
// `portes/publique.ts` et `passage.ts`. Ici comme ailleurs, les paramètres sont
// numérotés : D1 ne connaît pas les paramètres nommés.

/**
 * Une condition sur un questionnaire : il existe sous l'identifiant `p` (un
 * paramètre, `?4`…) et vérifie `ou`, écrit sur l'alias `q`. C'est par elle que
 * l'ordre et les alertes d'un lot se lient à ce que le lot a réellement écrit.
 */
export const questionnaireExiste = (p: string, ou = '1') =>
  `EXISTS (SELECT 1 FROM questionnaires q WHERE q.id = ${p} AND (${ou}))`;

/** Aucun questionnaire ne porte déjà cet envoi : la mémoire d'un envoi après la purge de sa commande. */
export const sansQuestionnaireDeCetEnvoi = (p: string) =>
  `NOT EXISTS (SELECT 1 FROM questionnaires WHERE envoi_id = ${p})`;

/** L'empreinte de l'envoi qu'un questionnaire porte, s'il en porte un sous cette clé. */
export const lireMemoireEnvoi = (db: D1Database, cle: string) =>
  db.prepare('SELECT envoi_empreinte AS empreinte FROM questionnaires WHERE envoi_id = ?1').bind(cle);

/** Ce que l'insertion reçoit : l'envoi validé, mis en forme, et ce que le jeton désigne. */
export type QuestionnaireRecu = {
  id: string;
  /** La clé de la commande. */
  envoiId: string;
  envoiEmpreinte: string;
  contexte: 'seance' | 'decouverte' | 'groupe' | 'journee_externe';
  version: 'complet' | 'suivi';
  versionFormulaire: string;
  /** La séance que désigne un jeton valable ; vide sans jeton valable. */
  seanceCandidate: string | null;
  /** Le `liens_version` que le jeton porte. */
  liensVersion: number | null;
  evenementCandidat: string | null;
  /** JSON, tels qu'envoyés. */
  identite: string;
  coordonnees: string | null;
  confiance: string | null;
  /** JSON : la copie figée des questions et des réponses, et le texte libre. */
  reponses: string;
  nbOui: number;
  dateNaissanceEnvoi: string | null;
  accordVersion: number;
  /** La date de réception à Paris, `AAAA-MM-JJ` : c'est elle qui dit l'âge. */
  jourReception: string;
  /** La commande qui décide du lot. */
  commandeId: string;
};

/**
 * L'insertion du questionnaire, qui DÉCIDE ELLE-MÊME de son rattachement : elle
 * relit la séance à l'instant du lot — non annulée, à la même version des liens,
 * sans questionnaire. Entre la lecture et le lot, la séance a pu être annulée,
 * son lien révoqué, un premier questionnaire rattaché : c'est l'état du moment
 * qui vaut (§14.6.1, point 3).
 *
 *   - séance libre → rattaché (`fait`), à la séance et à son client s'il en a un ;
 *   - séance vue mais qui a déjà son questionnaire → `a_rapprocher`, AVEC la
 *     séance d'où il vient, et sans client ;
 *   - évènement existant et non supprimé → rattaché à l'évènement, sans client ;
 *   - tout le reste → `a_rapprocher`, sans rien. Jamais par l'identité déclarée.
 *
 * L'âge se lit sur la date de naissance de l'envoi, sinon sur celle de la fiche
 * désignée ; inconnu, il ne demande rien (`sans_objet`). Un suivi est « à
 * revoir » quand le client n'a aucun questionnaire complet — toujours, sans
 * client. Le texte de l'accord est celui de la version acceptée, lu dans la même
 * instruction.
 *
 * Liée à la commande du lot, et à ce qu'aucun questionnaire ne porte déjà cet
 * envoi : un rejeu ne finit jamais en panne sur l'index unique.
 */
/** Le prédicat du lien, partagé avec la vérification à l'ouverture (portes/lien.ts). */
const LIEN = seanceAuLienValable('s', '?7', '?8');

export const insertionQuestionnaire = (db: D1Database, q: QuestionnaireRecu, maintenant: number) =>
  db.prepare(`
    INSERT INTO questionnaires (
      id, envoi_id, envoi_empreinte, contexte, version, version_formulaire,
      client_id, seance_id, evenement_id, identite, coordonnees, confiance, reponses, nb_oui,
      autorisation_parentale, declaration, accord_conservation, accord_texte, accord_le,
      rattachement, a_revoir, source, created_at, updated_at
    )
    SELECT ?1, ?2, ?3, ?4, ?5, ?6,
      r.client_id, r.seance_id, r.evenement_id, ?10, ?11, ?12, ?13, ?14,
      CASE WHEN r.naissance IS NOT NULL AND date(r.naissance, '+18 years') > ?16 THEN 'a_obtenir' ELSE 'sans_objet' END,
      1, 1, (SELECT t.texte FROM textes_versions t WHERE t.cle = 'accord_conservation' AND t.version = ?17), ?18,
      CASE WHEN r.libre OR r.evt THEN 'fait' ELSE 'a_rapprocher' END,
      CASE WHEN ?5 = 'suivi' AND (r.client_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM questionnaires p WHERE p.client_id = r.client_id AND p.version = 'complet'
      )) THEN 1 ELSE 0 END,
      'site', ?18, ?18
    FROM (
      SELECT b.vue, b.libre, b.evt, b.client_id,
        CASE WHEN b.vue THEN ?7 END AS seance_id,
        CASE WHEN b.evt THEN ?9 END AS evenement_id,
        COALESCE(?15, (SELECT c.date_naissance FROM clients c WHERE c.id = b.client_id)) AS naissance
      FROM (
        SELECT
          EXISTS (SELECT 1 FROM seances s WHERE ${LIEN}) AS vue,
          EXISTS (SELECT 1 FROM seances s WHERE ${LIEN} AND s.questionnaire_id IS NULL) AS libre,
          EXISTS (SELECT 1 FROM evenements e WHERE e.id = ?9 AND e.deleted_at IS NULL) AS evt,
          (SELECT s.client_id FROM seances s WHERE ${LIEN} AND s.questionnaire_id IS NULL) AS client_id
      ) AS b
    ) AS r
    WHERE EXISTS (SELECT 1 FROM commandes WHERE id = ?19)
      AND NOT EXISTS (SELECT 1 FROM questionnaires WHERE envoi_id = ?2)`).bind(
    q.id, q.envoiId, q.envoiEmpreinte, q.contexte, q.version, q.versionFormulaire,
    q.seanceCandidate, q.liensVersion, q.evenementCandidat, q.identite, q.coordonnees, q.confiance, q.reponses, q.nbOui,
    q.dateNaissanceEnvoi, q.jourReception, q.accordVersion, maintenant, q.commandeId,
  );

/**
 * La séance reçoit son questionnaire — à la condition qu'il lui soit
 * EFFECTIVEMENT rattaché par le lot : un second envoi ou un lien révoqué ne la
 * touche pas.
 */
export const rattachementALaSeance = (db: D1Database, q: Pick<QuestionnaireRecu, 'id' | 'seanceCandidate'>, maintenant: number) =>
  db.prepare(`
    UPDATE seances SET questionnaire_id = ?1, updated_at = ?3
    WHERE id = ?2 AND questionnaire_id IS NULL
      AND EXISTS (SELECT 1 FROM questionnaires q WHERE q.id = ?1 AND q.seance_id = ?2 AND q.rattachement = 'fait')`)
    .bind(q.id, q.seanceCandidate, maintenant);

/** Ce que l'accusé de réception sait du destinataire : l'identité envoyée. */
export type DestinataireQuestionnaire = { prenom: string; nom: string; email: string | null };

/** L'identité envoyée avec un questionnaire : une instruction, pour qu'une lecture groupée la porte. */
export const lireIdentite = (db: D1Database, id: string) =>
  db.prepare('SELECT identite FROM questionnaires WHERE id = ?1').bind(id);

/**
 * Le destinataire d'un accusé de réception, depuis la ligne lue : l'identité
 * envoyée avec le questionnaire — pas la fiche, qui peut ne pas exister (« à
 * rapprocher »). `null` : le questionnaire n'existe plus (effacé) ;
 * `destinataire: null` : il existe, mais personne à qui écrire.
 */
export const destinataireDepuis = (ligne: { identite?: unknown } | null | undefined): { destinataire: DestinataireQuestionnaire | null } | null => {
  if (!ligne) return null;
  try {
    const i = JSON.parse(typeof ligne.identite === 'string' ? ligne.identite : 'null') as Record<string, unknown> | null;
    if (!i || typeof i.prenom !== 'string') return { destinataire: null };
    return {
      destinataire: {
        prenom: i.prenom,
        nom: typeof i.nom === 'string' ? i.nom : '',
        email: typeof i.email === 'string' && i.email.trim() !== '' ? i.email.trim() : null,
      },
    };
  } catch {
    return { destinataire: null };
  }
};

// ─── Compléter la fiche, après la réponse (§14.6.1, point 10) ───────────────

/**
 * Ce qu'un questionnaire peut apporter à une fiche : sept champs, remplis s'ils
 * sont vides, jamais touchés s'ils sont remplis (§14.4 : la porte publique ne
 * modifie jamais une fiche existante).
 */
const CHAMPS_FICHE: [colonne: string, source: 'coordonnees' | 'identite', chemin: string][] = [
  ['civilite', 'coordonnees', '$.civilite'],
  ['date_naissance', 'coordonnees', '$.date_naissance'],
  ['profession', 'coordonnees', '$.profession'],
  ['adresse', 'coordonnees', '$.adresse'],
  ['code_postal', 'coordonnees', '$.code_postal'],
  ['ville', 'coordonnees', '$.ville'],
  ['telephone', 'identite', '$.telephone'],
];
const CHAMPS_CONFIANCE = ['civilite', 'prenom', 'nom', 'telephone', 'email'];

/** Une valeur reçue, vide rendue nulle. */
const recu = (q: string, source: string, chemin: string) => `NULLIF(TRIM(json_extract(${q}.${source}, '${chemin}')), '')`;
const plein = (valeur: string) => `NULLIF(TRIM(${valeur}), '')`;
/** Deux valeurs différentes, les deux renseignées — casse et espaces ignorés. */
const differe = (a: string, b: string) =>
  `(${plein(a)} IS NOT NULL AND ${b} IS NOT NULL AND LOWER(REPLACE(TRIM(${a}), ' ', '')) <> LOWER(REPLACE(${b}, ' ', '')))`;

/** Le questionnaire `p` est rattaché à une fiche, et la fiche n'en a pas encore reçu ce qu'il apporte. */
const aCompleter = (a: string, p: string) =>
  `${a}.id = ${p} AND ${a}.client_id IS NOT NULL AND ${a}.rattachement = 'fait' AND ${a}.fiche_completee_le IS NULL`;

/**
 * Le lot qui complète la fiche. Tout est conditionné à `aCompleter` : rejoué,
 * il ne change rien, puisqu'il pose `fiche_completee_le` en dernier.
 *
 *   1. un écart entre l'envoi et la fiche — un autre téléphone, une autre
 *      adresse e-mail, une autre personne de confiance — ouvre `ecart_fiche` sur
 *      le questionnaire ; l'écart se lit sur la ligne reçue ;
 *   2. les champs vides de la fiche sont remplis ; `updated_at` n'avance que si
 *      l'un d'eux l'a été ;
 *   3. la personne de confiance est créée si la fiche n'en a pas ;
 *   4. le questionnaire est marqué.
 */
export const lotCompletionFiche = (db: D1Database, questionnaireId: string, maintenant: number): D1PreparedStatement[] => {
  const ecarts = [
    ...CHAMPS_FICHE.map(([col, source, chemin]) => differe(`c.${col}`, recu('q', source, chemin))),
    differe('c.email', recu('q', 'identite', '$.email')),
    `EXISTS (SELECT 1 FROM clients_confiance cc WHERE cc.client_id = c.id AND (${
      CHAMPS_CONFIANCE.map((col) => differe(`cc.${col}`, recu('q', 'confiance', `$.${col}`))).join(' OR ')}))`,
  ].join('\n        OR ');
  const vide = (col: string) => `${plein(`clients.${col}`)} IS NULL`;
  const rempli = CHAMPS_FICHE.map(([col, source, chemin]) => `(${vide(col)} AND ${recu('q', source, chemin)} IS NOT NULL)`).join(' OR ');

  return [
    ouvrirAlerte(db, { sorte: 'ecart_fiche', objetType: 'questionnaire', objetId: questionnaireId }, maintenant, `
      EXISTS (SELECT 1 FROM questionnaires q JOIN clients c ON c.id = q.client_id
      WHERE ${aCompleter('q', '?4')} AND (
        ${ecarts}))`),
    db.prepare(`
      UPDATE clients SET
        ${CHAMPS_FICHE.map(([col, source, chemin]) =>
          `${col} = CASE WHEN ${vide(col)} THEN COALESCE(${recu('q', source, chemin)}, clients.${col}) ELSE clients.${col} END`).join(',\n        ')},
        updated_at = CASE WHEN ${rempli} THEN ?2 ELSE clients.updated_at END
      FROM (SELECT * FROM questionnaires x WHERE ${aCompleter('x', '?1')}) AS q
      WHERE clients.id = q.client_id`).bind(questionnaireId, maintenant),
    db.prepare(`
      INSERT INTO clients_confiance (id, client_id, civilite, prenom, nom, telephone, email, mis_a_jour_le, questionnaire_id, created_at, updated_at)
      SELECT ?3, q.client_id, ${CHAMPS_CONFIANCE.map((col) => recu('q', 'confiance', `$.${col}`)).join(', ')}, ?2, q.id, ?2, ?2
      FROM questionnaires q
      WHERE ${aCompleter('q', '?1')}
        AND COALESCE(${CHAMPS_CONFIANCE.filter((c) => c !== 'civilite').map((col) => recu('q', 'confiance', `$.${col}`)).join(', ')}) IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM clients_confiance cc WHERE cc.client_id = q.client_id)
      ON CONFLICT DO NOTHING`).bind(questionnaireId, maintenant, newId()),
    db.prepare(`UPDATE questionnaires SET fiche_completee_le = ?2, updated_at = ?2 WHERE ${aCompleter('questionnaires', '?1')}`)
      .bind(questionnaireId, maintenant),
  ];
};

/** Les questionnaires rattachés dont la fiche n'a pas été complétée : ce que le passage planifié reprend. */
export const questionnairesAReprendre = async (db: D1Database, limite: number): Promise<string[]> => {
  const { results } = await db.prepare(`
    SELECT id FROM questionnaires
    WHERE client_id IS NOT NULL AND rattachement = 'fait' AND fiche_completee_le IS NULL AND source = 'site'
    ORDER BY created_at LIMIT ?1`).bind(limite).all<{ id: string }>();
  return results.map((r) => r.id);
};

// ═══ Phase C1 — la console des clients (SPEC §15.2, règles 4 et 7) ═════════
//
// Les notes d'une fiche et d'une séance s'écrivent contre la VERSION lue : la
// date de leur dernière écriture, ou `null` pour une note qui n'existe pas
// encore. L'écriture est conditionnelle, et `meta.changes` dit si elle a pris.
// La date avance strictement — `MAX(maintenant, version + 1)` —, si bien que
// deux écritures dans la même milliseconde donnent deux versions distinctes.
// Une première écriture n'est une insertion qu'à la condition qu'aucune ligne
// n'existe ; deux premières écritures vraiment simultanées sont départagées
// par l'index unique de S1, et la perdante reçoit le même refus.

/** Ce qu'une écriture conditionnelle a donné : la nouvelle version, ou rien. */
export type IssueNote = { ecrite: true; version: number } | { ecrite: false };

const versionSuivante = (version: number | null, maintenant: number) =>
  version === null ? maintenant : Math.max(maintenant, version + 1);

const issue = async (
  ecriture: Promise<D1Result>, version: number | null, maintenant: number,
): Promise<IssueNote> => {
  try {
    const r = await ecriture;
    return r.meta.changes === 1 ? { ecrite: true, version: versionSuivante(version, maintenant) } : { ecrite: false };
  } catch (err) {
    // La perdante de deux créations simultanées : même refus que la version périmée.
    if (err instanceof Error && /UNIQUE constraint failed/i.test(err.message)) return { ecrite: false };
    throw err;
  }
};

// ─── La note d'une fiche ────────────────────────────────────────────────────

export type NoteFiche = { texte: string; version: number | null };

export const lireNoteFiche = async (db: D1Database, clientId: string): Promise<NoteFiche> => {
  const ligne = await db.prepare('SELECT texte, updated_at FROM clients_notes WHERE client_id = ?1').bind(clientId)
    .first<{ texte: string; updated_at: number }>();
  return ligne ? { texte: ligne.texte, version: Number(ligne.updated_at) } : { texte: '', version: null };
};

export const ecrireNoteFiche = (
  db: D1Database, clientId: string, texte: string, version: number | null, maintenant: number, id: string,
): Promise<IssueNote> => issue(version === null
  ? db.prepare(`
      INSERT INTO clients_notes (id, client_id, texte, created_at, updated_at)
      SELECT ?1, c.id, ?3, ?4, ?4 FROM clients c
      WHERE c.id = ?2 AND NOT EXISTS (SELECT 1 FROM clients_notes n WHERE n.client_id = ?2)`)
    .bind(id, clientId, texte, maintenant).run()
  : db.prepare(`
      UPDATE clients_notes SET texte = ?2, updated_at = MAX(?3, updated_at + 1)
      WHERE client_id = ?1 AND updated_at = ?4`)
    .bind(clientId, texte, maintenant, version).run(),
version, maintenant);

// ─── La personne de confiance d'une fiche ───────────────────────────────────

export type Confiance = {
  civilite: string | null; prenom: string | null; nom: string | null; telephone: string | null; email: string | null;
  misAJourLe: number | null;
};

export const lireConfiance = async (db: D1Database, clientId: string): Promise<Confiance | null> => {
  const l = await db.prepare(`
    SELECT civilite, prenom, nom, telephone, email, mis_a_jour_le FROM clients_confiance WHERE client_id = ?1`)
    .bind(clientId).first<Record<string, string | number | null>>();
  return l ? {
    civilite: l.civilite as string | null, prenom: l.prenom as string | null, nom: l.nom as string | null,
    telephone: l.telephone as string | null, email: l.email as string | null,
    misAJourLe: l.mis_a_jour_le === null ? null : Number(l.mis_a_jour_le),
  } : null;
};

/** Une par fiche : l'index unique de S1 fait d'une seconde écriture une mise à jour. Rend 0 si la fiche n'existe pas. */
export const ecrireConfiance = async (
  db: D1Database, clientId: string, c: Omit<Confiance, 'misAJourLe'>, maintenant: number, id: string,
): Promise<boolean> => {
  const r = await db.prepare(`
    INSERT INTO clients_confiance (id, client_id, civilite, prenom, nom, telephone, email, mis_a_jour_le, created_at, updated_at)
    SELECT ?1, cl.id, ?3, ?4, ?5, ?6, ?7, ?8, ?8, ?8 FROM clients cl WHERE cl.id = ?2
    ON CONFLICT(client_id) DO UPDATE SET
      civilite = excluded.civilite, prenom = excluded.prenom, nom = excluded.nom,
      telephone = excluded.telephone, email = excluded.email,
      mis_a_jour_le = excluded.mis_a_jour_le, updated_at = excluded.updated_at`)
    .bind(id, clientId, c.civilite, c.prenom, c.nom, c.telephone, c.email, maintenant).run();
  return r.meta.changes === 1;
};

// ─── Les questionnaires d'une fiche : de quoi les retrouver, rien d'autre ──

/**
 * Pour la lecture groupée d'une fiche (§15.3) : la date, la version, relu ou
 * non, à revoir ou non — et l'identifiant. Pas une réponse, pas une identité.
 * Un test vérifie les clés exactes de ce que la route en rend.
 */
export const questionnairesDeLaFiche = (db: D1Database, clientId: string): D1PreparedStatement =>
  db.prepare(`
    SELECT id, created_at AS date, version, (relu_le IS NOT NULL) AS relu, a_revoir
    FROM questionnaires WHERE client_id = ?1 ORDER BY created_at DESC, id`).bind(clientId);

// ─── Les notes d'une séance ─────────────────────────────────────────────────
//
// Un seul texte Markdown (notes.ts) : il s'écrit dans la colonne `seance`, et
// chaque écriture vide les cinq autres colonnes de l'ancienne trame.

export type NotesSeance = {
  texte: string | null;
  version: number | null;
  /** En lecture seule : la copie brute de la page Notion d'origine. */
  importNotion: string | null;
  /** En lecture seule : les réponses données à la réservation, dans l'ordre. */
  reponses: { rang: number; question: string; reponse: string }[];
};

/** Deux lectures, en un aller-retour : la note et les réponses à la réservation. */
export const lireNotesSeance = async (db: D1Database, seanceId: string): Promise<NotesSeance> => {
  const [notes, reponses] = await db.batch([
    db.prepare(`
      SELECT demande, objectif, seance, travail_personnel, idees_suite, reponse_sms, import_notion, updated_at
      FROM seances_notes WHERE seance_id = ?1`).bind(seanceId),
    db.prepare('SELECT rang, question, reponse FROM seances_reponses WHERE seance_id = ?1 ORDER BY rang').bind(seanceId),
  ]);
  const n = (notes.results[0] ?? null) as Record<string, string | number | null> | null;
  return {
    texte: n ? texteDesNotes(n as ColonnesTrame) : null,
    importNotion: (n?.import_notion as string) ?? null,
    version: n ? Number(n.updated_at) : null,
    reponses: (reponses.results as Record<string, unknown>[]).map((r) => ({
      rang: Number(r.rang), question: String(r.question), reponse: String(r.reponse),
    })),
  };
};

export const ecrireNotesSeance = (
  db: D1Database, seanceId: string, texte: string | null, version: number | null, maintenant: number, id: string,
): Promise<IssueNote> => issue(version === null
  ? db.prepare(`
      INSERT INTO seances_notes (id, seance_id, seance, created_at, updated_at)
      SELECT ?1, s.id, ?3, ?4, ?4 FROM seances s
      WHERE s.id = ?2 AND NOT EXISTS (SELECT 1 FROM seances_notes n WHERE n.seance_id = ?2)`)
    .bind(id, seanceId, texte, maintenant).run()
  : db.prepare(`
      UPDATE seances_notes SET demande = NULL, objectif = NULL, seance = ?2, travail_personnel = NULL, idees_suite = NULL,
        reponse_sms = NULL, updated_at = MAX(?3, updated_at + 1)
      WHERE seance_id = ?1 AND updated_at = ?4`)
    .bind(seanceId, texte, maintenant, version).run(),
version, maintenant);

// ═══ Refonte de la console, lot 3 : l'écran Aujourd'hui ═══════════════════
//
// Aujourd'hui montre l'ÉTAT d'une note et d'un questionnaire, jamais leur
// contenu (docs/refonte/04, §4) : deux fragments qui rendent un drapeau ou un
// mot, à placer dans un SELECT sur `seances` sous l'alias donné. Rien de ce
// que contient la table ne sort d'ici.

/** 1 si la séance a des notes écrites (une ligne de notes qui n'est pas vide), 0 sinon. */
export const notesEcritesSql = (s: string) => `EXISTS (
  SELECT 1 FROM seances_notes n WHERE n.seance_id = ${s}.id
  AND TRIM(COALESCE(n.seance, '') || COALESCE(n.demande, '') || COALESCE(n.objectif, '')
    || COALESCE(n.travail_personnel, '') || COALESCE(n.idees_suite, '') || COALESCE(n.import_notion, '')) <> '')`;

/** 'relu', 'non_relu', ou NULL quand aucun questionnaire n'est attaché à la séance. */
export const etatQuestionnaireSql = (s: string) => `(
  SELECT CASE WHEN q.relu_le IS NULL THEN 'non_relu' ELSE 'relu' END
  FROM questionnaires q WHERE q.id = ${s}.questionnaire_id)`;

// ═══ Refonte de la console, lot 8 : lire un questionnaire, le marquer relu ═
//
// Le seul écran qui montre les réponses : celui du questionnaire, ouvert par
// Florent depuis la séance, la fiche ou Aujourd'hui. Aucune liste ne les
// porte. Une lecture, deux décisions : relu, à revoir.

export type QuestionnaireLu = {
  id: string; recuLe: number; contexte: string; version: string | null;
  clientId: string | null; seanceId: string | null; evenementId: string | null;
  prenom: string | null; nom: string | null;
  questions: { cle: string; libelle: string; reponse: string }[];
  informations: string;
  reluLe: number | null; aRevoir: boolean; aRapprocher: boolean;
};

/** Le questionnaire, la personne par son prénom et son nom (sa fiche, sinon ce qu'elle a envoyé). Une instruction. */
export const lireQuestionnaire = async (db: D1Database, id: string): Promise<QuestionnaireLu | null> => {
  const q = await db.prepare(`
    SELECT q.id, q.created_at, q.contexte, q.version, q.client_id, q.seance_id, q.evenement_id, q.reponses,
      q.relu_le, q.a_revoir, q.rattachement,
      COALESCE(c.prenom, json_extract(q.identite, '$.prenom')) AS prenom,
      COALESCE(c.nom, json_extract(q.identite, '$.nom')) AS nom
    FROM questionnaires q LEFT JOIN clients c ON c.id = q.client_id
    WHERE q.id = ?1`).bind(id).first<Record<string, unknown>>();
  if (!q) return null;
  let contenu: { questions?: unknown; informations?: unknown } = {};
  try { contenu = JSON.parse(String(q.reponses ?? '{}')); } catch { contenu = {}; }
  const questions = Array.isArray(contenu.questions)
    ? (contenu.questions as Record<string, unknown>[]).map((r) => ({ cle: String(r.cle ?? ''), libelle: String(r.libelle ?? ''), reponse: String(r.reponse ?? '') }))
    : [];
  return {
    id: String(q.id), recuLe: Number(q.created_at), contexte: String(q.contexte), version: (q.version as string | null) ?? null,
    clientId: (q.client_id as string | null) ?? null, seanceId: (q.seance_id as string | null) ?? null, evenementId: (q.evenement_id as string | null) ?? null,
    prenom: (q.prenom as string | null) ?? null, nom: (q.nom as string | null) ?? null,
    questions, informations: typeof contenu.informations === 'string' ? contenu.informations : '',
    reluLe: q.relu_le === null ? null : Number(q.relu_le), aRevoir: Number(q.a_revoir) === 1, aRapprocher: q.rattachement === 'a_rapprocher',
  };
};

/**
 * Marquer relu : la date, et « à revoir » retombe ; l'alerte `a_revoir` qui
 * désignait ce questionnaire se résout dans le même lot. Rendre `false` : il
 * n'existe pas.
 */
export const marquerQuestionnaireRelu = async (db: D1Database, id: string, maintenant: number): Promise<boolean> => {
  const [maj] = await db.batch([
    db.prepare('UPDATE questionnaires SET relu_le = ?2, a_revoir = 0, updated_at = ?2 WHERE id = ?1').bind(id, maintenant),
    db.prepare(`UPDATE alertes SET resolue_le = ?2, updated_at = ?2
      WHERE sorte = 'a_revoir' AND objet_type = 'questionnaire' AND objet_id = ?1 AND resolue_le IS NULL`).bind(id, maintenant),
  ]);
  return maj.meta.changes === 1;
};

/** « À revoir avec la personne » : le questionnaire n'est plus relu, il attend l'échange. */
export const marquerQuestionnaireARevoir = async (db: D1Database, id: string, maintenant: number): Promise<boolean> => {
  const r = await db.prepare('UPDATE questionnaires SET a_revoir = 1, relu_le = NULL, updated_at = ?2 WHERE id = ?1').bind(id, maintenant).run();
  return r.meta.changes === 1;
};
