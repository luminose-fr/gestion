/**
 * La page d'essai de la recette (SPEC §14.5) — essai-recette.luminose.fr.
 *
 * Il n'existe pas de site de recette : cette page en tient lieu, sur une
 * origine DISTINCTE de celle de la porte, pour que CORS soit réellement essayé.
 * HTML et JS sans dépendance. Aucune donnée réelle : l'identité préremplie est
 * fictive, et aucun numéro de téléphone réel n'y figure.
 *
 * Le jeton du lien (`#r=…`) est retiré de l'adresse et de l'historique AVANT
 * tout appel, et gardé en mémoire seulement — rien dans le stockage du
 * navigateur (§15.2, règle 5, par analogie). Un test lit ce code et le vérifie.
 */

/** Le script de la page. `__PORTE__` est remplacé par l'origine de la porte, encodée en JSON. */
export const SCRIPT = String.raw`
(() => {
  'use strict';
  const PORTE = __PORTE__;

  // 1. Le jeton, lu après le « # », puis retiré aussitôt de l'adresse et de l'historique.
  const lu = /^#r=([A-Za-z0-9._-]{1,512})$/.exec(location.hash);
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  const reference = lu ? lu[1] : null;

  const $ = (id) => document.getElementById(id);
  const montrer = (id) => { for (const x of ['verification', 'invalide', 'ferme', 'panne', 'formulaire']) $(x).hidden = x !== id; };
  const brut = (statut, texte) => { $('brut').textContent = 'HTTP ' + statut + (texte ? '\n' + texte : ' (corps vide)'); };

  /** Un appel à la porte : le statut, le texte, et le corps lu s'il est en JSON. */
  const appeler = async (chemin, corps) => {
    try {
      const r = await fetch(PORTE + chemin, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: corps });
      const texte = await r.text();
      let json = null;
      try { json = texte ? JSON.parse(texte) : null; } catch { json = null; }
      return { statut: r.status, texte, json };
    } catch {
      return { statut: 0, texte: 'réseau injoignable', json: null };
    }
  };

  // 2. La clé de l'envoi : fabriquée une fois par formulaire, gardée pour un renvoi.
  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
  const nouvelleCle = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), (o) => ALPHABET[o % 64]).join('');
  const cle = nouvelleCle();
  let dernierEnvoi = null;

  const envoi = () => {
    const corps = {
      cle,
      contexte: 'seance',
      version: 'complet',
      version_formulaire: 'essai-1',
      identite: { prenom: $('prenom').value, nom: $('nom').value, email: $('email').value },
      reponses: [{ cle: 'essai.question', libelle: 'Question d’essai', reponse: $('reponse').value }],
      declaration: true,
      accord: { accepte: true, version: 1 },
      site_web: $('site_web').value,
    };
    if (reference) corps.reference = reference;
    return JSON.stringify(corps);
  };

  const envoyer = async (corps) => {
    dernierEnvoi = corps;
    $('renvoyer').disabled = false;
    const r = await appeler('/v1/questionnaires', corps);
    brut(r.statut, r.texte);
  };

  $('formulaire').addEventListener('submit', (e) => { e.preventDefault(); envoyer(envoi()); });
  $('renvoyer').addEventListener('click', () => { if (dernierEnvoi) envoyer(dernierEnvoi); });
  $('mode').textContent = reference ? 'Lien avec référence' : 'Lien nu (sans référence) : l’envoi sera « à rapprocher »';

  // 3. À l'ouverture : le lien vaut-il encore ? Avant toute saisie.
  const ouvrir = async () => {
    if (!reference) { montrer('formulaire'); return; }
    montrer('verification');
    const r = await appeler('/v1/questionnaires/lien', JSON.stringify({ reference }));
    brut(r.statut, r.texte);
    if (r.statut === 200 && r.json && r.json.ok === true) montrer('formulaire');
    else if (r.statut === 200 && r.json && r.json.motif === 'lien_invalide') montrer('invalide');
    else if (r.statut === 200 && r.json && r.json.motif === 'ferme') montrer('ferme');
    else montrer('panne');
  };
  ouvrir();
})();
`;

const STYLE = `
  body { font: 16px/1.5 system-ui, sans-serif; max-width: 40rem; margin: 2rem auto; padding: 0 1rem; color: #1f2933; }
  .bandeau { background: #fff4d6; border: 1px solid #e0b84c; padding: .5rem .75rem; border-radius: 6px; font-weight: 600; }
  label { display: block; margin-top: .75rem; font-weight: 500; }
  input, textarea { width: 100%; box-sizing: border-box; padding: .4rem; font: inherit; }
  .piege { position: absolute; left: -10000px; width: 1px; height: 1px; overflow: hidden; }
  button { margin-top: 1rem; margin-right: .5rem; padding: .5rem 1rem; font: inherit; }
  pre { background: #f3f4f6; padding: .75rem; border-radius: 6px; white-space: pre-wrap; }
`;

/** La page, pour une porte donnée. L'origine est encodée en JSON : jamais du HTML ni du JS brut. */
export const pageDEssai = (originePorte: string): string => `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Page d’essai — recette</title>
<style>${STYLE}</style>
</head>
<body>
<p class="bandeau">Page d’essai — recette. Données fictives seulement.</p>
<h1>Questionnaire d’essai</h1>
<p id="mode"></p>

<p id="verification" hidden>Vérification du lien…</p>
<div id="invalide" hidden>
  <h2>Ce lien n’est plus valable</h2>
  <p>Texte d’essai : sur le site, ce message invite à joindre Florent pour recevoir un nouveau lien.</p>
</div>
<div id="ferme" hidden>
  <h2>Le questionnaire est momentanément fermé</h2>
  <p>Texte d’essai : la porte est coupée dans Réglages.</p>
</div>
<div id="panne" hidden>
  <h2>Le service ne répond pas</h2>
  <p>Texte d’essai : sur le site, ce message dit d’appeler Florent (aucun numéro réel ici).</p>
</div>

<form id="formulaire" hidden autocomplete="off">
  <label for="prenom">Prénom</label><input id="prenom" value="Camille" required>
  <label for="nom">Nom</label><input id="nom" value="Essai">
  <label for="email">Adresse e-mail</label><input id="email" type="email" value="camille.essai@example.org" required>
  <label for="reponse">Réponse à la question d’essai</label><textarea id="reponse" rows="3">Réponse d’essai.</textarea>
  <div class="piege" aria-hidden="true"><label for="site_web">Site web</label><input id="site_web" tabindex="-1" autocomplete="off"></div>
  <button type="submit">Envoyer</button>
  <button type="button" id="renvoyer" disabled>Renvoyer le même envoi</button>
</form>

<h2>Réponse brute</h2>
<pre id="brut">—</pre>
<script>${SCRIPT.replace('__PORTE__', JSON.stringify(originePorte).replace(/</g, '\\u003c'))}</script>
</body>
</html>
`;

/**
 * Les en-têtes de la page. La CSP n'ouvre que la porte en `connect-src` : la
 * page ne peut rien envoyer ailleurs, ni être encadrée, ni soumettre un
 * formulaire classique.
 */
export const entetesDeLaPage = (originePorte: string): Record<string, string> => ({
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': [
    "default-src 'none'",
    "script-src 'unsafe-inline'",
    "style-src 'unsafe-inline'",
    `connect-src ${originePorte}`,
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; '),
});
