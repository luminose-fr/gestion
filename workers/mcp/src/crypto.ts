/**
 * Ce que la couche A garde en propre : signer le cookie de connexion, et le
 * défi PKCE de notre échange avec Google. Rien que Web Crypto — disponible tel
 * quel dans le Worker comme dans les tests.
 */

const encodeur = new TextEncoder();

export const base64url = (octets: Uint8Array): string => {
  let binaire = '';
  for (const octet of octets) binaire += String.fromCharCode(octet);
  return btoa(binaire).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export const depuisBase64url = (texte: string): Uint8Array => {
  const b64 = texte.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((texte.length + 3) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
};

/** 32 octets par défaut : 256 bits, hors de portée de toute énumération. */
export const aleatoire = (octets = 32): string =>
  base64url(crypto.getRandomValues(new Uint8Array(octets)));

/** SHA-256 en base64url : exactement le défi PKCE S256. */
export const empreinte = async (texte: string): Promise<string> =>
  base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', encodeur.encode(texte))));

const cleHmac = (secret: string) =>
  crypto.subtle.importKey('raw', encodeur.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);

/**
 * `<charge base64url>.<signature>` — lisible, infalsifiable sans le secret.
 * La `nature` entre dans la signature : une valeur signée pour un usage ne
 * peut pas être présentée pour un autre.
 */
export const signer = async (nature: string, charge: unknown, secret: string): Promise<string> => {
  const corps = base64url(encodeur.encode(JSON.stringify(charge)));
  const signature = await crypto.subtle.sign('HMAC', await cleHmac(secret), encodeur.encode(`${nature}.${corps}`));
  return `${corps}.${base64url(new Uint8Array(signature))}`;
};

/** `null` pour tout ce qui n'est pas signé par nous, pour cette nature. Comparaison en temps constant. */
export const verifier = async <T>(nature: string, jeton: string, secret: string): Promise<T | null> => {
  const point = jeton.lastIndexOf('.');
  if (point <= 0) return null;
  const corps = jeton.slice(0, point);
  try {
    const signature = depuisBase64url(jeton.slice(point + 1));
    const valide = await crypto.subtle.verify('HMAC', await cleHmac(secret), signature, encodeur.encode(`${nature}.${corps}`));
    if (!valide) return null;
    return JSON.parse(new TextDecoder().decode(depuisBase64url(corps))) as T;
  } catch {
    return null;
  }
};
