/**
 * Les quatre domaines du serveur — la seule déclaration qui dise à quoi un
 * outil touche.
 *
 * Deux interfaces la lisent, et c'est pour ça qu'elle est seule : la page de
 * consentement (un groupe par domaine, lecture puis écriture) et `tools/list`
 * (le titre de chaque outil commence par le nom de son domaine). L'app Claude
 * ne range les outils qu'en deux tas, d'après `readOnlyHint` : le domaine ne
 * s'y voit que par ce préfixe. Tenir deux listes à la main, c'était les voir
 * diverger au premier outil ajouté.
 *
 * L'ordre des clés est celui de la page et de `tools/list`. Google Ads et Tag
 * Manager se suivent : gtm_verifier_conversions les met face à face.
 *
 * `libelle` est le texte exact de la case : les refus des outils d'écriture
 * (ecriture.ts) disent « cocher « … » » avec ces mots-là, et un test vérifie
 * qu'ils concordent — un conseil qui nomme une case absente de la page ne
 * sert à rien.
 */
import { SCOPE_CONTENUS, SCOPE_CORPUS, SCOPE_ECRITURE, SCOPE_TAG_MANAGER } from './ecriture';

export type Domaine = {
  /** Le préfixe des titres d'outils. Court : l'app l'affiche dans une liste étroite. */
  nom: string;
  /** Le titre du groupe sur la page de consentement. */
  intitule: string;
  /** Ce que la lecture donne. Toujours accordée, elle n'a pas de case à cocher. */
  lecture: string;
  ecriture: {
    scope: string;
    /** Le nom du champ du formulaire : il ne change pas, les tests et le POST le lisent. */
    champ: string;
    libelle: string;
    detail: string;
  };
};

export const DOMAINES = {
  ads: {
    nom: 'Google Ads',
    intitule: 'Google Ads',
    lecture: 'Lire le compte : campagnes, coûts, clics, conversions, termes de recherche.',
    ecriture: {
      scope: SCOPE_ECRITURE,
      champ: 'ecrire',
      libelle: 'Préparer des modifications',
      detail:
        'exclure des recherches, mettre en pause, créer des campagnes, des annonces et des mots-clés — en pause. ' +
        'Chaque écriture est montrée avant d\'être faite, et rien ne s\'active : l\'activation reste dans Google Ads.',
    },
  },
  gtm: {
    nom: 'Tag Manager',
    intitule: 'Google Tag Manager',
    lecture: 'Lire le conteneur Tag Manager du site : balises, déclencheurs, variables.',
    ecriture: {
      scope: SCOPE_TAG_MANAGER,
      champ: 'gtm',
      libelle: 'Préparer des balises dans Tag Manager',
      detail:
        'créer des déclencheurs, des balises de conversion et d\'événement GA4 ; mettre une balise de mesure en pause, lui ' +
        'ajouter un déclencheur, couper un envoi de page vue en double — dans un espace de travail « [Claude] ». Chaque écriture ' +
        'est montrée avant d\'être faite, et rien n\'est publié : la publication reste dans Tag Manager.',
    },
  },
  corpus: {
    nom: 'Corpus',
    intitule: 'Le corpus de Luminose',
    lecture: 'Lire le corpus, tel que le dépôt le porte.',
    ecriture: {
      scope: SCOPE_CORPUS,
      champ: 'corpus',
      libelle: 'Modifier le corpus',
      detail:
        'corriger une fiche, ajouter une décision, par commit sur le dépôt, et lancer le déploiement qui les publie. ' +
        'Chaque écriture est montrée avant d\'être faite.',
    },
  },
  console: {
    nom: 'Console',
    intitule: 'La console de gestion',
    lecture: 'Lire les contenus et les séries de la console.',
    ecriture: {
      scope: SCOPE_CONTENUS,
      champ: 'contenus',
      libelle: 'Modifier les contenus',
      detail:
        'créer une idée, modifier la fiche d\'un contenu, écrire son brouillon, regrouper des idées en série, déplacer un ' +
        'contenu d\'une série à l\'autre, réordonner une série. Ces écritures partent directement ; un brouillon se signe ' +
        '« Claude (MCP) » et s\'annule dans l\'éditeur.',
    },
  },
} as const satisfies Record<string, Domaine>;

export type CleDomaine = keyof typeof DOMAINES;

export const ORDRE_DOMAINES = Object.keys(DOMAINES) as CleDomaine[];
