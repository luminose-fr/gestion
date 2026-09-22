/**
 * Prise de rendez-vous Calendly — pour un invité, par Florent.
 *
 * L'écran existe pour une raison précise, et une seule : depuis quelques mois,
 * Calendly demande à l'invité de CONFIRMER son numéro par SMS avant de lui
 * envoyer des rappels. Quand c'est l'invité qui réserve, il le fait lui-même ;
 * quand le rendez-vous est posé pour lui — au téléphone, en fin de séance —
 * personne n'est là pour confirmer, et les rappels ne partent jamais.
 *
 * La Scheduling API accepte, elle, un numéro fourni par le compte
 * (`text_reminder_number`) : c'est le titulaire du compte qui atteste du
 * consentement de l'invité, comme le fait déjà le panneau « Réserver une
 * réunion » de l'administration Calendly.
 *
 * Une seule requête D1, et seulement sur `/selection` : le reste ne parle
 * qu'à Calendly.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../env';
import { Refus } from '../refus';
import { now } from '../db';

export const rdv = new Hono<{ Bindings: Env }>();

const API = 'https://api.calendly.com';

/** Le fuseau des invités, faute de mieux : ils sont tous en France. */
const FUSEAU_PAR_DEFAUT = 'Europe/Paris';

/** Calendly refuse une fenêtre de plus de 7 jours, disponibilités comme occupations. */
const TRANCHE_JOURS = 7;

/** Trois mois : au-delà, ni l'agenda ni la mémoire ne suivent. */
const HORIZON_MAX_JOURS = 92;

/** Les types d'événements retenus par l'écran, dans `app_settings`. */
const CLE_SELECTION = 'rdv:types';

const lireJeton = (env: Env): string => {
  const jeton = env.CALENDLY_TOKEN?.trim();
  if (!jeton) {
    throw new Refus(
      'Aucun jeton Calendly. Posez-le en secret : npx wrangler secret put CALENDLY_TOKEN ' +
      '(Calendly → Intégrations et applications → Jetons d’accès personnels).',
      409,
    );
  }
  return jeton;
};

/**
 * Un appel à l'API v2, dont le refus REVIENT AVEC SON MESSAGE.
 *
 * Calendly explique précisément ce qui cloche — créneau déjà pris, lieu
 * manquant, numéro mal formé. Remplacer ça par « Erreur interne » obligerait à
 * ouvrir les journaux du Worker pour apprendre ce que l'appelant pouvait
 * corriger tout seul. Un 4xx de Calendly devient donc un Refus, message
 * compris ; un 5xx reste une panne de leur côté, et se dit comme telle.
 */
const appeler = async <T>(jeton: string, chemin: string, init: RequestInit = {}): Promise<T> => {
  let res: Response;
  try {
    res = await fetch(`${API}${chemin}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${jeton}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
  } catch (e: any) {
    throw new Refus(`Calendly n’a pas répondu : ${e?.message ?? 'réseau indisponible'}`, 409);
  }

  const texte = await res.text();
  let charge: any = null;
  try { charge = texte ? JSON.parse(texte) : null; } catch { /* réponse non-JSON */ }

  if (res.ok) return charge as T;

  // `details` porte le champ fautif quand il y en a un ; c'est l'information la
  // plus utile des trois, et la seule qui dise QUOI corriger.
  const details: string = Array.isArray(charge?.details)
    ? charge.details.map((d: any) => `${d?.parameter ?? ''} ${d?.message ?? ''}`.trim()).join(' · ')
    : '';
  const message = [charge?.message ?? charge?.title ?? `Calendly a répondu ${res.status}`, details]
    .filter(Boolean).join(' — ');

  if (res.status === 403) {
    throw new Refus(
      `Calendly a refusé (403) : ${message}. La Scheduling API demande un plan payant ` +
      'et un jeton portant la portée « scheduled_events:write ».',
      403,
    );
  }
  if (res.status >= 400 && res.status < 500) {
    throw new Refus(message, res.status === 404 ? 404 : 400);
  }
  throw new Error(`Calendly ${res.status} : ${message}`);
};

/**
 * Le numéro, au format E.164 — le seul que Calendly accepte.
 *
 * Le numéro vient de Notion, tapé à la main : « 06 12 34 56 78 »,
 * « 06.12.34.56.78 », parfois déjà « +33 6 … ». Le convertir ici évite de
 * demander à l'appelant une discipline qu'il n'aura pas, et fait échouer tôt —
 * avec un message clair — plutôt qu'au milieu d'une réservation.
 */
export const enE164 = (brut: string | null | undefined): string | null => {
  const texte = (brut ?? '').trim();
  if (!texte) return null;

  const nettoye = texte.replace(/[^\d+]/g, '');
  if (/^\+[1-9]\d{7,14}$/.test(nettoye)) return nettoye;
  if (/^0\d{9}$/.test(nettoye)) return `+33${nettoye.slice(1)}`;
  if (/^33\d{9}$/.test(nettoye)) return `+${nettoye}`;

  throw new Refus(
    `Numéro de téléphone « ${texte} » non reconnu. Attendu : 06 12 34 56 78 ou +33 6 12 34 56 78.`,
    400,
  );
};

/** L'URI de l'utilisateur du jeton — point de départ de toute requête v2. */
const moi = async (jeton: string): Promise<{ uri: string; fuseau: string }> => {
  const rep = await appeler<any>(jeton, '/users/me');
  return {
    uri: String(rep?.resource?.uri ?? ''),
    fuseau: String(rep?.resource?.timezone ?? FUSEAU_PAR_DEFAUT),
  };
};

/**
 * Le lieu tel que Calendly l'attend à la création.
 *
 * Appris d'un 400 en production : « location.location is required when
 * location.kind is 'outbound_call', 'ask_invitee', 'physical' or 'custom' ».
 * Le `kind` seul ne suffit pas — il faut aussi le TEXTE du lieu, celui que le
 * type d'événement porte déjà (« 2 Avenue de Verdun… »). On le remonte donc
 * jusqu'à l'écran, qui le renvoie tel quel ou corrigé.
 */
const KINDS_AVEC_TEXTE = ['custom', 'physical', 'ask_invitee', 'outbound_call'];

const lieuDuType = (t: any): { kind: string; texte: string } | null => {
  const l = t?.locations?.[0];
  if (!l?.kind) return null;
  const texte = String(l.location ?? l.phone_number ?? l.additional_info ?? '');
  return { kind: String(l.kind), texte };
};

// ── Types d'événements ───────────────────────────────────────────────────

/**
 * Les types actifs, tels quels : c'est l'écran qui choisit, pas le Worker.
 *
 * Les types masqués (`secret`) sont conservés — une séance de suivi n'est pas
 * toujours publique, et c'est justement pour celles-là qu'on réserve à la place
 * de l'invité.
 */
rdv.get('/types', async (c) => {
  const jeton = lireJeton(c.env);
  const { uri } = await moi(jeton);
  const rep = await appeler<any>(
    jeton,
    `/event_types?user=${encodeURIComponent(uri)}&active=true&count=100&sort=name:asc`,
  );

  const types = (rep?.collection ?? []).map((t: any) => ({
    uri: String(t.uri),
    nom: String(t.name ?? ''),
    duree: Number(t.duration ?? 0),
    couleur: String(t.color ?? '#0069ff'),
    secret: Boolean(t.secret),
    lieu: lieuDuType(t),
  }));

  return c.json({ types });
});

// ── Ce que l'écran affiche ───────────────────────────────────────────────

const SelectionSchema = z.object({ types: z.array(z.string().url()).max(50) });

/**
 * 1 requête. Les types retenus, et seulement eux.
 *
 * Le compte en porte treize, dont la moitié ne sert plus ; les afficher tous
 * en boutons radio reviendrait à remplacer une liste déroulante par un mur.
 * Une sélection vide veut dire « tous » : c'est l'état d'un déploiement neuf,
 * et il doit montrer quelque chose.
 */
rdv.get('/selection', async (c) => {
  const row = await c.env.DB
    .prepare('SELECT value FROM app_settings WHERE key = ?').bind(CLE_SELECTION).first();
  let types: string[] = [];
  try { types = JSON.parse(String(row?.value ?? '[]')); } catch { types = []; }
  return c.json({ types: Array.isArray(types) ? types : [] });
});

/** 1 requête. */
rdv.put('/selection', async (c) => {
  const { types } = SelectionSchema.parse(await c.req.json());
  await c.env.DB.prepare(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).bind(CLE_SELECTION, JSON.stringify(types), now()).run();
  return c.json({ types });
});

// ── Fuseaux : l'heure locale d'un agenda, l'instant d'un rendez-vous ──────

/**
 * L'écart du fuseau à un instant donné, en minutes.
 *
 * Écrit à la main parce qu'un Worker n'a pas de bibliothèque de fuseaux, et
 * qu'un décalage fixe serait faux deux fois par an — exactement aux périodes
 * où un rendez-vous pris à la mauvaise heure ne se remarque qu'au moment de
 * l'attendre.
 */
const ecartMinutes = (instant: Date, fuseau: string): number => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: fuseau, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(instant);
  const p: Record<string, number> = {};
  for (const x of parts) if (x.type !== 'literal') p[x.type] = Number(x.value);
  const local = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second);
  return (local - instant.getTime()) / 60_000;
};

/** Une heure locale (9 h 30 à Paris) rendue en instant. Deux passes : le premier écart peut être celui de l'autre côté d'un changement d'heure. */
const instantLocal = (an: number, mois: number, jour: number, h: number, min: number, fuseau: string): Date => {
  let t = Date.UTC(an, mois - 1, jour, h, min);
  for (let i = 0; i < 2; i++) {
    t = Date.UTC(an, mois - 1, jour, h, min) - ecartMinutes(new Date(t), fuseau) * 60_000;
  }
  return new Date(t);
};

/** La date locale d'un instant, découpée — pour parcourir des journées, pas des tranches de 24 h. */
const dateLocale = (instant: Date, fuseau: string) => {
  const p: Record<string, number> = {};
  for (const x of new Intl.DateTimeFormat('en-US', {
    timeZone: fuseau, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  }).formatToParts(instant)) {
    if (x.type === 'weekday') continue;
    if (x.type !== 'literal') p[x.type] = Number(x.value);
  }
  return { an: p.year, mois: p.month, jour: p.day };
};

const JOURS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

// ── Créneaux ─────────────────────────────────────────────────────────────

/** Les tranches de sept jours qui couvrent une fenêtre — Calendly n'en accepte pas de plus longues. */
const tranches = (depart: Date, fin: Date): Array<[Date, Date]> => {
  const out: Array<[Date, Date]> = [];
  let curseur = depart;
  while (curseur < fin) {
    const bout = new Date(Math.min(curseur.getTime() + TRANCHE_JOURS * 86_400_000, fin.getTime()));
    out.push([curseur, bout]);
    curseur = bout;
  }
  return out;
};

/** Les appels partent par petits paquets : treize d'un coup, c'est une limite de débit assurée. */
const parPaquets = async <T, R>(items: T[], taille: number, f: (x: T) => Promise<R>): Promise<R[]> => {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += taille) {
    out.push(...await Promise.all(items.slice(i, i + taille).map(f)));
  }
  return out;
};

/** Ce que Calendly propose — délai minimum et horizon de réservation compris. */
const creneauxPublies = async (jeton: string, type: string, depart: Date, fin: Date) => {
  const lots = await parPaquets(tranches(depart, fin), 4, ([d, f]) =>
    appeler<any>(
      jeton,
      `/event_type_available_times?event_type=${encodeURIComponent(type)}` +
      `&start_time=${encodeURIComponent(d.toISOString())}` +
      `&end_time=${encodeURIComponent(f.toISOString())}`,
    ).catch(() => ({ collection: [] })),
  );

  return lots.flatMap((r: any) => (r?.collection ?? [])
    .filter((x: any) => x?.status === 'available')
    .map((x: any) => String(x.start_time)));
};

/**
 * Ce que l'agenda permet — sans le délai minimum ni l'horizon.
 *
 * Pourquoi ce second mode existe : le type « Séance » impose 48 h de délai et
 * ne s'ouvre qu'à 21 jours. Ces deux garde-fous protègent la page publique ;
 * ils n'ont aucun sens quand c'est le praticien qui pose le rendez-vous, au
 * téléphone, pour demain ou pour dans deux mois. Calendly le sait : son propre
 * panneau d'administration offre « Remplacer les heures de disponibilité ».
 *
 * On recompose donc les créneaux à partir de deux sources publiques : les
 * règles de disponibilité (planning par défaut) et les plages occupées.
 *
 * Ses limites, à connaître : c'est le planning PAR DÉFAUT qui sert, l'API v2
 * ne disant pas quel planning suit un type d'événement ; les tampons avant et
 * après ne sont pas appliqués ; et le pas vaut la durée de l'événement. Ce
 * mode propose — il ne garantit pas. Calendly reste seul juge à la création.
 */
const creneauxDeLAgenda = async (
  jeton: string, uriUtilisateur: string, duree: number, depart: Date, fin: Date,
) => {
  const [plannings, occupations] = await Promise.all([
    appeler<any>(jeton, `/user_availability_schedules?user=${encodeURIComponent(uriUtilisateur)}`),
    parPaquets(tranches(depart, fin), 4, ([d, f]) =>
      appeler<any>(
        jeton,
        `/user_busy_times?user=${encodeURIComponent(uriUtilisateur)}` +
        `&start_time=${encodeURIComponent(d.toISOString())}` +
        `&end_time=${encodeURIComponent(f.toISOString())}`,
      ).catch(() => ({ collection: [] })),
    ),
  ]);

  const planning = (plannings?.collection ?? []).find((p: any) => p?.default)
    ?? (plannings?.collection ?? [])[0];
  if (!planning) {
    throw new Refus('Aucun planning de disponibilité lisible sur ce compte Calendly.', 409);
  }

  const fuseau = String(planning.timezone ?? FUSEAU_PAR_DEFAUT);
  const regles: any[] = planning.rules ?? [];

  const pris = occupations
    .flatMap((r: any) => r?.collection ?? [])
    .map((b: any) => [new Date(b.start_time).getTime(), new Date(b.end_time).getTime()] as const);

  const libre = (debut: number, bout: number) => !pris.some(([a, b]) => debut < b && bout > a);

  const creneaux: string[] = [];
  const maintenant = Date.now();
  const dureeMs = duree * 60_000;

  // On avance de journée LOCALE en journée locale : un pas de 24 h glisserait
  // d'une heure aux changements d'heure, et décalerait tout un dimanche.
  for (let i = 0; i < HORIZON_MAX_JOURS + 1; i++) {
    const midiUtc = new Date(depart.getTime() + i * 86_400_000);
    if (midiUtc.getTime() > fin.getTime() + 86_400_000) break;
    const { an, mois, jour } = dateLocale(midiUtc, fuseau);
    const nomDuJour = JOURS[new Date(Date.UTC(an, mois - 1, jour)).getUTCDay()];

    // Une règle datée l'emporte sur la règle hebdomadaire : c'est ainsi que
    // Calendly exprime « ce jour-là, exceptionnellement ».
    const dateIso = `${an}-${String(mois).padStart(2, '0')}-${String(jour).padStart(2, '0')}`;
    const exception = regles.find((r) => r?.type === 'date' && r?.date === dateIso);
    const regle = exception ?? regles.find((r) => r?.type === 'wday' && r?.wday === nomDuJour);
    for (const intervalle of (regle?.intervals ?? [])) {
      const [hd, md] = String(intervalle.from ?? '').split(':').map(Number);
      const [hf, mf] = String(intervalle.to ?? '').split(':').map(Number);
      if ([hd, md, hf, mf].some((x) => Number.isNaN(x))) continue;

      const ouverture = instantLocal(an, mois, jour, hd, md, fuseau).getTime();
      const fermeture = instantLocal(an, mois, jour, hf, mf, fuseau).getTime();

      for (let t = ouverture; t + dureeMs <= fermeture; t += dureeMs) {
        if (t <= maintenant || t < depart.getTime() || t > fin.getTime()) continue;
        if (libre(t, t + dureeMs)) creneaux.push(new Date(t).toISOString());
      }
    }
  }

  return creneaux;
};

const CreneauxQuery = z.object({
  type: z.string().url(),
  jours: z.coerce.number().int().min(1).max(HORIZON_MAX_JOURS).optional(),
  /** `1` : recomposer depuis l'agenda, sans le délai minimum ni l'horizon. */
  libre: z.coerce.boolean().optional(),
});

rdv.get('/creneaux', async (c) => {
  const jeton = lireJeton(c.env);
  const { type, jours, libre } = CreneauxQuery.parse({
    type: c.req.query('type'),
    jours: c.req.query('jours'),
    libre: c.req.query('libre'),
  });

  // Une minute d'avance : le temps que la requête parte, « maintenant » est
  // déjà du passé pour Calendly, qui refuse alors la fenêtre entière.
  const depart = new Date(Date.now() + 60_000);
  const fin = new Date(depart.getTime() + (jours ?? HORIZON_MAX_JOURS) * 86_400_000);

  let debuts: string[];
  if (libre) {
    const [{ uri }, detail] = await Promise.all([
      moi(jeton),
      appeler<any>(jeton, `/event_types/${encodeURIComponent(type.split('/').pop() ?? '')}`),
    ]);
    const duree = Number(detail?.resource?.duration ?? 0);
    if (!duree) throw new Refus('Durée du type d’événement illisible.', 409);
    debuts = await creneauxDeLAgenda(jeton, uri, duree, depart, fin);
  } else {
    debuts = await creneauxPublies(jeton, type, depart, fin);
  }

  const creneaux = [...new Set(debuts)].sort().map((debut) => ({ debut }));
  return c.json({ creneaux, depuis: depart.toISOString(), jusqua: fin.toISOString(), libre: Boolean(libre) });
});

// ── Création ─────────────────────────────────────────────────────────────

const RdvSchema = z.object({
  type: z.string().url(),
  debut: z.string().datetime(),
  nom: z.string().min(1).max(200),
  email: z.string().email(),
  /** Brut, tel que Notion l'envoie — la normalisation a lieu ici (voir enE164). */
  telephone: z.string().max(40).nullable().optional(),
  fuseau: z.string().max(60).optional(),
  /** Le lieu attendu par le type : son `kind`, et le texte que Calendly exige avec. */
  lieu: z.object({ kind: z.string().max(60), texte: z.string().max(500) }).nullable().optional(),
});

/**
 * Poser le rendez-vous.
 *
 * Le numéro part dans `invitee.text_reminder_number`. La documentation le
 * nomme tantôt sous `invitee`, tantôt à la racine, et c'est le genre de
 * divergence qu'on ne découvre qu'en production : on tente la forme documentée
 * dans le guide, et si Calendly la refuse EN DÉSIGNANT ce champ, on retente à
 * la racine avant d'abandonner. Deux appels au pire, aucun dans le cas normal.
 */
rdv.post('/', async (c) => {
  const jeton = lireJeton(c.env);
  const entree = RdvSchema.parse(await c.req.json());
  const telephone = enE164(entree.telephone);

  const base: any = {
    event_type: entree.type,
    start_time: entree.debut,
    invitee: {
      name: entree.nom,
      email: entree.email,
      timezone: entree.fuseau ?? FUSEAU_PAR_DEFAUT,
    },
  };

  if (entree.lieu?.kind) {
    base.location = { kind: entree.lieu.kind };
    if (KINDS_AVEC_TEXTE.includes(entree.lieu.kind)) {
      // Un lieu vide serait refusé par Calendly ; le numéro de l'invité est le
      // repli naturel des deux formules d'appel.
      const texte = entree.lieu.texte.trim()
        || (['outbound_call', 'ask_invitee'].includes(entree.lieu.kind) ? (telephone ?? '') : '');
      if (!texte) {
        throw new Refus(
          `Ce type d’événement demande un lieu (« ${entree.lieu.kind} ») : renseignez-le avant de réserver.`,
          400,
        );
      }
      base.location.location = texte;
    }
  }

  const avecInvitee = telephone
    ? { ...base, invitee: { ...base.invitee, text_reminder_number: telephone } }
    : base;

  const poster = (charge: any) =>
    appeler<any>(jeton, '/invitees', { method: 'POST', body: JSON.stringify(charge) });

  let rep: any;
  try {
    rep = await poster(avecInvitee);
  } catch (e: any) {
    const designeLeNumero = e instanceof Refus && /text_reminder_number/i.test(e.message);
    if (!telephone || !designeLeNumero) throw e;
    rep = await poster({ ...base, text_reminder_number: telephone });
  }

  const invite = rep?.resource ?? rep;
  return c.json({
    rdv: {
      uri: String(invite?.uri ?? ''),
      evenement: String(invite?.event ?? ''),
      debut: entree.debut,
      nom: entree.nom,
      email: entree.email,
      /** Le numéro RETENU par Calendly, pas celui qu'on a envoyé : c'est la différence entre croire et savoir. */
      telephone: (invite?.text_reminder_number as string | null) ?? telephone ?? null,
      annulation: String(invite?.cancel_url ?? ''),
      report: String(invite?.reschedule_url ?? ''),
    },
  });
});
