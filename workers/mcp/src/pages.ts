/**
 * Les deux seules pages HTML du serveur : le consentement, et le message qui
 * dit pourquoi une connexion s'arrête. Pas de script, pas de ressource externe.
 */

const echapper = (texte: string) =>
  texte.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * `frame-ancestors 'none'` : une page de consentement encadrée par un site
 * tiers se fait cliquer à l'insu de celui qui la voit. `form-action` inclut
 * Google parce que la réponse au formulaire y redirige, et que les
 * navigateurs appliquent la directive aux redirections.
 */
const SECURITE = {
  'Content-Type': 'text/html; charset=utf-8',
  'Content-Security-Policy':
    "default-src 'none'; style-src 'unsafe-inline'; form-action 'self' https://accounts.google.com; frame-ancestors 'none'; base-uri 'none'",
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
};

const gabarit = (titre: string, corps: string) => `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${echapper(titre)} — Luminose</title>
<style>
  :root { color-scheme: light dark; --fond: #fafaf9; --texte: #1c1917; --doux: #57534e; --bord: #e7e5e4; --alerte: #b45309; --bouton: #1c1917; --sur-bouton: #fafaf9; }
  @media (prefers-color-scheme: dark) { :root { --fond: #1c1917; --texte: #f5f5f4; --doux: #a8a29e; --bord: #44403c; --alerte: #fcd34d; --bouton: #f5f5f4; --sur-bouton: #1c1917; } }
  body { margin: 0; background: var(--fond); color: var(--texte); font: 16px/1.5 system-ui, -apple-system, sans-serif; }
  main { max-width: 28rem; margin: 4rem auto; padding: 0 1rem; }
  h1 { font-size: 1.25rem; margin: 0 0 1rem; }
  p { margin: 0 0 1rem; }
  .doux { color: var(--doux); font-size: 0.875rem; }
  .alerte { color: var(--alerte); border: 1px solid var(--alerte); border-radius: 8px; padding: 0.75rem; font-size: 0.875rem; }
  button { font: inherit; font-weight: 600; background: var(--bouton); color: var(--sur-bouton); border: 0; border-radius: 8px; padding: 0.75rem 1.25rem; cursor: pointer; }
  code { font-size: 0.875em; }
</style>
</head>
<body><main>
${corps}
</main></body>
</html>`;

export const page = (statut: number, titre: string, message: string, entetes: Record<string, string> = {}) =>
  new Response(gabarit(titre, `<h1>${echapper(titre)}</h1>\n<p>${echapper(message)}</p>`), {
    status: statut,
    headers: { ...SECURITE, ...entetes },
  });

/**
 * Le consentement que la spécification MCP exige d'un serveur qui relaie un
 * fournisseur d'identité avec un client unique : sans lui, un lien piégé vers
 * /authorize suffirait — Google ne redemande pas l'accord déjà donné, et le
 * code partirait sans que personne ait rien vu. L'hôte de retour s'affiche en
 * clair, et une boucle locale est signalée : n'importe quel programme de la
 * machine peut écouter un port.
 */
export const pageConsentement = (options: {
  client: string | undefined;
  hoteRetour: string;
  boucleLocale: boolean;
  jeton: string;
  cookie: string;
}) => {
  const client = options.client ? `<strong>${echapper(options.client)}</strong>` : 'Un client MCP';
  const corps = `<h1>Connecter Claude à Google Ads</h1>
<p>${client} demande à lire le compte Google Ads de Luminose. Lecture seule : aucune campagne, aucun budget, aucune annonce ne peut être modifié par ce serveur.</p>
<p>Après la connexion Google, vous serez renvoyé vers <strong>${echapper(options.hoteRetour)}</strong>.</p>
${options.boucleLocale
    ? `<p class="alerte">Cette adresse de retour est locale. N'autorisez que si vous venez de lancer la connexion depuis Claude Code ou l'inspecteur MCP, sur cette machine.</p>\n`
    : ''}<form method="post" action="/authorize">
<input type="hidden" name="n" value="${echapper(options.jeton)}">
<p><button type="submit">Continuer avec Google</button></p>
</form>
<p class="doux">Seule l'adresse autorisée peut aller au bout. Si vous n'avez pas lancé cette connexion, fermez cet onglet.</p>`;

  return new Response(gabarit('Connecter Claude à Google Ads', corps), {
    status: 200,
    headers: { ...SECURITE, 'Set-Cookie': options.cookie },
  });
};
