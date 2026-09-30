#!/usr/bin/env node
/**
 * Obtenir, une fois, le refresh token de la couche B (scope `adwords`).
 *
 *   node workers/mcp/scripts/jeton-google-ads.mjs
 *
 * SUR LE MAC, là où s'ouvre le navigateur : Google renvoie sur
 * http://localhost:8976/retour, qui doit être la machine du navigateur. Rien à
 * installer — Node seul, aucune dépendance, `node_modules` n'est pas touché.
 *
 * Lit GOOGLE_OAUTH_CLIENT_ID et GOOGLE_OAUTH_CLIENT_SECRET dans
 * l'environnement, sinon dans workers/mcp/.dev.vars.
 *
 * N'ÉCRIT RIEN SUR DISQUE. Il affiche le jeton ; on le pose soi-même avec
 * `wrangler secret put`. Un jeton qui traîne dans un fichier finit dans une
 * sauvegarde, un commit ou un partage d'écran.
 *
 * Se connecter avec le compte qui a accès à Google Ads : florent@luminose.fr.
 * L'écran de consentement « Interne » garantit un jeton qui n'expire pas au
 * bout de sept jours.
 */
import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

const PORT = 8976;
const RETOUR = `http://localhost:${PORT}/retour`;
const SCOPE = 'https://www.googleapis.com/auth/adwords';
const DELAI = 5 * 60 * 1000;

// La version de l'API s'écrit à un seul endroit, src/google-ads.ts. On l'y
// lit plutôt que de la recopier : une copie finirait par mentir.
const VERSION_API = readFileSync(new URL('../src/google-ads.ts', import.meta.url), 'utf8')
  .match(/export const VERSION_API = '(v\d+)'/)?.[1];

const base64url = (octets) => octets.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const lireDevVars = () => {
  try {
    const texte = readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8');
    return Object.fromEntries(texte.split('\n')
      .map((ligne) => ligne.match(/^\s*([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/))
      .filter(Boolean)
      .map(([, cle, valeur]) => [cle, valeur]));
  } catch {
    return {};
  }
};

const devVars = lireDevVars();
const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID ?? devVars.GOOGLE_OAUTH_CLIENT_ID;
const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? devVars.GOOGLE_OAUTH_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error(
    'GOOGLE_OAUTH_CLIENT_ID et GOOGLE_OAUTH_CLIENT_SECRET sont introuvables.\n' +
    "Renseignez-les dans workers/mcp/.dev.vars (modèle : .dev.vars.example), ou dans l'environnement.",
  );
  process.exit(1);
}

const verificateur = base64url(randomBytes(32));
const etat = base64url(randomBytes(16));

const autorisation = new URL('https://accounts.google.com/o/oauth2/v2/auth');
autorisation.search = new URLSearchParams({
  client_id: clientId,
  redirect_uri: RETOUR,
  response_type: 'code',
  scope: SCOPE,
  // `offline` + `consent` : sans eux, Google ne rend pas de refresh token
  // à un compte qui a déjà autorisé ce client une fois.
  access_type: 'offline',
  prompt: 'consent',
  state: etat,
  code_challenge: base64url(createHash('sha256').update(verificateur).digest()),
  code_challenge_method: 'S256',
}).toString();

const page = (titre, texte) =>
  `<!doctype html><meta charset="utf-8"><title>${titre}</title>` +
  `<body style="font:16px/1.5 system-ui;max-width:28rem;margin:4rem auto;padding:0 1rem"><h1 style="font-size:1.25rem">${titre}</h1><p>${texte}</p>`;

const echanger = async (code) => {
  const reponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: RETOUR,
      code_verifier: verificateur,
    }),
  });
  const corps = await reponse.json().catch(() => ({}));
  if (!reponse.ok) throw new Error(`Google refuse l'échange : ${corps.error ?? reponse.status} ${corps.error_description ?? ''}`);
  return corps;
};

/** Vérification immédiate : le projet Cloud a-t-il bien accès à l'API ? */
const verifierAcces = async (acces) => {
  if (!VERSION_API) return console.log('\n(Version de l’API introuvable dans src/google-ads.ts : vérification sautée.)');
  const reponse = await fetch(`https://googleads.googleapis.com/${VERSION_API}/customers:listAccessibleCustomers`, {
    headers: { Authorization: `Bearer ${acces}` },
  });
  const texte = await reponse.text();
  if (reponse.ok) {
    const { resourceNames = [] } = JSON.parse(texte);
    console.log(`\nAccès à l'API Google Ads ${VERSION_API} : OK. Comptes visibles directement :`);
    for (const nom of resourceNames) console.log(`  - ${nom.replace('customers/', '')}`);
    if (resourceNames.length === 0) console.log('  (aucun : l’accès passe peut-être par un compte administrateur)');
  } else {
    console.log(`\nLe jeton est valide, mais l'API Google Ads répond HTTP ${reponse.status} :\n${texte.slice(0, 1500)}`);
    console.log("\nCauses fréquentes : API non activée dans le projet Cloud, niveau d'accès Explorer pas encore accordé.");
  }
};

const serveurs = [];
const arreter = (codeSortie) => {
  for (const s of serveurs) s.close();
  setTimeout(() => process.exit(codeSortie), 100);
};

const traiter = async (requete, reponse) => {
  const url = new URL(requete.url, RETOUR);
  if (url.pathname !== '/retour') {
    reponse.writeHead(404).end();
    return;
  }
  const html = (statut, titre, texte) => reponse.writeHead(statut, { 'Content-Type': 'text/html; charset=utf-8' }).end(page(titre, texte));

  if (url.searchParams.get('state') !== etat) {
    html(400, 'Retour inattendu', 'Ce retour ne correspond pas à la demande en cours.');
    return;
  }
  if (url.searchParams.get('error')) {
    html(400, 'Autorisation refusée', `Google : ${url.searchParams.get('error')}.`);
    console.error(`\nGoogle a refusé : ${url.searchParams.get('error')}`);
    arreter(1);
    return;
  }

  try {
    const jetons = await echanger(url.searchParams.get('code'));
    if (!jetons.refresh_token) {
      throw new Error("Google n'a pas rendu de refresh token. Révoquez l'accès de ce client sur myaccount.google.com/permissions, puis relancez.");
    }
    html(200, 'Jeton obtenu', 'Vous pouvez fermer cet onglet et revenir au terminal.');
    await verifierAcces(jetons.access_token);
    console.log(
      '\n──────────── GOOGLE_ADS_REFRESH_TOKEN ────────────\n' +
      `${jetons.refresh_token}\n` +
      '──────────────────────────────────────────────────\n\n' +
      'À poser depuis la VM, sans l’écrire ailleurs :\n' +
      '  cd workers/mcp && npx wrangler secret put GOOGLE_ADS_REFRESH_TOKEN\n\n' +
      'Pour le développement local, la même valeur va dans workers/mcp/.dev.vars.',
    );
    arreter(0);
  } catch (e) {
    html(500, 'Échec', 'Voir le terminal.');
    console.error(`\n${e.message}`);
    arreter(1);
  }
};

// `localhost` peut se résoudre en IPv4 comme en IPv6 selon le navigateur :
// on écoute les deux boucles, et rien d'autre — pas d'interface réseau.
for (const hote of ['127.0.0.1', '::1']) {
  const serveur = createServer((requete, reponse) => { traiter(requete, reponse); });
  serveur.on('error', (e) => { if (hote === '127.0.0.1') { console.error(`Port ${PORT} indisponible : ${e.message}`); process.exit(1); } });
  serveur.listen(PORT, hote);
  serveurs.push(serveur);
}

console.log(`Ouvrez cette adresse, connecté en florent@luminose.fr :\n\n${autorisation}\n`);
console.log(`(L'URL de retour ${RETOUR} doit être déclarée dans le client OAuth Google.)`);
const ouvrir = process.platform === 'darwin' ? 'open' : process.platform === 'linux' ? 'xdg-open' : null;
if (ouvrir) spawn(ouvrir, [autorisation.toString()], { stdio: 'ignore', detached: true }).on('error', () => {}).unref();

setTimeout(() => {
  console.error('\nAucun retour de Google au bout de cinq minutes : abandon.');
  arreter(1);
}, DELAI).unref();
