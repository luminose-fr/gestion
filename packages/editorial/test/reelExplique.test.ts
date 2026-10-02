/**
 * Le Reel expliqué — SPEC §12.3. Ce qui se compte se compte ici, et c'est ce
 * calcul-là que l'écran affiche au-dessus du storyboard : un script qui passe
 * ces tests peut se tourner sans que l'écran sache déjà qu'il ne tiendra pas.
 */
import { describe, it, expect } from 'vitest';
import {
    verifierReelExplique, segmentsSurlignes, texteAffiche, motsNormalises, motsSitues,
    positionsDesReperes, dureeEstimee, reelToMarkdown, reelToPlainText,
    estReelExplique, type ReelExplique,
} from '../src/reelExplique';
import { getFormatDef, parseDraftResponse, TargetFormat, FORMAT_REGISTRY } from '../src/index';

/** Un script qui tient : ~126 mots, 50 s estimées, deux scènes, repères dans l'ordre. */
const valide = (): ReelExplique => ({
    format: 'Reel expliqué',
    sequences: [
        { plan: 'camera', role: 'Accroche', voix: "Vous relisez trois fois un message avant de l'envoyer ?", intention: 'Regard caméra, sourcil levé.' },
        { plan: 'camera', role: 'Ancrage', voix: "En séance, je l'entends presque chaque semaine. Et ce n'est pas de la politesse : c'est un système d'alarme qui s'est réglé trop fort." },
        {
            plan: 'scene', role: 'Mécanique', registre: 'pedagogie',
            voix: "Le perfectionnisme fonctionne comme une alarme incendie. Elle était utile quand vous étiez enfant et qu'une erreur coûtait cher. Aujourd'hui, elle sonne pour une virgule. Et chaque fois qu'elle sonne, vous payez en fatigue.",
            titre: 'Une alarme [trop sensible]',
            elements: [
                { type: 'carte', taille: 'petite', ton: 'ombre', texte: 'Enfant : erreur = danger', apparait_sur: 'quand vous étiez enfant' },
                { type: 'carte', taille: 'petite', ton: 'ombre', texte: 'Adulte : une [virgule]', apparait_sur: 'elle sonne pour une virgule' },
                {
                    type: 'carte', taille: 'grande', ton: 'ombre', texte: 'Le prix : la [fatigue]',
                    visuel: { nature: 'schema', description: "Une jauge d'alarme bloquée dans le rouge pour un détail minuscule." },
                    apparait_sur: 'vous payez en fatigue',
                },
            ],
        },
        {
            plan: 'scene', role: 'Bascule', registre: 'humour',
            voix: "Imaginez un détecteur de fumée qui se déclenche dès que vous allumez une bougie. Vous ne le jetez pas : vous le réglez.",
            titre: 'On ne le jette [pas]',
            elements: [
                {
                    type: 'carte', taille: 'grande', ton: 'neutre', texte: null,
                    visuel: { nature: 'illustration', description: "Un détecteur de fumée paniqué au plafond, au-dessus d'une seule bougie d'anniversaire." },
                    apparait_sur: 'dès que vous allumez une bougie',
                },
                { type: 'pastille', ton: 'lumiere', texte: 'On le [règle]', apparait_sur: 'vous le réglez' },
            ],
        },
        { plan: 'camera', role: "Appel à l'action", voix: "C'est ce travail-là qu'on fait en séance : baisser le volume, sans couper le son. Si ça vous parle, tout est sur luminose.fr, lien en bio." },
    ],
    accroche_pub: { voix: "Relire trois fois un message avant de l'envoyer : on croit que c'est de la politesse." },
    legende: { texte: 'Trois relectures pour un message de deux lignes.', cta: 'Lien en bio → luminose.fr', hashtags: ['#perfectionnisme'] },
});

const problemesDe = (data: unknown) => verifierReelExplique(data).map(p => `${p.ou} — ${p.probleme}`);

describe('un script qui tient', () => {
    it('ne lève aucun problème', () => {
        expect(problemesDe(valide())).toEqual([]);
    });

    it('est estimé à sa durée de lecture', () => {
        expect(dureeEstimee(valide())).toBe(50);
    });

    it('passe le contrôle déclaré par le registre, et la frontière de rédaction', () => {
        const def = getFormatDef('Reel expliqué');
        expect(def?.key).toBe(TargetFormat.REEL_EXPLIQUE);
        expect(def?.controler?.(valide())).toEqual([]);
        expect(() => parseDraftResponse(JSON.stringify(valide()))).not.toThrow();
    });
});

describe('ce qui se compte', () => {
    it('exige d’ouvrir et de fermer face caméra', () => {
        const data = valide();
        data.sequences = [data.sequences[2], ...data.sequences.slice(3, 4)];
        const p = problemesDe(data);
        expect(p.some(x => x.startsWith('séquence 1 — la vidéo doit s\'ouvrir face caméra'))).toBe(true);
        expect(p.some(x => x.includes('se fermer face caméra'))).toBe(true);
    });

    it('borne l’accroche, faute de quoi le scroll l’emporte', () => {
        const data = valide();
        data.sequences[0].voix = 'Un deux trois quatre cinq six sept huit neuf dix onze douze treize quatorze quinze seize.';
        expect(problemesDe(data)).toContain("séquence 1 — l'accroche fait 16 mots (max 15)");
    });

    it('compte le texte affiché, pas ses crochets', () => {
        const data = valide();
        // 30 caractères affichés, 32 avec les crochets : ça tient.
        data.sequences[2].elements![0].texte = 'Une erreur = un danger, [enfant]';
        expect(texteAffiche(data.sequences[2].elements![0].texte)).toHaveLength(30);
        expect(problemesDe(data)).toEqual([]);
        data.sequences[2].elements![0].texte = 'Une erreur = un danger : [enfant]';
        expect(problemesDe(data)).toEqual([
            'séquence 3, élément 1 — 31 caractères (max 30) : « Une erreur = un danger : enfant »',
        ]);
    });

    it('signale un repère introuvable dans la voix', () => {
        const data = valide();
        data.sequences[2].elements![1].apparait_sur = 'pour une faute';
        expect(problemesDe(data).join('\n')).toContain('séquence 3, élément 2 — repère « pour une faute » introuvable');
    });

    it('signale un repère placé avant celui de l’élément qui le précède', () => {
        const data = valide();
        const [a, b, c] = data.sequences[2].elements!;
        data.sequences[2].elements = [c, a, b];
        const p = problemesDe(data).join('\n');
        expect(p).toContain('séquence 3, élément 2');
        expect(p).toContain('placé avant le repère précédent');
    });

    it('accepte une carte sans texte quand elle porte un visuel décrit, pas l’inverse', () => {
        const data = valide();
        expect(data.sequences[3].elements![0].texte).toBeNull();
        expect(problemesDe(data)).toEqual([]);
        data.sequences[3].elements![0].visuel = { nature: 'illustration', description: '  ' };
        expect(problemesDe(data)).toContain('séquence 4, élément 1 — visuel sans description : Florent ne saura pas quoi produire');
        data.sequences[3].elements![0].visuel = null;
        expect(problemesDe(data)).toContain('séquence 4, élément 1 — élément vide : ni texte ni visuel');
    });

    it('ne tient qu’une grande carte par scène', () => {
        const data = valide();
        data.sequences[2].elements![0].taille = 'grande';
        expect(problemesDe(data)).toContain("séquence 3 — plus d'une grande carte : le cadre vertical n'en tient qu'une");
    });

    it('borne le nombre de scènes', () => {
        const data = valide();
        data.sequences.splice(3, 1);
        expect(problemesDe(data)).toContain('script — 1 scène(s) (attendu : 2 à 4)');
    });

    it('exige la seconde accroche', () => {
        const data = valide();
        data.accroche_pub = null;
        expect(problemesDe(data)).toContain("seconde accroche — \"accroche_pub\" absente : la variante publicitaire n'aura pas d'ouverture");
    });

    it('borne la durée estimée', () => {
        const data = valide();
        data.sequences[1].voix = 'mot '.repeat(200);
        expect(problemesDe(data).join('\n')).toContain('durée estimée');
    });

    it('rend un problème lisible, sans lever, sur une réponse qui n’en est pas une', () => {
        expect(problemesDe({ format: 'Reel expliqué' })).toEqual([
            'script — aucune séquence : le champ "sequences" est vide ou absent',
        ]);
        expect(problemesDe(null)).toHaveLength(1);
    });
});

describe('les mots et les repères', () => {
    it('normalise comme le fera l’alignement sur la prise', () => {
        expect(motsNormalises("L'ombre, c'est ÉVIDENT !")).toEqual(['l', 'ombre', 'c', 'est', 'evident']);
        // Une ligature n'est pas un séparateur : « cœur » reste un mot.
        expect(motsNormalises('Le cœur, luminose.fr')).toEqual(['le', 'coeur', 'luminose', 'fr']);
        // Un texte décomposé (NFD) donne les mêmes mots que sa forme composée.
        expect(motsNormalises('évident'.normalize('NFD'))).toEqual(['evident']);
    });

    it('garde la place de chaque mot dans le texte d’origine', () => {
        const texte = "C'est évident.";
        expect(motsSitues(texte).map(m => texte.slice(m.debut, m.fin))).toEqual(['C', 'est', 'évident']);
    });

    it('situe chaque élément dans la voix de sa scène', () => {
        expect(positionsDesReperes(valide().sequences[2])).toEqual([10, 22, 33]);
    });
});

describe('le surlignage', () => {
    it('découpe sur les crochets', () => {
        expect(segmentsSurlignes("Sur le papier, c'est [évident]")).toEqual([
            { texte: "Sur le papier, c'est ", surligne: false },
            { texte: 'évident', surligne: true },
        ]);
    });

    it('accepte le gras markdown, par où un modèle revient souvent', () => {
        expect(segmentsSurlignes('un **énorme** problème')).toEqual([
            { texte: 'un ', surligne: false },
            { texte: 'énorme', surligne: true },
            { texte: ' problème', surligne: false },
        ]);
    });

    it('rend une liste vide sur un texte absent', () => {
        expect(segmentsSurlignes(null)).toEqual([]);
    });
});

describe('les lectures en texte', () => {
    it('donne au Lecteur froid la voix ET l’écran', () => {
        const md = reelToMarkdown(valide());
        expect(md).toContain('**Séquence 3 — Scène — Mécanique (pédagogie)**');
        expect(md).toContain('Écran — titre : Une alarme [trop sensible]');
        expect(md).toContain('- Carte (grande, ombre) : Le prix : la [fatigue] [schéma : ');
        expect(md).toContain('apparaît sur « vous payez en fatigue »');
        expect(md).toContain('**Seconde accroche (publicité)**');
        expect(md).toContain('**Légende de publication**');
    });

    it('passe par le registre', () => {
        expect(FORMAT_REGISTRY[TargetFormat.REEL_EXPLIQUE].toMarkdown(valide())).toBe(reelToMarkdown(valide()));
    });

    it('résume par la voix seule, l’écran ne disant rien de plus', () => {
        const texte = reelToPlainText(valide());
        expect(texte.startsWith("Vous relisez trois fois un message avant de l'envoyer ?")).toBe(true);
        expect(texte).not.toContain('Une alarme');
    });

    it('se reconnaît à sa structure', () => {
        expect(estReelExplique(valide())).toBe(true);
        expect(estReelExplique({ format: 'Script Reel', sections: [] })).toBe(false);
    });
});
