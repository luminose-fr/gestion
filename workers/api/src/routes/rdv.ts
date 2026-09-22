/**
 * Prise de rendez-vous Calendly — pour un invité, par Florent.
 *
 * L'écran existe pour une raison précise, et une seule : depuis quelques mois,
 * Calendly demande à l'invité de CONFIRMER son numéro par SMS avant d'accepter
 * de lui envoyer des rappels. Quand c'est l'invité qui réserve, il le fait
 * lui-même ; quand le rendez-vous est posé pour lui — au téléphone, en fin de
 * séance — personne n'est là pour confirmer, et les rappels ne partent jamais.
 *
 * La Scheduling API accepte, elle, un numéro fourni par le compte
 * (`text_reminder_number`) : c'est le propriétaire du compte qui atteste du
 * consentement de l'invité, comme le fait déjà le panneau « Réserver une
 * réunion » de l'administration Calendly.
 *
 * Aucune requête D1 : cette route ne parle qu'à Calendly.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../env';
import { Refus } from '../refus';

export const rdv = new Hono<{ Bindings: Env }>();

const API = 'https://api.calendly.com';

/** Le fuseau des invités, faute de mieux : ils sont tous en France. */
const FUSEAU_PAR_DEFAUT = 'Europe/Paris';

/** Calendly refuse une fenêtre de disponibilités de plus de 7 jours. */
const FENETRE_MAX_JOURS = 7;

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
    /** Le type de lieu attendu par Calendly à la création — null s'il n'en impose aucun. */
    lieu: t?.locations?.length === 1 ? String(t.locations[0]?.kind ?? '') || null : null,
  }));

  return c.json({ types });
});

// ── Créneaux ─────────────────────────────────────────────────────────────

const CreneauxQuery = z.object({
  type: z.string().url(),
  debut: z.string().datetime().optional(),
  jours: z.coerce.number().int().min(1).max(FENETRE_MAX_JOURS).optional(),
});

/**
 * Les créneaux libres d'un type, sur une fenêtre courte.
 *
 * Deux contraintes de Calendly, qui se traduisent ici plutôt que de remonter en
 * 400 devant l'invité : la fenêtre ne peut pas dépasser sept jours, et elle ne
 * peut pas commencer dans le passé. Une demande qui démarre « maintenant » est
 * donc décalée d'une minute — sinon le temps que la requête parte, elle est
 * déjà en retard.
 */
rdv.get('/creneaux', async (c) => {
  const jeton = lireJeton(c.env);
  const { type, debut, jours } = CreneauxQuery.parse({
    type: c.req.query('type'),
    debut: c.req.query('debut'),
    jours: c.req.query('jours'),
  });

  const plancher = new Date(Date.now() + 60_000);
  const demande = debut ? new Date(debut) : plancher;
  const depart = demande.getTime() < plancher.getTime() ? plancher : demande;
  const fin = new Date(depart.getTime() + (jours ?? FENETRE_MAX_JOURS) * 24 * 3600_000);

  const rep = await appeler<any>(
    jeton,
    `/event_type_available_times?event_type=${encodeURIComponent(type)}` +
    `&start_time=${encodeURIComponent(depart.toISOString())}` +
    `&end_time=${encodeURIComponent(fin.toISOString())}`,
  );

  const creneaux = (rep?.collection ?? [])
    .filter((x: any) => x?.status === 'available')
    .map((x: any) => ({ debut: String(x.start_time) }));

  return c.json({ creneaux, depuis: depart.toISOString(), jusqua: fin.toISOString() });
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
  /** Le `kind` attendu par le type d'événement, quand il en impose un. */
  lieu: z.string().max(60).nullable().optional(),
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
  if (entree.lieu) base.location = { kind: entree.lieu };

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
