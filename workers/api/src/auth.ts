/**
 * Jeton de session signé (SPEC §7).
 *
 * Format : "<payload base64>.<signature base64>". Le payload reste lisible
 * côté client — le front y lit l'expiration — mais n'est plus falsifiable :
 * sans le secret, impossible de produire une signature valide.
 *
 * Repris tel quel du Worker d'avant migration, où il est couvert par 15 tests.
 */

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const encoder = new TextEncoder();

/**
 * SESSION_SECRET est le réglage recommandé ; AUTH_PASSWORD sert de repli pour
 * qu'un déploiement sans le nouveau secret ne casse pas la connexion.
 */
export const getSessionSecret = (env: { SESSION_SECRET?: string; AUTH_PASSWORD?: string }) =>
  env.SESSION_SECRET || env.AUTH_PASSWORD || '';

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const base64ToBytes = (value: string) =>
  Uint8Array.from(atob(value), (c) => c.charCodeAt(0));

const importSigningKey = (secret: string) =>
  crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);

export const createSessionToken = async (env: { SESSION_SECRET?: string; AUTH_PASSWORD?: string }) => {
  const payloadB64 = btoa(JSON.stringify({
    token: crypto.randomUUID(),
    expiresAt: Date.now() + SESSION_TTL_MS,
  }));
  const key = await importSigningKey(getSessionSecret(env));
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payloadB64));
  return `${payloadB64}.${bytesToBase64(new Uint8Array(signature))}`;
};

export type TokenCheck = { valid: true } | { valid: false; error: string };

export const verifySessionToken = async (
  sessionToken: string | null,
  env: { SESSION_SECRET?: string; AUTH_PASSWORD?: string }
): Promise<TokenCheck> => {
  const secret = getSessionSecret(env);
  if (!secret) return { valid: false, error: 'Worker mal configuré : aucun secret de signature' };
  if (!sessionToken) return { valid: false, error: 'Token manquant' };

  const separator = sessionToken.lastIndexOf('.');
  if (separator <= 0) return { valid: false, error: 'Token invalide' };

  const payloadB64 = sessionToken.slice(0, separator);
  const signatureB64 = sessionToken.slice(separator + 1);

  let signatureBytes: Uint8Array;
  try {
    signatureBytes = base64ToBytes(signatureB64);
  } catch {
    return { valid: false, error: 'Token invalide' };
  }

  // crypto.subtle.verify compare en temps constant
  const key = await importSigningKey(secret);
  const ok = await crypto.subtle.verify('HMAC', key, signatureBytes, encoder.encode(payloadB64));
  if (!ok) return { valid: false, error: 'Signature invalide' };

  try {
    const data = JSON.parse(atob(payloadB64));
    if (typeof data.expiresAt !== 'number' || !Number.isFinite(data.expiresAt) || typeof data.token !== 'string' || !data.token) {
      return { valid: false, error: 'Token invalide' };
    }
    if (Date.now() >= data.expiresAt) return { valid: false, error: 'Session expirée' };
    return { valid: true };
  } catch {
    return { valid: false, error: 'Token invalide' };
  }
};

export const empreinteSession = async (texte: string): Promise<string> =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(texte))), b => b.toString(16).padStart(2, '0')).join('');

/** Le nom __Host- empêche un autre sous-domaine de remplacer la session. */
const nomCookie = (url: string) => new URL(url).protocol === 'https:' ? '__Host-luminose-session' : 'luminose_dev_session';

export const sessionDe = (req: Request): string | null => {
  const nom = nomCookie(req.url);
  const morceau = (req.headers.get('Cookie') ?? '').split(';').map(x => x.trim()).find(x => x.startsWith(`${nom}=`));
  if (morceau) {
    try { return decodeURIComponent(morceau.slice(nom.length + 1)); } catch { return null; }
  }
  return req.headers.get('X-Session-Token') || null;
};

export const cookieSession = (url: string, jeton: string, age = SESSION_TTL_MS / 1000): string =>
  `${nomCookie(url)}=${encodeURIComponent(jeton)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${new URL(url).protocol === 'https:' ? '; Secure' : ''}`;

export const expirationSession = (jeton: string): number => JSON.parse(atob(jeton.slice(0, jeton.lastIndexOf('.')))).expiresAt;
