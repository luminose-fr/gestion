/**
 * Un export de Notion FICTIF, à la forme exacte de ce que l'API rend
 * (SPEC §14.9.1, tâche 6) — identités du jeu d'essai, en `@example.org`.
 *
 * Fabriqué à la main : aucune page réelle n'a servi à l'écrire, et la session
 * qui l'a écrit n'en a vu aucune. Chaque cas de la transformation y a sa page ;
 * les tests le modifient pour rejouer un second import.
 */
import type { Bloc, Export, Page, Schema } from '../lire.ts';

type Prop = Record<string, unknown>;

const riche = (t: string | null, href?: string) => (t ? [{ type: 'text', plain_text: t, href: href ?? null, text: { content: t } }] : []);

export const p = {
  titre: (t: string): Prop => ({ type: 'title', title: riche(t) }),
  texte: (t: string | null): Prop => ({ type: 'rich_text', rich_text: riche(t) }),
  choix: (n: string | null): Prop => ({ type: 'select', select: n ? { name: n } : null }),
  statut: (n: string | null): Prop => ({ type: 'status', status: n ? { name: n } : null }),
  multi: (ns: string[]): Prop => ({ type: 'multi_select', multi_select: ns.map((name) => ({ name })) }),
  date: (start: string | null, end: string | null = null): Prop => ({ type: 'date', date: start ? { start, end, time_zone: null } : null }),
  relation: (ids: string[]): Prop => ({ type: 'relation', relation: ids.map((id) => ({ id })), has_more: false }),
  nombre: (n: number | null): Prop => ({ type: 'number', number: n }),
  case: (b: boolean): Prop => ({ type: 'checkbox', checkbox: b }),
  email: (e: string | null): Prop => ({ type: 'email', email: e }),
  tel: (t: string | null): Prop => ({ type: 'phone_number', phone_number: t }),
  url: (u: string | null): Prop => ({ type: 'url', url: u }),
  agregat: (n: number | null): Prop => ({ type: 'rollup', rollup: { type: 'number', number: n, function: 'count' } }),
  formule: (n: number | null): Prop => ({ type: 'formula', formula: { type: 'number', number: n } }),
};

/** Un bloc du corps d'une page. `lien` : l'adresse portée par le texte. */
export const bloc = (id: string, type: string, texte: string, options: { lien?: string; enfants?: Bloc[]; le?: string } = {}): Bloc => ({
  object: 'block', id, type, created_time: options.le ?? '2026-03-02T09:00:00.000Z', has_children: Boolean(options.enfants?.length),
  [type]: { rich_text: riche(texte, options.lien) },
  ...(options.enfants ? { children: options.enfants } : {}),
});

/** Le schéma de chaque base : le nom et le type réel de chaque propriété. */
export const SCHEMAS: Record<keyof Export['bases'], Record<string, string>> = {
  clients: {
    'Nom': 'title', 'Genre': 'select', 'Date de naissance': 'date', 'Email': 'email', 'Phone': 'phone_number',
    'Profession': 'rich_text', 'Adresse': 'rich_text', 'Code postal': 'rich_text', 'Ville': 'rich_text', 'Pays': 'select',
    'Origine': 'select', 'Google Ads Keyword': 'rich_text', 'Via professionnel': 'relation', 'Via client': 'relation',
    'Couple': 'relation', 'A recommandé': 'relation', 'Séances': 'relation', 'Evènements': 'relation',
    'Personne de confiance - Genre': 'select', 'Personne de confiance - Prénom': 'rich_text', 'Personne de confiance - Nom': 'rich_text',
    'Personne de confiance - Téléphone': 'phone_number', 'Personne de confiance - E-mail': 'email',
    'stancer_customer_id': 'rich_text', 'qonto_client_id': 'rich_text', 'Mot de passe (SHA-256)': 'rich_text',
    'Nombre de séances': 'rollup', 'Dernière séance': 'rollup', 'Âge': 'formula',
    // Une propriété que l'inventaire ne connaît pas : listée, pas bloquante.
    'Propriété ajoutée': 'rich_text',
  },
  seances: {
    'Name': 'title', 'Date': 'date', 'Clients': 'relation', 'Statut': 'status', 'État paiement': 'select',
    'Demande': 'rich_text', 'Objectif': 'rich_text', 'gclid': 'rich_text', 'calendly_uri': 'url',
    'stancer_payment_intent_id': 'rich_text', 'stancer_payment_intent_amount': 'number', 'qonto_client_invoice_id': 'rich_text',
    'recevoir_notification_disponibilite': 'checkbox',
  },
  evenements: {
    'Nom': 'title', 'Date': 'date', "Type d'évènement": 'select', 'Ville': 'rich_text', 'Clients': 'relation',
    'Places totales': 'number', 'Places libres': 'formula', 'Publié sur le site': 'checkbox', 'Questionnaire de santé': 'checkbox',
    'URL Inscription': 'url', 'cle': 'rich_text', 'Meta description': 'rich_text', 'HTML Permalink': 'rich_text',
    'HTML Programme': 'rich_text', 'HTML Prix': 'rich_text', 'HTML Lieu - adresse': 'rich_text', 'HTML Lieu - instructions': 'rich_text',
  },
  professionnels: {
    'Nom': 'title', 'Catégorie': 'multi_select', 'Spécialisation': 'rich_text', 'Adresse': 'rich_text', 'Code postal': 'rich_text',
    'Ville': 'rich_text', 'Adresse complète': 'formula', 'Téléphone': 'phone_number', 'E-mail': 'email', 'Site web': 'url',
    'Note': 'rich_text', 'Connu': 'checkbox', 'Courriers envoyés': 'multi_select', 'Clients': 'relation', 'Clients reçus': 'formula',
  },
};

/** La valeur vide d'un type : une page de Notion porte toutes les propriétés de sa base. */
const videDe = (type: string): Prop => {
  switch (type) {
    case 'title': return p.titre('');
    case 'rich_text': return p.texte(null);
    case 'select': return p.choix(null);
    case 'status': return p.statut(null);
    case 'multi_select': return p.multi([]);
    case 'date': return p.date(null);
    case 'relation': return p.relation([]);
    case 'number': return p.nombre(null);
    case 'checkbox': return p.case(false);
    case 'email': return p.email(null);
    case 'phone_number': return p.tel(null);
    case 'url': return p.url(null);
    case 'rollup': return p.agregat(null);
    case 'formula': return p.formule(null);
    default: return { type };
  }
};

const page = (base: keyof Export['bases'], id: string, props: Record<string, Prop>, blocs?: Bloc[]): Page => ({
  id,
  created_time: '2026-01-05T10:00:00.000Z',
  last_edited_time: '2026-11-20T10:00:00.000Z',
  archived: false,
  in_trash: false,
  properties: Object.fromEntries(Object.entries(SCHEMAS[base]).map(([nom, type]) => [nom, { id: nom, ...(props[nom] ?? videDe(type)) }])),
  ...(blocs ? { blocs } : {}),
});

const schema = (base: keyof Export['bases']): Schema =>
  Object.fromEntries(Object.entries(SCHEMAS[base]).map(([nom, type]) => [nom, { id: nom, name: nom, type, [type]: {} }]));

/** L'instant de référence des tests : le 27/11/2026 à midi, Paris. Ce qui suit est « à venir ». */
export const MAINTENANT = Date.parse('2026-11-27T11:00:00Z');

/** Un lien Drive « questionnaire » : le paragraphe dit ce qu'il est. */
const DRIVE_1 = 'https://drive.google.com/file/d/FICHIERESSAI0001abc/view';
const DRIVE_2 = 'https://drive.google.com/file/d/FICHIERESSAI0002abc/view';

export const exportFictif = (): Export => ({
  version: 1,
  exporteLe: '2026-11-27T11:00:00.000Z',
  bases: {
    professionnels: {
      id: 'base-professionnels', schema: schema('professionnels'),
      pages: [page('professionnels', 'pro-cabinet', {
        'Nom': p.titre('Cabinet d’essai'), 'Catégorie': p.multi(['Médecin généraliste']), 'Ville': p.texte('Ville d’essai'),
        'E-mail': p.email('cabinet@example.org'), 'Connu': p.case(true), 'Courriers envoyés': p.multi(['Mai 2025']),
        'Clients reçus': p.formule(1),
      })],
    },
    clients: {
      id: 'base-clients', schema: schema('clients'),
      pages: [
        page('clients', 'c-emilie', {
          'Nom': p.titre('Émilie Martin'), 'Genre': p.choix('Mme'), 'Email': p.email('emilie.martin@example.org'),
          'Phone': p.tel('+33 6 39 98 00 01'), 'Pays': p.choix('France - FR'), 'Origine': p.choix('Internet'),
          'Date de naissance': p.date('1988-04-12'), 'Via professionnel': p.relation(['pro-cabinet']), 'Couple': p.relation(['c-paul']),
          'Personne de confiance - Prénom': p.texte('Personne'), 'Personne de confiance - Téléphone': p.tel('+33 6 39 98 00 60'),
          'Nombre de séances': p.agregat(1), 'Propriété ajoutée': p.texte('Texte d’essai'),
        }, [
          bloc('b-e1', 'paragraph', 'Texte d’essai — première note.'),
          bloc('b-e2', 'paragraph', 'Questionnaire de santé (PDF)', { lien: DRIVE_1, le: '2026-02-10T08:00:00.000Z' }),
          bloc('b-e3', 'paragraph', 'Document d’essai', { lien: DRIVE_2 }),
        ]),
        page('clients', 'c-paul', {
          'Nom': p.titre('Paul Martin'), 'Genre': p.choix('M.'), 'Email': p.email('paul.martin@example.org'),
          'Couple': p.relation(['c-emilie']), 'Nombre de séances': p.agregat(0),
        }),
        page('clients', 'c-trois', {
          'Nom': p.titre('Marie Claire Dupont'), 'Email': p.email('marie.dupont@example.org'), 'Nombre de séances': p.agregat(3),
        }),
        // La même clé qu'Émilie, écrite autrement : à rapprocher.
        page('clients', 'c-double', { 'Nom': p.titre('Martin Émilie'), 'Email': p.email(' Emilie.Martin@Example.org ') }),
        page('clients', 'c-sans-adresse', {
          'Nom': p.titre('Léo Roux'), 'Via client': p.relation(['c-emilie']),
        }, [bloc('b-s1', 'paragraph', 'Ancien questionnaire', { lien: DRIVE_1 })]),
        page('clients', 'c-invalide', {
          'Nom': p.titre('Zoé Essai'), 'Email': p.email('zoe-chez-example'), 'Genre': p.choix('Autre'),
          'Via client': p.relation(['page-absente']),
        }),
      ],
    },
    seances: {
      id: 'base-seances', schema: schema('seances'),
      pages: [
        page('seances', 's-1', {
          'Name': p.titre('Séance 1 (Séance à distance)'), 'Date': p.date('2026-10-05T09:30:00.000+02:00', '2026-10-05T11:00:00.000+02:00'),
          'Clients': p.relation(['c-emilie']), 'Statut': p.statut('Réalisée'), 'État paiement': p.choix('Payée'),
          'Demande': p.texte('Texte d’essai — demande'), 'stancer_payment_intent_id': p.texte('pi_essai_1'),
          'stancer_payment_intent_amount': p.nombre(80), 'qonto_client_invoice_id': p.texte('facture-essai-1'),
          'gclid': p.texte('gclid-essai'),
        }, [
          bloc('t-1', 'heading_2', 'Séance'), bloc('t-2', 'paragraph', 'Texte d’essai — séance'),
          bloc('t-3', 'heading_2', 'Travail personnel'), bloc('t-4', 'paragraph', 'Texte d’essai — travail'),
          bloc('t-5', 'callout', 'Idées pour la suite', { enfants: [bloc('t-6', 'paragraph', 'Texte d’essai — idées')] }),
          bloc('t-7', 'heading_2', 'Réponse SMS'), bloc('t-8', 'paragraph', 'Texte d’essai — SMS'),
        ]),
        page('seances', 's-2', {
          'Name': p.titre('Séance 2 (Séance mystère)'), 'Date': p.date('2026-10-12T09:30:00.000+02:00'),
          'Clients': p.relation(['c-emilie']), 'Statut': p.statut('Annulée'), 'État paiement': p.choix('Annulée'),
        }, [bloc('u-1', 'paragraph', 'Texte d’essai sans trame')]),
        page('seances', 's-3', {
          'Name': p.titre('Séance 3 (Séance)'), 'Date': p.date('2027-02-01T09:30:00.000+01:00', '2027-02-01T11:00:00.000+01:00'),
          'Clients': p.relation(['c-emilie', 'c-paul']), 'Statut': p.statut('Prévue'), 'État paiement': p.choix('A payer'),
          'recevoir_notification_disponibilite': p.case(true),
        }),
        page('seances', 's-4', {
          'Name': p.titre('Séance 1 (Séance)'), 'Date': p.date('2027-02-01T13:00:00.000+01:00', '2027-02-01T14:30:00.000+01:00'),
          'Clients': p.relation(['c-trois']), 'Statut': p.statut('Prévue'), 'État paiement': p.choix('Payée'),
        }),
        page('seances', 's-5', {
          'Name': p.titre('Séance 2 (Séance)'), 'Date': p.date('2026-09-07T09:30:00.000+02:00', '2026-09-07T11:00:00.000+02:00'),
          'Clients': p.relation(['c-trois']), 'Statut': p.statut('Réalisée'), 'État paiement': p.choix('Payée'),
          'stancer_payment_intent_id': p.texte('pi_essai_double'), 'stancer_payment_intent_amount': p.nombre(80),
        }),
        // Passée, et sur la même heure que s-5 : de l'histoire, reprise telle quelle.
        page('seances', 's-6', {
          'Name': p.titre('Séance 3 (Séance)'), 'Date': p.date('2026-09-07T10:00:00.000+02:00', '2026-09-07T11:30:00.000+02:00'),
          'Clients': p.relation(['c-trois']), 'Statut': p.statut('Réalisée'), 'État paiement': p.choix('Payée'),
          'stancer_payment_intent_id': p.texte('pi_essai_double'), 'stancer_payment_intent_amount': p.nombre(80),
        }),
      ],
    },
    evenements: {
      id: 'base-evenements', schema: schema('evenements'),
      pages: [
        page('evenements', 'e-passe', {
          'Nom': p.titre('Journée d’essai passée'), 'Date': p.date('2026-06-06T10:00:00.000+02:00', '2026-06-06T17:00:00.000+02:00'),
          "Type d'évènement": p.choix('yoga'), 'Places totales': p.nombre(10), 'Places libres': p.formule(9),
          'Clients': p.relation(['c-emilie']), 'Publié sur le site': p.case(false),
        }),
        page('evenements', 'e-avenir', {
          'Nom': p.titre('Journée d’essai à venir'), 'Date': p.date('2027-03-06T10:00:00.000+01:00', '2027-03-06T17:00:00.000+01:00'),
          "Type d'évènement": p.choix('respiration-holotropique'), 'Ville': p.texte('Ville d’essai'), 'Places totales': p.nombre(3),
          'Places libres': p.formule(2), 'Clients': p.relation(['c-paul', 'page-absente']), 'Publié sur le site': p.case(true),
          'Questionnaire de santé': p.case(true), 'HTML Programme': p.texte('<p>Texte d’essai</p>'),
        }),
      ],
    },
  },
});
