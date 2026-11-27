/**
 * Les ordres : ce que gestion demande à Make (SPEC §14.2, règle 9 ; §14.6).
 *
 * Gestion décide, Make exécute. Un ordre porte une sorte, l'objet concerné,
 * une échéance, un état et une clé d'unicité — **ni adresse, ni numéro, ni
 * texte** : le message se compose au départ, depuis le modèle et la fiche du
 * moment, et ne se range nulle part.
 */
import { messageEmail, type MessageEmail, type SorteOrdre } from '@luminose/contrat';
import type { Env } from '../env';
import { newId } from '../db';
import { baseClients } from './base';
import { ouvrirAlerte, alerteBorne } from './alertes';
import { lireIdentite, destinataireDepuis } from './sensible';
import { messageDeSeance } from './messages-seances';

export type NouvelOrdre = {
  sorte: SorteOrdre;
  /** Pour un message : la clé du modèle. */
  modeleCle: string | null;
  objetType: string;
  objetId: string;
  prevuLe: number;
  /** Une clé par effet : `accuse:<questionnaire>`… Un doublon s'efface devant elle. */
  cleUnicite: string;
};

/**
 * L'instruction qui inscrit un ordre, sous une condition qui peut lire
 * l'identifiant de l'objet en `?5` : l'ordre n'existe que si le lot a écrit son
 * objet. Un ordre de même clé déjà inscrit ne bouge pas.
 */
export const inscrireOrdre = (db: D1Database, o: NouvelOrdre, maintenant: number, condition = '1') =>
  db.prepare(`
    INSERT INTO ordres (id, sorte, modele_cle, objet_type, objet_id, prevu_le, etat, cle_unicite, tentatives, created_at, updated_at)
    SELECT ?1, ?2, ?3, ?4, ?5, ?6, 'prevu', ?7, 0, ?8, ?8 WHERE (${condition})
    ON CONFLICT DO NOTHING`).bind(newId(), o.sorte, o.modeleCle, o.objetType, o.objetId, o.prevuLe, o.cleUnicite, maintenant);

// ─── Remettre les ordres à Make ─────────────────────────────────────────────

/**
 * L'en-tête qui porte le secret de gestion vers Make. Le nom est à confirmer
 * en S2b contre le scénario de recette : c'est celui qu'attend un webhook Make
 * protégé par une clé d'API.
 */
export const EN_TETE_SECRET_MAKE = 'x-make-apikey';

/** Le délai donné à Make pour accuser réception d'une remise. Sa réponse n'est pas une confirmation. */
const DELAI_REMISE_MS = 10_000;
const MINUTE = 60_000;
const JOUR = 24 * 3_600_000;

/** Une adresse, et une seule : ni liste, ni nom, ni espace. */
const ADRESSE_UNIQUE = /^[^\s@,;<>"']+@[^\s@,;<>"']+\.[^\s@,;<>"']+$/;

/** Ce qu'il faut avant toute remise. Absent, rien n'est appelé et rien ne casse. */
type Configuration = { webhook: string; secret: string; detournement: string | null };

export type RaisonAttente = 'webhook_absent' | 'secret_absent' | 'detournement_absent';

/**
 * La configuration des remises, ou la raison pour laquelle on ne remet rien.
 * C'est `ENVIRONNEMENT === 'production'`, et lui seul, qui autorise un vrai
 * destinataire : absent ou autre, on détourne — et sans adresse de
 * détournement valide et unique, rien ne part.
 */
export const configurationDesRemises = (env: Env): Configuration | RaisonAttente => {
  const webhook = env.MAKE_WEBHOOK_MESSAGE_EMAIL?.trim();
  const secret = env.MAKE_SECRET?.trim();
  if (!webhook || !/^https:\/\//.test(webhook)) return 'webhook_absent';
  if (!secret) return 'secret_absent';
  if (env.ENVIRONNEMENT === 'production') return { webhook, secret, detournement: null };
  const detournement = env.DETOURNEMENT_EMAIL?.trim() ?? '';
  return ADRESSE_UNIQUE.test(detournement) ? { webhook, secret, detournement } : 'detournement_absent';
};

const echapper = (t: string) =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const remplir = (gabarit: string, valeurs: Record<string, string>) =>
  gabarit.replace(/\{\{(\w+)\}\}/g, (tel, nom: string) => (nom in valeurs ? valeurs[nom] : tel));

/**
 * Un message composé AU DÉPART, depuis le modèle et les données du moment. Le
 * corps du modèle est du texte ; le HTML en est déduit, un paragraphe par bloc,
 * et toute valeur insérée y est échappée. Variables de la phase : `{{prenom}}`.
 */
export const composer = (modele: { objet: string | null; corps: string }, valeurs: Record<string, string>) => {
  const echappees = Object.fromEntries(Object.entries(valeurs).map(([k, v]) => [k, echapper(v)]));
  return {
    objet: remplir(modele.objet ?? '', valeurs).trim(),
    texte: remplir(modele.corps, valeurs),
    html: modele.corps.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
      .map((p) => `<p>${remplir(echapper(p), echappees).replace(/\n/g, '<br>')}</p>`).join(''),
  };
};

type Candidat = { id: string; modele_cle: string | null; objet_type: string; objet_id: string; cle_unicite: string; etat: 'prevu' | 'confie_a_make'; tentatives: number };

export type Bilan = {
  examines: number;
  remis: number;
  enEchec: number;
  annules: number;
  /** Pourquoi rien n'a été examiné, le cas échéant. */
  attente?: RaisonAttente;
};

/** Clôt un ordre que l'on n'appellera plus, s'il est encore dans l'état observé. */
const clore = (db: D1Database, o: Candidat, etat: 'annule' | 'echec', motif: string, maintenant: number) => [
  db.prepare(`
    UPDATE ordres SET etat = ?2, motif = ?3, termine_le = ?4, updated_at = ?4
    WHERE id = ?1 AND etat = ?5 AND tentatives = ?6`).bind(o.id, etat, motif, maintenant, o.etat, o.tentatives),
  ...(etat === 'echec'
    ? [ouvrirAlerte(db, { sorte: 'message_echec', objetType: 'ordre', objetId: o.id }, maintenant,
        "EXISTS (SELECT 1 FROM ordres WHERE id = ?4 AND etat = 'echec')")]
    : []),
];

/**
 * Remettre à Make les ordres dus (SPEC §14.6) : les `prevu` échus, et les
 * `confie_a_make` non confirmés depuis `ordre_relance_min` — dans la limite :
 * un passage traite un nombre borné d'ordres et laisse le reste au suivant
 * (§14.7). Requêtes : une lecture, puis au plus trois allers-retours par ordre
 * — 31 pour la limite de dix.
 *
 * **Make n'est appelé qu'après avoir pris l'ordre** par une mise à jour
 * conditionnelle, qui porte l'état et le nombre de tentatives observés à la
 * lecture : deux passages simultanés n'appellent qu'une fois. Pour une première
 * remise, la borne `emails_max_jour` fait partie de la condition — le compte des
 * premières remises des dernières 24 heures, dans la même instruction : ses
 * relances ne comptent pas, et sa dernière place ne se prend pas à deux.
 *
 * Ni l'adresse du webhook, ni le destinataire, ni le texte ne sont journalisés
 * ou rangés.
 */
export const releverLesOrdres = async (env: Env, maintenant: number, limite = 10): Promise<Bilan> => {
  const bilan: Bilan = { examines: 0, remis: 0, enEchec: 0, annules: 0 };
  const configuration = configurationDesRemises(env);
  if (typeof configuration === 'string') return { ...bilan, attente: configuration };
  const db = baseClients(env);

  const [reglages, dus] = await db.batch([
    db.prepare("SELECT cle, valeur FROM reglages WHERE cle IN ('ordre_tentatives_max')"),
    db.prepare(`
      SELECT id, modele_cle, objet_type, objet_id, cle_unicite, etat, tentatives FROM ordres
      WHERE sorte = 'message.email' AND (
        (etat = 'prevu' AND prevu_le <= ?1)
        OR (etat = 'confie_a_make' AND confie_le <= ?1 - COALESCE((SELECT valeur FROM reglages WHERE cle = 'ordre_relance_min'), 15) * ${MINUTE})
      )
      ORDER BY prevu_le, id LIMIT ?2`).bind(maintenant, limite),
  ]);
  const tentativesMax = Number((reglages.results as { valeur: number }[])[0]?.valeur ?? 5);

  for (const o of dus.results as Candidat[]) {
    bilan.examines += 1;

    // Représenté trop de fois sans confirmation : un échec, que Florent regarde.
    if (o.etat === 'confie_a_make' && o.tentatives >= tentativesMax) {
      await db.batch(clore(db, o, 'echec', 'sans_confirmation', maintenant));
      bilan.enEchec += 1;
      continue;
    }

    // Revérifier que l'ordre a encore lieu d'être, et composer le message — en un aller-retour.
    const [modeleLu, identiteLue] = await db.batch([
      db.prepare(`
        SELECT objet, corps FROM messages_modeles
        WHERE cle = ?1 AND canal = 'email' AND deleted_at IS NULL ORDER BY version DESC LIMIT 1`).bind(o.modele_cle ?? ''),
      lireIdentite(db, o.objet_type === 'questionnaire' ? o.objet_id : ''),
    ]);
    // Une séance (confirmation, rappel, annulation) : relue au départ — toujours dans l'état
    // attendu, à la même révision — et ses valeurs composées depuis la séance et la fiche.
    let valeurs: Record<string, string> = {};
    let vu: { destinataire: { prenom: string; nom: string; email: string | null } | null } | null;
    if (o.objet_type === 'seance') {
      const m = await messageDeSeance(env, db, o.cle_unicite);
      if ('annuler' in m) {
        await db.batch(clore(db, o, 'annule', m.annuler, maintenant));
        bilan.annules += 1;
        continue;
      }
      vu = { destinataire: m.destinataire };
      valeurs = m.valeurs;
    } else {
      vu = destinataireDepuis(identiteLue.results?.[0] as { identite?: unknown } | undefined);
    }
    if (!vu || !vu.destinataire?.email) {
      // L'objet a disparu (effacé), ou il n'y a personne à qui écrire. Un ordre
      // déjà remis ne se reprend pas : il reste tracé, en échec.
      const motif = !vu ? 'objet_absent' : 'sans_destinataire';
      await db.batch(clore(db, o, o.etat === 'prevu' ? 'annule' : 'echec', motif, maintenant));
      if (o.etat === 'prevu') bilan.annules += 1; else bilan.enEchec += 1;
      continue;
    }
    const modele = modeleLu.results?.[0] as { objet: string | null; corps: string } | undefined;
    const compose = modele ? composer(modele, { prenom: vu.destinataire.prenom, ...valeurs }) : null;
    const message: MessageEmail | null = compose && compose.objet ? {
      ordre: o.id,
      type: 'message.email',
      destinataire: configuration.detournement
        ? { nom: `${vu.destinataire.prenom} ${vu.destinataire.nom}`.trim(), email: configuration.detournement }
        : { nom: `${vu.destinataire.prenom} ${vu.destinataire.nom}`.trim(), email: vu.destinataire.email },
      objet: configuration.detournement ? `[Recette] ${compose.objet}` : compose.objet,
      html: compose.html,
      texte: compose.texte,
      pieces: [],
    } : null;
    if (!message || !messageEmail.safeParse(message).success) {
      // Sans modèle utilisable, l'ordre attend : le texte viendra (lot F).
      await ouvrirAlerte(db, { sorte: 'modele_absent', objetType: 'modele', objetId: o.modele_cle ?? '' }, maintenant).run();
      continue;
    }

    // Prendre l'ordre avant d'appeler.
    const prise = await db.prepare(`
      UPDATE ordres SET
        etat = 'confie_a_make', tentatives = tentatives + 1, confie_le = ?2,
        premiere_remise_le = COALESCE(premiere_remise_le, ?2), updated_at = ?2
      WHERE id = ?1 AND etat = ?3 AND tentatives = ?4
        AND (premiere_remise_le IS NOT NULL OR (
          SELECT COUNT(*) FROM ordres WHERE sorte = 'message.email' AND premiere_remise_le > ?2 - ${JOUR}
        ) < COALESCE((SELECT valeur FROM reglages WHERE cle = 'emails_max_jour'), 0))`)
      .bind(o.id, maintenant, o.etat, o.tentatives).run();
    if (prise.meta.changes !== 1) {
      // Pris par un autre passage — ou la borne : l'ordre n'a pas bougé.
      const encore = await db.prepare('SELECT 1 AS la FROM ordres WHERE id = ?1 AND etat = ?2 AND tentatives = ?3')
        .bind(o.id, o.etat, o.tentatives).first();
      if (encore) await alerteBorne(db, 'emails_max_jour', maintenant).run();
      continue;
    }

    try {
      await fetch(configuration.webhook, {
        method: 'POST',
        headers: { 'content-type': 'application/json', [EN_TETE_SECRET_MAKE]: configuration.secret },
        body: JSON.stringify(message),
        signal: AbortSignal.timeout(DELAI_REMISE_MS),
      });
    } catch {
      // L'ordre est pris : il sera représenté après le délai. Un code, rien d'autre.
      console.warn('incident: remise_make_echouee');
    }
    bilan.remis += 1;
  }
  return bilan;
};
