/**
 * Après un déploiement, un onglet resté ouvert demande des morceaux de
 * l'ancienne version que la nouvelle a retirés ; Pages lui répond par la page
 * HTML, et l'écran reste blanc. Constaté en recette le 28/11/2026. Le remède
 * est de recharger : une fois, jamais en boucle — si le morceau manque encore
 * trente secondes plus tard, c'est une vraie panne, et l'écran d'erreur la dit.
 */
const CLE = 'luminose-rechargement-apres-deploiement';

export const estUnMorceauPerime = (e: unknown) =>
  /dynamically imported module|Importing a module script failed|error loading dynamically imported/i.test(e instanceof Error ? e.message : String(e));

/** Vrai si la page se recharge. */
export const rechargerUneFois = (): boolean => {
  const dernier = Number(sessionStorage.getItem(CLE) ?? 0);
  if (Date.now() - dernier < 30_000) return false;
  sessionStorage.setItem(CLE, String(Date.now()));
  window.location.reload();
  return true;
};

export const surveillerLesMorceaux = () => {
  window.addEventListener('vite:preloadError', (e) => { if (rechargerUneFois()) e.preventDefault(); });
};
