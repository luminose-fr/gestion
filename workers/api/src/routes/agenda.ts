/**
 * Relier l'agenda Google (SPEC §14.12) — `/api/agenda`.
 *
 *   GET    /api/agenda           l'état : client posé, agenda relié, compte
 *   PUT    /api/agenda/client    poser l'identifiant et le secret du client OAuth
 *   GET    /api/agenda/connexion partir chez Google autoriser gestion (navigation, pas fetch)
 *   GET    /api/agenda/retour    le retour de Google — HORS session, voir plus bas
 *   DELETE /api/agenda           oublier l'autorisation
 *
 * **Le secret et le jeton de renouvellement n'ont aucun chemin de retour**
 * (§5.5) : l'état ne dit que « posé » et le compte connecté.
 *
 * **Le retour de Google ne porte pas la session** : le cookie est `SameSite=Strict`,
 * et la navigation vient de accounts.google.com. Il est donc exempté de la
 * session (index.ts), et c'est l'`état` qui l'authentifie : signé par gestion
 * avec le secret des sessions, échu en dix minutes, il n'a pu être fabriqué que
 * par `/connexion`, qui exige la session.
 */
import { z } from 'zod';
import type { Env } from '../env';
import { Refus } from '../refus';
import { famille, corps } from './clients-commun';
import {
  lireConfiguration, poser, echangerLeCode, estRelie, PORTEES,
  CLE_CLIENT_ID, CLE_CLIENT_SECRET, CLE_RENOUVELLEMENT, CLE_COMPTE,
} from '../clients/agenda';

export const agenda = famille();

const DIX_MINUTES = 10 * 60_000;
const encodeur = new TextEncoder();
const base64url = (o: Uint8Array) => btoa(String.fromCharCode(...o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const cleEtat = (env: Env) =>
  crypto.subtle.importKey('raw', encodeur.encode(`luminose/agenda/${env.SESSION_SECRET || env.AUTH_PASSWORD}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);

const signerAvec = async (env: Env, charge: string) =>
  base64url(new Uint8Array(await crypto.subtle.sign('HMAC', await cleEtat(env), encodeur.encode(charge))));

const signerEtat = async (env: Env, echeance: number) => {
  const charge = `${echeance}.${base64url(crypto.getRandomValues(new Uint8Array(12)))}`;
  return `${charge}.${await signerAvec(env, charge)}`;
};

const etatValable = async (env: Env, etat: string, maintenant: number) => {
  const morceaux = etat.split('.');
  if (morceaux.length !== 3) return false;
  const [echeance, alea, signature] = morceaux;
  if (!(Number(echeance) > maintenant)) return false;
  const attendue = await signerAvec(env, `${echeance}.${alea}`);
  // Même longueur, comparaison sans court-circuit.
  if (attendue.length !== signature.length) return false;
  let ecart = 0;
  for (let i = 0; i < attendue.length; i++) ecart |= attendue.charCodeAt(i) ^ signature.charCodeAt(i);
  return ecart === 0;
};

/** L'adresse de retour : celle de cet environnement, telle que Google l'a enregistrée. */
const retour = (url: string) => `${new URL(url).origin}/api/agenda/retour`;

agenda.get('/', async (c) => {
  const conf = await lireConfiguration(c.env);
  return c.json({ clientPose: !!(conf.clientId && conf.clientSecret), relie: estRelie(conf), compte: estRelie(conf) ? conf.compte : null });
});

const Client = z.strictObject({ clientId: z.string().trim().min(10).max(200), clientSecret: z.string().trim().min(10).max(200) });

agenda.put('/client', async (c) => {
  const { clientId, clientSecret } = await corps(c, Client);
  const maintenant = Date.now();
  // Un autre client : l'ancienne autorisation ne vaut plus pour lui.
  await c.env.DB.batch([
    poser(c.env, CLE_CLIENT_ID, clientId, maintenant),
    poser(c.env, CLE_CLIENT_SECRET, clientSecret, maintenant),
    poser(c.env, CLE_RENOUVELLEMENT, null, maintenant),
    poser(c.env, CLE_COMPTE, null, maintenant),
  ]);
  return c.json({ clientPose: true, relie: false, compte: null });
});

agenda.get('/connexion', async (c) => {
  const conf = await lireConfiguration(c.env);
  if (!conf.clientId || !conf.clientSecret) throw new Refus('Posez d’abord l’identifiant et le secret du client OAuth.', 409);
  const adresse = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  adresse.search = new URLSearchParams({
    client_id: conf.clientId, redirect_uri: retour(c.req.url), response_type: 'code', scope: PORTEES.join(' '),
    access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true',
    state: await signerEtat(c.env, Date.now() + DIX_MINUTES),
  }).toString();
  return c.redirect(adresse.toString(), 302);
});

/** Hors session (voir l'en-tête) : l'état signé seul l'authentifie. Revient toujours à l'écran des réglages. */
agenda.get('/retour', async (c) => {
  const ecran = (issue: string) => c.redirect(`${new URL(c.req.url).origin}/#reglages/agenda?agenda=${issue}`, 302);
  const code = c.req.query('code');
  const etat = c.req.query('state') ?? '';
  if (!(await etatValable(c.env, etat, Date.now()))) return ecran('lien_echu');
  if (!code) return ecran('refuse');
  const conf = await lireConfiguration(c.env);
  try {
    const { renouvellement, compte } = await echangerLeCode(conf, code, retour(c.req.url));
    const maintenant = Date.now();
    await c.env.DB.batch([poser(c.env, CLE_RENOUVELLEMENT, renouvellement, maintenant), poser(c.env, CLE_COMPTE, compte, maintenant)]);
    return ecran('relie');
  } catch (erreur) {
    // Un code fixe, jamais la réponse de Google : elle peut porter des jetons.
    console.error(erreur instanceof Error && erreur.message.startsWith('agenda.') ? erreur.message : 'agenda.echange');
    return ecran('echec');
  }
});

agenda.delete('/', async (c) => {
  const maintenant = Date.now();
  await c.env.DB.batch([poser(c.env, CLE_RENOUVELLEMENT, null, maintenant), poser(c.env, CLE_COMPTE, null, maintenant)]);
  return c.json({ relie: false });
});
