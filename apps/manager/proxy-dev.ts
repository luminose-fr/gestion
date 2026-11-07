/**
 * L'origine que le proxy de développement présente au Worker.
 *
 * En production, la page et l'API partagent UNE origine (SPEC §1.2) : le
 * navigateur envoie `Origin: https://gestion.luminose.fr` à un Worker qui
 * répond sur cette même origine, et la vérification des écritures (SPEC §7)
 * passe d'elle-même. En local, le proxy de Vite relie deux origines — la
 * page sur :7860, `wrangler dev` sur :8787 — et `changeOrigin` ne réécrit
 * que `Host`, jamais `Origin`. Depuis la correction d'audit du 31/10/2026, le
 * Worker refusait donc la connexion locale : « Origine refusée ».
 *
 * La réparation vit ICI, et non dans une liste élargie côté Worker, pour deux
 * raisons :
 *   - le §1.2 l'interdit en toutes lettres : « plus d'origine de
 *     développement à déclarer ». Une exception pour `localhost` dans le code
 *     de production serait une dette de sécurité déployée partout pour servir
 *     un seul poste ;
 *   - c'est le proxy qui crée l'écart, c'est donc à lui de le refermer. Il
 *     joue en local le rôle de la route Cloudflare : faire d'une requête de
 *     la page une requête de même origine pour le Worker.
 *
 * Seule la page servie par CE serveur Vite est traduite. Une origine
 * étrangère traverse le proxy telle quelle, et le Worker la refuse comme en
 * production : réécrire sans condition ferait du serveur de développement un
 * blanchisseur d'origine pour n'importe quel site ouvert dans le navigateur.
 * Une requête sans `Origin` reste sans `Origin` — le Worker l'accepte déjà,
 * et en inventer une ne prouverait rien.
 *
 * Renvoie l'origine à poser, ou `undefined` pour laisser l'en-tête intact.
 */
export const origineVueParLeWorker = (
  origine: string | undefined,
  hote: string | undefined,
  cible: string,
): string | undefined => {
  if (!origine || !hote) return undefined;
  let page: URL;
  try { page = new URL(origine); } catch { return undefined; }
  // `host` et non `origin` : l'en-tête Host ne porte pas le schéma, et le
  // serveur Vite peut tourner en http comme en https.
  return page.host === hote ? new URL(cible).origin : undefined;
};
