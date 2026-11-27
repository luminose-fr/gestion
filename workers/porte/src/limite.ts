/**
 * La limite de fréquence (SPEC §14.5) : liaison `ratelimits`, clé = SHA-256 de
 * l'adresse IP et de la route.
 *
 * **Elle écarte le bruit, elle ne borne rien** : approchée et comptée par
 * centre de données. Les vraies bornes sont dans gestion, et ce sont des
 * réglages (`commandes_questionnaire_max_jour`…).
 *
 * L'adresse n'est jamais gardée ni journalisée, même hachée : elle sert à
 * calculer la clé, et la clé ne sort pas de ce module.
 */
import type { Limiteur } from './env.ts';

const encodeur = new TextEncoder();

const empreinte = async (texte: string): Promise<string> =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', encodeur.encode(texte)))]
    .map((o) => o.toString(16).padStart(2, '0')).join('');

/** `true` : la limite est atteinte pour cette adresse sur cette route. */
export const limiteAtteinte = async (limiteur: Limiteur, requete: Request, route: string): Promise<boolean> => {
  // Sans adresse (une requête qui ne vient pas de Cloudflare — les tests, `wrangler dev`) : une clé commune.
  const adresse = requete.headers.get('CF-Connecting-IP') ?? 'sans-adresse';
  const { success } = await limiteur.limit({ key: await empreinte(`${route}\n${adresse}`) });
  return !success;
};
