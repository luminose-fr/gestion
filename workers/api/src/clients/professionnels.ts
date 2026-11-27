/**
 * Les professionnels (SPEC §15.3). Une table sans personne accompagnée : la
 * suppression y est logique, et les fiches qui désignaient un professionnel
 * retiré gardent leur lien jusqu'à ce que Florent le change.
 */
type Brut = Record<string, unknown>;

export type ChampsProfessionnel = Partial<{
  nom: string;
  categories: string[];
  specialisation: string | null;
  adresse: string | null;
  codePostal: string | null;
  ville: string | null;
  telephone: string | null;
  email: string | null;
  siteWeb: string | null;
  note: string | null;
  connu: boolean;
  courriers: string[];
}>;

const COLONNES: Record<keyof ChampsProfessionnel, string> = {
  nom: 'nom', categories: 'categories', specialisation: 'specialisation', adresse: 'adresse', codePostal: 'code_postal',
  ville: 'ville', telephone: 'telephone', email: 'email', siteWeb: 'site_web', note: 'note', connu: 'connu',
  courriers: 'courriers',
};

const enValeur = (v: unknown) => (Array.isArray(v) ? JSON.stringify(v) : typeof v === 'boolean' ? (v ? 1 : 0) : v);

/** Tous, avec le nombre de fiches qui les désignent, en UNE instruction. */
export const listeProfessionnels = async (db: D1Database): Promise<Brut[]> => {
  const { results } = await db.prepare(`
    SELECT p.id, p.nom, p.categories, p.specialisation, p.adresse, p.code_postal, p.ville, p.telephone, p.email,
      p.site_web, p.note, p.connu, p.courriers, p.created_at, p.updated_at,
      (SELECT COUNT(*) FROM clients c WHERE c.via_professionnel_id = p.id) AS personnes_recues
    FROM professionnels p WHERE p.deleted_at IS NULL ORDER BY p.nom COLLATE NOCASE, p.id`).all();
  return results as Brut[];
};

export const creerProfessionnel = async (db: D1Database, id: string, champs: ChampsProfessionnel, maintenant: number) => {
  const valeurs: Record<string, unknown> = { id, created_at: maintenant, updated_at: maintenant };
  for (const [cle, colonne] of Object.entries(COLONNES)) {
    const v = champs[cle as keyof ChampsProfessionnel];
    if (v !== undefined) valeurs[colonne] = enValeur(v);
  }
  const colonnes = Object.keys(valeurs);
  await db.prepare(`INSERT INTO professionnels (${colonnes.join(', ')}) VALUES (${colonnes.map((_, i) => `?${i + 1}`).join(', ')})`)
    .bind(...colonnes.map((c) => valeurs[c])).run();
};

export const modifierProfessionnel = async (db: D1Database, id: string, champs: ChampsProfessionnel, maintenant: number): Promise<boolean> => {
  const sets: string[] = [];
  const valeurs: unknown[] = [id, maintenant];
  for (const [cle, colonne] of Object.entries(COLONNES)) {
    const v = champs[cle as keyof ChampsProfessionnel];
    if (v === undefined) continue;
    valeurs.push(enValeur(v));
    sets.push(`${colonne} = ?${valeurs.length}`);
  }
  const r = await db.prepare(`UPDATE professionnels SET ${[...sets, 'updated_at = ?2'].join(', ')} WHERE id = ?1 AND deleted_at IS NULL`)
    .bind(...valeurs).run();
  return r.meta.changes === 1;
};

export const supprimerProfessionnel = async (db: D1Database, id: string, maintenant: number): Promise<boolean> => {
  const r = await db.prepare('UPDATE professionnels SET deleted_at = ?2, updated_at = ?2 WHERE id = ?1 AND deleted_at IS NULL')
    .bind(id, maintenant).run();
  return r.meta.changes === 1;
};
