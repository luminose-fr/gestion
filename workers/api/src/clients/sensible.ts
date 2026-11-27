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
export const TABLES_SENSIBLES = [
  'questionnaires',
  'seances_notes',
  'seances_reponses',
  'clients_confiance',
  'clients_notes',
] as const;

export type TableSensible = (typeof TABLES_SENSIBLES)[number];

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

export const CHAMPS_NOTES_SEANCE = ['demande', 'objectif', 'seance', 'travailPersonnel', 'ideesSuite', 'reponseSms'] as const;
export type TrameSeance = Record<(typeof CHAMPS_NOTES_SEANCE)[number], string | null>;
export type NotesSeance = TrameSeance & {
  version: number | null;
  /** En lecture seule : la copie brute de la page Notion d'origine. */
  importNotion: string | null;
  /** En lecture seule : les réponses données à la réservation, dans l'ordre. */
  reponses: { rang: number; question: string; reponse: string }[];
};

/** Deux lectures, en un aller-retour : la trame et les réponses à la réservation. */
export const lireNotesSeance = async (db: D1Database, seanceId: string): Promise<NotesSeance> => {
  const [notes, reponses] = await db.batch([
    db.prepare(`
      SELECT demande, objectif, seance, travail_personnel, idees_suite, reponse_sms, import_notion, updated_at
      FROM seances_notes WHERE seance_id = ?1`).bind(seanceId),
    db.prepare('SELECT rang, question, reponse FROM seances_reponses WHERE seance_id = ?1 ORDER BY rang').bind(seanceId),
  ]);
  const n = (notes.results[0] ?? null) as Record<string, string | number | null> | null;
  return {
    demande: (n?.demande as string) ?? null,
    objectif: (n?.objectif as string) ?? null,
    seance: (n?.seance as string) ?? null,
    travailPersonnel: (n?.travail_personnel as string) ?? null,
    ideesSuite: (n?.idees_suite as string) ?? null,
    reponseSms: (n?.reponse_sms as string) ?? null,
    importNotion: (n?.import_notion as string) ?? null,
    version: n ? Number(n.updated_at) : null,
    reponses: (reponses.results as Record<string, unknown>[]).map((r) => ({
      rang: Number(r.rang), question: String(r.question), reponse: String(r.reponse),
    })),
  };
};

export const ecrireNotesSeance = (
  db: D1Database, seanceId: string, t: TrameSeance, version: number | null, maintenant: number, id: string,
): Promise<IssueNote> => issue(version === null
  ? db.prepare(`
      INSERT INTO seances_notes (id, seance_id, demande, objectif, seance, travail_personnel, idees_suite, reponse_sms, created_at, updated_at)
      SELECT ?1, s.id, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9 FROM seances s
      WHERE s.id = ?2 AND NOT EXISTS (SELECT 1 FROM seances_notes n WHERE n.seance_id = ?2)`)
    .bind(id, seanceId, t.demande, t.objectif, t.seance, t.travailPersonnel, t.ideesSuite, t.reponseSms, maintenant).run()
  : db.prepare(`
      UPDATE seances_notes SET demande = ?2, objectif = ?3, seance = ?4, travail_personnel = ?5, idees_suite = ?6,
        reponse_sms = ?7, updated_at = MAX(?8, updated_at + 1)
      WHERE seance_id = ?1 AND updated_at = ?9`)
    .bind(seanceId, t.demande, t.objectif, t.seance, t.travailPersonnel, t.ideesSuite, t.reponseSms, maintenant, version).run(),
version, maintenant);
