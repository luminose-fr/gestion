/**
 * Tenir l'agenda Google d'accord avec les séances (SPEC §14.4, §14.12).
 *
 * **Une seule fonction, quelle que soit la cause** — une réservation du site,
 * un rendez-vous posé, déplacé, annulé ou remis à « prévue » dans la console,
 * un type ou un mode changés : `synchroniserAgenda` lit la séance telle
 * qu'elle est, et rend l'agenda conforme. Elle se rejoue sans rien doubler.
 *
 *   - prévue, sans évènement      → écrit (avec un lien Meet en visio) ;
 *   - prévue, avec un évènement   → mis à jour ; disparu de l'agenda, réécrit ;
 *   - annulée, avec un évènement  → retiré ;
 *   - réalisée, absente           → laissée telle quelle : c'est l'histoire.
 *
 * Elle part APRÈS la réponse (`waitUntil`) : un agenda en panne ne bloque ni la
 * console ni la porte. Une synchronisation manquée met la séance en `echec`, et
 * le passage planifié la reprend. Agenda non relié : rien, et rien n'est noté.
 */
import type { Env } from '../env';
import { baseClients, clientsReliee } from './base';
import { ouvrirAgenda, type Agenda } from './agenda';

const MINUTE = 60_000;
const LIBELLES_MODE: Record<string, string> = { sur_place: 'sur place', visio: 'en visio', appel: 'par téléphone' };

type Ligne = Record<string, string | number | null>;

const lire = (db: D1Database, seanceId: string) => db.prepare(`
  SELECT s.id, s.debut, s.duree_min, s.mode, s.statut, s.origine, s.agenda_etat, s.agenda_evenement_id, s.visio_url, s.identite_recue,
    t.libelle AS type, c.prenom, c.nom, c.telephone
  FROM seances s LEFT JOIN types_seance t ON t.id = s.type_seance_id LEFT JOIN clients c ON c.id = s.client_id
  WHERE s.id = ?1`).bind(seanceId).first<Ligne>();

/** Le titre et la description : le type et le nom, tels que la fiche ou l'envoi les donnent. En recette, « [Recette] ». */
const rendezVous = (env: Env, s: Ligne) => {
  let recue: { prenom?: string; nom?: string; telephone?: string } = {};
  try { recue = JSON.parse(String(s.identite_recue ?? '{}')); } catch { /* sans identité reçue */ }
  const nom = [s.prenom ?? recue.prenom, s.nom ?? recue.nom].filter(Boolean).join(' ') || 'Personne à rapprocher';
  const recette = env.ENVIRONNEMENT === 'recette';
  const adresseConsole = recette ? 'https://gestion-recette.luminose.fr' : 'https://gestion.luminose.fr';
  const telephone = s.telephone ?? recue.telephone;
  const debut = Number(s.debut);
  return {
    seanceId: String(s.id),
    titre: `${recette ? '[Recette] ' : ''}${s.type ?? 'Séance'} — ${nom}`,
    description: [
      `${s.origine === 'site' ? 'Réservée sur le site' : 'Posée dans gestion'}, ${LIBELLES_MODE[String(s.mode)] ?? ''}`.trim().replace(/,$/, ''),
      telephone ? `Téléphone : ${telephone}` : null,
      `Dans gestion : ${adresseConsole}/#seances/${encodeURIComponent(String(s.id))}`,
    ].filter(Boolean).join('\n'),
    debut,
    fin: debut + Number(s.duree_min) * MINUTE,
    visio: s.mode === 'visio',
  };
};

const noter = (db: D1Database, seanceId: string, etat: 'ecrit' | 'echec', evenementId?: string | null, visioUrl?: string | null) =>
  db.prepare(`UPDATE seances SET agenda_etat = ?2, agenda_evenement_id = CASE WHEN ?3 = 1 THEN ?4 ELSE agenda_evenement_id END,
      visio_url = COALESCE(?5, visio_url), updated_at = ?6 WHERE id = ?1`)
    .bind(seanceId, etat, evenementId !== undefined ? 1 : 0, evenementId ?? null, visioUrl ?? null, Date.now()).run();

/** Rend l'agenda conforme à la séance. Ne lève pas. `true` : l'agenda est d'accord. */
export const synchroniserAgenda = async (env: Env, db: D1Database, agenda: Agenda, seanceId: string): Promise<boolean> => {
  const s = await lire(db, seanceId);
  if (!s) return false;
  const evenement = s.agenda_evenement_id ? String(s.agenda_evenement_id) : null;
  try {
    if (s.statut === 'annulee') {
      if (evenement) await agenda.retirer(evenement);
      await noter(db, seanceId, 'ecrit', null);
      return true;
    }
    if (s.statut !== 'prevue') return true;
    const rv = rendezVous(env, s);
    if (evenement) {
      const fait = await agenda.modifier(evenement, rv, rv.visio && !s.visio_url);
      if (fait) {
        await noter(db, seanceId, 'ecrit', evenement, fait.visioUrl);
        return true;
      }
      // Disparu de l'agenda (supprimé à la main, ou un autre agenda d'écriture) : on le réécrit.
    }
    const { evenementId, visioUrl } = await agenda.ecrire(rv);
    await noter(db, seanceId, 'ecrit', evenementId, visioUrl);
    return true;
  } catch (erreur) {
    console.error(erreur instanceof Error && erreur.message.startsWith('agenda.') ? erreur.message : 'agenda.synchronisation');
    await noter(db, seanceId, 'echec');
    return false;
  }
};

/**
 * Après une action de la console : l'agenda suit, après la réponse. Rien si
 * l'agenda n'est pas relié ou la base des clients absente.
 */
export const apresChangement = (env: Env, contexte: () => { waitUntil: (p: Promise<unknown>) => void }, seanceId: string) => {
  const travail = (async () => {
    if (!clientsReliee(env)) return;
    const agenda = await ouvrirAgenda(env);
    if (agenda) await synchroniserAgenda(env, baseClients(env), agenda, seanceId);
  })().catch(() => { console.error('agenda.apres_changement'); });
  // Sans contexte d'exécution (un appel direct, dans les essais), le travail part seul.
  try { contexte().waitUntil(travail); } catch { void travail; }
};

/**
 * Le passage planifié : les séances dont la synchronisation a échoué, quelques-unes
 * à la fois (§14.7) ; les séances passées ne se rattrapent pas. Agenda non relié : rien.
 */
export const reprendreLesAgendas = async (env: Env, limite = 5): Promise<number> => {
  if (!clientsReliee(env)) return 0;
  const agenda = await ouvrirAgenda(env);
  if (!agenda) return 0;
  const db = baseClients(env);
  const { results } = await db.prepare(`
    SELECT id FROM seances WHERE agenda_etat = 'echec' AND debut > ?1 ORDER BY debut LIMIT ?2`)
    .bind(Date.now(), limite).all<{ id: string }>();
  let faites = 0;
  for (const { id } of results) if (await synchroniserAgenda(env, db, agenda, id)) faites += 1;
  return faites;
};
