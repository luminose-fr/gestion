/**
 * Les tables de correspondance de l'import (SPEC §14.9.1, Annexe D) —
 * VERSIONNÉES, et ne contenant que des libellés : aucune donnée de personne.
 *
 * Ce que l'outil ne sait pas traduire, il ne le devine pas : la ligne est
 * reprise sans la valeur quand la colonne l'accepte, et le cas est listé dans
 * le rapport. C'est Florent qui complète ces tables, puis relance.
 */

/**
 * Le texte entre parenthèses du titre d'une séance (« Séance 4 (Séance à
 * distance) ») → la clé d'un type de `types_seance`. Un libellé absent d'ici :
 * la séance est reprise sans type, et le libellé est listé avec son nombre
 * d'occurrences.
 */
export const LIBELLES_TYPES: Record<string, string> = {
  'Rencontre': 'rencontre',
  'Rencontre — découvrir le breathwork': 'rencontre_breathwork',
  'Séance': 'seance',
  'Séance à distance': 'seance_distance',
  'Séance enfant': 'seance_enfant',
  'Séance de breathwork holotropique': 'seance_breathwork',
};

/**
 * Les types de départ (migrations-clients/0002_reference.sql) : identifiant,
 * durée et marge. Un test vérifie que ces valeurs sont celles de la migration.
 */
export const TYPES: Record<string, { id: string; dureeMin: number; margeApresMin: number; montantCentimes: number }> = {
  rencontre: { id: '9941effe-66b6-487a-81a0-b0bf833c17fb', dureeMin: 20, margeApresMin: 0, montantCentimes: 0 },
  rencontre_breathwork: { id: 'f65f2eda-d19e-47a7-adbc-7382d4507936', dureeMin: 20, margeApresMin: 0, montantCentimes: 0 },
  seance: { id: '4e7e5b6f-2217-4567-b227-14f2ecbc33b9', dureeMin: 90, margeApresMin: 0, montantCentimes: 8000 },
  seance_distance: { id: '62a866c3-35b0-40ec-8a99-848223a207ee', dureeMin: 90, margeApresMin: 0, montantCentimes: 8000 },
  seance_enfant: { id: '66375c3a-ae15-4b90-9ecc-6bb721d7e863', dureeMin: 60, margeApresMin: 0, montantCentimes: 6000 },
  seance_breathwork: { id: '96477be8-8460-4874-bc12-723ca512f586', dureeMin: 105, margeApresMin: 15, montantCentimes: 14000 },
};

/** Sans fin ni type reconnu : la durée retenue, et le cas est listé. */
export const DUREE_PAR_DEFAUT_MIN = 60;

export const CIVILITES: Record<string, string> = { 'Mme': 'Mme', 'M.': 'M.' };

export const STATUTS_SEANCE: Record<string, string> = {
  'Prévue': 'prevue', 'Réalisée': 'realisee', 'Annulée': 'annulee', 'Absent': 'absent',
};

export const ETATS_PAIEMENT: Record<string, string> = {
  'A payer': 'a_payer', 'À payer': 'a_payer', 'En attente paiement espèce': 'attente_especes',
  'Payée': 'payee', 'Offerte': 'offerte', 'Annulée': 'annulee',
};

export const TYPES_EVENEMENT = ['meditation', 'hypnose', 'respiration-holotropique'] as const;

/** « France - FR » → `FR` : le code qui suit le dernier tiret. Rien d'autre n'est deviné. */
export const codePays = (valeur: string): string | null => /\s-\s([A-Z]{2})$/.exec(valeur)?.[1] ?? null;

/**
 * Un ancien questionnaire se reconnaît à un lien vers Google Drive dont le
 * paragraphe dit qu'il en est un : ce motif, sans accents ni casse. Les autres
 * liens Drive ne créent rien, ils sont listés.
 */
export const MOTIF_QUESTIONNAIRE = /questionnaire/i;

/** Les titres de la trame d'une séance, tels que le modèle de page de Notion les porte. */
export const TITRES_TRAME: Record<string, 'seance' | 'travailPersonnel' | 'ideesSuite' | 'reponseSms'> = {
  'seance': 'seance',
  'travail personnel': 'travailPersonnel',
  'idees pour la suite': 'ideesSuite',
  'reponse sms': 'reponseSms',
};

// ─── Les propriétés attendues de chaque base (inventaire, §1) ───────────────

/** Ce que la transformation fait d'une propriété : la nature de la valeur lue. */
export type Nature = 'texte' | 'nombre' | 'date' | 'booleen' | 'choix' | 'liste' | 'relation';

export type Attendue = { nom: string; nature: Nature };

/**
 * Les propriétés qu'une base DOIT avoir, et la nature de valeur qu'on en tire.
 * Le TYPE Notion se lit dans le schéma exporté ; l'outil sait en lire une
 * famille (lire.ts) et s'arrête sur un type qu'il ne connaît pas.
 *
 * **Les noms de la personne de confiance sont à confirmer** contre le schéma
 * réel : l'inventaire ne les donne qu'en abrégé. S'ils diffèrent, l'outil
 * s'arrête en les nommant, et cette table se corrige.
 */
export const ATTENDUES: Record<'clients' | 'seances' | 'evenements' | 'professionnels', Attendue[]> = {
  clients: [
    { nom: 'Nom', nature: 'texte' },
    { nom: 'Genre', nature: 'choix' },
    { nom: 'Date de naissance', nature: 'date' },
    { nom: 'Email', nature: 'texte' },
    { nom: 'Phone', nature: 'texte' },
    { nom: 'Profession', nature: 'texte' },
    { nom: 'Adresse', nature: 'texte' },
    { nom: 'Code postal', nature: 'texte' },
    { nom: 'Ville', nature: 'texte' },
    { nom: 'Pays', nature: 'choix' },
    { nom: 'Origine', nature: 'choix' },
    { nom: 'Google Ads Keyword', nature: 'texte' },
    { nom: 'Via professionnel', nature: 'relation' },
    { nom: 'Via client', nature: 'relation' },
    { nom: 'Couple', nature: 'relation' },
    { nom: 'Personne de confiance - Genre', nature: 'choix' },
    { nom: 'Personne de confiance - Prénom', nature: 'texte' },
    { nom: 'Personne de confiance - Nom', nature: 'texte' },
    { nom: 'Personne de confiance - Téléphone', nature: 'texte' },
    { nom: 'Personne de confiance - E-mail', nature: 'texte' },
    { nom: 'stancer_customer_id', nature: 'texte' },
    { nom: 'qonto_client_id', nature: 'texte' },
    { nom: 'Nombre de séances', nature: 'nombre' },
  ],
  seances: [
    { nom: 'Name', nature: 'texte' },
    { nom: 'Date', nature: 'date' },
    { nom: 'Clients', nature: 'relation' },
    { nom: 'Statut', nature: 'choix' },
    { nom: 'État paiement', nature: 'choix' },
    { nom: 'Demande', nature: 'texte' },
    { nom: 'Objectif', nature: 'texte' },
    { nom: 'gclid', nature: 'texte' },
    { nom: 'stancer_payment_intent_id', nature: 'texte' },
    { nom: 'stancer_payment_intent_amount', nature: 'nombre' },
    { nom: 'qonto_client_invoice_id', nature: 'texte' },
    { nom: 'recevoir_notification_disponibilite', nature: 'booleen' },
  ],
  evenements: [
    { nom: 'Nom', nature: 'texte' },
    { nom: 'Date', nature: 'date' },
    { nom: "Type d'évènement", nature: 'choix' },
    { nom: 'Ville', nature: 'texte' },
    { nom: 'Clients', nature: 'relation' },
    { nom: 'Places totales', nature: 'nombre' },
    { nom: 'Places libres', nature: 'nombre' },
    { nom: 'Publié sur le site', nature: 'booleen' },
    { nom: 'Questionnaire de santé', nature: 'booleen' },
    { nom: 'URL Inscription', nature: 'texte' },
    { nom: 'Meta description', nature: 'texte' },
    { nom: 'HTML Permalink', nature: 'texte' },
    { nom: 'HTML Programme', nature: 'texte' },
    { nom: 'HTML Prix', nature: 'texte' },
    { nom: 'HTML Lieu - adresse', nature: 'texte' },
    { nom: 'HTML Lieu - instructions', nature: 'texte' },
  ],
  professionnels: [
    { nom: 'Nom', nature: 'texte' },
    { nom: 'Catégorie', nature: 'liste' },
    { nom: 'Spécialisation', nature: 'texte' },
    { nom: 'Adresse', nature: 'texte' },
    { nom: 'Code postal', nature: 'texte' },
    { nom: 'Ville', nature: 'texte' },
    { nom: 'Téléphone', nature: 'texte' },
    { nom: 'E-mail', nature: 'texte' },
    { nom: 'Site web', nature: 'texte' },
    { nom: 'Note', nature: 'texte' },
    { nom: 'Connu', nature: 'booleen' },
    { nom: 'Courriers envoyés', nature: 'liste' },
    { nom: 'Clients reçus', nature: 'nombre' },
  ],
};

/** Les propriétés connues et volontairement non reprises (Annexe D) : ni attendues, ni listées « en plus ». */
export const NON_REPRISES: Record<keyof typeof ATTENDUES, string[]> = {
  clients: ['Séances', 'Evènements', 'A recommandé', 'Dernière séance', 'Âge', 'Mot de passe (SHA-256)',
    'Prise de rendez-vous', 'Paiement stage respiration', 'Créer dans Stancer et Qonto'],
  seances: ['calendly_uri', 'calendly_cancel_uri', 'calendly_reschedule_uri'],
  evenements: ['cle'],
  professionnels: ['Adresse complète', 'Clients'],
};
