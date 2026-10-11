/**
 * Google Tag Manager, modifier — décision du 11/10/2026
 * (workers/mcp/decisions/2026-10-11-gtm-modifier.md). Trois outils, qui
 * MODIFIENT une balise existante dans l'espace de travail « [Claude] », de
 * trois façons et de trois seulement : la mettre en pause, lui ajouter des
 * déclencheurs, couper son envoi de page vue vers GA4. Florent relit l'espace
 * dans Tag Manager et le publie ; ce serveur ne le peut pas.
 *
 * Toucher à une balise de Florent n'est pas en créer une marquée : son nom ne
 * change pas, et rien ne la désigne parmi les autres. La marque va donc dans
 * ses notes — une ligne « [Claude] … » qui dit ce qui change et pourquoi —, et
 * le journal garde la balise d'avant, entière, pour la rétablir à la main.
 */
import { z } from 'zod';
import { ecrireGtm, type PlanGtm } from './ecriture-gtm';
import {
  ESPACE_CLAUDE, TYPES_AJOUT, TYPES_PAUSE, baliseEspace, couperPagesVues, modifications, normaliserBalise, noter, pagesVues, versionEnLigne,
  type Balise, type Conteneur, type Contenu, type Espace, type NatureModification, type Parametre,
} from './gtm';
import { ECRITURE, ID, avertirToutesLesPages, exigerDeclencheurs, lireContenu, ou } from './outils-gtm-ecriture';
import { balisesDeConversion, blocBalise, indexDeclencheurs, nomDeclencheur, param, resoudre } from './outils-gtm';
import { JETON } from './outils-ecriture';
import { outil, texte } from './outil';
import { MARQUE } from './regles';
import { Refus } from './refus';
import type { Env } from './env';

const DEUX_TEMPS =
  'Deux temps, toujours. 1) Appeler SANS jeton : rien ne part, l’outil rend un aperçu — la balise telle qu’elle est, et ce qui ' +
  "changerait — et un jeton. 2) Montrer l'aperçu à Florent ; s'il valide, rappeler avec les MÊMES arguments et le jeton. Un jeton " +
  'vaut dix minutes, une fois, et seulement pour la balise telle que l’aperçu l’a lue : changée depuis, rien ne part.';

const DANS_L_ESPACE =
  'La modification se fait dans l’espace de travail « [Claude] » du conteneur, ouvert au premier besoin depuis la dernière version — ' +
  'jamais dans « Default Workspace », jamais en ligne. Le nom de la balise ne change pas : une ligne « [Claude] … » s’ajoute à ses ' +
  'notes, avec la raison donnée. Ce serveur ne peut ni publier, ni supprimer, ni rétablir : Florent relit l’espace dans Tag Manager ' +
  'et le publie — ou y annule la modification.';

const RIEN_NE_CHANGE =
  `Rien ne change sur le site : la modification n'existera que dans l'espace « ${ESPACE_CLAUDE} », que Florent relit et publie dans Tag Manager.`;

const BALISE = ID.describe('Le numéro de la balise (n° …), tel que gtm_lire quoi = balises le donne.');
const RAISON = z.string().min(3).max(200).regex(/^[^<>\n\r]+$/, 'une phrase, sans < ni >')
  .describe('Pourquoi, en une phrase. Elle s’ajoute aux notes de la balise, après « [Claude] … » : Florent la lit avant de publier.');

/** Les autres espaces dont l'aperçu lit les modifications — trois dans la version gratuite de Tag Manager. */
const MAX_ESPACES = 3;

// ── Ce que les trois outils partagent ────────────────────────────────────

/**
 * La balise n° `id` : dans le contenu déjà lu, quand l'outil l'a lu ; sinon
 * relue seule — dans l'espace « [Claude] » s'il existe, ou dans la version en
 * ligne, dont il partira. Une requête.
 */
const lireBalise = async (env: Env, c: Conteneur, espace: Espace | undefined, id: string, contenu?: Contenu): Promise<Balise> => {
  if (!contenu && espace) return baliseEspace(env, c, String(espace.workspaceId), id);
  const lu = contenu ?? await versionEnLigne(env, c);
  const b = lu.balises.find((x) => x.tagId === id);
  if (!b) throw new Refus(`Balise n° ${id} introuvable dans ${lu.source}. gtm_lire quoi = balises donne le numéro de chacune.`, 404);
  return b;
};

/**
 * Un autre espace qui change la même balise sans l'avoir publiée : au premier
 * des deux publiés, Tag Manager fera choisir l'autre entre les deux versions.
 * Une requête par espace, MAX_ESPACES au plus.
 */
const conflits = async (env: Env, c: Conteneur, autres: Espace[], id: string): Promise<string[]> => {
  const lus = autres.slice(0, MAX_ESPACES);
  const changements = await Promise.all(lus.map((e) => modifications(env, c, String(e.workspaceId))));
  return lus.filter((_, i) => changements[i].some((m) => m.tag?.tagId === id)).map((e) =>
    `ATTENTION — l'espace « ${e.name ?? '?'} » (n° ${e.workspaceId}) modifie aussi cette balise, sans l'avoir publiée : ` +
    'au premier des deux publiés, Tag Manager demandera à l’autre de choisir entre les deux versions.');
};

type Apercu = {
  quoi: string; b: Balise; contenu: Contenu; espace: Espace | undefined;
  avant?: string[]; change: string[]; ligne: string; avertissements: string[];
};

/** L'aperçu d'une modification : la balise telle qu'elle est, puis ce qui change, notes comprises. */
const decrire = (a: Apercu): string => [
  `${a.quoi} ${ou(a.espace, a.contenu)} :`,
  '',
  ...blocBalise(a.b, indexDeclencheurs(a.contenu), 300),
  ...(a.avant?.length ? ['', ...a.avant] : []),
  '',
  'Ce qui change :',
  ...a.change.map((l) => `- ${l}`),
  `- notes : s’y ajoute « ${a.ligne} ».`,
  'Rien d’autre : ni le nom, ni les paramètres, ni les autres déclencheurs.',
  '',
  ...(a.avertissements.length ? [...a.avertissements, ''] : []),
  RIEN_NE_CHANGE,
].join('\n');

/** Le plan : la balise lue, sans ce que Tag Manager tient à jour ; le corps, la même modifiée, et la ligne de notes ajoutée. */
const planifier = (
  nature: NatureModification, b: Balise, id: string, ligne: string, description: string, bilan: string,
  changer: (avant: Record<string, unknown>) => Record<string, unknown>,
): PlanGtm => {
  const avant = normaliserBalise(b);
  return { entite: 'modification', nature, balise: id, avant, corps: { ...changer(avant), notes: noter(avant.notes, ligne) }, description, bilan: () => bilan };
};

// ── gtm_mettre_en_pause ──────────────────────────────────────────────────

/** Pourquoi une balise ne se met pas en pause par ce serveur. */
const SANS_PAUSE: Record<string, string> = {
  googtag: 'la balise Google porte la configuration de Google Ads ou de GA4 : tout ce qui en dépend s’arrêterait avec elle',
  gclidw: 'le linker garde le clic d’origine des conversions : sans lui, Google Ads en attribuerait moins',
  html: 'du code personnalisé, où un bandeau de consentement se cache souvent',
  img: 'une image personnalisée : du code, que ce serveur ne touche pas',
};
const sansPause = (type: string) => SANS_PAUSE[type]
  ?? (type.startsWith('cvt_') ? 'un modèle personnalisé — le mode Consentement du conteneur en est un, et ce serveur ne les distingue pas' : 'hors des balises de mesure');

/** Une balise de conversion en pause : sa conversion ne compte plus, si c'était sa seule balise active. */
const seuleDeSaConversion = (b: Balise, contenu: Contenu): string[] => {
  const toutes = balisesDeConversion(contenu);
  const elle = toutes.find((x) => x.balise.tagId === b.tagId);
  if (!elle?.aw || !elle.libelle) return [];
  const relais = toutes.filter((x) => x.balise.tagId !== b.tagId && x.aw === elle.aw && x.libelle === elle.libelle
    && !x.balise.paused && x.balise.firingTriggerId?.length);
  return relais.length ? [] : [
    `ATTENTION — c’est la seule balise active de la conversion AW-${elle.aw}/${elle.libelle} : publiée, la pause l’arrête. Si des ` +
    `campagnes l’optimisent, elles enchériront sans elle. gtm_verifier_conversions, sur l’espace « ${ESPACE_CLAUDE} », la dira À VOIR.`,
  ];
};

const mettreEnPause = outil({
  name: 'gtm_mettre_en_pause',
  title: 'Tag Manager — mettre une balise en pause',
  description: [
    'Met en pause, dans l’espace de travail « [Claude] » du conteneur Google Tag Manager du site, une balise existante : en pause, ' +
    'elle ne part plus, et n’est pas supprimée. Une balise de mesure seulement — conversion Google Ads (awct), appel (awcc), ' +
    'remarketing (sp), événement ou configuration GA4 (gaawe, gaawc), Universal Analytics (ua), Floodlight (flc, fls). Jamais la ' +
    'balise Google, le linker, ni du HTML, une image ou un modèle personnalisés : le mode Consentement et le bandeau de consentement vivent là.',
    '',
    'Le numéro de la balise se lit dans gtm_lire quoi = balises. L’aperçu dit quand c’est la seule balise active d’une conversion : ' +
    'publiée, la pause l’arrête. Une pause ne se lève pas par ce serveur, mais dans Tag Manager.',
    '',
    DEUX_TEMPS,
    '',
    DANS_L_ESPACE,
  ].join('\n'),
  schema: z.object({ balise: BALISE, raison: RAISON, jeton: JETON }).strict(),
  annotations: ECRITURE,
  async executer({ balise, raison, jeton }, env, contexte) {
    return texte(await ecrireGtm(env, contexte, {
      outil: 'gtm_mettre_en_pause',
      jeton,
      preparer: async (temps, c, espace, autres) => {
        const contenu = temps.execution ? undefined : await lireContenu(env, c, espace);
        const b = await lireBalise(env, c, espace, balise, contenu);
        const nom = b.name ?? '?';
        const type = b.type ?? '?';
        if (!TYPES_PAUSE.includes(type)) {
          throw new Refus(`« ${nom} » (${type}) ne se met pas en pause par ce serveur : ${sansPause(type)}. Dans Tag Manager, si c'est voulu.`);
        }
        if (b.paused) throw new Refus(`« ${nom} » est déjà en pause : rien à faire.`, 409);
        const ligne = `${MARQUE} Mise en pause — ${raison}`;
        const description = contenu ? decrire({
          quoi: 'Mise en pause d’une balise', b, contenu, espace, ligne,
          change: ['EN PAUSE : elle ne part plus, sur aucun de ses déclencheurs. Elle n’est pas supprimée.'],
          avertissements: [...seuleDeSaConversion(b, contenu), ...await conflits(env, c, autres, balise)],
        }) : '';
        return planifier('pause', b, balise, ligne, description, `Balise « ${nom} » (n° ${balise}) mise en pause dans l’espace.`,
          (avant) => ({ ...avant, paused: true }));
      },
    }));
  },
});

// ── gtm_declencheurs_ajouter ─────────────────────────────────────────────

const declencheursAjouter = outil({
  name: 'gtm_declencheurs_ajouter',
  title: 'Tag Manager — ajouter des déclencheurs à une balise',
  description: [
    'Ajoute un à cinq déclencheurs à une balise existante — conversion Google Ads (awct) ou événement GA4 (gaawe), les types que ' +
    'ce serveur crée —, dans l’espace de travail « [Claude] » du conteneur Google Tag Manager du site. Elle continue de partir sur ' +
    'ses déclencheurs d’aujourd’hui : aucun ne se retire par ce serveur. Ceux qu’elle a déjà sont écartés ; un déclencheur qui la ' +
    'bloque, ou d’initialisation, est refusé.',
    '',
    'Les numéros se lisent dans gtm_lire : quoi = balises pour la balise, quoi = declencheurs pour les déclencheurs ; ' +
    'gtm_declencheur_creer en crée un. 2147479553 : toutes les pages — sur une conversion, l’aperçu avertit qu’elle compterait ' +
    'chaque page vue.',
    '',
    DEUX_TEMPS,
    '',
    DANS_L_ESPACE,
  ].join('\n'),
  schema: z.object({
    balise: BALISE,
    declencheurs: z.array(ID).min(1).max(5).describe('Les déclencheurs à ajouter, par identifiant (n° …).'),
    raison: RAISON,
    jeton: JETON,
  }).strict(),
  annotations: ECRITURE,
  async executer({ balise, declencheurs, raison, jeton }, env, contexte) {
    const demandes = [...new Set(declencheurs)];
    return texte(await ecrireGtm(env, contexte, {
      outil: 'gtm_declencheurs_ajouter',
      jeton,
      preparer: async (temps, c, espace, autres) => {
        const contenu = temps.execution ? undefined : await lireContenu(env, c, espace);
        const b = await lireBalise(env, c, espace, balise, contenu);
        const nom = b.name ?? '?';
        const type = b.type ?? '?';
        if (!TYPES_AJOUT.includes(type)) {
          throw new Refus(`« ${nom} » (${type}) : ce serveur n’ajoute de déclencheur qu’à une conversion Google Ads (awct) ou à un ` +
            'événement GA4 (gaawe), les types qu’il crée. Étendre une balise de code, c’est exécuter ce code ailleurs : dans Tag Manager, si c’est voulu.');
        }
        const deja = b.firingTriggerId ?? [];
        const ajout = demandes.filter((id) => !deja.includes(id));
        const ecartes = demandes.filter((id) => deja.includes(id));
        if (!ajout.length) throw new Refus(`« ${nom} » part déjà sur ${ecartes.map((id) => `n° ${id}`).join(', ')} : rien à ajouter.`, 409);
        const bloquants = ajout.filter((id) => b.blockingTriggerId?.includes(id));
        if (bloquants.length) {
          throw new Refus(`${bloquants.map((id) => `n° ${id}`).join(', ')} bloque « ${nom} » : l’ajouter aussi pour la faire partir se ` +
            'contredirait. À démêler dans Tag Manager.');
        }
        if (contenu) exigerDeclencheurs(ajout, contenu);
        const s = ajout.length > 1 ? 's' : '';
        const ligne = `${MARQUE} Déclencheur${s} ajouté${s} : ${ajout.map((id) => `n° ${id}`).join(', ')} — ${raison}`;

        let description = '';
        if (contenu) {
          const index = indexDeclencheurs(contenu);
          description = decrire({
            quoi: `Ajout de déclencheur${s} à une balise`, b, contenu, espace, ligne,
            change: [
              ...ajout.map((id) => `s’ajoute : ${nomDeclencheur(id, index)}`),
              ...(ecartes.length ? [`déjà là, écarté${ecartes.length > 1 ? 's' : ''} : ${ecartes.map((id) => nomDeclencheur(id, index)).join(', ')}`] : []),
            ],
            avertissements: [
              ...avertirToutesLesPages(type, ajout),
              ...(b.paused ? ['La balise est en pause : elle ne partira sur aucun déclencheur, ajouté ou non, tant qu’elle l’est.'] : []),
              ...await conflits(env, c, autres, balise),
            ],
          });
        }
        return planifier('declencheurs', b, balise, ligne, description,
          `Balise « ${nom} » (n° ${balise}) : déclencheur${s} ${ajout.map((id) => `n° ${id}`).join(', ')} ajouté${s} dans l’espace.`,
          (avant) => ({ ...avant, firingTriggerId: [...deja, ...ajout] }));
      },
    }));
  },
});

// ── gtm_pages_vues_couper ────────────────────────────────────────────────

const mesureDe = (b: Balise, contenu: Contenu) => resoudre(param(b.parameter, 'tagId'), contenu.variables).valeur ?? '';

const pagesVuesCouper = outil({
  name: 'gtm_pages_vues_couper',
  title: 'Tag Manager — couper l’envoi de page vue d’une balise Google',
  description: [
    'Coupe l’envoi de page vue d’une balise Google (googtag) vers GA4 — send_page_view à false dans sa table de configuration —, ' +
    'dans l’espace de travail « [Claude] » du conteneur Google Tag Manager du site. Pour deux balises Google qui envoient chacune ' +
    'une page vue au même identifiant G-… : GA4 compte alors chaque page deux fois. La balise garde sa configuration ; les ' +
    'événements qui s’en servent partent comme avant.',
    '',
    'Refusé quand ce serait la dernière : une autre balise Google active, au même identifiant, doit continuer d’envoyer les pages ' +
    'vues avec certitude — revérifié au moment d’écrire. Le numéro de la balise se lit dans gtm_lire quoi = balises : garder celle ' +
    'qui part le plus tôt, couper l’autre.',
    '',
    DEUX_TEMPS,
    '',
    DANS_L_ESPACE,
  ].join('\n'),
  schema: z.object({ balise: BALISE, raison: RAISON, jeton: JETON }).strict(),
  annotations: ECRITURE,
  async executer({ balise, raison, jeton }, env, contexte) {
    return texte(await ecrireGtm(env, contexte, {
      outil: 'gtm_pages_vues_couper',
      jeton,
      preparer: async (temps, c, espace, autres) => {
        // Tout le contenu, à l'exécution aussi : la balise qui continuera d'envoyer les
        // pages vues se revérifie au moment d'écrire. Deux coupes préparées ensemble, sur
        // les deux balises, ne passent pas toutes les deux.
        const contenu = await lireContenu(env, c, espace);
        const b = await lireBalise(env, c, espace, balise, contenu);
        const nom = b.name ?? '?';
        if (b.type !== 'googtag') throw new Refus(`« ${nom} » (${b.type ?? '?'}) n’est pas une balise Google : send_page_view n’existe que là.`);
        const mesure = mesureDe(b, contenu);
        if (!/^G-[A-Z0-9]{4,20}$/.test(mesure)) {
          throw new Refus(`« ${nom} » ne configure pas GA4 (${mesure || 'identifiant non résolu'}) : aucune page vue GA4 à couper.`);
        }
        const etat = pagesVues(b);
        if (etat === 'non') throw new Refus(`« ${nom} » n’envoie déjà plus de page vue (send_page_view = false) : rien à faire.`, 409);
        if (etat === 'inconnu') {
          throw new Refus(`send_page_view de « ${nom} » passe par une variable, qui ne se lit qu’au chargement de la page : à régler dans Tag Manager.`);
        }
        if (b.paused || !b.firingTriggerId?.length) {
          throw new Refus(`« ${nom} » est en pause ou sans déclencheur : elle n’envoie rien aujourd’hui, rien à couper.`, 409);
        }
        const relais = contenu.balises.filter((x) => x.tagId !== balise && x.type === 'googtag' && !x.paused && x.firingTriggerId?.length
          && mesureDe(x, contenu) === mesure && pagesVues(x) === 'oui');
        if (!relais.length) {
          throw new Refus(`« ${nom} » est la seule balise Google qui envoie avec certitude les pages vues à ${mesure} dans ${contenu.source} : ` +
            'coupée, GA4 n’en compterait plus aucune.', 409);
        }
        const ligne = `${MARQUE} send_page_view coupé — ${raison}`;

        let description = '';
        if (!temps.execution) {
          const index = indexDeclencheurs(contenu);
          const partDe = (x: Balise) => `« ${x.name ?? '?'} » (n° ${x.tagId}), déclenchée par ${(x.firingTriggerId ?? []).map((id) => nomDeclencheur(id, index)).join(', ')}`;
          description = decrire({
            quoi: 'Couper l’envoi de page vue d’une balise Google', b, contenu, espace, ligne,
            avant: [`Aujourd’hui, ${relais.length + 1} balises Google envoient une page vue à ${mesure} : là où elles partent toutes, ` +
              `GA4 compte chaque page ${relais.length + 1} fois.`],
            change: [
              `send_page_view = false : « ${nom} » garde sa configuration — les événements GA4 qui s’en servent partent comme avant — ` +
              `et n’envoie plus de page vue à ${mesure}.`,
              `les pages vues continuent de partir de : ${relais.map(partDe).join(' ; ')}.`,
            ],
            avertissements: await conflits(env, c, autres, balise),
          });
        }
        return planifier('pages_vues', b, balise, ligne, description,
          `Balise « ${nom} » (n° ${balise}) : send_page_view coupé dans l’espace ; les pages vues partent de ${relais.map((x) => `« ${x.name ?? '?'} »`).join(', ')}.`,
          (avant) => ({ ...avant, parameter: couperPagesVues((avant.parameter ?? []) as Parametre[]) }));
      },
    }));
  },
});

export const OUTILS_GTM_MODIFICATION = [mettreEnPause, declencheursAjouter, pagesVuesCouper] as const;
