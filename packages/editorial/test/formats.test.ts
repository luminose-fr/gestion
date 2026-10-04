/**
 * ai/formats.ts — le registre comme source unique de vérité.
 *
 * Ce que ces tests protègent : le routage par format (où stocker le résultat,
 * où atterrir après rédaction, qui a droit à la relecture à froid) était
 * autrefois réécrit à la main dans l'éditeur — huit endroits à modifier pour
 * ajouter un format, dont un oubli passait inaperçu. Ces tests garantissent que
 * chaque format déclare tout ce dont l'éditeur a besoin.
 */
import { describe, it, expect } from 'vitest';
import { TargetFormat, TARGET_FORMAT_VALUES } from '../src/domain';
import {
  FORMAT_REGISTRY,
  formatDraftContent,
  estMontable,
  getFormatDef,
  getEditorTab,
  getFormatPromptTemplate,
  supportsColdRead,
  bodyJsonToText,
  parseBodyJson,
  VALID_SHORT_KEYS,
  resoudreFormat,
} from '../src/index';

const ALL_FORMATS = Object.values(TargetFormat);

describe('complétude du registre', () => {
  it('couvre tous les TargetFormat', () => {
    expect(Object.keys(FORMAT_REGISTRY).sort()).toEqual([...TARGET_FORMAT_VALUES].sort());
  });

  it.each(ALL_FORMATS)('%s déclare tout ce dont l’éditeur a besoin', (format) => {
    const def = FORMAT_REGISTRY[format];
    expect(def.shortKey).toBeTruthy();
    expect(['atelier', 'brouillon', 'slides', 'postcourt', 'script']).toContain(def.editorTab);
    expect(typeof def.supportsColdRead).toBe('boolean');
    expect(def.promptTemplate.length).toBeGreaterThan(50);
    expect(typeof def.toPlainText).toBe('function');
  });

  /**
   * La lecture en texte vivait dans un `switch` dont la branche par défaut
   * rendait une chaîne vide. Or c'est elle que reçoit le Lecteur froid, et une
   * lecture vide fait sauter la relecture sans un mot : un format ajouté sans y
   * penser n'aurait jamais été relu.
   */
  it.each(ALL_FORMATS)('%s se lit en texte, pour l’édition comme pour le Lecteur froid', (format) => {
    expect(typeof FORMAT_REGISTRY[format].toMarkdown).toBe('function');
    expect(formatDraftContent(format, {})).toBe('');
  });

  it('n’a pas deux formats avec la même clé courte', () => {
    expect(new Set(VALID_SHORT_KEYS).size).toBe(VALID_SHORT_KEYS.length);
  });
});

describe('routage — comportement attendu par l’éditeur', () => {
  it('mène au bon écran après la rédaction', () => {
    expect(getEditorTab(TargetFormat.POST_TEXTE_COURT)).toBe('postcourt');
    expect(getEditorTab(TargetFormat.SCRIPT_VIDEO_REEL_SHORT)).toBe('script');
    expect(getEditorTab(TargetFormat.REEL_EXPLIQUE)).toBe('script');
    expect(getEditorTab(TargetFormat.CARROUSEL_SLIDE)).toBe('brouillon');
  });

  it('réserve la relecture à froid aux formats courts et tendus', () => {
    expect(supportsColdRead(TargetFormat.POST_TEXTE_COURT)).toBe(true);
    expect(supportsColdRead(TargetFormat.CARROUSEL_SLIDE)).toBe(true);
    expect(supportsColdRead(TargetFormat.SCRIPT_VIDEO_REEL_SHORT)).toBe(true);
    expect(supportsColdRead(TargetFormat.REEL_EXPLIQUE)).toBe(true);
    expect(supportsColdRead(TargetFormat.ARTICLE_LONG_SEO)).toBe(false);
  });

  it('dit quels formats se montent en vidéo — l\u2019espace Vidéos le demande au registre', () => {
    expect(estMontable(TargetFormat.REEL_EXPLIQUE)).toBe(true);
    expect(estMontable(TargetFormat.SCRIPT_VIDEO_REEL_SHORT)).toBe(false);
    expect(estMontable(TargetFormat.CARROUSEL_SLIDE)).toBe(false);
    expect(estMontable(null)).toBe(false);
    expect(estMontable('format inconnu')).toBe(false);
  });

  it('reste prévisible quand le format est absent', () => {
    expect(getEditorTab(null)).toBe('brouillon');
    expect(supportsColdRead(null)).toBe(false);
    expect(getFormatPromptTemplate(null)).toBe('');
  });
});

describe('getFormatDef', () => {
  it('résout par valeur d’enum comme par clé courte', () => {
    expect(getFormatDef(TargetFormat.CARROUSEL_SLIDE)?.shortKey).toBe('Carrousel');
    expect(getFormatDef('Carrousel')?.key).toBe(TargetFormat.CARROUSEL_SLIDE);
  });

  it('renvoie undefined sur une entrée inconnue', () => {
    expect(getFormatDef('Tweet')).toBeUndefined();
    expect(getFormatDef(null)).toBeUndefined();
  });
});

describe('lecture du contenu stocké', () => {
  it('tolère la signature markdown concaténée après le JSON', () => {
    const raw = JSON.stringify({ format: 'Post Texte', accroche: 'A', corps: 'B', cta: 'C' })
      + '\n\n_Généré par : GPT-5.2 Pro - le 17/08/2026_';
    expect(parseBodyJson(raw)).toMatchObject({ format: 'Post Texte' });
    expect(bodyJsonToText(raw)).toContain('A');
  });

  it('renvoie le texte brut quand ce n’est pas du JSON', () => {
    expect(bodyJsonToText('Simple note manuelle')).toBe('Simple note manuelle');
  });

  it('respecte une édition manuelle libre', () => {
    const raw = JSON.stringify({ format: 'Post Texte', edited_raw: 'Texte réécrit à la main' });
    expect(bodyJsonToText(raw)).toBe('Texte réécrit à la main');
  });
});

/**
 * La résolution d'un format écrit par un modèle (SPEC §6.2).
 *
 * Née d'un fait : le 24/08/2026, un plan de série est arrivé avec des
 * publications sans format alors que l'Éclateur en avait clairement désigné un.
 * La comparaison était une ÉGALITÉ STRICTE — et le prompt, deux lignes après
 * avoir exigé « la valeur EXACTE », abrège lui-même en « Script Vidéo ».
 */
describe('résoudre un format écrit à la main', () => {
    it('accepte la valeur du registre, telle quelle', () => {
        expect(resoudreFormat('Script Vidéo (Reel/Short)')).toBe(TargetFormat.SCRIPT_VIDEO_REEL_SHORT);
        expect(resoudreFormat('Carrousel (Slide par Slide)')).toBe(TargetFormat.CARROUSEL_SLIDE);
        expect(resoudreFormat('Post Texte (Court)')).toBe(TargetFormat.POST_TEXTE_COURT);
    });

    it('pardonne l’accent, la casse et l’espacement', () => {
        expect(resoudreFormat('Script Video (Reel/Short)')).toBe(TargetFormat.SCRIPT_VIDEO_REEL_SHORT);
        expect(resoudreFormat('script vidéo (reel / short)')).toBe(TargetFormat.SCRIPT_VIDEO_REEL_SHORT);
        expect(resoudreFormat('CARROUSEL (SLIDE PAR SLIDE)')).toBe(TargetFormat.CARROUSEL_SLIDE);
        expect(resoudreFormat('  Post Texte (Court)  ')).toBe(TargetFormat.POST_TEXTE_COURT);
    });

    /** Le prompt abrège lui-même : ces formes-là sont celles que le modèle recopie. */
    it('accepte les clés courtes du registre', () => {
        expect(resoudreFormat('Post Texte')).toBe(TargetFormat.POST_TEXTE_COURT);
        expect(resoudreFormat('Carrousel')).toBe(TargetFormat.CARROUSEL_SLIDE);
        expect(resoudreFormat('Script Reel')).toBe(TargetFormat.SCRIPT_VIDEO_REEL_SHORT);
        expect(resoudreFormat('Script Youtube')).toBe(TargetFormat.SCRIPT_VIDEO_YOUTUBE);
    });

    it('rattrape un mot décisif isolé', () => {
        expect(resoudreFormat('Reel')).toBe(TargetFormat.SCRIPT_VIDEO_REEL_SHORT);
        expect(resoudreFormat('un carrousel de 8 slides')).toBe(TargetFormat.CARROUSEL_SLIDE);
        expect(resoudreFormat('Newsletter hebdo')).toBe(TargetFormat.NEWSLETTER);
        expect(resoudreFormat('Article SEO long')).toBe(TargetFormat.ARTICLE_LONG_SEO);
    });

    /**
     * « Reel expliqué » contient « reel ». Sans préséance du nom le plus précis,
     * le seul format dont le nom en englobe un autre ne se résoudrait jamais :
     * l'Éclateur le désignerait, et la ligne de plan arriverait sans format.
     */
    it('laisse le nom le plus précis l’emporter sur celui qu’il contient', () => {
        expect(resoudreFormat('Reel expliqué')).toBe(TargetFormat.REEL_EXPLIQUE);
        expect(resoudreFormat('reel explique')).toBe(TargetFormat.REEL_EXPLIQUE);
        expect(resoudreFormat('Short expliqué')).toBe(TargetFormat.REEL_EXPLIQUE);
        expect(resoudreFormat('Reel (scènes animées)')).toBe(TargetFormat.REEL_EXPLIQUE);
        expect(resoudreFormat('Script Reel')).toBe(TargetFormat.SCRIPT_VIDEO_REEL_SHORT);
        expect(resoudreFormat('Reel')).toBe(TargetFormat.SCRIPT_VIDEO_REEL_SHORT);
        // La préséance ne couvre que le nom englobé : un autre format nommé à
        // côté reste une ambiguïté.
        expect(resoudreFormat('Reel expliqué ou carrousel')).toBeNull();
    });

    /**
     * Le point qui compte autant que la tolérance : deviner à la place de
     * Florent serait pire que de rendre null, parce que personne ne le saurait.
     */
    it('rend null plutôt que de trancher une ambiguïté', () => {
        // « Vidéo » ne départage pas le Reel du Youtube.
        expect(resoudreFormat('Vidéo')).toBeNull();
        expect(resoudreFormat('Script Vidéo')).toBeNull();
        // Deux formats nommés dans la même chaîne : on ne choisit pas.
        expect(resoudreFormat('un carrousel ou une newsletter')).toBeNull();
    });

    it('rend null sur ce qui n’est pas une désignation', () => {
        expect(resoudreFormat(null)).toBeNull();
        expect(resoudreFormat(undefined)).toBeNull();
        expect(resoudreFormat('')).toBeNull();
        expect(resoudreFormat('   ')).toBeNull();
        expect(resoudreFormat(42)).toBeNull();
        expect(resoudreFormat('Podcast')).toBeNull();
    });

    it('reconnaît chaque format du registre par ses deux noms', () => {
        for (const def of Object.values(FORMAT_REGISTRY)) {
            expect(resoudreFormat(def.key)).toBe(def.key);
            expect(resoudreFormat(def.shortKey)).toBe(def.key);
        }
    });
});
