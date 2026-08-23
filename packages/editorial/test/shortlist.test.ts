/**
 * La courte liste (SPEC §5.6).
 *
 * Ce qui compte ici : la liste reste COURTE et VARIÉE. Un test qui vérifierait
 * seulement « vingt lignes » raterait l'essentiel — vingt variantes du même
 * modèle sont vingt lignes et zéro choix.
 */
import { describe, it, expect } from 'vitest';
import {
    selectionnerCourteListe,
    normaliserNomModele,
    fabricantDe,
    ligneeDe,
    PALIERS_PRIX,
    PLANCHER_ELO,
    PLAFOND_SLOP,
    CAP_FABRICANT,
    profilerModele,
    qualiteRedactionDe,
    famillesPourModele,
    type ModeleNote,
    type NoteProfilable,
} from '../src/shortlist';
import { ATTENDU_FAMILLES, AI_ACTION_CATALOG } from '../src/actions';

const note = (slug: string, prixSortie: number, elo: number, ecriture = 16, slop = 15): ModeleNote =>
    ({ slug, prixSortie, elo, ecriture, slop });

/** Un champ plausible : plusieurs fabricants, tous les paliers, quelques pièges. */
const CHAMP: ModeleNote[] = [
    note('thinkingmachines/inkling', 4.05, 1608, 16.38, 15.0),   // le même, payant
    note('anthropic/claude-opus-5', 25, 2105, 17.07, 6.6),
    note('anthropic/claude-opus-4.7', 25, 1904, 16.57, 11.1),   // dominé par Opus 5
    note('anthropic/claude-fable-5', 50, 1932, 16.81, 10.3),
    note('anthropic/claude-sonnet-4.6', 15, 1803, 16.50, 9.9),
    note('anthropic/claude-sonnet-4.5', 15, 1676, 16.14, 16.1),
    note('openai/gpt-5.6-sol', 10, 1959, 16.78, 11.7),
    note('openai/gpt-5.6-luna', 1.2, 1826, 16.58, 11.8),
    note('openai/gpt-5.6-terra', 12, 1847, 16.56, 12.4),
    note('openai/gpt-5.4', 15, 1834, 16.89, 12.2),
    note('openai/gpt-4o-mini', 0.6, 870, 11.67, 44.0),           // sous le plancher
    note('moonshotai/kimi-k3', 15, 2060, 16.85, 9.7),
    note('moonshotai/kimi-k2.6', 4, 1723, 16.67, 13.3),
    note('~deepseek/deepseek-v4-flash-latest', 0.08, 1556, 16.29, 20.9),
    note('deepseek/deepseek-v4-flash-0731', 0.18, 1438, 15.98, 24.6), // même lignée
    note('deepseek/deepseek-v4-pro', 0.79, 1553, 16.45, 19.7),
    note('z-ai/glm-5.2:free', 0, 1750, 16.44, 13.1),
    note('thinkingmachines/inkling:free', 0, 1608, 16.38, 15.0),
    note('thinkingmachines/inkling-small:free', 0, 1489, 15.53, 14.7), // même lignée
    note('google/gemini-3.7-flash', 1.88, 1722, 16.27, 24.4),
    note('google/gemini-3.1-pro-preview', 12, 1489, 16.04, 30.03),     // au-dessus du plafond
    note('nousresearch/hermes-4-405b', 3, 1418, 16.15, 39.6),          // au-dessus du plafond
    note('x-ai/grok-4.5', 6, 1576, 16.25, 17.7),
    note('meta/muse-spark-1.1', 4.25, 1911, 16.54, 12.1),
    note('qwen/qwen3.8-2.4t-a95b', 6, 1840, 16.72, 12.3),
    note('mistralai/mistral-medium-3.1', 2, 1474, 15.96, 26.2),
];

const slugs = (r: ReturnType<typeof selectionnerCourteListe>) => r.map(x => x.slug);

describe('appariement des noms', () => {
    it('rapproche les deux façons de nommer un même modèle', () => {
        expect(normaliserNomModele('anthropic/claude-opus-5')).toBe(normaliserNomModele('claude-opus-5'));
        expect(normaliserNomModele('z-ai/glm-5.2:free')).toBe(normaliserNomModele('glm-5.2'));
        expect(normaliserNomModele('~deepseek/deepseek-v4-flash-latest')).toBe(normaliserNomModele('deepseek-v4-flash'));
        expect(normaliserNomModele('google/gemini-3.1-pro-preview')).toBe(normaliserNomModele('gemini-3.1-pro'));
    });

    it('ne confond pas deux générations', () => {
        expect(normaliserNomModele('moonshotai/kimi-k3')).not.toBe(normaliserNomModele('moonshotai/kimi-k2.6'));
    });
});

describe('fabricant et lignée', () => {
    it('lit le fabricant malgré le tilde des variantes', () => {
        expect(fabricantDe('~deepseek/deepseek-v4-flash-latest')).toBe('deepseek');
        expect(fabricantDe('anthropic/claude-opus-5')).toBe('anthropic');
    });

    it('fond les variantes d’un même modèle, sépare les générations', () => {
        expect(ligneeDe('~deepseek/deepseek-v4-flash-latest')).toBe(ligneeDe('deepseek/deepseek-v4-flash-0731'));
        expect(ligneeDe('thinkingmachines/inkling:free')).toBe(ligneeDe('thinkingmachines/inkling-small:free'));
        expect(ligneeDe('moonshotai/kimi-k3')).not.toBe(ligneeDe('moonshotai/kimi-k2.6'));
    });
});

describe('la courte liste', () => {
    const retenus = selectionnerCourteListe(CHAMP);

    it('tient dans la cible', () => {
        expect(retenus.length).toBeLessThanOrEqual(20);
        expect(retenus.length).toBeGreaterThan(10);
    });

    it('écarte ce qui écrit mal — quitte à laisser un palier incomplet', () => {
        expect(slugs(retenus)).not.toContain('openai/gpt-4o-mini');          // elo 870
        expect(slugs(retenus)).not.toContain('nousresearch/hermes-4-405b');  // slop 39.6
        expect(slugs(retenus)).not.toContain('google/gemini-3.1-pro-preview'); // slop 30.03
    });

    it('écarte les dominés : même palier, moins bon partout', () => {
        expect(slugs(retenus)).toContain('anthropic/claude-opus-5');
        expect(slugs(retenus)).not.toContain('anthropic/claude-opus-4.7');
        expect(slugs(retenus)).not.toContain('anthropic/claude-sonnet-4.5');
        // Le constat qui vaut la peine d'être encodé : Fable 5 coûte le double
        // d'Opus 5 et perd sur les trois axes. La liste n'a pas à le proposer.
        expect(slugs(retenus)).not.toContain('anthropic/claude-fable-5');
    });

    it('ne laisse pas un modèle gratuit effacer une option payante bon marché', () => {
        // GLM 5.2 gratuit bat DeepSeek Flash sur les trois axes, mais un gratuit
        // est plafonné en débit : ce n'est pas le même service.
        expect(slugs(retenus)).toContain('z-ai/glm-5.2:free');
        expect(slugs(retenus)).toContain('~deepseek/deepseek-v4-flash-latest');
    });

    it('ne propose jamais l’accès payant d’un modèle publié gratuitement', () => {
        // Inkling est publié gratuit ET à 4,05 $ : proposer le second serait absurde.
        expect(slugs(retenus)).not.toContain('thinkingmachines/inkling');
    });

    it('ne montre qu’une variante par lignée', () => {
        const retenusSlugs = slugs(retenus);
        expect(retenusSlugs).toContain('~deepseek/deepseek-v4-flash-latest');
        expect(retenusSlugs).not.toContain('deepseek/deepseek-v4-flash-0731');
        expect(retenusSlugs.filter(s => s.startsWith('thinkingmachines/')).length).toBeLessThanOrEqual(1);
    });

    it('ne laisse aucun fabricant occuper la liste', () => {
        const parFabricant = new Map<string, number>();
        for (const s of slugs(retenus)) {
            const f = fabricantDe(s);
            parFabricant.set(f, (parFabricant.get(f) ?? 0) + 1);
        }
        for (const [, n] of parFabricant) expect(n).toBeLessThanOrEqual(CAP_FABRICANT);
        expect(parFabricant.size).toBeGreaterThanOrEqual(6);
    });

    it('étale les prix — c’est l’arbitrage réel', () => {
        const paliers = new Set(retenus.map(r => r.palier));
        expect(paliers.size).toBeGreaterThanOrEqual(5);
        expect(paliers.has('gratuit')).toBe(true);
        expect(paliers.has('premium')).toBe(true);
    });

    it('garde les meilleurs de chaque bout : le gratuit défendable et le sommet', () => {
        expect(slugs(retenus)).toContain('z-ai/glm-5.2:free');
        expect(slugs(retenus)).toContain('moonshotai/kimi-k3');
        expect(slugs(retenus)).toContain('anthropic/claude-opus-5');
    });

    it('range du moins cher au plus cher', () => {
        const prix = retenus.map(r => CHAMP.find(m => m.slug === r.slug)!.prixSortie!);
        expect([...prix].sort((a, b) => a - b)).toEqual(prix);
    });

    it('annonce le palier de chaque ligne', () => {
        for (const r of retenus) {
            expect(PALIERS_PRIX.some(p => p.id === r.palier)).toBe(true);
            expect(r.palierLibelle).toBeTruthy();
        }
    });
});

/**
 * La domination masque souvent la règle de lignée dans un champ réel. Ce champ
 * l'isole : deux variantes d'un même modèle, dans deux paliers différents, dont
 * aucune ne domine l'autre.
 */
describe('l’accès le moins cher, isolé', () => {
    it('garde le gratuit et écarte le payant, à modèle identique', () => {
        const r = slugs(selectionnerCourteListe([
            note('thinkingmachines/inkling', 4.05, 1608, 16.38, 15.0),
            note('thinkingmachines/inkling:free', 0, 1608, 16.38, 15.0),
        ]));
        expect(r).toEqual(['thinkingmachines/inkling:free']);
    });

    it('à prix égal, le meilleur Elo tranche', () => {
        const r = slugs(selectionnerCourteListe([
            note('acme/modele-small:free', 0, 1489, 15.53, 14.7),
            note('acme/modele:free', 0, 1608, 16.38, 15.0),
        ]));
        expect(r).toEqual(['acme/modele:free']);
    });
});

describe('la règle de lignée, isolée', () => {
    const CHAMP_LIGNEE: ModeleNote[] = [
        note('acme/model-v2', 5, 1900, 16.8, 10),
        note('acme/model-v2-mini', 1.5, 1700, 16.4, 12),
        note('autre/concurrent-1', 2, 1750, 16.5, 11),
    ];

    it('retient une seule variante, et garde le concurrent', () => {
        const r = slugs(selectionnerCourteListe(CHAMP_LIGNEE));
        expect(r.filter(s => ligneeDe(s) === ligneeDe('acme/model-v2'))).toHaveLength(1);
        expect(r).toContain('autre/concurrent-1');
    });
});

describe('dégradations', () => {
    it('sans note, aucune sélection — et pas d’exception', () => {
        const sansNote = CHAMP.map(m => ({ ...m, elo: null, ecriture: null, slop: null }));
        expect(selectionnerCourteListe(sansNote)).toEqual([]);
        expect(selectionnerCourteListe([])).toEqual([]);
    });

    it('un modèle sans prix ne peut pas être placé dans un palier', () => {
        const r = selectionnerCourteListe([{ slug: 'x/y', prixSortie: null, elo: 2000, ecriture: 17, slop: 8 }]);
        expect(r).toEqual([]);
    });

    it('un champ d’un seul modèle ne divise pas par zéro', () => {
        const r = selectionnerCourteListe([note('anthropic/claude-opus-5', 25, 2105, 17.07, 6.6)]);
        expect(slugs(r)).toEqual(['anthropic/claude-opus-5']);
    });

    it('les seuils sont ceux annoncés dans la SPEC', () => {
        expect(PLANCHER_ELO).toBe(1400);
        expect(PLAFOND_SLOP).toBe(30);
    });
});

/**
 * Le profil d'un modèle (SPEC §5.6).
 *
 * Ces trois champs se remplissaient de mémoire. Ce qui compte ici : ils disent
 * ce que les mesures disent — et se taisent quand elles manquent.
 */
describe('le profil déduit des mesures', () => {
    const CONTEXTE = {
        releveLe: '23/08/2026',
        familles: ATTENDU_FAMILLES,
        actions: AI_ACTION_CATALOG,
    };

    const profil = (over: Partial<NoteProfilable> = {}) => profilerModele({
        slug: 'openai/gpt-5.6-sol', prixSortie: 10, prixIn: 2,
        elo: 1959, ecriture: 16.78, slop: 11.68, suivi: 18.48,
        forces: ['Rythme', "Évite l'emphase"],
        ...over,
    }, CONTEXTE);

    it('range le coût sur les mêmes paliers que la sélection', () => {
        expect(profil({ prixSortie: 0 }).cost).toBe('low');
        expect(profil({ prixSortie: 0.08 }).cost).toBe('low');
        expect(profil({ prixSortie: 0.79 }).cost).toBe('low_medium');
        expect(profil({ prixSortie: 4 }).cost).toBe('medium');
        expect(profil({ prixSortie: 15 }).cost).toBe('high');
        expect(profil({ prixSortie: 50 }).cost).toBe('very_high');
    });

    it('classe la rédaction sur l’Elo', () => {
        expect(qualiteRedactionDe(2105, 6.6)).toBe(5);
        expect(qualiteRedactionDe(1826, 11.8)).toBe(4);
        expect(qualiteRedactionDe(1556, 20.9)).toBe(3);
        expect(qualiteRedactionDe(1301, 22)).toBe(2);
        expect(qualiteRedactionDe(870, 44)).toBe(1);
    });

    it('retire un cran au modèle bavard, si bien classé soit-il', () => {
        // Gemini 3.1 Pro : correctement classé, mais trois fois le slop de Fable 5.
        expect(qualiteRedactionDe(1489, 30.03)).toBe(1);
        expect(qualiteRedactionDe(1489, 12)).toBe(2);
        // Le plancher tient.
        expect(qualiteRedactionDe(700, 60)).toBe(1);
    });

    it('écrit les mesures, le prix et la date du relevé', () => {
        const { strengths } = profil();
        expect(strengths).toContain("Rythme, Évite l'emphase.");
        expect(strengths).toContain('écriture 16,78/20');
        expect(strengths).toContain("tournures d'IA 11,7 (plus bas est meilleur)");
        expect(strengths).toContain('suivi des consignes 18,5/20');
        expect(strengths).toContain('Prix : 2,00 → 10,00 $ par million de jetons.');
        expect(strengths).toContain('Relevé le 23/08/2026');
    });

    it('dit « gratuit » plutôt qu’un prix de zéro', () => {
        expect(profil({ prixSortie: 0, prixIn: 0 }).strengths).toContain('Gratuit.');
    });

    it('nomme les familles ET les actions concernées', () => {
        // Bien écrit et peu bavard : la voix.
        const voix = profil({ prixSortie: 25, ecriture: 17.07, slop: 6.6, elo: 2105 }).strengths;
        expect(voix).toContain('Porter la voix — Atelier (conversation), Rédaction, Ajustement du texte.');
        expect(voix).toContain('Synthétiser — Brief verrouillé, Plan de série.');
        // Trop cher pour le volume : ni juger ni recopier.
        expect(voix).not.toContain('Juger —');
    });

    it('envoie les modèles bon marché sur le volume', () => {
        const eco = profil({ prixSortie: 0.38, elo: 1511, ecriture: 16.28, slop: 23.19 }).strengths;
        expect(eco).toContain('Juger — Analyse des idées, Relecture à froid.');
        expect(eco).toContain('Recopier — Slides du carrousel, Prompts d’image.');
        // Trop bavard pour porter la voix, et sous le seuil de la synthèse.
        expect(eco).not.toContain('Porter la voix');
        expect(eco).not.toContain('Synthétiser');
    });

    it('le dit quand aucune famille ne le distingue', () => {
        const quelconque = profil({ prixSortie: 20, elo: 1450, ecriture: 15.9, slop: 26 }).strengths;
        expect(quelconque).toContain('Aucune famille du flux ne le distingue');
    });

    /** Ne pas inventer une note est plus utile que d'en inventer une moyenne. */
    it('se tait quand le modèle n’est pas mesuré', () => {
        const p = profil({ elo: null, ecriture: null, slop: null, suivi: null, forces: [] });
        expect(p.textQuality).toBeNull();
        expect(p.strengths).toContain('n’est pas mesuré par EQ-Bench');
        expect(p.strengths).not.toContain('écriture');
        // Le prix, lui, est connu : le coût reste juste.
        expect(p.cost).toBe('high');
    });

    /**
     * La distinction qui évite un mensonge : l'écriture appartient au MODÈLE,
     * le tarif au FOURNISSEUR. Le même Claude coûte des crédits chez 1min.ai et
     * des dollars par million de jetons chez OpenRouter.
     */
    it('ne colle pas un tarif OpenRouter sur un modèle appelé ailleurs', () => {
        const p = profilerModele(
            { slug: 'anthropic/claude-opus-5', prixSortie: 25, prixIn: 5,
              elo: 2105, ecriture: 17.07, slop: 6.59, suivi: 18.43, forces: ['Rythme'] },
            { ...CONTEXTE, avecPrix: false },
        );
        expect(p.cost).toBeNull();
        expect(p.strengths).not.toContain('$ par million');
        expect(p.strengths).toContain('Les tarifs de votre fournisseur ne sont pas repris ici.');
        // Ce qui relève du modèle, lui, reste écrit.
        expect(p.textQuality).toBe(5);
        expect(p.strengths).toContain('écriture 17,07/20');
        expect(p.strengths).toContain('Porter la voix');
    });

    it('les familles se lisent aussi seules', () => {
        expect(famillesPourModele({
            slug: 'x/y', prixSortie: 1, elo: 1800, ecriture: 16.6, slop: 11, suivi: 18, forces: [],
        })).toEqual(['voix', 'juger', 'recopie', 'synthèse']);
    });
});
