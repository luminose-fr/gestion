/**
 * Transformer — un export de Notion → les lignes de chaque table, et la liste
 * de ce qui demande un regard (SPEC §14.9.1, tâche 4 ; modèle, §6 ; Annexe D).
 *
 * Une fonction PURE : ni base, ni réseau, ni horloge — l'instant de référence
 * est un paramètre. Elle ne devine rien : ce qu'elle ne sait pas traduire est
 * repris sans la valeur quand la colonne l'accepte, et listé. Le rapport
 * désigne les lignes par leur identifiant, jamais par un nom.
 *
 * Les identifiants : celui de la page Notion pour une ligne qui a sa page
 * (§2.4) ; pour les autres — une note, une personne de confiance, un
 * paiement, une inscription, un ancien questionnaire — un identifiant DÉRIVÉ
 * de ceux de ses pages. Deux imports donnent les mêmes identifiants.
 *
 * Ce fichier nomme les tables sensibles : il est hors de `src/`, donc hors du
 * contrôle de la règle 3 (§14.2), comme les migrations et le jeu d'essai.
 */
import { cleClient, nomRecherche, normaliserEmail, instantDeParis } from '@luminose/pratique';
import {
  LIBELLES_TYPES, TYPES, DUREE_PAR_DEFAUT_MIN, CIVILITES, STATUTS_SEANCE, ETATS_PAIEMENT, TYPES_EVENEMENT,
  codePays, MOTIF_QUESTIONNAIRE,
} from './correspondance.ts';
import { texteDesNotes } from '../src/clients/notes.ts';
import {
  verifierSchemas, lecteur, finDeDate, blocsAPlat, texteDuBloc, liensDuBloc, corpsEnTexte,
  type Export, type Page, type Bloc, type Valeur,
} from './lire.ts';

const MINUTE = 60_000;

export type Ligne = Record<string, string | number | null>;

/** Les tables écrites, dans l'ordre des renvois : ce qui est désigné avant ce qui désigne. */
export const TABLES = [
  'professionnels', 'clients', 'clients_confiance', 'clients_notes', 'evenements', 'seances', 'seances_notes',
  'paiements', 'inscriptions', 'questionnaires',
] as const;
export type Table = (typeof TABLES)[number];

/** Les rubriques du rapport, dans l'ordre où Florent les lit. */
export const RUBRIQUES = {
  proprietesEnPlus: 'Propriétés de Notion en plus (non reprises)',
  nomsTroisMots: 'Fiches dont le nom a trois mots ou plus (prénom = premier mot)',
  memeCle: 'Fiches de même clé (à rapprocher)',
  sansAdresse: 'Fiches sans adresse e-mail',
  adressesInvalides: 'Adresses e-mail invalides',
  typesInconnus: 'Séances sans type reconnu',
  libellesInconnus: 'Libellés de type inconnus (à ajouter à la table de correspondance), avec leur nombre',
  sansPersonne: 'Séances sans personne',
  sansFin: 'Séances sans fin (durée du type, sinon 60 minutes)',
  sansHeure: 'Séances datées sans heure (minuit, heure de Paris)',
  statutVide: 'Séances au statut vide : NON reprises',
  paiementVide: 'Séances à l’état de paiement vide (repris « à payer »)',
  valeursInconnues: 'Valeurs de liste inconnues (reprises sans la valeur)',
  relationsAbsentes: 'Relations vers une page absente de l’export (reprises sans le lien)',
  relationsMultiples: 'Relations « un seul » qui en portent plusieurs (aucun lien choisi)',
  paiementsMemeReference: 'Séances qui portent la même référence de paiement (aucun paiement écrit)',
  payeesSansStancer: 'Séances payées sans identifiant Stancer (pas de ligne de paiement)',
  anciensQuestionnaires: 'Anciens questionnaires repris de Drive (contexte inconnu, rangé « séance »)',
  memeFichierDrive: 'Liens vers un fichier Drive déjà repris (un seul questionnaire par fichier)',
  autresLiensDrive: 'Autres liens Drive (rien de créé)',
  evenementsSansPrix: 'Évènements à venir : prix à saisir',
  disparues: 'Lignes importées auparavant et absentes de cet export (gardées en base)',
} as const;
export type Rubrique = keyof typeof RUBRIQUES;
export type Rapport = Record<Rubrique, string[]>;

export type Transformation = { lignes: Record<Table, Ligne[]>; liens: Ligne[]; rapport: Rapport };

/** Deux séances prévues, à venir, qui se chevauchent — marge comprise : l'import s'arrête avant d'écrire. */
export class Chevauchement extends Error {
  // Pas de propriété de paramètre : `node` lance cet outil en retirant les types, sans les traduire.
  readonly paires: [string, string][];
  constructor(paires: [string, string][]) {
    super(`Import arrêté : des séances prévues à venir se chevauchent. À corriger dans Notion, puis relancer :\n${
      paires.map(([a, b]) => `  ${a} ↔ ${b}`).join('\n')}`);
    this.paires = paires;
    this.name = 'Chevauchement';
  }
}

const ms = (iso: string) => Date.parse(iso);
const sansAccents = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Une date Notion → un instant. Sans heure : minuit à Paris, et `sansHeure` le dit. */
const instant = (date: string): { t: number; sansHeure: boolean } =>
  /^\d{4}-\d{2}-\d{2}$/.test(date) ? { t: instantDeParis(date, '00:00'), sansHeure: true } : { t: ms(date), sansHeure: false };

const ADRESSE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** L'identifiant d'un fichier Drive, lu dans son adresse. */
export const fichierDrive = (url: string): string | null => {
  if (!/(drive|docs)\.google\.com/.test(url)) return null;
  return /\/d\/([\w-]{10,})/.exec(url)?.[1] ?? /[?&]id=([\w-]{10,})/.exec(url)?.[1] ?? null;
};

/**
 * Le corps d'une page, en Markdown : un bloc par ligne, dans l'ordre, ses
 * titres et ses listes gardés. Les notes d'une séance tiennent en un seul texte
 * (src/clients/notes.ts) : le corps y passe entier, sans découpage.
 */
export const corpsEnMarkdown = (blocs: Bloc[] = []): string | null => {
  const lignes: string[] = [];
  for (const bloc of blocsAPlat(blocs)) {
    const t = texteDuBloc(bloc);
    if (bloc.type === 'heading_1') lignes.push('', `# ${t}`);
    // L'encadré « Idées pour la suite » du modèle de Notion porte son texte dans ses enfants : un titre.
    else if (bloc.type === 'heading_2' || bloc.type === 'heading_3' || (bloc.type === 'callout' && bloc.children?.length)) lignes.push('', `## ${t}`);
    else if (bloc.type === 'bulleted_list_item' || bloc.type === 'to_do') lignes.push(`- ${t}`);
    else if (bloc.type === 'numbered_list_item') lignes.push(`1. ${t}`);
    else if (bloc.type === 'quote') lignes.push(`> ${t}`);
    else lignes.push(t);
  }
  const md = lignes.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return md || null;
};

const vide = (): Rapport => Object.fromEntries(Object.keys(RUBRIQUES).map((r) => [r, []])) as unknown as Rapport;

/**
 * La transformation entière. `maintenant` décide de ce qui est « à venir » —
 * les chevauchements qui arrêtent l'import, les évènements dont le prix est à
 * saisir. Lève `SchemaInvalide` (lire.ts) ou `Chevauchement` : dans les deux
 * cas, rien n'est rendu, donc rien ne peut être écrit.
 */
export const transformer = (exp: Export, maintenant: number): Transformation => {
  const rapport = vide();
  rapport.proprietesEnPlus.push(...verifierSchemas(exp).enPlus);

  const pages = (base: keyof Export['bases']) => exp.bases[base].pages.filter((p) => !p.archived && !p.in_trash);
  const idsDe = (base: keyof Export['bases']) => new Set(pages(base).map((p) => p.id));
  const ids = { clients: idsDe('clients'), seances: idsDe('seances'), evenements: idsDe('evenements'), professionnels: idsDe('professionnels') };
  const horodatage = (p: Page) => ({ created_at: ms(p.created_time), updated_at: ms(p.last_edited_time) });

  /** Une relation « un seul » : la cible si elle existe et qu'il n'y en a qu'une ; sinon rien, et le cas listé. */
  const unSeul = (valeur: Valeur, cible: Set<string>, ou: string): string | null => {
    const liste = (valeur as string[]) ?? [];
    if (liste.length === 0) return null;
    if (liste.length > 1) { rapport.relationsMultiples.push(ou); return null; }
    if (!cible.has(liste[0])) { rapport.relationsAbsentes.push(ou); return null; }
    return liste[0];
  };

  /** Une valeur de liste traduite, ou rien, et le cas listé. */
  const traduire = (table: Record<string, string>, valeur: Valeur, ou: string): string | null => {
    if (valeur === null) return null;
    const v = table[String(valeur)];
    if (v === undefined) rapport.valeursInconnues.push(`${ou} = ${String(valeur)}`);
    return v ?? null;
  };

  const lignes = Object.fromEntries(TABLES.map((t) => [t, []])) as unknown as Record<Table, Ligne[]>;
  const liens: Ligne[] = [];

  // ── Professionnels ──
  const lp = lecteur(exp, 'professionnels');
  for (const p of pages('professionnels')) {
    lignes.professionnels.push({
      id: p.id, nom: (lp(p, 'Nom') as string) ?? '', categories: JSON.stringify(lp(p, 'Catégorie') ?? []),
      specialisation: lp(p, 'Spécialisation') as string | null, adresse: lp(p, 'Adresse') as string | null,
      code_postal: lp(p, 'Code postal') as string | null, ville: lp(p, 'Ville') as string | null,
      telephone: lp(p, 'Téléphone') as string | null, email: lp(p, 'E-mail') as string | null,
      site_web: lp(p, 'Site web') as string | null, note: lp(p, 'Note') as string | null,
      connu: lp(p, 'Connu') ? 1 : 0, courriers: JSON.stringify(lp(p, 'Courriers envoyés') ?? []), ...horodatage(p),
    });
  }

  // ── Clients ──
  const lc = lecteur(exp, 'clients');
  const parCle = new Map<string, string[]>();
  const fichiersDrive = new Set<string>();
  for (const p of pages('clients')) {
    const nomComplet = ((lc(p, 'Nom') as string) ?? '').trim();
    const mots = nomComplet.split(/\s+/).filter(Boolean);
    if (mots.length >= 3) rapport.nomsTroisMots.push(p.id);
    const prenom = mots[0] ?? '';
    const nom = mots.slice(1).join(' ');
    const email = lc(p, 'Email') as string | null;
    if (!email) rapport.sansAdresse.push(p.id);
    else if (!ADRESSE.test(normaliserEmail(email))) rapport.adressesInvalides.push(p.id);
    const cle = cleClient(email, prenom, nom);
    if (cle) parCle.set(cle, [...(parCle.get(cle) ?? []), p.id]);
    const pays = lc(p, 'Pays') as string | null;
    const code = pays === null ? null : codePays(pays);
    if (pays !== null && code === null) rapport.valeursInconnues.push(`clients › ${p.id} › Pays = ${pays}`);
    lignes.clients.push({
      id: p.id, civilite: traduire(CIVILITES, lc(p, 'Genre'), `clients › ${p.id} › Genre`), prenom, nom,
      nom_recherche: nomRecherche(prenom, nom), cle_client: cle, email, telephone: lc(p, 'Phone') as string | null,
      date_naissance: ((lc(p, 'Date de naissance') as string | null) ?? '').slice(0, 10) || null,
      profession: lc(p, 'Profession') as string | null, adresse: lc(p, 'Adresse') as string | null,
      code_postal: lc(p, 'Code postal') as string | null, ville: lc(p, 'Ville') as string | null, pays: code,
      // L'origine est un texte libre : la liste de Notion bouge, elle se reprend telle quelle.
      origine: lc(p, 'Origine') as string | null, mot_cle_google_ads: lc(p, 'Google Ads Keyword') as string | null,
      stancer_customer_id: lc(p, 'stancer_customer_id') as string | null, qonto_client_id: lc(p, 'qonto_client_id') as string | null,
      ...horodatage(p),
    });
    // Les liens d'une fiche à l'autre s'écrivent APRÈS toutes les fiches : aucun ordre d'insertion n'est nécessaire.
    liens.push({
      id: p.id,
      via_professionnel_id: unSeul(lc(p, 'Via professionnel'), ids.professionnels, `clients › ${p.id} › Via professionnel`),
      via_client_id: unSeul(lc(p, 'Via client'), ids.clients, `clients › ${p.id} › Via client`),
      couple_client_id: unSeul(lc(p, 'Couple'), ids.clients, `clients › ${p.id} › Couple`),
    });
    // Personne de confiance : une ligne seulement si l'un de ses cinq champs est rempli.
    const confiance = {
      civilite: traduire(CIVILITES, lc(p, 'Personne de confiance - Genre'), `clients › ${p.id} › Personne de confiance - Genre`),
      prenom: lc(p, 'Personne de confiance - Prénom') as string | null,
      nom: lc(p, 'Personne de confiance - Nom') as string | null,
      telephone: lc(p, 'Personne de confiance - Téléphone') as string | null,
      email: lc(p, 'Personne de confiance - E-mail') as string | null,
    };
    if (Object.values(confiance).some((v) => v !== null)) {
      lignes.clients_confiance.push({ id: `confiance-${p.id}`, client_id: p.id, ...confiance, mis_a_jour_le: ms(p.last_edited_time), ...horodatage(p) });
    }
    const texte = corpsEnTexte(p.blocs);
    if (texte.trim()) lignes.clients_notes.push({ id: `note-${p.id}`, client_id: p.id, texte, ...horodatage(p) });
    // Les anciens questionnaires : un lien Drive dont le paragraphe dit qu'il en est un.
    for (const bloc of blocsAPlat(p.blocs)) {
      for (const lien of liensDuBloc(bloc)) {
        const fichier = fichierDrive(lien);
        if (!fichier) continue;
        if (!MOTIF_QUESTIONNAIRE.test(sansAccents(texteDuBloc(bloc)))) { rapport.autresLiensDrive.push(`clients › ${p.id}`); continue; }
        const id = `drive-${fichier}`;
        if (fichiersDrive.has(id)) { rapport.memeFichierDrive.push(`clients › ${p.id} › ${id}`); continue; }
        fichiersDrive.add(id);
        rapport.anciensQuestionnaires.push(id);
        const le = ms(bloc.created_time);
        lignes.questionnaires.push({
          id, contexte: 'seance', client_id: p.id, source: 'import_drive', drive_url: lien, created_at: le, updated_at: le,
        });
      }
    }
  }
  for (const [, fiches] of parCle) if (fiches.length > 1) rapport.memeCle.push(fiches.join(' · '));

  // ── Séances ──
  const ls = lecteur(exp, 'seances');
  const libellesInconnus = new Map<string, number>();
  const parReference = new Map<string, string[]>();
  for (const p of pages('seances')) {
    const statut = traduire(STATUTS_SEANCE, ls(p, 'Statut'), `seances › ${p.id} › Statut`);
    if (statut === null) { rapport.statutVide.push(p.id); continue; }
    const date = ls(p, 'Date') as string | null;
    if (date === null) { rapport.statutVide.push(`${p.id} (sans date)`); continue; }
    const titre = (ls(p, 'Name') as string | null) ?? '';
    const libelle = /\(([^()]*)\)\s*$/.exec(titre)?.[1]?.trim() ?? null;
    const cleType = libelle === null ? undefined : LIBELLES_TYPES[libelle];
    const type = cleType ? TYPES[cleType] : undefined;
    if (!type) {
      rapport.typesInconnus.push(p.id);
      const l = libelle ?? '(aucun libellé entre parenthèses)';
      libellesInconnus.set(l, (libellesInconnus.get(l) ?? 0) + 1);
    }
    const debut = instant(date);
    if (debut.sansHeure) rapport.sansHeure.push(p.id);
    const fin = finDeDate(p, 'Date');
    let duree = fin ? Math.round((instant(fin).t - debut.t) / MINUTE) : 0;
    if (!fin || duree <= 0) { rapport.sansFin.push(p.id); duree = type?.dureeMin ?? DUREE_PAR_DEFAUT_MIN; }
    const client = unSeul(ls(p, 'Clients'), ids.clients, `seances › ${p.id} › Clients`);
    if (((ls(p, 'Clients') as string[]) ?? []).length === 0) rapport.sansPersonne.push(p.id);
    let paiement = traduire(ETATS_PAIEMENT, ls(p, 'État paiement'), `seances › ${p.id} › État paiement`);
    if (paiement === null) { rapport.paiementVide.push(p.id); paiement = 'a_payer'; }
    const montantStancer = ls(p, 'stancer_payment_intent_amount') as number | null;
    lignes.seances.push({
      id: p.id, client_id: client, type_seance_id: type?.id ?? null, debut: debut.t, duree_min: duree,
      occupe_jusqua: debut.t + (duree + (type?.margeApresMin ?? 0)) * MINUTE, statut, etat_paiement: paiement,
      montant_centimes: montantStancer !== null ? Math.round(montantStancer * 100) : type?.montantCentimes ?? 0,
      clic_annonce: ls(p, 'gclid') as string | null, liste_attente: ls(p, 'recevoir_notification_disponibilite') ? 1 : 0,
      libelle_importe: titre || null, ...horodatage(p),
    });
    const texte = texteDesNotes({
      demande: ls(p, 'Demande') as string | null, objectif: ls(p, 'Objectif') as string | null, seance: corpsEnMarkdown(p.blocs),
    });
    const importNotion = corpsEnTexte(p.blocs).trim() ? corpsEnTexte(p.blocs) : null;
    if (texte !== null || importNotion !== null) {
      lignes.seances_notes.push({
        id: `notes-${p.id}`, seance_id: p.id, demande: null, objectif: null, seance: texte,
        travail_personnel: null, idees_suite: null, reponse_sms: null, import_notion: importNotion, ...horodatage(p),
      });
    }
    const reference = ls(p, 'stancer_payment_intent_id') as string | null;
    if (reference) parReference.set(reference, [...(parReference.get(reference) ?? []), p.id]);
    else if (paiement === 'payee') rapport.payeesSansStancer.push(p.id);
  }
  for (const [libelle, n] of [...libellesInconnus].sort()) rapport.libellesInconnus.push(`${libelle} : ${n}`);

  // Paiements : une ligne par référence Stancer, et seulement si une seule séance la porte.
  const seancesParId = new Map(lignes.seances.map((s) => [String(s.id), s]));
  for (const [reference, seances] of parReference) {
    if (seances.length > 1) { rapport.paiementsMemeReference.push(seances.join(' · ')); continue; }
    const s = seancesParId.get(seances[0])!;
    const page = pages('seances').find((x) => x.id === seances[0])!;
    lignes.paiements.push({
      id: `paiement-${s.id}`, seance_id: s.id, prestataire: 'stancer', reference, montant_centimes: s.montant_centimes,
      devise: 'EUR', statut: s.etat_paiement === 'payee' ? 'reussi' : 'cree', test: 0,
      facture_qonto_id: ls(page, 'qonto_client_invoice_id') as string | null, ...horodatage(page),
    });
  }

  // Deux séances prévues, à venir, qui se chevauchent — marge comprise : on s'arrête avant d'écrire.
  const avenir = lignes.seances.filter((s) => s.statut === 'prevue' && Number(s.debut) >= maintenant)
    .sort((a, b) => Number(a.debut) - Number(b.debut) || String(a.id).localeCompare(String(b.id)));
  const paires: [string, string][] = [];
  for (let i = 0; i < avenir.length; i++) {
    for (let j = i + 1; j < avenir.length && Number(avenir[j].debut) < Number(avenir[i].occupe_jusqua); j++) {
      paires.push([String(avenir[i].id), String(avenir[j].id)]);
    }
  }
  if (paires.length > 0) throw new Chevauchement(paires);

  // ── Évènements et inscriptions ──
  const le = lecteur(exp, 'evenements');
  for (const p of pages('evenements')) {
    const date = le(p, 'Date') as string | null;
    if (date === null) { rapport.valeursInconnues.push(`evenements › ${p.id} › Date = (vide)`); continue; }
    const debut = instant(date).t;
    const finTexte = finDeDate(p, 'Date');
    const type = le(p, "Type d'évènement") as string | null;
    if (type !== null && !(TYPES_EVENEMENT as readonly string[]).includes(type)) {
      rapport.valeursInconnues.push(`evenements › ${p.id} › Type d'évènement = ${type}`);
    }
    if (debut >= maintenant) rapport.evenementsSansPrix.push(p.id);
    lignes.evenements.push({
      id: p.id, nom: (le(p, 'Nom') as string) ?? '', type: type !== null && (TYPES_EVENEMENT as readonly string[]).includes(type) ? type : null,
      debut, fin: finTexte ? instant(finTexte).t : null, ville: le(p, 'Ville') as string | null,
      places_totales: le(p, 'Places totales') as number | null, prix_centimes: null,
      questionnaire_requis: le(p, 'Questionnaire de santé') ? 1 : 0, url_inscription: le(p, 'URL Inscription') as string | null,
      publie: le(p, 'Publié sur le site') ? 1 : 0, meta_description: le(p, 'Meta description') as string | null,
      html_permalink: le(p, 'HTML Permalink') as string | null, html_programme: le(p, 'HTML Programme') as string | null,
      html_prix: le(p, 'HTML Prix') as string | null, html_lieu_adresse: le(p, 'HTML Lieu - adresse') as string | null,
      html_lieu_instructions: le(p, 'HTML Lieu - instructions') as string | null, ...horodatage(p),
    });
    for (const client of (le(p, 'Clients') as string[]) ?? []) {
      if (!ids.clients.has(client)) { rapport.relationsAbsentes.push(`evenements › ${p.id} › Clients`); continue; }
      lignes.inscriptions.push({
        id: `inscription-${p.id}-${client}`, evenement_id: p.id, client_id: client, statut: 'confirmee', origine: 'import',
        ...horodatage(p),
      });
    }
  }

  return { lignes, liens, rapport };
};

/** Le rapport, lisible : une rubrique par section, les lignes par leur identifiant. */
export const rapportEnTexte = (r: Rapport): string => {
  const sections = (Object.keys(RUBRIQUES) as Rubrique[]).map((cle) =>
    `## ${RUBRIQUES[cle]} — ${r[cle].length}\n${r[cle].length ? r[cle].map((x) => `- ${x}`).join('\n') : '(aucune)'}`);
  return `# Ce qui demande un regard\n\nLes lignes sont désignées par leur identifiant (la page Notion), jamais par un nom.\n\n${sections.join('\n\n')}\n`;
};
