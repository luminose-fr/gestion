/**
 * L'agenda Google de Florent (SPEC §14.4, §14.12 — contrat §3.1).
 *
 * Choix de Florent du 27/11/2026 : son compte Google Workspace (luminose.fr),
 * l'agenda principal seul pour les indisponibilités, l'agenda principal pour
 * écrire, et un lien Google Meet créé pour un rendez-vous en visio.
 *
 * **Une connexion OAuth, faite une fois par Florent** (Réglages → Agenda
 * Google) : il pose l'identifiant et le secret de son client OAuth, puis
 * autorise gestion chez Google. Gestion garde le jeton de renouvellement. Les
 * trois valeurs vivent dans `app_settings`, sous le préfixe des clés
 * (`provider_key:`, §5.5) : **aucune route ne les relit**, et l'export les
 * exclut. Le secret et le jeton ne sortent jamais du Worker.
 *
 * Sans connexion, gestion fait comme avant : pas de lecture, pas d'écriture
 * (`relie` faux). Connecté, une lecture qui échoue est une **panne** — rien
 * n'est réservé sur un agenda illisible (contrat §2).
 *
 * Ce module ne nomme aucune table sensible ; il reçoit ce qu'il écrit.
 */
import type { Env } from '../env';

export const CLE_CLIENT_ID = 'provider_key:google_agenda_client_id';
export const CLE_CLIENT_SECRET = 'provider_key:google_agenda_client_secret';
export const CLE_RENOUVELLEMENT = 'provider_key:google_agenda_renouvellement';
/** L'adresse du compte connecté : ce que l'écran affiche. Pas un secret. */
export const CLE_COMPTE = 'agenda_google_compte';

/** Lire et écrire les évènements, lire les disponibilités de l'agenda. Rien d'autre. */
export const PORTEES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.freebusy',
  'openid',
  'email',
];

const JETONS = 'https://oauth2.googleapis.com/token';
const CALENDRIER = 'https://www.googleapis.com/calendar/v3';
const DELAI_MS = 8_000;

export type Configuration = { clientId: string | null; clientSecret: string | null; renouvellement: string | null; compte: string | null };

/** 1 requête : les quatre valeurs d'un coup. */
export const lireConfiguration = async (env: Env): Promise<Configuration> => {
  if (!env.DB) return { clientId: null, clientSecret: null, renouvellement: null, compte: null };
  const { results } = await env.DB.prepare('SELECT key, value FROM app_settings WHERE key IN (?1, ?2, ?3, ?4)')
    .bind(CLE_CLIENT_ID, CLE_CLIENT_SECRET, CLE_RENOUVELLEMENT, CLE_COMPTE).all<{ key: string; value: string }>();
  const v = (k: string) => results.find((r) => r.key === k)?.value?.trim() || null;
  return {
    clientId: v(CLE_CLIENT_ID) ?? (env.GOOGLE_CLIENT_ID?.trim() || null),
    clientSecret: v(CLE_CLIENT_SECRET) ?? (env.GOOGLE_CLIENT_SECRET?.trim() || null),
    renouvellement: v(CLE_RENOUVELLEMENT),
    compte: v(CLE_COMPTE),
  };
};

export const poser = (env: Env, cle: string, valeur: string | null, maintenant: number) =>
  valeur === null
    ? env.DB.prepare('DELETE FROM app_settings WHERE key = ?1').bind(cle)
    : env.DB.prepare(`INSERT INTO app_settings (key, value, updated_at) VALUES (?1, ?2, ?3)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`).bind(cle, valeur, maintenant);

const appeler = async (url: string, init: RequestInit): Promise<Response> => {
  const controle = new AbortController();
  const minuterie = setTimeout(() => controle.abort(), DELAI_MS);
  try {
    return await fetch(url, { ...init, signal: controle.signal });
  } finally {
    clearTimeout(minuterie);
  }
};

/** Échanger le code de l'autorisation contre les jetons (le retour de Google). */
export const echangerLeCode = async (c: Configuration, code: string, redirection: string) => {
  const r = await appeler(JETONS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: c.clientId ?? '', client_secret: c.clientSecret ?? '', redirect_uri: redirection, grant_type: 'authorization_code',
    }),
  });
  if (!r.ok) throw new Error(`agenda.echange_${r.status}`);
  const j = await r.json() as { refresh_token?: string; id_token?: string };
  if (!j.refresh_token) throw new Error('agenda.sans_renouvellement');
  // L'adresse du compte, lue dans le jeton d'identité que Google vient de rendre — sans le vérifier :
  // elle ne sert qu'à l'afficher, jamais à décider.
  let compte: string | null = null;
  try {
    const charge = JSON.parse(atob((j.id_token ?? '').split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    compte = typeof charge.email === 'string' ? charge.email : null;
  } catch { /* sans adresse, l'écran dit seulement « connecté » */ }
  return { renouvellement: j.refresh_token, compte };
};

/** Un jeton d'accès, à partir du jeton de renouvellement. */
const jetonDAcces = async (c: Configuration): Promise<string> => {
  const r = await appeler(JETONS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: c.clientId ?? '', client_secret: c.clientSecret ?? '', refresh_token: c.renouvellement ?? '', grant_type: 'refresh_token',
    }),
  });
  if (!r.ok) throw new Error(`agenda.renouvellement_${r.status}`);
  const j = await r.json() as { access_token?: string };
  if (!j.access_token) throw new Error('agenda.sans_acces');
  return j.access_token;
};

/** L'agenda est-il relié : identifiant, secret et autorisation présents. */
export const estRelie = (c: Configuration) => !!(c.clientId && c.clientSecret && c.renouvellement);

/** Un accès à l'agenda, pour une invocation : le jeton est demandé une fois. */
export type Agenda = {
  occupe: (debut: number, fin: number) => Promise<{ debut: number; fin: number }[]>;
  ecrire: (r: RendezVous) => Promise<{ evenementId: string; visioUrl: string | null }>;
};

export type RendezVous = {
  /** Sert aussi de `requestId` du lien Meet : rejouée, l'écriture ne crée pas un second lien. */
  seanceId: string;
  titre: string;
  description: string;
  debut: number;
  fin: number;
  visio: boolean;
};

/** `null` : l'agenda n'est pas relié, gestion fait sans lui. */
export const ouvrirAgenda = async (env: Env): Promise<Agenda | null> => {
  const c = await lireConfiguration(env);
  if (!estRelie(c)) return null;
  let jeton: string | null = null;
  const entetes = async () => {
    jeton ??= await jetonDAcces(c);
    return { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' };
  };
  return {
    occupe: async (debut, fin) => {
      const r = await appeler(`${CALENDRIER}/freeBusy`, {
        method: 'POST', headers: await entetes(),
        body: JSON.stringify({ timeMin: new Date(debut).toISOString(), timeMax: new Date(fin).toISOString(), items: [{ id: 'primary' }] }),
      });
      if (!r.ok) throw new Error(`agenda.lecture_${r.status}`);
      const j = await r.json() as { calendars?: { primary?: { busy?: { start: string; end: string }[]; errors?: unknown[] } } };
      const p = j.calendars?.primary;
      if (!p || (p.errors && p.errors.length)) throw new Error('agenda.lecture_illisible');
      return (p.busy ?? []).map((b) => ({ debut: Date.parse(b.start), fin: Date.parse(b.end) }));
    },
    ecrire: async (rv) => {
      const evenement: Record<string, unknown> = {
        summary: rv.titre,
        description: rv.description,
        start: { dateTime: new Date(rv.debut).toISOString(), timeZone: 'Europe/Paris' },
        end: { dateTime: new Date(rv.fin).toISOString(), timeZone: 'Europe/Paris' },
        // L'identifiant de la séance, pour retrouver l'évènement et ne pas l'écrire deux fois.
        extendedProperties: { private: { luminose_seance: rv.seanceId } },
      };
      if (rv.visio) {
        evenement.conferenceData = { createRequest: { requestId: rv.seanceId, conferenceSolutionKey: { type: 'hangoutsMeet' } } };
      }
      const r = await appeler(`${CALENDRIER}/calendars/primary/events?conferenceDataVersion=1&sendUpdates=none`, {
        method: 'POST', headers: await entetes(), body: JSON.stringify(evenement),
      });
      if (!r.ok) throw new Error(`agenda.ecriture_${r.status}`);
      const j = await r.json() as { id?: string; hangoutLink?: string };
      if (!j.id) throw new Error('agenda.ecriture_sans_id');
      return { evenementId: j.id, visioUrl: j.hangoutLink ?? null };
    },
  };
};
