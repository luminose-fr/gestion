/**
 * Les jetons des liens envoyés aux personnes, et les empreintes des envois
 * (SPEC §14.5, §14.6).
 *
 * **Un secret, deux emplois.** `PORTES_SECRET` n'est jamais employé tel quel :
 * deux sous-clés en sont dérivées par HMAC-SHA-256, une pour signer les liens,
 * une pour les empreintes des commandes. Une même clé pour deux usages
 * permettrait de fabriquer l'un avec l'autre — une empreinte rendue quelque
 * part deviendrait une signature de lien.
 *
 * **Un jeton n'est rangé nulle part.** Il dit son usage, son objet, son
 * échéance et une version — le `liens_version` de l'objet — et il se recalcule
 * quand un message doit le porter. Changer la version de l'objet révoque tous
 * les liens déjà envoyés. La version se vérifie au moment de s'en servir,
 * contre la base : ce module ne lit rien.
 *
 * **Un jeton ne se journalise pas** et ne figure dans aucun message d'erreur :
 * une vérification qui échoue rend `null`, et le même `null` quelle qu'en soit
 * la raison — signature fausse, forme invalide, échéance passée, autre usage.
 */
import type { Env } from '../env';

/** Ce qu'un lien peut ouvrir. Dans la phase S2a : remplir le questionnaire d'une séance. */
export type UsageJeton = 'questionnaire';

export type ContenuJeton = {
  usage: UsageJeton;
  /** L'identifiant de l'objet : la séance, pour un questionnaire. */
  objet: string;
  /** Instant en millisecondes UTC au-delà duquel le jeton ne vaut plus. */
  echeance: number;
  /** Le `liens_version` de l'objet au moment de la signature. */
  version: number;
};

type Emploi = 'liens' | 'empreintes';

const encodeur = new TextEncoder();

const enBase64Url = (octets: Uint8Array): string => {
  let binaire = '';
  for (const o of octets) binaire += String.fromCharCode(o);
  return btoa(binaire).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const depuisBase64Url = (texte: string): Uint8Array | null => {
  if (!/^[A-Za-z0-9_-]+$/.test(texte)) return null;
  try {
    const binaire = atob(texte.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (texte.length % 4)) % 4));
    return Uint8Array.from(binaire, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
};

/** Le secret des portes, ou `null` : facultatif, comme les autres secrets de env.ts. */
export const secretDesPortes = (env: Pick<Env, 'PORTES_SECRET'>): string | null => env.PORTES_SECRET?.trim() || null;

/** Une sous-clé par emploi, dérivée du secret par HMAC (un libellé par emploi). */
const sousCle = async (secret: string, emploi: Emploi): Promise<CryptoKey> => {
  const maitre = await crypto.subtle.importKey('raw', encodeur.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const derivee = await crypto.subtle.sign('HMAC', maitre, encodeur.encode(`luminose/portes/${emploi}`));
  return crypto.subtle.importKey('raw', derivee, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
};

const exigerSecret = (env: Pick<Env, 'PORTES_SECRET'>): string => {
  const secret = secretDesPortes(env);
  // Une panne, pas un refus : sans secret, la porte ne peut rien recevoir.
  if (!secret) throw new Error('PORTES_SECRET absent');
  return secret;
};

/** Le jeton d'un lien : base64url du contenu, un point, la signature. Sûr dans une adresse. */
export const signerJeton = async (env: Pick<Env, 'PORTES_SECRET'>, contenu: ContenuJeton): Promise<string> => {
  const cle = await sousCle(exigerSecret(env), 'liens');
  const charge = enBase64Url(encodeur.encode(JSON.stringify({ u: contenu.usage, o: contenu.objet, e: contenu.echeance, v: contenu.version })));
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', cle, encodeur.encode(charge)));
  return `${charge}.${enBase64Url(signature)}`;
};

/**
 * Le contenu d'un jeton valable pour cet usage, ou `null`. La signature se
 * vérifie par `crypto.subtle.verify`, à temps constant ; le contenu n'est lu
 * qu'une fois la signature reconnue.
 */
export const verifierJeton = async (
  env: Pick<Env, 'PORTES_SECRET'>,
  jeton: string,
  usageAttendu: UsageJeton,
  maintenant: number,
): Promise<ContenuJeton | null> => {
  const secret = secretDesPortes(env);
  if (!secret || typeof jeton !== 'string' || jeton.length > 1024) return null;
  const parties = jeton.split('.');
  if (parties.length !== 2) return null;
  const [charge, signatureTexte] = parties;
  const signature = depuisBase64Url(signatureTexte);
  if (!signature || !depuisBase64Url(charge)) return null;
  const cle = await sousCle(secret, 'liens');
  if (!(await crypto.subtle.verify('HMAC', cle, signature, encodeur.encode(charge)))) return null;
  let brut: unknown;
  try {
    brut = JSON.parse(new TextDecoder().decode(depuisBase64Url(charge)!));
  } catch {
    return null;
  }
  const c = brut as Record<string, unknown>;
  if (typeof c !== 'object' || c === null) return null;
  if (c.u !== usageAttendu || typeof c.o !== 'string' || typeof c.e !== 'number' || typeof c.v !== 'number') return null;
  if (!(c.e > maintenant)) return null;
  return { usage: c.u, objet: c.o, echeance: c.e, version: c.v };
};

/** Une empreinte HMAC (sous-clé `empreintes`), en hexadécimal. Panne sans secret. */
export const empreinteHmac = async (env: Pick<Env, 'PORTES_SECRET'>, texte: string): Promise<string> => {
  const cle = await sousCle(exigerSecret(env), 'empreintes');
  const octets = new Uint8Array(await crypto.subtle.sign('HMAC', cle, encodeur.encode(texte)));
  return [...octets].map((o) => o.toString(16).padStart(2, '0')).join('');
};
