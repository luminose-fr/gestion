/**
 * La porte de service, côté gestion : ce que Make y confirme (SPEC §14.5,
 * §14.6 ; contrat §4.2).
 *
 * Comme la porte publique, rien ici ne sait d'où vient l'envoi : la fonction
 * reçoit l'en-tête d'autorisation et l'envoi tels qu'ils sont arrivés, et rend
 * une réponse du contrat — ou `{ autorisation: 'refusee' }`, que la porte
 * servira en 401 et que Make ne peut pas prendre pour une réponse à son envoi.
 *
 * **Une entrée ne vaut pas une authentification** (§14.3) : c'est gestion qui
 * vérifie le jeton de Make. Il n'en garde que l'empreinte
 * (`SERVICE_JETON_EMPREINTE`), comme pour le serveur MCP ; sans empreinte
 * posée, tout porteur est refusé. Le jeton n'ouvre que cette confirmation.
 */
import { OK, invalide, valider, confirmation as schemaConfirmation, type Reponse, type AutorisationRefusee } from '@luminose/contrat';
import type { Env } from '../../env';
import { baseClients, clientsReliee } from '../base';
import { secretDesPortes } from '../jetons';
import { decisionCommande, empreinteDe } from '../commandes';
import { ouvrirAlerte } from '../alertes';
import { newId } from '../../db';

const REFUSEE: AutorisationRefusee = { autorisation: 'refusee' };
const encodeur = new TextEncoder();

/** Deux chaînes de même longueur comparées sans s'arrêter à la première différence. */
const egales = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

/** Le porteur présenté est-il celui de Make ? Un `Bearer` et rien d'autre. */
export const autoriseParMake = async (env: Pick<Env, 'SERVICE_JETON_EMPREINTE'>, autorisation: string | null): Promise<boolean> => {
  const attendue = env.SERVICE_JETON_EMPREINTE?.trim().toLowerCase();
  if (!attendue || typeof autorisation !== 'string' || !autorisation.startsWith('Bearer ')) return false;
  const jeton = autorisation.slice('Bearer '.length).trim();
  if (!jeton) return false;
  const octets = new Uint8Array(await crypto.subtle.digest('SHA-256', encodeur.encode(jeton)));
  return egales([...octets].map((o) => o.toString(16).padStart(2, '0')).join(''), attendue);
};

/**
 * Une confirmation de Make (contrat §4.2).
 *
 * La décision est le passage de l'ordre de `confie_a_make` à l'issue reçue. La
 * commande (porte `service`, clé = l'identifiant de l'ordre) n'est écrite, dans
 * le même lot, que si ce passage a eu lieu ; l'alerte d'un échec aussi. Quand
 * le passage n'a rien écrit, l'ordre lu dit pourquoi :
 *
 *   - il porte déjà cette issue → sans effet, `{ ok: true }` ;
 *   - il porte l'issue contraire → rien ne change, alerte
 *     `confirmation_contraire`, `{ ok: true }` : Make n'a rien à corriger, c'est
 *     Florent qui regarde ;
 *   - inconnu, jamais confié (`prevu`), ou `annule` → `invalide`, rien d'écrit —
 *     et sa clé n'est pas consommée : une fois confié, il se confirmera.
 */
export const confirmation = async (
  env: Env,
  autorisation: string | null,
  envoi: unknown,
  maintenant: number,
): Promise<Reponse | AutorisationRefusee> => {
  if (!(await autoriseParMake(env, autorisation))) return REFUSEE;
  const v = valider(schemaConfirmation, envoi);
  if (!v.valide) return v.refus;
  const c = v.donnees;

  if (!secretDesPortes(env)) throw new Error('incident: portes_secret_absent');
  if (!clientsReliee(env)) throw new Error('incident: base_non_reliee');
  const db = baseClients(env);

  const resultat = c.resultat?.identifiant_externe !== undefined ? JSON.stringify({ identifiant_externe: c.resultat.identifiant_externe }) : null;
  const objet = { objetType: 'ordre', objetId: c.ordre };
  const [passage] = await db.batch([
    db.prepare(`
      UPDATE ordres SET etat = ?2, termine_le = ?3, resultat = ?4, motif = ?5, updated_at = ?3
      WHERE id = ?1 AND etat = 'confie_a_make'`).bind(c.ordre, c.issue, maintenant, resultat, c.issue === 'echec' ? c.motif! : null),
    decisionCommande(db, {
      id: newId(), porte: 'service', cle: c.ordre, sorte: 'confirmation', ...objet,
      empreinte: await empreinteDe(env, c), recu: OK, borne: null,
      // ?3 : la clé, c'est-à-dire l'ordre ; ?9 : l'instant. Le passage vient d'avoir lieu.
    }, maintenant, `EXISTS (SELECT 1 FROM ordres WHERE id = ?3 AND termine_le = ?9 AND etat = '${c.issue}')`),
    ouvrirAlerte(db, { sorte: 'message_echec', ...objet }, maintenant,
      "EXISTS (SELECT 1 FROM ordres WHERE id = ?4 AND etat = 'echec' AND termine_le = ?5)"),
  ]);
  if (passage.meta.changes === 1) return OK;

  const ordre = await db.prepare('SELECT etat FROM ordres WHERE id = ?1').bind(c.ordre).first<{ etat: string }>();
  if (ordre?.etat === c.issue) return OK;
  if (ordre?.etat === 'fait' || ordre?.etat === 'echec') {
    await ouvrirAlerte(db, { sorte: 'confirmation_contraire', ...objet }, maintenant).run();
    return OK;
  }
  return invalide(['ordre']);
};
