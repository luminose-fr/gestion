/**
 * Écrire — les lignes transformées → un fichier SQL (SPEC §14.9.1, tâche 5).
 *
 * Des insertions « ou mise à jour », **jamais `INSERT OR REPLACE`** : il
 * retire la ligne avant de la récrire, et emporterait par les clés étrangères
 * tout ce qui en dépend — les séances d'une fiche réimportée, ses notes.
 *
 * Deux règles tiennent la rejouabilité :
 * - **la cible du conflit se définit table par table**, d'après les index
 *   uniques du schéma, pas seulement `id` ;
 * - **une mise à jour ne touche que les colonnes que Notion pilote.** Ce qui se
 *   saisit dans gestion — le prix d'un évènement, la référence d'une
 *   inscription, le type attribué à la main — n'est jamais remis à vide.
 *
 * Les lignes de référence (types de séance, horaires, réglages) ne sont pas
 * touchées.
 */
import type { Ligne, Table, Transformation } from './transformer.ts';

type Regle = {
  /** Les colonnes d'un index unique : la cible du conflit. Plusieurs cibles possibles. */
  conflits: string[][];
  /** Les colonnes que Notion pilote, mises à jour à chaque import. Vide : la ligne ne se met plus à jour. */
  pilotees: string[];
  /** Une colonne qui garde sa valeur de gestion quand Notion n'en donne pas (`COALESCE`). */
  gardees?: string[];
  /** Une insertion n'a lieu qu'à cette condition (une expression SQL sur les valeurs, en `?`). */
  condition?: (l: Ligne) => string;
};

const sql = (v: string | number | null | undefined): string =>
  v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${v.replace(/'/g, "''")}'`;

export const REGLES: Record<Table, Regle> = {
  professionnels: {
    conflits: [['id']],
    pilotees: ['nom', 'categories', 'specialisation', 'adresse', 'code_postal', 'ville', 'telephone', 'email', 'site_web', 'note', 'connu', 'courriers', 'updated_at'],
  },
  clients: {
    conflits: [['id']],
    pilotees: ['civilite', 'prenom', 'nom', 'nom_recherche', 'cle_client', 'email', 'telephone', 'date_naissance', 'profession', 'adresse',
      'code_postal', 'ville', 'pays', 'origine', 'mot_cle_google_ads', 'stancer_customer_id', 'qonto_client_id', 'updated_at'],
  },
  clients_confiance: { conflits: [['client_id']], pilotees: ['civilite', 'prenom', 'nom', 'telephone', 'email', 'mis_a_jour_le', 'updated_at'] },
  clients_notes: { conflits: [['client_id']], pilotees: ['texte', 'updated_at'] },
  evenements: {
    conflits: [['id']],
    // `prix_centimes` n'en est pas : Notion n'a qu'un texte HTML, le prix se saisit dans gestion.
    pilotees: ['nom', 'type', 'debut', 'fin', 'ville', 'places_totales', 'questionnaire_requis', 'url_inscription', 'publie',
      'meta_description', 'html_permalink', 'html_programme', 'html_prix', 'html_lieu_adresse', 'html_lieu_instructions', 'updated_at'],
  },
  seances: {
    conflits: [['id']],
    pilotees: ['client_id', 'debut', 'duree_min', 'occupe_jusqua', 'statut', 'etat_paiement', 'montant_centimes', 'clic_annonce',
      'liste_attente', 'libelle_importe', 'updated_at'],
    // Un type attribué à la main dans gestion n'est pas remis à vide par un libellé toujours inconnu.
    gardees: ['type_seance_id'],
  },
  seances_notes: {
    conflits: [['seance_id']],
    pilotees: ['demande', 'objectif', 'seance', 'travail_personnel', 'idees_suite', 'reponse_sms', 'import_notion', 'updated_at'],
  },
  paiements: {
    conflits: [['prestataire', 'reference'], ['id']],
    pilotees: ['seance_id', 'montant_centimes', 'statut', 'facture_qonto_id', 'updated_at'],
  },
  inscriptions: {
    conflits: [['id']],
    // Une inscription ne se met plus à jour : son statut et sa référence appartiennent à gestion.
    pilotees: [],
    // L'index des inscriptions vivantes : une inscription prise dans gestion pour la même fiche l'emporte.
    condition: (l) => `NOT EXISTS (SELECT 1 FROM inscriptions x WHERE x.evenement_id = ${sql(l.evenement_id as string)}
      AND x.client_id = ${sql(l.client_id as string)} AND x.id <> ${sql(l.id as string)} AND x.statut IN ('retenue', 'payee', 'confirmee'))`,
  },
  questionnaires: { conflits: [['id']], pilotees: ['client_id', 'drive_url', 'updated_at'] },
};

/** Les colonnes posées seulement à la première insertion, que l'import ne reprend jamais ensuite. */
const A_LA_CREATION: Partial<Record<Table, Ligne>> = {
  seances: { revision: 0, agenda_etat: 'ecrit', origine: 'import', liens_version: 1 },
  paiements: {},
};

/** Une instruction d'insertion « ou mise à jour » pour une ligne. */
export const upsert = (table: Table, ligne: Ligne, references?: () => string): string => {
  const regle = REGLES[table];
  const complete: Ligne = { ...A_LA_CREATION[table], ...ligne };
  // La référence publique d'une inscription : tirée au hasard à la PREMIÈRE insertion,
  // gardée ensuite — l'instruction ne la met jamais à jour.
  if (table === 'inscriptions' && references) complete.reference = references();
  const colonnes = Object.keys(complete);
  const valeurs = colonnes.map((c) => sql(complete[c]));
  const tete = regle.condition
    ? `INSERT INTO ${table} (${colonnes.join(', ')}) SELECT ${valeurs.join(', ')} WHERE ${regle.condition(ligne)}`
    : `INSERT INTO ${table} (${colonnes.join(', ')}) VALUES (${valeurs.join(', ')})`;
  const majs = [
    ...regle.pilotees.filter((c) => colonnes.includes(c)).map((c) => `${c} = excluded.${c}`),
    ...(regle.gardees ?? []).filter((c) => colonnes.includes(c)).map((c) => `${c} = COALESCE(excluded.${c}, ${table}.${c})`),
  ];
  const clauses = regle.conflits.map((cible) =>
    majs.length ? ` ON CONFLICT(${cible.join(', ')}) DO UPDATE SET ${majs.join(', ')}` : ` ON CONFLICT(${cible.join(', ')}) DO NOTHING`);
  return `${tete}${clauses.join('')};`;
};

/** Une référence d'inscription : 32 caractères tirés au hasard, sans signification. */
const referenceAuHasard = () => crypto.randomUUID().replace(/-/g, '');

/**
 * Le fichier SQL entier. Les parents avant ce qui en dépend ; les liens d'une
 * fiche à l'autre en dernier, une fois toutes les fiches écrites.
 */
export const enSql = (t: Transformation, references: () => string = referenceAuHasard): string => {
  const lignes: string[] = ['-- Import de Notion — DONNÉES RÉELLES : ce fichier ne quitte pas le dossier privé (SPEC §14.9).'];
  for (const table of Object.keys(REGLES) as Table[]) {
    for (const l of t.lignes[table]) lignes.push(upsert(table, l, table === 'inscriptions' ? references : undefined));
  }
  for (const l of t.liens) {
    lignes.push(`UPDATE clients SET via_professionnel_id = ${sql(l.via_professionnel_id)}, via_client_id = ${sql(l.via_client_id)}, ` +
      `couple_client_id = ${sql(l.couple_client_id)} WHERE id = ${sql(l.id)};`);
  }
  return `${lignes.join('\n')}\n`;
};

/** Les lignes qu'un import a écrites, `table:id` : gardées dans le dossier privé, pour le suivant. */
export const lignesImportees = (t: Transformation): string[] =>
  (['professionnels', 'clients', 'evenements', 'seances', 'inscriptions', 'questionnaires'] as const)
    .flatMap((table) => t.lignes[table].map((l) => `${table}:${l.id}`)).sort();

/**
 * Ce qu'un import précédent avait écrit et que cet export ne porte plus :
 * listé, jamais retiré — une inscription dont la relation a disparu reste
 * confirmée. Comparé à la liste du précédent, pas à la base : une fiche créée
 * dans gestion n'a jamais été importée, et n'a pas à « disparaître ».
 */
export const disparues = (precedentes: string[], t: Transformation): string[] => {
  const presentes = new Set(lignesImportees(t));
  return precedentes.filter((cle) => !presentes.has(cle)).map((cle) => cle.replace(':', ' › '));
};
