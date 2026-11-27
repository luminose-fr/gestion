/**
 * Les fiches, vues de la console (SPEC §15.3, « Les fiches »).
 *
 * Chaque lecture a un nombre d'instructions fixe, indépendant du volume
 * (règle 2 du chapitre 15) : la liste en une instruction, ses agrégats en
 * sous-requêtes ; une fiche en une lecture groupée (`db.batch`). Aucune ne
 * porte le contenu d'une table sensible : d'un questionnaire, une fiche ne
 * dit que de quoi le retrouver (`sensible.ts`).
 */
import { cleClient, nomRecherche, normaliserEmail, normaliserNom } from '@luminose/pratique';
import { questionnairesDeLaFiche } from './sensible';

export const PAR_PAGE = 50;

/** Les champs qu'une création ou une modification accepte (§15.3), et rien d'autre. */
export type ChampsFiche = Partial<{
  civilite: string | null;
  prenom: string;
  nom: string | null;
  email: string | null;
  telephone: string | null;
  dateNaissance: string | null;
  profession: string | null;
  adresse: string | null;
  codePostal: string | null;
  ville: string | null;
  pays: string | null;
  origine: string | null;
  motCleGoogleAds: string | null;
  viaProfessionnelId: string | null;
  viaClientId: string | null;
  coupleClientId: string | null;
}>;

const COLONNES: Record<Exclude<keyof ChampsFiche, 'coupleClientId'>, string> = {
  civilite: 'civilite', prenom: 'prenom', nom: 'nom', email: 'email', telephone: 'telephone',
  dateNaissance: 'date_naissance', profession: 'profession', adresse: 'adresse', codePostal: 'code_postal',
  ville: 'ville', pays: 'pays', origine: 'origine', motCleGoogleAds: 'mot_cle_google_ads',
  viaProfessionnelId: 'via_professionnel_id', viaClientId: 'via_client_id',
};

/** `%`, `_` et la barre de fuite de la saisie ne sont que des caractères. */
const motifLike = (texte: string) => `%${texte.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export type LigneFiche = {
  id: string; prenom: string; nom: string; ville: string | null;
  nbSeances: number; derniereSeance: number | null; prochaineSeance: number | null;
};

/**
 * La liste, 50 par page, par ordre alphabétique, en UNE instruction. `q` se
 * cherche sans accents dans le prénom et le nom (`nom_recherche`), et dans
 * l'adresse e-mail. Une ligne de plus est lue pour savoir s'il y a une suite.
 */
export const rechercherFiches = async (
  db: D1Database, q: string, page: number, maintenant: number,
): Promise<{ fiches: LigneFiche[]; suite: boolean }> => {
  const nom = nomRecherche(q, '');
  const email = normaliserEmail(q);
  const filtre = nom === '' && email === ''
    ? ''
    : `WHERE (c.nom_recherche LIKE ?2 ESCAPE '\\' OR (?3 <> '%%' AND LOWER(COALESCE(c.email, '')) LIKE ?3 ESCAPE '\\'))`;
  const { results } = await db.prepare(`
    SELECT c.id, c.prenom, c.nom, c.ville,
      (SELECT COUNT(*) FROM seances s WHERE s.client_id = c.id AND s.statut <> 'annulee') AS nb_seances,
      (SELECT MAX(s.debut) FROM seances s WHERE s.client_id = c.id AND s.statut <> 'annulee' AND s.debut < ?1) AS derniere_seance,
      (SELECT MIN(s.debut) FROM seances s WHERE s.client_id = c.id AND s.statut = 'prevue' AND s.debut >= ?1) AS prochaine_seance
    FROM clients c
    ${filtre}
    ORDER BY c.nom_recherche, c.id
    LIMIT ?4 OFFSET ?5`)
    .bind(maintenant, motifLike(nom), email === '' ? '%%' : motifLike(email), PAR_PAGE + 1, page * PAR_PAGE).all();
  const lignes = (results as Record<string, unknown>[]).map((r) => ({
    id: String(r.id), prenom: String(r.prenom), nom: String(r.nom), ville: (r.ville as string) ?? null,
    nbSeances: Number(r.nb_seances),
    derniereSeance: r.derniere_seance === null ? null : Number(r.derniere_seance),
    prochaineSeance: r.prochaine_seance === null ? null : Number(r.prochaine_seance),
  }));
  return { fiches: lignes.slice(0, PAR_PAGE), suite: lignes.length > PAR_PAGE };
};

/**
 * Les fiches semblables à ce qui se saisit (§15.3) : même clé, même adresse,
 * ou même prénom ET même nom, sans accents. **Une valeur vide ne se compare à
 * rien** : sans adresse saisie, les fiches sans adresse ne sont pas semblables,
 * et un prénom seul ne ramène pas tous les homonymes de prénom.
 */
export const fichesSemblables = async (
  db: D1Database, prenom: string, nom: string, email: string,
): Promise<{ id: string; prenom: string; nom: string; ville: string | null }[]> => {
  const cle = cleClient(email, prenom, nom);
  const adresse = normaliserEmail(email);
  const p = normaliserNom(prenom);
  const n = normaliserNom(nom);
  const recherche = p !== '' && n !== '' ? nomRecherche(p, n) : null;
  const { results } = await db.prepare(`
    SELECT id, prenom, nom, ville FROM clients
    WHERE (?1 IS NOT NULL AND cle_client = ?1)
       OR (?2 <> '' AND email = ?2)
       OR (?3 IS NOT NULL AND nom_recherche = ?3)
    ORDER BY nom_recherche, id LIMIT 20`).bind(cle, adresse, recherche).all();
  return (results as Record<string, unknown>[]).map((r) => ({
    id: String(r.id), prenom: String(r.prenom), nom: String(r.nom), ville: (r.ville as string) ?? null,
  }));
};

/** Les valeurs d'identité normalisées, la clé et le nom de recherche, recalculés ensemble. */
const identite = (prenom: string, nom: string, email: string | null) => {
  const p = normaliserNom(prenom);
  const n = normaliserNom(nom);
  const e = email === null ? null : normaliserEmail(email) || null;
  return { prenom: p, nom: n, email: e, nomRecherche: nomRecherche(p, n), cleClient: cleClient(e, p, n) };
};

/**
 * Le lien « couple » s'écrit des deux côtés, et se défait des deux côtés,
 * dans le lot de l'écriture : l'ancien conjoint de chacun est délié.
 */
const lienCouple = (db: D1Database, id: string, conjoint: string | null, maintenant: number): D1PreparedStatement[] => conjoint === null
  ? [
    db.prepare('UPDATE clients SET couple_client_id = NULL, updated_at = ?2 WHERE couple_client_id = ?1').bind(id, maintenant),
    db.prepare('UPDATE clients SET couple_client_id = NULL, updated_at = ?2 WHERE id = ?1').bind(id, maintenant),
  ]
  : [
    db.prepare('UPDATE clients SET couple_client_id = NULL, updated_at = ?3 WHERE couple_client_id = ?1 AND id <> ?2').bind(id, conjoint, maintenant),
    db.prepare('UPDATE clients SET couple_client_id = NULL, updated_at = ?3 WHERE couple_client_id = ?2 AND id <> ?1').bind(id, conjoint, maintenant),
    db.prepare('UPDATE clients SET couple_client_id = ?2, updated_at = ?3 WHERE id = ?1').bind(id, conjoint, maintenant),
    db.prepare('UPDATE clients SET couple_client_id = ?1, updated_at = ?3 WHERE id = ?2').bind(id, conjoint, maintenant),
  ];

/** Crée une fiche, et son lien de couple, en un lot. Prénom obligatoire. */
export const creerFiche = async (
  db: D1Database, id: string, champs: ChampsFiche & { prenom: string }, maintenant: number,
): Promise<void> => {
  const ident = identite(champs.prenom, champs.nom ?? '', champs.email ?? null);
  const valeurs: Record<string, unknown> = {};
  for (const [cle, colonne] of Object.entries(COLONNES)) {
    const v = champs[cle as keyof typeof COLONNES];
    if (v !== undefined) valeurs[colonne] = v;
  }
  Object.assign(valeurs, {
    id, prenom: ident.prenom, nom: ident.nom, email: ident.email,
    nom_recherche: ident.nomRecherche, cle_client: ident.cleClient, created_at: maintenant, updated_at: maintenant,
  });
  const colonnes = Object.keys(valeurs);
  const insertion = db.prepare(`INSERT INTO clients (${colonnes.join(', ')}) VALUES (${colonnes.map((_, i) => `?${i + 1}`).join(', ')})`)
    .bind(...colonnes.map((c) => valeurs[c]));
  const couple = champs.coupleClientId ? lienCouple(db, id, champs.coupleClientId, maintenant) : [];
  await db.batch([insertion, ...couple]);
};

/**
 * Modifie une fiche : les champs reçus, puis le nom de recherche et la clé,
 * recalculés sur les valeurs qui en résultent — dans la même instruction, à
 * partir de la ligne lue juste avant. Rend `false` si la fiche n'existe pas.
 */
export const modifierFiche = async (db: D1Database, id: string, champs: ChampsFiche, maintenant: number): Promise<boolean> => {
  const actuelle = await db.prepare('SELECT prenom, nom, email FROM clients WHERE id = ?1').bind(id)
    .first<{ prenom: string; nom: string; email: string | null }>();
  if (!actuelle) return false;
  const ident = identite(
    champs.prenom ?? actuelle.prenom,
    champs.nom === undefined ? actuelle.nom : champs.nom ?? '',
    champs.email === undefined ? actuelle.email : champs.email,
  );
  const sets: Record<string, unknown> = {};
  for (const [cle, colonne] of Object.entries(COLONNES)) {
    const v = champs[cle as keyof typeof COLONNES];
    if (v !== undefined) sets[colonne] = v;
  }
  Object.assign(sets, {
    prenom: ident.prenom, nom: ident.nom, email: ident.email,
    nom_recherche: ident.nomRecherche, cle_client: ident.cleClient, updated_at: maintenant,
  });
  const colonnes = Object.keys(sets);
  const instructions = [
    db.prepare(`UPDATE clients SET ${colonnes.map((c, i) => `${c} = ?${i + 2}`).join(', ')} WHERE id = ?1`)
      .bind(id, ...colonnes.map((c) => sets[c])),
  ];
  if (champs.coupleClientId !== undefined) instructions.push(...lienCouple(db, id, champs.coupleClientId, maintenant));
  const [r] = await db.batch(instructions);
  return r.meta.changes === 1;
};

type Brut = Record<string, unknown>;

export type FicheComplete = {
  fiche: Brut;
  viaProfessionnel: { id: string; nom: string } | null;
  viaClient: { id: string; prenom: string; nom: string } | null;
  couple: { id: string; prenom: string; nom: string } | null;
  aRecommande: { id: string; prenom: string; nom: string }[];
  seances: Brut[];
  inscriptions: Brut[];
  listeQuestionnaires: { id: string; date: number; version: string | null; relu: boolean; aRevoir: boolean }[];
};

/**
 * Une fiche et tout ce qu'elle montre, en UNE lecture groupée de cinq
 * instructions. Le numéro d'une séance est son rang parmi les séances non
 * annulées de la personne, par date — calculé ici, jamais rangé.
 */
export const lireFiche = async (db: D1Database, id: string): Promise<FicheComplete | null> => {
  const [fiche, recommandees, seances, inscriptions, formulaires] = await db.batch([
    db.prepare(`
      SELECT c.id, c.civilite, c.prenom, c.nom, c.email, c.telephone, c.date_naissance, c.profession, c.adresse,
        c.code_postal, c.ville, c.pays, c.origine, c.mot_cle_google_ads, c.created_at, c.updated_at,
        p.id AS pro_id, p.nom AS pro_nom,
        v.id AS via_id, v.prenom AS via_prenom, v.nom AS via_nom,
        k.id AS couple_id, k.prenom AS couple_prenom, k.nom AS couple_nom
      FROM clients c
      LEFT JOIN professionnels p ON p.id = c.via_professionnel_id
      LEFT JOIN clients v ON v.id = c.via_client_id
      LEFT JOIN clients k ON k.id = c.couple_client_id
      WHERE c.id = ?1`).bind(id),
    db.prepare('SELECT id, prenom, nom FROM clients WHERE via_client_id = ?1 ORDER BY nom_recherche, id').bind(id),
    db.prepare(`
      SELECT s.id, s.debut, s.duree_min, s.statut, s.etat_paiement, s.montant_centimes, s.mode, s.libelle_importe,
        t.id AS type_id, t.cle AS type_cle, t.libelle AS type_libelle,
        CASE WHEN s.statut <> 'annulee'
          THEN ROW_NUMBER() OVER (PARTITION BY s.statut = 'annulee' ORDER BY s.debut, s.id) END AS numero
      FROM seances s LEFT JOIN types_seance t ON t.id = s.type_seance_id
      WHERE s.client_id = ?1
      ORDER BY s.debut DESC, s.id DESC`).bind(id),
    db.prepare(`
      SELECT i.id, i.statut, i.mode_paiement, i.retenue_jusqua, i.montant_centimes, i.created_at,
        e.id AS evenement_id, e.nom AS evenement_nom, e.debut AS evenement_debut
      FROM inscriptions i JOIN evenements e ON e.id = i.evenement_id
      WHERE i.client_id = ?1
      ORDER BY e.debut DESC, i.id`).bind(id),
    questionnairesDeLaFiche(db, id),
  ]);
  const f = fiche.results[0] as Brut | undefined;
  if (!f) return null;
  return {
    fiche: f,
    viaProfessionnel: f.pro_id ? { id: String(f.pro_id), nom: String(f.pro_nom) } : null,
    viaClient: f.via_id ? { id: String(f.via_id), prenom: String(f.via_prenom), nom: String(f.via_nom) } : null,
    couple: f.couple_id ? { id: String(f.couple_id), prenom: String(f.couple_prenom), nom: String(f.couple_nom) } : null,
    aRecommande: (recommandees.results as Brut[]).map((r) => ({ id: String(r.id), prenom: String(r.prenom), nom: String(r.nom) })),
    seances: seances.results as Brut[],
    inscriptions: inscriptions.results as Brut[],
    listeQuestionnaires: (formulaires.results as Brut[]).map((q) => ({
      id: String(q.id), date: Number(q.date), version: (q.version as string) ?? null,
      relu: Number(q.relu) === 1, aRevoir: Number(q.a_revoir) === 1,
    })),
  };
};

/** La fiche existe-t-elle ? Pour distinguer « introuvable » d'un autre refus. */
export const ficheExiste = async (db: D1Database, id: string): Promise<boolean> =>
  (await db.prepare('SELECT 1 AS un FROM clients WHERE id = ?1').bind(id).first()) !== null;
