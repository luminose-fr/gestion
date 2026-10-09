#!/usr/bin/env node
/**
 * Obtenir, une fois, le refresh token de la couche B (scope `adwords`) — ou,
 * avec `gtm`, celui de la couche D (scope `tagmanager.readonly` seul : ce
 * jeton ne peut ni modifier ni publier un conteneur) — ou, avec
 * `gtm-ecriture`, celui qui crée dans un espace de travail (scope
 * `tagmanager.edit.containers` seul : ni version ni publication).
 *
 *   node workers/mcp/scripts/jeton-google-ads.mjs                # Google Ads
 *   node workers/mcp/scripts/jeton-google-ads.mjs gtm            # Tag Manager, lire
 *   node workers/mcp/scripts/jeton-google-ads.mjs gtm-ecriture   # Tag Manager, préparer
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
 * Se connecter avec le compte qui a accès à Google Ads — ou à Tag Manager : florent@luminose.fr.
 * L'écran de consentement « Interne » garantit un jeton qui n'expire pas au
 * bout de sept jours.
 */
import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

const PORT = 8976;
const RETOUR = `http://localhost:${PORT}/retour`;
const DELAI = 5 * 60 * 1000;

const CIBLE = process.argv[2] ?? 'ads';
if (!['ads', 'gtm', 'gtm-ecriture'].includes(CIBLE)) {
  console.error(`Cible inconnue : ${CIBLE}. Rien (Google Ads), « gtm » (Tag Manager, lire) ou « gtm-ecriture » (Tag Manager, préparer).`);
  process.exit(1);
}
const GTM = CIBLE !== 'ads';
const ECRITURE = CIBLE === 'gtm-ecriture';
const SECRET = { ads: 'GOOGLE_ADS_REFRESH_TOKEN', gtm: 'GTM_REFRESH_TOKEN', 'gtm-ecriture': 'GTM_ECRITURE_REFRESH_TOKEN' }[CIBLE];

// La version de l'API Google Ads et le scope de Tag Manager s'écrivent chacun
// à un seul endroit, dans src/. On les y lit plutôt que de les recopier : une
// copie finirait par mentir.
const VERSION_API = readFileSync(new URL('../src/google-ads.ts', import.meta.url), 'utf8')
  .match(/export const VERSION_API = '(v\d+)'/)?.[1];
const SOURCE_GTM = readFileSync(new URL('../src/gtm.ts', import.meta.url), 'utf8');
const SCOPE_GTM = SOURCE_GTM.match(/export const SCOPE_GTM = '([^']+)'/)?.[1];
const SCOPE_GTM_ECRITURE = SOURCE_GTM.match(/export const SCOPE_GTM_ECRITURE = '([^']+)'/)?.[1];
const SCOPE = ECRITURE ? SCOPE_GTM_ECRITURE : GTM ? SCOPE_GTM : 'https://www.googleapis.com/auth/adwords';
if (!SCOPE) {
  console.error('Scope de Tag Manager introuvable dans src/gtm.ts.');
  process.exit(1);
}

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
  if (!reponse.ok) {
    throw new Error(`Google refuse l'échange : ${corps.error ?? reponse.status} ${corps.error_description ?? ''}` +
      (corps.error === 'invalid_grant' ? '\nLe code a déjà servi, ou il a expiré (quelques minutes) : relancez le script et ouvrez la nouvelle adresse.' : ''));
  }
  return corps;
};

/** Vérification immédiate pour Tag Manager : l'API répond-elle, et quels conteneurs ce compte voit-il ? */
const verifierGtm = async (acces) => {
  const api = 'https://tagmanager.googleapis.com/tagmanager/v2';
  const lire = async (chemin) => {
    const reponse = await fetch(api + chemin, { headers: { Authorization: `Bearer ${acces}` } });
    const texte = await reponse.text();
    if (!reponse.ok) throw new Error(`HTTP ${reponse.status} :\n${texte.slice(0, 1500)}`);
    return JSON.parse(texte);
  };
  try {
    const { account = [] } = await lire('/accounts');
    console.log("\nAccès à l'API Tag Manager : OK. Conteneurs visibles — l'identifiant GTM-… va dans GTM_CONTENEUR (wrangler.toml) :");
    for (const a of account) {
      const { container = [] } = await lire(`/accounts/${a.accountId}/containers`);
      for (const c of container) console.log(`  - ${c.publicId}  « ${c.name} »  ${(c.domainName ?? []).join(', ')}`);
    }
    if (account.length === 0) console.log('  (aucun : ce compte Google n’a accès à aucun compte Tag Manager)');
  } catch (e) {
    console.log(`\nLe jeton est valide, mais l'API Tag Manager répond ${e.message}`);
    console.log('\nCause fréquente : « Tag Manager API » non activée dans le projet Cloud du client OAuth.');
  }
};

/** Vérification immédiate : le projet Cloud a-t-il bien accès à l'API ? */
const verifierAcces = async (acces) => {
  if (GTM) return verifierGtm(acces);
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

/**
 * Un navigateur peut appeler deux fois la page de retour (rechargement,
 * préchargement). Le code ne s'échange qu'une fois : le second échange
 * échouait en invalid_grant et arrêtait le script pendant que le premier,
 * réussi, vérifiait encore l'accès — le jeton n'était jamais affiché
 * (08/10/2026). Seul le premier retour est traité.
 */
let recu = false;

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
  if (recu) {
    html(200, 'Déjà reçu', 'Ce retour est déjà traité : revenez au terminal.');
    return;
  }
  recu = true;
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
    // Ce que Google a réellement accordé — un accord antérieur peut s'y ajouter.
    // Le Worker refuserait un jeton de Tag Manager plus large que son scope
    // (gtm.ts, controleLecture et controleEcriture) : autant le dire ici.
    const accordes = String(jetons.scope ?? '').split(/\s+/).filter(Boolean);
    const deTrop = accordes.filter((s) => /\/auth\/tagmanager\./.test(s) && s !== SCOPE && !(ECRITURE && s === SCOPE_GTM));
    if (GTM && deTrop.length) {
      throw new Error(`Google a accordé à ce jeton, en plus de ${SCOPE} : ${deTrop.join(', ')}. Le Worker le refuserait.\n` +
        "Révoquez l'accès de ce client sur myaccount.google.com/permissions, puis relancez.");
    }
    html(200, 'Jeton obtenu', 'Vous pouvez fermer cet onglet et revenir au terminal.');
    // Le jeton d'abord : une vérification qui échoue ou s'éternise ne doit pas le perdre.
    console.log(
      `\n──────────── ${SECRET} ────────────\n` +
      `${jetons.refresh_token}\n` +
      '──────────────────────────────────────────────────\n\n' +
      'À poser depuis la VM, sans l’écrire ailleurs :\n' +
      `  cd workers/mcp && npx wrangler secret put ${SECRET}\n\n` +
      'Pour le développement local, la même valeur va dans workers/mcp/.dev.vars.',
    );
    await verifierAcces(jetons.access_token);
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

console.log(`${ECRITURE ? 'Google Tag Manager, préparer (ni version ni publication)' : GTM ? 'Google Tag Manager, lecture seule' : 'Google Ads'} — ` +
  `ouvrez cette adresse, connecté en florent@luminose.fr :\n\n${autorisation}\n`);
console.log(`(L'URL de retour ${RETOUR} doit être déclarée dans le client OAuth Google.)`);
const ouvrir = process.platform === 'darwin' ? 'open' : process.platform === 'linux' ? 'xdg-open' : null;
if (ouvrir) spawn(ouvrir, [autorisation.toString()], { stdio: 'ignore', detached: true }).on('error', () => {}).unref();

setTimeout(() => {
  console.error('\nAucun retour de Google au bout de cinq minutes : abandon.');
  arreter(1);
}, DELAI).unref();
