/**
 * Google Tag Manager, préparer — décision du 09/10/2026
 * (workers/mcp/decisions/2026-10-09-gtm-ecriture.md). Trois outils, qui
 * CRÉENT dans l'espace de travail « [Claude] » du conteneur, et rien
 * d'autre : un déclencheur, une balise de conversion Google Ads, une balise
 * d'événement GA4. Florent relit l'espace dans Tag Manager et le publie ; ce
 * serveur ne le peut pas.
 *
 * Ce que le modèle ne recopie jamais : l'identifiant et le libellé d'une
 * conversion, lus dans Google Ads ; l'identifiant de mesure GA4, lu dans les
 * balises Google du conteneur. Il désigne ; le serveur lit (G10). Une
 * recopie qui se trompe d'un caractère ne mesure rien, sans le dire.
 */
import { z } from 'zod';
import { compteEcriture } from './ecriture';
import { ecrireGtm } from './ecriture-gtm';
import { connexionPour, rechercher } from './google-ads';
import { ESPACE_CLAUDE, contenuEspace, versionEnLigne, type Balise, type Conteneur, type Contenu, type Declencheur, type Espace, type Parametre } from './gtm';
import { DECLENCHEURS_INTEGRES, ENVOI, balisesDeConversion, blocBalise, indexDeclencheurs, param, resoudre, resumeDeclencheur } from './outils-gtm';
import { JETON } from './outils-ecriture';
import { outil, texte } from './outil';
import { marquer } from './regles';
import { Refus } from './refus';
import type { Env } from './env';

const ECRITURE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };

const DEUX_TEMPS =
  'Deux temps, toujours. 1) Appeler SANS jeton : rien ne part, l’outil rend un aperçu — ce qui serait créé, paramètre par ' +
  "paramètre — et un jeton. 2) Montrer l'aperçu à Florent ; s'il valide, rappeler avec les MÊMES arguments et le jeton. Un jeton " +
  'vaut dix minutes, une fois, et seulement pour le contenu de son aperçu.';

const DANS_L_ESPACE =
  'Tout se crée dans l’espace de travail « [Claude] » du conteneur, ouvert au premier besoin — jamais dans « Default Workspace », ' +
  'jamais en ligne. Ce serveur ne peut ni publier ni créer de version : son jeton ne le permet pas. Florent relit l’espace dans ' +
  'Tag Manager et le publie ; gtm_verifier_conversions et gtm_lire, avec espace = son identifiant, montrent ce qu’il publierait. ' +
  'Rien ne se modifie ni ne se supprime par ce serveur.';

const RIEN_NE_PART =
  `Rien ne part sur le site : l'élément n'existera que dans l'espace « ${ESPACE_CLAUDE} », que Florent relit et publie dans Tag Manager.`;

const ID = z.string().regex(/^\d{1,20}$/, 'identifiant numérique');
const NOM = z.string().min(1).max(100).regex(/^[^<>]+$/, 'sans < ni >');
const NOM_VARIABLE = z.string().min(1).max(100).regex(/^[^{}<>]+$/, 'le nom seul, sans accolades');
const DECLENCHEURS = z.array(ID).min(1).max(5)
  .describe('Les déclencheurs qui la font partir, par identifiant (n° …) : gtm_lire quoi = declencheurs les donne, gtm_declencheur_creer en crée un. ' +
    '2147479553 : toutes les pages.');

/** Le déclencheur intégré « All Pages » — le seul permis à une balise créée ici. */
const TOUTES_LES_PAGES = '2147479553';
const NOTES = 'Préparé par Claude (serveur MCP mcp.luminose.fr), dans une conversation. Relire avant de publier.';
/** « Aucun consentement supplémentaire » : la convention des balises Google du conteneur, dont le mode Consentement règle déjà le comportement. */
const CONSENTEMENT = { consentStatus: 'notNeeded' };

const p = (key: string, value: string): Parametre => ({ type: 'template', key, value });
const b = (key: string, value: boolean): Parametre => ({ type: 'boolean', key, value: String(value) });

// ── Ce que l'aperçu vérifie ──────────────────────────────────────────────

/** L'espace « [Claude] » s'il existe ; sinon la version en ligne, dont il partira. */
const lireContenu = (env: Env, c: Conteneur, espace: Espace | undefined): Promise<Contenu> =>
  (espace ? contenuEspace(env, c, espace) : versionEnLigne(env, c));

const ou = (espace: Espace | undefined, contenu: Contenu) => (espace
  ? `dans l'espace de travail « ${ESPACE_CLAUDE} » (n° ${espace.workspaceId})`
  : `dans un espace de travail « ${ESPACE_CLAUDE} », ouvert à l'exécution depuis la dernière version du conteneur (vérifié sur ${contenu.source})`);

const exigerNomLibre = (noms: (string | undefined)[], nom: string, quoi: string, contenu: Contenu) => {
  if (noms.includes(nom)) throw new Refus(`${quoi} se nomme déjà « ${nom} » dans ${contenu.source} : choisir un autre nom.`, 409);
};

/** Une variable citée : intégrée et activée, ou définie dans le conteneur. Ce serveur n'en crée ni n'en active aucune. */
const exigerVariables = (noms: string[], contenu: Contenu) => {
  const inconnues = [...new Set(noms)].filter((n) => !contenu.integrees.includes(n) && !contenu.variables.some((v) => v.name === n));
  if (inconnues.length) {
    throw new Refus(`Variable(s) inconnue(s) dans ${contenu.source} : ${inconnues.map((n) => `{{${n}}}`).join(', ')}. ` +
      'gtm_lire quoi = variables liste les variables du conteneur et les variables intégrées activées. Une variable intégrée ' +
      's’active, une variable se crée, dans Tag Manager : ce serveur ne le fait pas.', 404);
  }
};

const exigerDeclencheurs = (ids: string[], contenu: Contenu) => {
  const reserves = ids.filter((id) => DECLENCHEURS_INTEGRES[id] && id !== TOUTES_LES_PAGES);
  if (reserves.length) {
    throw new Refus(`${reserves.map((id) => `« ${DECLENCHEURS_INTEGRES[id]} »`).join(', ')} : réservé aux balises de configuration ` +
      'et de consentement, pas à une conversion ni à un événement.');
  }
  const index = indexDeclencheurs(contenu);
  const inconnus = ids.filter((id) => id !== TOUTES_LES_PAGES && !index.has(id));
  if (inconnus.length) {
    throw new Refus(`Déclencheur(s) introuvable(s) dans ${contenu.source} : ${inconnus.map((id) => `n° ${id}`).join(', ')}. ` +
      'gtm_lire quoi = declencheurs les liste, avec leur numéro ; gtm_declencheur_creer en crée un.', 404);
  }
};

// ── gtm_declencheur_creer ────────────────────────────────────────────────

const OPERATEURS = {
  egale: 'equals', contient: 'contains', commence_par: 'startsWith', finit_par: 'endsWith', regex: 'matchRegex', selecteur_css: 'cssSelector',
} as const;
type Operateur = keyof typeof OPERATEURS;

const TYPES = { vue_de_page: 'pageview', evenement: 'customEvent', clic: 'click' } as const;

const condition = (variable: string, operateur: Operateur, valeur: string, negation?: boolean) => ({
  type: OPERATEURS[operateur],
  parameter: [p('arg0', `{{${variable}}}`), p('arg1', valeur), ...(negation ? [b('negate', true)] : [])],
});

const declencheurCreer = outil({
  name: 'gtm_declencheur_creer',
  title: 'Tag Manager — créer un déclencheur',
  description: [
    'Crée un déclencheur dans l’espace de travail « [Claude] » du conteneur Google Tag Manager du site : une vue de page, un ' +
    'événement poussé dans la couche de données, ou un clic sur un élément — les trois formes que le conteneur emploie. ' +
    'Le site marque ses boutons d’un data-track : un clic se reconnaît par selecteur_css sur Click Element, ex. ' +
    'a[data-track="bt_prise_rdv"], a[data-track="bt_prise_rdv"] *. Lire d’abord les déclencheurs existants (gtm_lire quoi = declencheurs) : ' +
    'celui qu’il faut existe peut-être déjà.',
    '',
    'Un déclencheur seul ne fait rien partir : une balise le cite ensuite par son numéro (gtm_conversion_creer, gtm_evenement_ga4_creer).',
    '',
    DEUX_TEMPS,
    '',
    DANS_L_ESPACE,
  ].join('\n'),
  schema: z.object({
    nom: NOM.describe('Le nom du déclencheur ; le serveur le préfixe de « [Claude] ».'),
    type: z.enum(['vue_de_page', 'evenement', 'clic']).describe('vue_de_page : conditions sur Page Path, Page URL… ; evenement : un événement ' +
      'de la couche de données, par son nom ; clic : un clic sur un élément, conditions sur Click Element, Click Text…'),
    evenement: z.string().regex(/^[A-Za-z0-9_.:-]{1,100}$/, 'lettres, chiffres, _ . : -').optional()
      .describe('evenement seulement : le nom que le site pousse — dataLayer.push({ event: … }).'),
    conditions: z.array(z.object({
      variable: NOM_VARIABLE.describe('Le nom de la variable, sans accolades : Page Path, Page URL, Click Element, Click Text… ou une variable du conteneur.'),
      operateur: z.enum(Object.keys(OPERATEURS) as [Operateur, ...Operateur[]]),
      valeur: z.string().min(1).max(500).describe('Le texte comparé, tel quel — sans {{variable}}.'),
      negation: z.boolean().optional().describe('true : la condition est inversée (ne contient pas…).'),
    }).strict()).max(5).optional().describe('Toutes doivent être vraies. Au moins une, sauf pour evenement, dont le nom suffit.'),
    jeton: JETON,
  }).strict(),
  annotations: ECRITURE,
  async executer({ nom, type, evenement, conditions = [], jeton }, env, contexte) {
    if (type === 'evenement' && !evenement) throw new Refus('Un déclencheur evenement nomme son événement : `evenement`.');
    if (type !== 'evenement' && evenement) throw new Refus('`evenement` ne sert qu’au type evenement.');
    if (evenement?.startsWith('gtm.')) throw new Refus('Les événements gtm.* sont ceux de Tag Manager lui-même : vue_de_page ou clic les couvrent.');
    // Sans condition, la balise partirait à chaque page, ou à chaque clic.
    if (type !== 'evenement' && conditions.length === 0) {
      throw new Refus(`Un déclencheur ${type} sans condition partirait à chaque ${type === 'clic' ? 'clic' : 'page'} : donner au moins une condition.`);
    }
    for (const k of conditions) {
      if (k.operateur === 'selecteur_css' && (type !== 'clic' || k.variable !== 'Click Element')) {
        throw new Refus('selecteur_css : seulement sur un clic, avec la variable Click Element.');
      }
      if (/\{\{|\}\}|</.test(k.valeur)) throw new Refus(`Valeur « ${k.valeur} » : du texte, sans {{variable}} ni balisage.`);
      if (k.operateur === 'regex') {
        try { new RegExp(k.valeur); } catch { throw new Refus(`Expression régulière invalide : ${k.valeur}`); }
      }
    }
    const nomComplet = marquer(nom);
    const corps = {
      name: nomComplet,
      type: TYPES[type],
      ...(type === 'evenement' ? { customEventFilter: [condition('_event', 'egale', evenement!)] } : {}),
      ...(conditions.length ? { filter: conditions.map((k) => condition(k.variable, k.operateur, k.valeur, k.negation)) } : {}),
      notes: NOTES,
    };

    return texte(await ecrireGtm(env, contexte, {
      outil: 'gtm_declencheur_creer',
      jeton,
      preparer: async (temps, c, espace) => {
        let description = '';
        if (!temps.execution) {
          const contenu = await lireContenu(env, c, espace);
          exigerNomLibre(contenu.declencheurs.map((d) => d.name), nomComplet, 'Un déclencheur', contenu);
          exigerVariables(conditions.map((k) => k.variable), contenu);
          description = [
            `Déclencheur ${ou(espace, contenu)} :`,
            '',
            `### « ${nomComplet} » — ${resumeDeclencheur(corps as Declencheur)}`,
            '',
            'Il ne fera partir aucune balise tant qu’une balise ne le cite pas — par le numéro que l’exécution rendra.',
            RIEN_NE_PART,
          ].join('\n');
        }
        return {
          entite: 'declencheur',
          corps,
          description,
          bilan: (id) => `Déclencheur « ${nomComplet} » créé — n° ${id}. Une balise s’en sert avec declencheurs = ["${id}"].`,
        };
      },
    }));
  },
});

// ── gtm_conversion_creer ─────────────────────────────────────────────────

/** Ce que l'aperçu lit dans Google Ads, et que le jeton fige. */
type Conversion = { nom: string; aw: string; libelle: string };

type LigneConversion = {
  conversionAction?: { id?: string; name?: string; status?: string; type?: string; tagSnippets?: { eventSnippet?: string }[] };
};

/** Pourquoi une conversion active ne prend pas de balise de conversion. */
const SANS_BALISE: Record<string, string> = {
  WEBPAGE_CODELESS: 'Google Ads la détecte sans code, par une règle, à travers la balise Google du compte : une balise dédiée la compterait deux fois',
  WEBSITE_CALL: 'un appel depuis le site se mesure par une balise d’appel (awcc), que ce serveur ne crée pas',
};

/** G10 — l'identifiant et le libellé, tels que Google Ads les donne dans l'extrait de la conversion. Une requête. */
const lireConversion = async (env: Env, id: string): Promise<Conversion> => {
  const compte = compteEcriture(env);
  const reponse = await rechercher(env, compte,
    'SELECT conversion_action.id, conversion_action.name, conversion_action.status, conversion_action.type, conversion_action.tag_snippets ' +
    `FROM conversion_action WHERE conversion_action.id = ${id}`, connexionPour(env, compte));
  const a = (reponse.results?.[0] as LigneConversion | undefined)?.conversionAction;
  if (!a) {
    throw new Refus(`Conversion n° ${id} introuvable dans le compte ${compte}. gtm_verifier_conversions donne le numéro de chaque conversion active.`, 404);
  }
  const nom = a.name ?? id;
  if (a.status !== 'ENABLED') throw new Refus(`« ${nom} » n'est pas active dans Google Ads (${a.status ?? '?'}) : une balise ne la mesurerait pas.`);
  if (a.type !== 'WEBPAGE') {
    throw new Refus(`« ${nom} » (${a.type ?? '?'}) : ${SANS_BALISE[a.type ?? ''] ?? 'elle ne se mesure pas par une balise de conversion du site'}.`);
  }
  const envoi = (a.tagSnippets ?? []).map((s) => ENVOI.exec(s.eventSnippet ?? '')).find(Boolean);
  if (!envoi) throw new Refus(`Google Ads ne donne pas d'extrait AW-…/… pour « ${nom} » : rien à recopier dans une balise.`, 409);
  return { nom, aw: envoi[1], libelle: envoi[2] };
};

const conversionCreer = outil({
  name: 'gtm_conversion_creer',
  title: 'Tag Manager — créer une balise de conversion Google Ads',
  description: [
    'Crée, dans l’espace de travail « [Claude] » du conteneur Google Tag Manager du site, la balise d’une conversion Google Ads ' +
    'mesurée sur une page du site (type WEBPAGE) : son identifiant AW- et son libellé sont LUS dans Google Ads par le serveur, ' +
    'jamais recopiés. Elle part sur les déclencheurs donnés ; linker de conversion activé, comme les balises du conteneur.',
    '',
    'Refusé : une conversion inactive, détectée sans code ou d’appel, et une conversion qui a déjà sa balise — une seconde la ' +
    'compterait deux fois. gtm_verifier_conversions dit lesquelles manquent.',
    '',
    DEUX_TEMPS,
    '',
    DANS_L_ESPACE,
  ].join('\n'),
  schema: z.object({
    conversion: ID.describe('Le numéro de la conversion dans Google Ads, tel que gtm_verifier_conversions le donne.'),
    declencheurs: DECLENCHEURS,
    nom: NOM.optional().describe('Par défaut : « GADS - <nom de la conversion> ». Le serveur préfixe « [Claude] ».'),
    valeur: z.number().positive().max(100_000).optional().describe('Une valeur fixe, dans la devise du compte.'),
    valeur_variable: NOM_VARIABLE.optional().describe('Ou : la variable du conteneur qui porte la valeur, sans accolades (ex. dl.calendlyConversionPrice).'),
    donnees_utilisateur: NOM_VARIABLE.optional().describe('Conversions améliorées : une variable « Données fournies par l’utilisateur » du ' +
      'conteneur, sans accolades. Absent : sans conversions améliorées.'),
    jeton: JETON,
  }).strict(),
  annotations: ECRITURE,
  async executer({ conversion, declencheurs, nom, valeur, valeur_variable, donnees_utilisateur, jeton }, env, contexte) {
    if (valeur !== undefined && valeur_variable !== undefined) throw new Refus('`valeur` OU `valeur_variable` — l’un des deux, pas les deux.');
    const ids = [...new Set(declencheurs)];

    return texte(await ecrireGtm(env, contexte, {
      outil: 'gtm_conversion_creer',
      jeton,
      preparer: async (temps, c, espace) => {
        // À l'exécution, la conversion est celle que l'aperçu a lue : le jeton la porte.
        const lue = temps.execution ? temps.fige as Conversion : await lireConversion(env, conversion);
        const nomComplet = marquer(nom ?? `GADS - ${lue.nom}`);
        const corps = {
          name: nomComplet,
          type: 'awct',
          parameter: [
            p('conversionId', lue.aw),
            p('conversionLabel', lue.libelle),
            ...(valeur !== undefined ? [p('conversionValue', String(valeur))] : valeur_variable ? [p('conversionValue', `{{${valeur_variable}}}`)] : []),
            b('enableConversionLinker', true),
            p('conversionCookiePrefix', '_gcl'),
            ...(donnees_utilisateur ? [b('enableEnhancedConversion', true), p('cssProvidedEnhancedConversionValue', `{{${donnees_utilisateur}}}`)] : []),
            b('rdp', false),
          ],
          firingTriggerId: ids,
          consentSettings: CONSENTEMENT,
          notes: NOTES,
        };

        let description = '';
        if (!temps.execution) {
          const contenu = await lireContenu(env, c, espace);
          exigerNomLibre(contenu.balises.map((x) => x.name), nomComplet, 'Une balise', contenu);
          exigerDeclencheurs(ids, contenu);
          exigerVariables([valeur_variable, donnees_utilisateur].filter((v): v is string => Boolean(v)), contenu);
          if (donnees_utilisateur && contenu.variables.find((v) => v.name === donnees_utilisateur)?.type !== 'awec') {
            throw new Refus(`{{${donnees_utilisateur}}} n'est pas une variable « Données fournies par l'utilisateur » : les conversions améliorées en demandent une.`);
          }
          // G11 — une conversion, une balise. Celle qui existe se corrige dans Tag Manager.
          const deja = balisesDeConversion(contenu).filter((x) => x.aw === lue.aw && x.libelle === lue.libelle);
          if (deja.length) {
            throw new Refus(`« ${lue.nom} » a déjà sa balise dans ${contenu.source} : ` +
              `${deja.map((x) => `« ${x.balise.name ?? '?'} »${x.balise.paused ? ' (en pause)' : ''}`).join(', ')}. ` +
              'Une seconde la compterait deux fois : corriger celle-là dans Tag Manager.', 409);
          }
          description = [
            `Balise de conversion ${ou(espace, contenu)}, pour « ${lue.nom} » — AW-${lue.aw}/${lue.libelle}, lus dans Google Ads :`,
            '',
            ...blocBalise(corps as Balise, indexDeclencheurs(contenu), 1000),
            '',
            valeur !== undefined || valeur_variable ? 'Valeur dans la devise du compte Google Ads.' : 'Sans valeur : Google Ads applique celle de la conversion, s’il en a une.',
            RIEN_NE_PART,
          ].join('\n');
        }
        return {
          entite: 'balise',
          corps,
          description,
          fige: lue,
          bilan: (id) => `Balise « ${nomComplet} » créée — n° ${id}, pour la conversion « ${lue.nom} » (AW-${lue.aw}/${lue.libelle}).`,
        };
      },
    }));
  },
});

// ── gtm_evenement_ga4_creer ──────────────────────────────────────────────

/** Les règles de nommage de GA4 : une lettre d'abord, lettres, chiffres et _, quarante au plus. */
const NOM_GA4 = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
const PREFIXES_RESERVES = /^(firebase_|google_|ga_)/i;
/** Les noms d'événement que GA4 réserve (aide Analytics, « Événements réservés »). */
const RESERVES = new Set([
  'ad_activeview', 'ad_click', 'ad_exposure', 'ad_impression', 'ad_query', 'ad_reward', 'adunit_exposure', 'app_background',
  'app_clear_data', 'app_exception', 'app_install', 'app_remove', 'app_store_refund', 'app_update', 'app_upgrade',
  'dynamic_link_app_open', 'dynamic_link_app_update', 'dynamic_link_first_open', 'error', 'first_open', 'first_visit',
  'in_app_purchase', 'notification_dismiss', 'notification_foreground', 'notification_open', 'notification_receive',
  'os_update', 'session_start', 'session_start_with_rollout', 'user_engagement',
]);
const VARIABLE = /^\{\{([^{}<>]{1,100})\}\}$/;

/** G10 — l'identifiant de mesure GA4, lu dans les balises Google du conteneur. Un seul, ou on ne choisit pas. */
const mesureGa4 = (contenu: Contenu): string => {
  const ids = new Set(contenu.balises
    .filter((x) => x.type === 'googtag')
    .map((x) => resoudre(param(x.parameter, 'tagId'), contenu.variables).valeur)
    .filter((v): v is string => Boolean(v && /^G-[A-Z0-9]{4,20}$/.test(v))));
  if (ids.size === 0) {
    throw new Refus(`Aucune balise Google GA4 (G-…) dans ${contenu.source} : l'identifiant de mesure ne se lit nulle part. ` +
      'La balise Google se pose dans Tag Manager.', 409);
  }
  if (ids.size > 1) throw new Refus(`Plusieurs identifiants GA4 dans ${contenu.source} (${[...ids].join(', ')}) : ce serveur ne choisit pas.`, 409);
  return [...ids][0];
};

const evenementGa4Creer = outil({
  name: 'gtm_evenement_ga4_creer',
  title: 'Tag Manager — créer une balise d’événement GA4',
  description: [
    'Crée, dans l’espace de travail « [Claude] » du conteneur Google Tag Manager du site, une balise qui envoie un événement à ' +
    'Google Analytics 4 sur les déclencheurs donnés, avec ses paramètres. L’identifiant de mesure (G-…) est LU dans la balise ' +
    'Google du conteneur, jamais recopié.',
    '',
    'Noms : ceux de GA4 — une lettre d’abord, lettres, chiffres et _, quarante au plus ; les noms réservés de GA4 sont refusés, ' +
    'et page_view aussi : la balise Google envoie déjà les pages vues.',
    '',
    DEUX_TEMPS,
    '',
    DANS_L_ESPACE,
  ].join('\n'),
  schema: z.object({
    evenement: z.string().regex(NOM_GA4, 'une lettre d’abord, puis lettres, chiffres et _, quarante au plus').describe('Le nom de l’événement dans GA4, ex. bt_inscription_newsletter.'),
    declencheurs: DECLENCHEURS,
    nom: NOM.optional().describe('Par défaut : « GA - <evenement> ». Le serveur préfixe « [Claude] ».'),
    parametres: z.array(z.object({
      nom: z.string().regex(NOM_GA4, 'une lettre d’abord, puis lettres, chiffres et _, quarante au plus'),
      valeur: z.string().min(1).max(100).describe('Un texte, ou une variable du conteneur écrite {{Nom}} — ex. {{Page Path}}.'),
    }).strict()).max(10).optional().describe('Les paramètres de l’événement, dix au plus.'),
    jeton: JETON,
  }).strict(),
  annotations: ECRITURE,
  async executer({ evenement, declencheurs, nom, parametres = [], jeton }, env, contexte) {
    if (evenement === 'page_view') throw new Refus('page_view : la balise Google du conteneur envoie déjà les pages vues. Une seconde les compterait deux fois.');
    if (RESERVES.has(evenement) || PREFIXES_RESERVES.test(evenement)) throw new Refus(`« ${evenement} » est un nom réservé par GA4.`);
    const reserves = parametres.filter((x) => PREFIXES_RESERVES.test(x.nom)).map((x) => x.nom);
    if (reserves.length) throw new Refus(`Paramètre(s) au préfixe réservé par GA4 : ${reserves.join(', ')}.`);
    if (new Set(parametres.map((x) => x.nom)).size !== parametres.length) throw new Refus('Deux paramètres portent le même nom.');
    for (const x of parametres) {
      if (!VARIABLE.test(x.valeur) && /\{\{|\}\}|</.test(x.valeur)) {
        throw new Refus(`Paramètre ${x.nom} : un texte, ou une variable seule écrite {{Nom}} — pas un mélange.`);
      }
    }
    const ids = [...new Set(declencheurs)];

    return texte(await ecrireGtm(env, contexte, {
      outil: 'gtm_evenement_ga4_creer',
      jeton,
      preparer: async (temps, c, espace) => {
        const contenu = temps.execution ? undefined : await lireContenu(env, c, espace);
        // À l'exécution, l'identifiant de mesure est celui que l'aperçu a lu : le jeton le porte.
        const mesure = contenu ? mesureGa4(contenu) : (temps.execution ? (temps.fige as { g: string }).g : '');
        const nomComplet = marquer(nom ?? `GA - ${evenement}`);
        const corps = {
          name: nomComplet,
          type: 'gaawe',
          parameter: [
            p('eventName', evenement),
            p('measurementIdOverride', mesure),
            b('sendEcommerceData', false),
            ...(parametres.length ? [{
              type: 'list', key: 'eventSettingsTable',
              list: parametres.map((x) => ({ type: 'map', map: [p('parameter', x.nom), p('parameterValue', x.valeur)] })),
            }] : []),
          ],
          firingTriggerId: ids,
          consentSettings: CONSENTEMENT,
          notes: NOTES,
        };

        let description = '';
        if (contenu) {
          exigerNomLibre(contenu.balises.map((x) => x.name), nomComplet, 'Une balise', contenu);
          exigerDeclencheurs(ids, contenu);
          exigerVariables(parametres.map((x) => VARIABLE.exec(x.valeur)?.[1]).filter((v): v is string => Boolean(v)), contenu);
          const memes = contenu.balises.filter((x) => x.type === 'gaawe' && param(x.parameter, 'eventName') === evenement);
          description = [
            `Balise d'événement GA4 ${ou(espace, contenu)} — « ${evenement} » vers ${mesure}, lu dans la balise Google du conteneur :`,
            '',
            ...blocBalise(corps as Balise, indexDeclencheurs(contenu), 1000),
            '',
            ...(memes.length ? [`« ${evenement} » part déjà de : ${memes.map((x) => `« ${x.name ?? '?'} »`).join(', ')}. Sur d’autres déclencheurs, c’est voulu ; sur les mêmes, il compterait deux fois.`] : []),
            RIEN_NE_PART,
          ].join('\n');
        }
        return {
          entite: 'balise',
          corps,
          description,
          fige: { g: mesure },
          bilan: (id) => `Balise « ${nomComplet} » créée — n° ${id} : l'événement « ${evenement} » vers ${mesure}.`,
        };
      },
    }));
  },
});

export const OUTILS_GTM_ECRITURE = [declencheurCreer, conversionCreer, evenementGa4Creer] as const;
