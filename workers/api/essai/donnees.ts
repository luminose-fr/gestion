/**
 * Le jeu d'essai de la base des clients (SPEC §14.8) — des identités FICTIVES.
 *
 * Aucune personne réelle : des adresses en `@example.org`, des téléphones de la
 * plage `+33 6 39 98 …`, des textes qui disent qu'ils sont d'essai. Ce fichier
 * est hors du contrôle de la règle 3 (§14.2) : il nomme les tables sensibles,
 * pour y poser quelques lignes manifestement factices.
 *
 * **Rejouable** : chaque ligne a un identifiant fixe, préfixé `essai-`, et
 * s'écrit par `INSERT … ON CONFLICT(id) DO UPDATE` — jamais un `DELETE`, dont
 * les cascades pourraient atteindre une ligne qui ne porte pas le préfixe.
 *
 * **Les dates se calculent depuis une date de référence** (aujourd'hui par
 * défaut) : « à venir » ne vieillit pas. Rien ne lit l'horloge ici — ni les
 * horodatages, ni les échéances : deux chargements à la même date écrivent le
 * même contenu, octet pour octet. Un test le vérifie.
 *
 * Ce module ne fait que composer : `charger.ts` vérifie la cible et appelle
 * wrangler.
 */
import { cleClient, nomRecherche, normaliserEmail, normaliserNom } from '@luminose/pratique';

const MINUTE = 60_000;
const HEURE = 60 * MINUTE;
const JOUR = 24 * HEURE;

/** Les identifiants des types de départ (migrations-clients/0002_reference.sql). */
const TYPES = {
  rencontre: '9941effe-66b6-487a-81a0-b0bf833c17fb',
  rencontre_breathwork: 'f65f2eda-d19e-47a7-adbc-7382d4507936',
  seance: '4e7e5b6f-2217-4567-b227-14f2ecbc33b9',
  seance_distance: '62a866c3-35b0-40ec-8a99-848223a207ee',
  seance_enfant: '66375c3a-ae15-4b90-9ecc-6bb721d7e863',
  seance_breathwork: '96477be8-8460-4874-bc12-723ca512f586',
} as const;
type CleType = keyof typeof TYPES;

/** Durée, marge et tarif de chaque type, tels que 0002_reference.sql les pose. */
const GABARITS: Record<CleType, { duree: number; marge: number; montant: number; etat: string; mode: string }> = {
  rencontre: { duree: 20, marge: 0, montant: 0, etat: 'offerte', mode: 'visio' },
  rencontre_breathwork: { duree: 20, marge: 0, montant: 0, etat: 'offerte', mode: 'visio' },
  seance: { duree: 90, marge: 0, montant: 8000, etat: 'a_payer', mode: 'sur_place' },
  seance_distance: { duree: 90, marge: 0, montant: 8000, etat: 'a_payer', mode: 'visio' },
  seance_enfant: { duree: 60, marge: 0, montant: 6000, etat: 'a_payer', mode: 'sur_place' },
  seance_breathwork: { duree: 105, marge: 15, montant: 14000, etat: 'a_payer', mode: 'sur_place' },
};

/** Ce que le jeu d'essai écrit, table par table. Le test le recompte dans une base chargée. */
export const EFFECTIFS = {
  professionnels: 1,
  // Les identités de la tâche 3 : une mère et son enfant à la même adresse,
  // deux fiches de même clé (« à rapprocher »), une fiche sans adresse. Et,
  // pour la console : une fiche venue par un professionnel, une fiche qui en a
  // recommandé une autre (la mère, pour son enfant), un couple.
  clients: 8,
  // Une à venir par type (6) ; cinq passées pour une fiche, dont une annulée ;
  // une sans client, qui garde l'identité reçue.
  seances: 12,
  // Un « créée » par séance, et l'annulation.
  seances_mouvements: 13,
  // Une place libre ; complet ; inscription ailleurs.
  evenements: 3,
  inscriptions: 6,
  paiements: 2,
  // Les tables sensibles : quelques lignes, manifestement factices.
  seances_notes: 1,
  questionnaires: 1,
  // La console (phase C1) : une note de fiche et une personne de confiance, factices.
  clients_confiance: 1,
  clients_notes: 1,
  seances_reponses: 0,
  // Phase S2a : de quoi recevoir un questionnaire et composer son accusé de
  // réception. Factices l'un et l'autre, et hors des migrations : les vrais
  // textes viennent avec les écrans et le lot F.
  textes_versions: 1,
  messages_modeles: 1,
} as const;

export type Table = keyof typeof EFFECTIFS;
type Ligne = Record<string, string | number | null>;
export type JeuDEssai = { table: Table; lignes: Ligne[] }[];

// ─── Le temps : une date de référence, l'heure de Paris ─────────────────────

/** Le décalage de Paris sur UTC à un instant donné, en millisecondes. */
const decalageParis = (instant: number): number => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(instant).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - instant;
};

/** `2026-12-07` à `09:30`, heure de Paris → un instant en millisecondes UTC (§14.7). */
export const aParis = (jour: number, heure: string): number => {
  const [h, m] = heure.split(':').map(Number);
  const naif = jour + h * HEURE + m * MINUTE;
  // Deux passes : le décalage d'un changement d'heure se lit à l'instant visé.
  const premier = naif - decalageParis(naif);
  return naif - decalageParis(premier);
};

/** `AAAA-MM-JJ` → minuit UTC de ce jour, la base des calculs de dates. */
export const lireDate = (texte: string): number => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texte);
  const jour = m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN;
  if (!m || Number.isNaN(jour) || new Date(jour).toISOString().slice(0, 10) !== texte) {
    throw new Error(`Date de référence « ${texte} » : attendue au format AAAA-MM-JJ.`);
  }
  return jour;
};

/** Aujourd'hui, à Paris. */
export const aujourdhui = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(Date.now());

/** Le premier jour de la semaine voulue (1 = lundi … 7 = dimanche) à partir de `jour`, inclus. */
const prochain = (jour: number, jourSemaine: number): number => {
  const courant = ((new Date(jour).getUTCDay() + 6) % 7) + 1;
  return jour + ((jourSemaine - courant + 7) % 7) * JOUR;
};

// ─── Les identités ──────────────────────────────────────────────────────────

type Identite = { id: string; prenom: string; nom: string; email: string | null; telephone: string; civilite: string };

/** Les identités du tableau de la tâche 3 (packages/pratique/test/client.test.ts). */
const IDENTITES: Identite[] = [
  { id: 'essai-client-emilie', prenom: 'Émilie', nom: 'Martin', email: 'emilie.martin@example.org', telephone: '+33 6 39 98 00 01', civilite: 'Mme' },
  // Son enfant : une autre fiche, avec l'adresse de sa mère — une autre clé.
  { id: 'essai-client-leo', prenom: 'Léo', nom: 'Martin', email: 'emilie.martin@example.org', telephone: '+33 6 39 98 00 01', civilite: 'M.' },
  // La même clé que la mère, écrite autrement : le cas « à rapprocher » (§14.4).
  { id: 'essai-client-emilie-double', prenom: 'MARTIN', nom: 'émilie', email: ' Emilie.Martin@Example.org ', telephone: '+33 6 39 98 00 02', civilite: 'Mme' },
  // Sans adresse : pas de clé, la fiche ne se rattache jamais d'elle-même.
  { id: 'essai-client-sans-adresse', prenom: 'Émilie', nom: 'Martin', email: null, telephone: '+33 6 39 98 00 03', civilite: 'Mme' },
  { id: 'essai-client-eve', prenom: 'Ève', nom: 'Dupont-Lévêque', email: 'eve.dupont@example.org', telephone: '+33 6 39 98 00 04', civilite: 'Mme' },
  { id: 'essai-client-jeanluc', prenom: 'Jean‑Luc', nom: 'Petit', email: 'jeanluc.petit@example.org', telephone: '+33 6 39 98 00 05', civilite: 'M.' },
  { id: 'essai-client-jp', prenom: 'Jean-Pierre', nom: 'L’Hôte', email: 'jp.lhote@example.org', telephone: '+33 6 39 98 00 06', civilite: 'M.' },
  { id: 'essai-client-oenone', prenom: 'Œnone', nom: 'Roux', email: 'oenone.roux@example.org', telephone: '+33 6 39 98 00 07', civilite: 'Mme' },
];

// ─── Le jeu ─────────────────────────────────────────────────────────────────

/** Le jeu d'essai pour une date de référence (`AAAA-MM-JJ`, heure de Paris). */
export const jeuDEssai = (dateReference: string): JeuDEssai => {
  const jour = lireDate(dateReference);
  // L'instant de référence : midi à Paris. Horodatages et échéances en partent.
  const maintenant = aParis(jour, '12:00');
  const t = { created_at: maintenant, updated_at: maintenant };

  const professionnels: Ligne[] = [{
    id: 'essai-pro-cabinet', nom: 'Cabinet d’essai', categories: '["Médecin généraliste"]', specialisation: null,
    adresse: '1 rue de l’Exemple', code_postal: '75000', ville: 'Ville d’essai', telephone: '+33 6 39 98 00 90',
    email: 'cabinet@example.org', site_web: 'https://example.org', note: 'Texte d’essai', connu: 1,
    courriers: '["Courrier d’essai"]', ...t, deleted_at: null,
  }];

  const clients: Ligne[] = IDENTITES.map((p) => {
    const prenom = normaliserNom(p.prenom);
    const nom = normaliserNom(p.nom);
    const email = p.email === null ? null : normaliserEmail(p.email);
    return {
      id: p.id, civilite: p.civilite, prenom, nom, nom_recherche: nomRecherche(prenom, nom),
      cle_client: cleClient(p.email, p.prenom, p.nom), email, telephone: p.telephone,
      date_naissance: p.id === 'essai-client-leo' ? '2016-05-12' : null, profession: null,
      adresse: null, code_postal: null, ville: 'Ville d’essai', pays: 'FR', origine: 'Essai',
      mot_cle_google_ads: null, clic_annonce: null, clic_date: null,
      // Un professionnel, relié à une fiche ; l'enfant, venu par sa mère.
      via_professionnel_id: p.id === 'essai-client-eve' ? 'essai-pro-cabinet' : null,
      via_client_id: p.id === 'essai-client-leo' ? 'essai-client-emilie' : null,
      couple_client_id: null, stancer_customer_id: null, qonto_client_id: null,
      brevo_ajoute_le: null, compta_wlu_ajoute_le: null, ...t,
    };
  });

  // Les séances. La semaine à venir : le premier lundi et le premier jeudi au
  // moins une semaine après la référence, aux heures de la semaine type. Rien
  // ne se chevauche, marge comprise : la règle 6 n'écrit pas ce fichier, mais
  // un agenda d'essai qui la violerait tromperait l'œil.
  const lundi = prochain(jour + 7 * JOUR, 1);
  const jeudi = prochain(jour + 7 * JOUR, 4);
  const seances: Ligne[] = [];
  const mouvements: Ligne[] = [];
  const seance = (id: string, cle: CleType, debut: number, client: string | null, statut = 'prevue', champs: Ligne = {}) => {
    const g = GABARITS[cle];
    seances.push({
      id, client_id: client, type_seance_id: TYPES[cle], identite_recue: null, debut, duree_min: g.duree,
      occupe_jusqua: debut + (g.duree + g.marge) * MINUTE, revision: 0, statut,
      etat_paiement: statut === 'prevue' ? g.etat : g.montant > 0 ? 'payee' : 'offerte',
      montant_centimes: g.montant, mode: g.mode, visio_url: null,
      agenda_evenement_id: null, agenda_etat: 'a_ecrire', liens_version: 1, liste_attente: 0,
      conditions_acceptees_le: null, conditions_version: null, questionnaire_id: null, origine: 'console',
      clic_annonce: null, provenance: null, conversion_importee_le: null, conversion_retiree_le: null,
      libelle_importe: null, ...t, ...champs,
    });
    mouvements.push({
      id: `${id}-creee`, seance_id: id, nature: 'creee', par: 'florent', ancien_debut: null, nouveau_debut: debut,
      revision: 0, ...t,
    });
  };

  seance('essai-seance-avenir-seance', 'seance', aParis(lundi, '09:30'), 'essai-client-emilie');
  seance('essai-seance-avenir-breathwork', 'seance_breathwork', aParis(lundi, '13:00'), 'essai-client-jeanluc');
  seance('essai-seance-avenir-rencontre', 'rencontre', aParis(lundi, '16:30'), 'essai-client-oenone');
  seance('essai-seance-avenir-distance', 'seance_distance', aParis(jeudi, '09:30'), 'essai-client-eve');
  seance('essai-seance-avenir-enfant', 'seance_enfant', aParis(jeudi, '13:00'), 'essai-client-leo');
  seance('essai-seance-avenir-rencontre-breathwork', 'rencontre_breathwork', aParis(jeudi, '16:30'), 'essai-client-jp');
  // Sans client : l'adresse de l'envoi est celle de deux fiches de même clé.
  seance('essai-seance-a-rapprocher', 'rencontre', aParis(jeudi, '17:00'), null, 'prevue', {
    identite_recue: JSON.stringify({ prenom: 'Émilie', nom: 'Martin', email: 'emilie.martin@example.org', telephone: '+33 6 39 98 00 08' }),
    origine: 'site',
  });
  // Cinq séances passées pour une même fiche, un lundi sur deux ; la troisième annulée.
  const lundiPasse = prochain(jour - 7 * JOUR, 1);
  for (let k = 1; k <= 5; k++) {
    const id = `essai-seance-passee-${k}`;
    const debut = aParis(lundiPasse - (k - 1) * 14 * JOUR, '09:30');
    seance(id, 'seance', debut, 'essai-client-emilie', k === 3 ? 'annulee' : 'realisee');
    if (k === 3) {
      seances[seances.length - 1].etat_paiement = 'annulee';
      mouvements.push({ id: `${id}-annulee`, seance_id: id, nature: 'annulee', par: 'florent', ancien_debut: debut, nouveau_debut: null, revision: 0, ...t });
    }
  }

  // Les évènements, un samedi à venir.
  const samedi = prochain(jour + 14 * JOUR, 6);
  const evenement = (id: string, nom: string, places: number | null, prix: number | null, url: string | null, decalage: number): Ligne => ({
    id, nom, type: 'respiration-holotropique', debut: aParis(samedi + decalage * 7 * JOUR, '10:00'),
    fin: aParis(samedi + decalage * 7 * JOUR, '17:00'), ville: 'Ville d’essai', places_totales: places, prix_centimes: prix,
    questionnaire_requis: 1, url_inscription: url, publie: 0, publie_le: null, publication_empreinte: null,
    meta_description: 'Texte d’essai', html_permalink: null, html_programme: null, html_prix: null,
    html_lieu_adresse: null, html_lieu_instructions: null, ...t, deleted_at: null,
  });
  const evenements: Ligne[] = [
    // Quatre places, trois occupées : la dernière place se joue ici.
    evenement('essai-evenement-une-place', 'Journée d’essai — une place libre', 4, 9000, null, 0),
    evenement('essai-evenement-complet', 'Journée d’essai — complète', 2, 9000, null, 1),
    evenement('essai-evenement-ailleurs', 'Journée d’essai — inscription ailleurs', 12, null, 'https://example.org/inscription-essai', 2),
  ];

  const inscription = (id: string, evenementId: string, client: string, statut: string, reference: string, champs: Ligne = {}): Ligne => ({
    id, evenement_id: evenementId, client_id: client, statut, retenue_jusqua: null, mode_paiement: null,
    montant_centimes: 9000, code_promo: null, questionnaire_id: null, reference, identite_recue: null,
    liens_version: 1, provenance: null, origine: 'console', ...t, ...champs,
  });
  const inscriptions: Ligne[] = [
    inscription('essai-inscription-confirmee', 'essai-evenement-une-place', 'essai-client-emilie', 'confirmee', 'ESSAI-UP-01'),
    inscription('essai-inscription-payee', 'essai-evenement-une-place', 'essai-client-eve', 'payee', 'ESSAI-UP-02'),
    // Par virement : elle compte, son délai passé ou non.
    inscription('essai-inscription-virement', 'essai-evenement-une-place', 'essai-client-jeanluc', 'retenue', 'ESSAI-UP-03',
      { mode_paiement: 'virement', retenue_jusqua: maintenant + 120 * HEURE }),
    // Par carte, délai passé : elle ne compte plus, même restée « retenue » (§14.4).
    inscription('essai-inscription-carte-echue', 'essai-evenement-une-place', 'essai-client-oenone', 'retenue', 'ESSAI-UP-04',
      { mode_paiement: 'carte', retenue_jusqua: maintenant - HEURE }),
    inscription('essai-inscription-complet-1', 'essai-evenement-complet', 'essai-client-jp', 'confirmee', 'ESSAI-CO-01'),
    inscription('essai-inscription-complet-2', 'essai-evenement-complet', 'essai-client-eve', 'confirmee', 'ESSAI-CO-02'),
  ];

  const paiements: Ligne[] = [
    {
      id: 'essai-paiement-seance', seance_id: 'essai-seance-passee-1', inscription_id: null, prestataire: 'stancer',
      reference: 'essai-pi-seance-1', montant_centimes: 8000, devise: 'EUR', statut: 'reussi', test: 1,
      facture_qonto_id: null, reussi_le: maintenant - 7 * JOUR, rembourse_le: null, ...t,
    },
    {
      id: 'essai-paiement-inscription', seance_id: null, inscription_id: 'essai-inscription-payee', prestataire: 'stripe',
      reference: 'essai-pi-inscription-1', montant_centimes: 9000, devise: 'EUR', statut: 'reussi', test: 1,
      facture_qonto_id: null, reussi_le: maintenant - JOUR, rembourse_le: null, ...t,
    },
  ];

  // Les tables sensibles : deux lignes, et qu'on ne puisse pas les prendre pour vraies.
  const notes: Ligne[] = [{
    id: 'essai-note-seance', seance_id: 'essai-seance-passee-1', demande: 'Texte d’essai', objectif: 'Texte d’essai',
    seance: 'Texte d’essai', travail_personnel: null, idees_suite: null, reponse_sms: null, import_notion: null, ...t,
  }];
  const questionnaires: Ligne[] = [{
    id: 'essai-questionnaire', envoi_id: 'essai-envoi-questionnaire', contexte: 'seance', version: 'complet',
    version_formulaire: 'essai', client_id: 'essai-client-jeanluc', seance_id: 'essai-seance-avenir-breathwork',
    inscription_id: null, evenement_id: null,
    identite: JSON.stringify({ prenom: 'Jean-Luc', nom: 'Petit' }), coordonnees: null, confiance: null,
    reponses: JSON.stringify({ questions: [{ libelle: 'Question d’essai', reponse: 'Texte d’essai' }], texte: 'Texte d’essai' }),
    nb_oui: 0, autorisation_parentale: 'sans_objet', declaration: 1, accord_conservation: 1,
    accord_texte: 'Texte d’essai', accord_le: maintenant, rattachement: 'fait', a_revoir: 0, relu_le: null,
    pdf_cle: null, pdf_le: null, source: 'site', drive_url: null, ...t,
  }];

  // Phase S2a : le texte d'accord que le questionnaire d'essai accepte, et le
  // modèle de son accusé de réception.
  const textes: Ligne[] = [{
    id: 'essai-texte-accord-v1', cle: 'accord_conservation', version: 1,
    texte: 'Texte d’essai — accord de conservation, factice.', en_vigueur_le: maintenant, ...t,
  }];
  const modeles: Ligne[] = [{
    id: 'essai-modele-questionnaire-accuse', cle: 'questionnaire_accuse', canal: 'email', version: 1,
    objet: 'Accusé de réception d’essai', corps: 'Texte d’essai — accusé de réception, {{prenom}}.', deleted_at: null, ...t,
  }];

  // La console (phase C1) : de quoi remplir les cartes d'une fiche.
  const notesFiche: Ligne[] = [{ id: 'essai-note-fiche', client_id: 'essai-client-emilie', texte: 'Texte d’essai — note de fiche', ...t }];
  const confiance: Ligne[] = [{
    id: 'essai-confiance', client_id: 'essai-client-emilie', civilite: 'M.', prenom: 'Personne', nom: 'D’essai',
    telephone: '+33 6 39 98 00 60', email: 'confiance@example.org', mis_a_jour_le: maintenant, questionnaire_id: null, ...t,
  }];

  // Dans l'ordre des renvois : ce qui est désigné avant ce qui désigne.
  return [
    { table: 'textes_versions', lignes: textes },
    { table: 'messages_modeles', lignes: modeles },
    { table: 'professionnels', lignes: professionnels },
    { table: 'clients', lignes: clients },
    { table: 'seances', lignes: seances },
    { table: 'seances_mouvements', lignes: mouvements },
    { table: 'evenements', lignes: evenements },
    { table: 'inscriptions', lignes: inscriptions },
    { table: 'paiements', lignes: paiements },
    { table: 'seances_notes', lignes: notes },
    { table: 'questionnaires', lignes: questionnaires },
    { table: 'clients_notes', lignes: notesFiche },
    { table: 'clients_confiance', lignes: confiance },
  ];
};

/** La séance que le jeu relie à son questionnaire, en fin de fichier (`enSql`). */
const SEANCE_AVEC_QUESTIONNAIRE = 'essai-seance-avenir-breathwork';

/**
 * Les séances du jeu qui attendent un questionnaire : prévues, et sans
 * questionnaire rattaché. Ce sont celles dont Réglages → Porte publique sait
 * fabriquer un lien d'essai (phase S2b). Des identifiants, rien de plus.
 */
export const seancesQuiAttendentUnQuestionnaire = (jeu: JeuDEssai): string[] =>
  (jeu.find((t) => t.table === 'seances')?.lignes ?? [])
    .filter((s) => s.statut === 'prevue' && s.questionnaire_id === null && s.id !== SEANCE_AVEC_QUESTIONNAIRE)
    .map((s) => String(s.id));

// ─── Le SQL ─────────────────────────────────────────────────────────────────

const litteral = (v: string | number | null): string =>
  v === null ? 'NULL' : typeof v === 'number' ? String(v) : `'${v.replace(/'/g, "''")}'`;

/**
 * Le jeu en SQL : une instruction par ligne, `INSERT … ON CONFLICT(id) DO
 * UPDATE`. Rejouée, elle remet chaque ligne `essai-` dans l'état du jeu, et ne
 * touche à rien d'autre. La séance qui renvoie à son questionnaire se relie en
 * dernier : chacun des deux désigne l'autre.
 */
export const enSql = (jeu: JeuDEssai): string => {
  const instructions: string[] = [];
  for (const { table, lignes } of jeu) {
    for (const ligne of lignes) {
      if (!String(ligne.id).startsWith('essai-')) throw new Error(`Ligne sans préfixe essai- : ${table}`);
      const colonnes = Object.keys(ligne);
      const maj = colonnes.filter((c) => c !== 'id').map((c) => `${c} = excluded.${c}`).join(', ');
      instructions.push(
        `INSERT INTO ${table} (${colonnes.join(', ')}) VALUES (${colonnes.map((c) => litteral(ligne[c])).join(', ')})\n` +
        `  ON CONFLICT(id) DO UPDATE SET ${maj};`,
      );
    }
  }
  instructions.push(`UPDATE seances SET questionnaire_id = 'essai-questionnaire' WHERE id = '${SEANCE_AVEC_QUESTIONNAIRE}';`);
  // Un couple, lié des deux côtés : chacune des deux fiches désigne l'autre, d'où la fin du fichier.
  instructions.push(`UPDATE clients SET couple_client_id = 'essai-client-oenone' WHERE id = 'essai-client-jeanluc';`);
  instructions.push(`UPDATE clients SET couple_client_id = 'essai-client-jeanluc' WHERE id = 'essai-client-oenone';`);
  return `-- Jeu d'essai de la base des clients — identités fictives (SPEC §14.8).\n${instructions.join('\n')}\n`;
};
