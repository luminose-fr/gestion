/**
 * Vérifier — l'export contre la base, ligne par ligne et champ par champ
 * (SPEC §9.3, §14.9.1). Une fonction pure : elle reçoit les lignes que la
 * transformation attend et celles que la base contient, et rend les écarts,
 * désignés par la table, l'identifiant et le nom du champ — **jamais par leurs
 * valeurs**, qui sont des données réelles.
 *
 * S'y ajoutent les valeurs recalculées, comparées à celles que Notion calcule :
 * le nombre de séances non annulées par fiche (l'agrégat « Nombre de
 * séances »), les places libres par évènement (la formule « Places libres »),
 * le nombre de fiches reçues par professionnel (« Clients reçus »).
 */
import { lecteur, type Export } from './lire.ts';
import { REGLES } from './ecrire.ts';
import type { Ligne, Table, Transformation } from './transformer.ts';

export type Ecart = { table: string; id: string; champ: string };

/** Les colonnes comparées : celles que l'import écrit et que gestion ne saisit pas. */
const COMPAREES = (table: Table, ligne: Ligne): string[] => {
  const ignorees = new Set(['created_at', 'reference', ...(table === 'evenements' ? ['prix_centimes'] : [])]);
  return Object.keys(ligne).filter((c) => !ignorees.has(c));
};

/** La clé d'une ligne pour la retrouver en base : la première cible de conflit de sa table. */
const cleDe = (table: Table, ligne: Ligne) => REGLES[table].conflits[0].map((c) => String(ligne[c])).join('|');

const egal = (a: unknown, b: unknown) => (a === null || a === undefined ? b === null || b === undefined : String(a) === String(b));

/**
 * `base` : pour chaque table, ses lignes telles que la base les rend.
 * `liensEnBase` : les trois liens de chaque fiche.
 */
export const comparer = (
  t: Transformation, exp: Export, base: Record<Table, Ligne[]>, maintenant: number,
): Ecart[] => {
  const ecarts: Ecart[] = [];
  for (const table of Object.keys(t.lignes) as Table[]) {
    const enBase = new Map(base[table].map((l) => [cleDe(table, l), l]));
    for (const attendue of t.lignes[table]) {
      const trouvee = enBase.get(cleDe(table, attendue));
      if (!trouvee) { ecarts.push({ table, id: String(attendue.id), champ: '(ligne absente)' }); continue; }
      for (const champ of COMPAREES(table, attendue)) {
        // Un type attribué à la main dans gestion : seul un type reconnu par l'import se compare.
        if (table === 'seances' && champ === 'type_seance_id' && attendue[champ] === null) continue;
        if (!egal(attendue[champ], trouvee[champ])) ecarts.push({ table, id: String(attendue.id), champ });
      }
    }
  }
  const fiches = new Map(base.clients.map((l) => [String(l.id), l]));
  for (const lien of t.liens) {
    const fiche = fiches.get(String(lien.id));
    for (const champ of ['via_professionnel_id', 'via_client_id', 'couple_client_id']) {
      if (fiche && !egal(lien[champ], fiche[champ])) ecarts.push({ table: 'clients', id: String(lien.id), champ });
    }
  }

  // ── Les valeurs recalculées, contre celles de Notion ──
  const lc = lecteur(exp, 'clients');
  for (const p of exp.bases.clients.pages) {
    const notion = lc(p, 'Nombre de séances') as number | null;
    if (notion === null) continue;
    const enBase = base.seances.filter((s) => s.client_id === p.id && s.statut !== 'annulee').length;
    if (enBase !== notion) ecarts.push({ table: 'clients', id: p.id, champ: '(nombre de séances non annulées ≠ Notion)' });
  }
  const le = lecteur(exp, 'evenements');
  for (const p of exp.bases.evenements.pages) {
    const notion = le(p, 'Places libres') as number | null;
    const ev = base.evenements.find((e) => e.id === p.id);
    if (notion === null || !ev || ev.places_totales === null) continue;
    // La définition du §14.4, à l'instant de la vérification.
    const occupees = base.inscriptions.filter((i) => i.evenement_id === p.id && (
      i.statut === 'payee' || i.statut === 'confirmee'
      || (i.statut === 'retenue' && i.mode_paiement === 'virement')
      || (i.statut === 'retenue' && i.mode_paiement === 'carte' && Number(i.retenue_jusqua) > maintenant))).length;
    if (Number(ev.places_totales) - occupees !== notion) ecarts.push({ table: 'evenements', id: p.id, champ: '(places libres ≠ Notion)' });
  }
  const lp = lecteur(exp, 'professionnels');
  for (const p of exp.bases.professionnels.pages) {
    const notion = lp(p, 'Clients reçus') as number | null;
    if (notion === null) continue;
    const enBase = base.clients.filter((c) => c.via_professionnel_id === p.id).length;
    if (enBase !== notion) ecarts.push({ table: 'professionnels', id: p.id, champ: '(fiches reçues ≠ Notion)' });
  }
  return ecarts;
};

export const ecartsEnTexte = (ecarts: Ecart[]): string =>
  ecarts.length === 0 ? 'Zéro écart.' : `${ecarts.length} écart(s) :\n${ecarts.map((e) => `  ${e.table} › ${e.id} › ${e.champ}`).join('\n')}`;
