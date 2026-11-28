/**
 * Les messages d'une séance (SPEC §14.6, §14.12) : la confirmation, le rappel
 * par e-mail, l'annulation.
 *
 * **Inscrire** : des ordres, ni adresse ni texte (§14.6). La clé d'unicité porte
 * la séance et sa **révision** : un déplacement fait de nouveaux messages, et
 * ceux de l'ancienne date tombent d'eux-mêmes à la remise, la révision ayant
 * changé. Rejouée, l'inscription ne double rien (`ON CONFLICT DO NOTHING`).
 *
 * **Composer, au départ** (`messageDeSeance`) : juste avant la remise à Make,
 * gestion relit la séance — toujours prévue (ou annulée, pour l'annulation), à
 * la même révision, avec quelqu'un à qui écrire — et compose les valeurs du
 * modèle depuis la séance et la fiche du moment.
 *
 * La confirmation part une fois l'agenda écrit, quand il est relié (contrat
 * §3.1, point 3) : c'est l'appelant qui choisit le moment. Une séance reprise de
 * Notion n'en reçoit aucun.
 */
import type { Env } from '../env';
import { inscrireOrdre } from './ordres';
import { secretDesPortes, signerJeton } from './jetons';

const HEURE = 3_600_000;

export type ModeleSeance = 'seance_confirmation' | 'seance_rappel' | 'seance_annulation';

const cle = (modele: ModeleSeance, seanceId: string, revision: number) => `${modele}:${seanceId}:${revision}`;

/** Lire la clé d'un ordre de séance : le modèle, la séance, la révision. `null` : ce n'en est pas un. */
export const lireCle = (cleUnicite: string): { modele: ModeleSeance; seanceId: string; revision: number } | null => {
  const m = /^(seance_confirmation|seance_rappel|seance_annulation):(.+):(\d+)$/.exec(cleUnicite);
  return m ? { modele: m[1] as ModeleSeance, seanceId: m[2], revision: Number(m[3]) } : null;
};

/**
 * Inscrire les messages qui reviennent à la séance dans son état présent :
 * prévue, la confirmation et le rappel (s'il reste le temps de le faire
 * partir) ; annulée, l'annulation. Deux allers-retours au plus.
 */
export const inscrireMessagesSeance = async (db: D1Database, seanceId: string, maintenant: number): Promise<number> => {
  const [lu, reglage] = await db.batch([
    db.prepare('SELECT id, statut, revision, debut, origine FROM seances WHERE id = ?1').bind(seanceId),
    db.prepare("SELECT valeur FROM reglages WHERE cle = 'rappel_email_avant_h'"),
  ]);
  const s = lu.results?.[0] as { id: string; statut: string; revision: number; debut: number; origine: string } | undefined;
  if (!s || s.origine === 'import') return 0;
  const objet = { objetType: 'seance', objetId: s.id };
  const instructions: D1PreparedStatement[] = [];
  if (s.statut === 'prevue') {
    instructions.push(inscrireOrdre(db, {
      sorte: 'message.email', modeleCle: 'seance_confirmation', ...objet, prevuLe: maintenant,
      cleUnicite: cle('seance_confirmation', s.id, Number(s.revision)),
    }, maintenant));
    const avantH = Number((reglage.results?.[0] as { valeur?: number } | undefined)?.valeur ?? 72);
    const rappel = Number(s.debut) - avantH * HEURE;
    // Un rappel qui partirait moins d'une heure après la confirmation ne rappelle rien.
    if (rappel > maintenant + HEURE) {
      instructions.push(inscrireOrdre(db, {
        sorte: 'message.email', modeleCle: 'seance_rappel', ...objet, prevuLe: rappel,
        cleUnicite: cle('seance_rappel', s.id, Number(s.revision)),
      }, maintenant));
    }
  } else if (s.statut === 'annulee' && Number(s.debut) > maintenant) {
    instructions.push(inscrireOrdre(db, {
      sorte: 'message.email', modeleCle: 'seance_annulation', ...objet, prevuLe: maintenant,
      cleUnicite: cle('seance_annulation', s.id, Number(s.revision)),
    }, maintenant));
  }
  if (!instructions.length) return 0;
  const r = await db.batch(instructions);
  return r.reduce((n, x) => n + (x.meta.changes ?? 0), 0);
};

// ─── Composer, au départ ────────────────────────────────────────────────────

const ADRESSE = 'au 2 avenue de Verdun, Le Moulin de Barrelles, 31290 Villefranche-de-Lauragais';
const ENREGISTREMENT = 'Pour ma prise de notes, notre entretien pourra être enregistré ; l’enregistrement est effacé une fois mes notes prises.';

/** « lundi 4 janvier à 9 h 30 », à Paris. */
export const quand = (instant: number) => {
  const jour = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long' }).format(instant);
  const p = Object.fromEntries(new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(instant).map((x) => [x.type, x.value]));
  return `${jour} à ${Number(p.hour)} h${p.minute === '00' ? '' : ` ${p.minute}`}`;
};

export type MessageDeSeance =
  | { annuler: string }
  | { destinataire: { prenom: string; nom: string; email: string | null }; valeurs: Record<string, string> };

/**
 * L'ordre a-t-il encore lieu d'être, et que dit-il ? Un aller-retour, plus la
 * signature d'un lien de questionnaire quand il en faut un.
 */
export const messageDeSeance = async (env: Env, db: D1Database, cleUnicite: string): Promise<MessageDeSeance> => {
  const c = lireCle(cleUnicite);
  if (!c) return { annuler: 'objet_absent' };
  const s = await db.prepare(`
    SELECT s.id, s.statut, s.revision, s.debut, s.mode, s.visio_url, s.identite_recue, s.questionnaire_id, s.liens_version,
      t.libelle AS type, t.nature, t.questionnaire_requis, c.prenom, c.nom, c.email
    FROM seances s LEFT JOIN types_seance t ON t.id = s.type_seance_id LEFT JOIN clients c ON c.id = s.client_id
    WHERE s.id = ?1`).bind(c.seanceId).first<Record<string, string | number | null>>();
  if (!s) return { annuler: 'objet_absent' };
  const attendu = c.modele === 'seance_annulation' ? 'annulee' : 'prevue';
  if (s.statut !== attendu || Number(s.revision) !== c.revision) return { annuler: 'seance_changee' };

  let recue: { prenom?: string; nom?: string; email?: string } = {};
  try { recue = JSON.parse(String(s.identite_recue ?? '{}')); } catch { /* sans identité reçue */ }
  const email = (s.email ?? recue.email ?? '').toString().trim() || null;
  const prenom = (s.prenom ?? recue.prenom ?? '').toString().trim();
  if (!prenom) return { destinataire: { prenom: '', nom: '', email: null }, valeurs: {} };

  const debut = Number(s.debut);
  const lieu = s.mode === 'visio'
    ? (s.visio_url ? `en visio : ${s.visio_url}` : 'en visio (le lien vous sera envoyé)')
    : s.mode === 'appel' ? 'par téléphone : je vous appelle au numéro que vous m’avez donné' : ADRESSE;

  let questionnaire = '';
  const origine = env.ORIGINE_SITE?.trim();
  if (c.modele !== 'seance_annulation' && Number(s.questionnaire_requis) === 1 && !s.questionnaire_id && secretDesPortes(env) && origine) {
    const jeton = await signerJeton(env, { usage: 'questionnaire', objet: String(s.id), echeance: debut, version: Number(s.liens_version) });
    questionnaire = `Avant la séance, merci de remplir le questionnaire de santé (moins de 5 minutes) : ${origine}/#r=${jeton}`;
  }
  return {
    destinataire: { prenom, nom: (s.nom ?? recue.nom ?? '').toString(), email },
    valeurs: {
      prenom,
      seance: String(s.type ?? 'Séance'),
      quand: quand(debut),
      lieu,
      questionnaire,
      enregistrement: c.modele === 'seance_confirmation' && s.nature === 'rencontre' ? ENREGISTREMENT : '',
    },
  };
};
