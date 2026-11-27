/**
 * Les commandes : ce qu'une porte a reçu (SPEC §14.6 ; règle 5).
 *
 * Une commande acceptée est **la décision d'un lot** (règle 6) : son insertion
 * ne s'écrit que si le couple (porte, clé) n'existe pas encore ET que la borne
 * du jour n'est pas atteinte — le compte fait partie de la condition, dans la
 * même instruction, si bien que deux envois simultanés ne prennent pas la
 * dernière place à deux. `meta.changes` dit l'issue ; toutes les écritures du
 * lot portent la condition que cette commande existe (`commandeExiste`), sous
 * un identifiant tiré avant le lot.
 *
 * Quand la décision n'a rien écrit, on ne répond pas à l'aveugle : la lecture
 * est refaite, et elle dit pourquoi — la clé est arrivée entre-temps (même
 * empreinte : son reçu ; une autre : `invalide`), ou c'est la borne.
 *
 * Les refus d'avant la décision (`invalide`, `ferme`, `trop_de_demandes`) ne
 * s'écrivent pas ici : ils n'ont rien décidé, et les garder ferait écrire la
 * base par cela même qu'elle refuse (§14.6.1).
 */
import { invalide, type Reponse } from '@luminose/contrat';
import type { Env } from '../env';
import { empreinteHmac } from './jetons';

export type Porte = 'publique' | 'service';
export type SorteCommande = 'questionnaire' | 'confirmation';

const JOUR = 24 * 3_600_000;
const HEURE = 3_600_000;

/**
 * La forme canonique d'un envoi : clés triées à tous les niveaux, `cle`
 * retirée à la racine — l'empreinte dit le CONTENU, la clé le désigne.
 */
export const formeCanonique = (envoi: unknown): string => {
  const trier = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(trier);
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, trier((v as Record<string, unknown>)[k])]));
    }
    return v;
  };
  const racine = envoi && typeof envoi === 'object' && !Array.isArray(envoi)
    ? Object.fromEntries(Object.entries(envoi as Record<string, unknown>).filter(([k]) => k !== 'cle'))
    : envoi;
  return JSON.stringify(trier(racine)) ?? 'null';
};

/**
 * L'empreinte d'un envoi : HMAC sous la sous-clé `empreintes`. Avec un secret,
 * et pas un simple condensé : celle d'un questionnaire ne doit pas permettre
 * d'en deviner les réponses en essayant les combinaisons.
 */
export const empreinteDe = (env: Pick<Env, 'PORTES_SECRET'>, envoi: unknown): Promise<string> =>
  empreinteHmac(env, formeCanonique(envoi));

/** La commande de cette clé, si elle existe : son empreinte et son reçu. */
export const lireCommande = (db: D1Database, porte: Porte, cle: string) =>
  db.prepare('SELECT empreinte, recu FROM commandes WHERE porte = ?1 AND cle = ?2').bind(porte, cle);

export type CommandeVue = { empreinte: string; recu: string };

/** Une clé déjà vue : son reçu si le contenu est le même, sinon `invalide` — sans champs. */
export const reponseAuRejeu = (vue: CommandeVue, empreinte: string): Reponse =>
  vue.empreinte === empreinte ? (JSON.parse(vue.recu) as Reponse) : invalide();

export type NouvelleCommande = {
  id: string;
  porte: Porte;
  cle: string;
  sorte: SorteCommande;
  objetType: string | null;
  objetId: string | null;
  empreinte: string;
  /** Le reçu : la réponse minimale rendue. Ni identité, ni réponse. */
  recu: Reponse;
  /** La clé du réglage qui borne les commandes de cette sorte sur 24 heures ; aucune borne sinon. */
  borne: string | null;
};

/**
 * L'instruction qui décide. `enPlus` : une condition de plus, qui peut lire
 * la clé en `?3` — celle, par exemple, qu'aucun questionnaire ne porte déjà
 * cet envoi (après la purge de sa commande). Un réglage de borne absent vaut
 * zéro : mieux vaut tout refuser que tout laisser passer.
 */
export const decisionCommande = (db: D1Database, c: NouvelleCommande, maintenant: number, enPlus = '1') =>
  db.prepare(`
    INSERT INTO commandes (id, porte, cle, sorte, objet_type, objet_id, empreinte, recu, created_at, updated_at)
    SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9
    WHERE NOT EXISTS (SELECT 1 FROM commandes WHERE porte = ?2 AND cle = ?3)
      AND (?10 IS NULL OR (
        SELECT COUNT(*) FROM commandes WHERE porte = ?2 AND sorte = ?4 AND created_at > ?9 - ${JOUR}
      ) < COALESCE((SELECT valeur FROM reglages WHERE cle = ?10), 0))
      AND (${enPlus})`)
    .bind(c.id, c.porte, c.cle, c.sorte, c.objetType, c.objetId, c.empreinte, JSON.stringify(c.recu), maintenant, c.borne);

/** La condition qui lie une écriture du lot à la commande : `p` est le paramètre de son identifiant. */
export const commandeExiste = (p: string) => `EXISTS (SELECT 1 FROM commandes WHERE id = ${p})`;

/**
 * Retire les commandes plus vieilles que `recus_garde_h`, dans une limite :
 * un passage traite un nombre borné de lignes (§14.7). Réglage absent : rien
 * n'est purgé. Après la purge, le questionnaire reste la mémoire de son envoi
 * (`envoi_id`, `envoi_empreinte`).
 */
export const purgerLesCommandes = async (db: D1Database, maintenant: number, limite = 200): Promise<number> => {
  const r = await db.prepare(`
    DELETE FROM commandes WHERE id IN (
      SELECT id FROM commandes
      WHERE created_at < ?1 - (SELECT valeur FROM reglages WHERE cle = 'recus_garde_h') * ${HEURE}
      ORDER BY created_at LIMIT ?2
    )`).bind(maintenant, limite).run();
  return r.meta.changes ?? 0;
};
