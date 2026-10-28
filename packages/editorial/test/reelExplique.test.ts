/**
 * Le Reel expliqué — SPEC §12.3. Ce qui se compte se compte ici, et c'est ce
 * calcul-là que l'écran affiche au-dessus du storyboard : un script qui passe
 * ces tests peut se tourner sans que l'écran sache déjà qu'il ne tiendra pas.
 */
import { describe, it, expect } from 'vitest';
import {
    verifierReelExplique, segmentsSurlignes, texteAffiche, motsNormalises, motsSitues,
    positionsDesReperes, dureeEstimee, reelToMarkdown, reelToPlainText,
    estReelExplique, minuterReel, horlogeEstimee, debutsDesEcrans, ecranEnClair, COUP_MIN, COUP_MAX, type ReelExplique,
} from '../src/reelExplique';
import { getFormatDef, parseDraftResponse, TargetFormat, FORMAT_REGISTRY } from '../src/index';
import { reelValide } from './reel-valide';

const valide = reelValide;

const problemesDe = (data: unknown) => verifierReelExplique(data).map(p => `${p.ou} — ${p.probleme}`);

describe('un script qui tient', () => {
    it('ne lève aucun problème', () => {
        expect(problemesDe(valide())).toEqual([]);
    });

    it('est estimé à sa durée de lecture', () => {
        expect(dureeEstimee(valide())).toBe(46);
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
        data.sequences = [data.sequences[2], data.sequences[4]];
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
        // 28 caractères affichés, 30 avec les crochets : ça tient.
        data.sequences[2].elements![1].texte = 'Perfectionnisme [obsessionnel]';
        expect(texteAffiche(data.sequences[2].elements![1].texte)).toHaveLength(28);
        expect(problemesDe(data)).toEqual([]);
        data.sequences[2].elements![1].texte = 'Perfectionnismes [obsessionnel]';
        expect(problemesDe(data)).toEqual([
            'séquence 3, écran 2 — 29 caractères (max 28) : « Perfectionnismes obsessionnel »',
        ]);
    });

    it('un écran se lit d’un coup d’œil : quatre mots au plus', () => {
        const data = valide();
        data.sequences[2].elements![1].texte = 'Une erreur, un [danger] mortel';
        expect(problemesDe(data)).toEqual(['séquence 3, écran 2 — 5 mots (max 4) : « Une erreur, un danger mortel »']);
    });

    it('une scène dure six secondes au plus : le visage revient entre deux', () => {
        const data = valide();
        data.sequences[2].voix = "Le perfectionnisme, c'est une alarme incendie. Enfant, une erreur coûtait cher, souvent vraiment très, très cher.";
        expect(problemesDe(data)).toContain('séquence 3 — 17 mots de voix (max 16) : une scène dure six secondes au plus, le visage revient entre deux');
    });

    it('signale un repère introuvable dans la voix', () => {
        const data = valide();
        data.sequences[2].elements![1].apparait_sur = 'une faute coûtait';
        expect(problemesDe(data).join('\n')).toContain('séquence 3, écran 2 — repère « une faute coûtait » introuvable');
    });

    it('signale un repère placé avant celui de l’écran qui le précède', () => {
        const data = valide();
        const [a, b] = data.sequences[4].elements!;
        data.sequences[4].elements = [b, a];
        const p = problemesDe(data).join('\n');
        expect(p).toContain('séquence 5, écran 2');
        expect(p).toContain('placé avant le repère précédent');
    });

    it('le premier écran arrive avec la scène, et chacun laisse au suivant le temps d’être lu', () => {
        const tard = valide();
        tard.sequences[2].elements![0].apparait_sur = 'une alarme incendie';
        expect(problemesDe(tard)).toContain('séquence 3, écran 1 — le premier écran arrive avec la scène : son repère doit être dans les 3 premiers mots de la voix');
        const serre = valide();
        serre.sequences[4].elements![1].apparait_sur = "qu'elle sonne";
        expect(problemesDe(serre)).toContain('séquence 5, écran 2 — 3 mot(s) après l\'écran précédent (min 4) : le précédent n\'aurait pas le temps d\'être lu');
    });

    it('accepte un écran sans texte quand il porte un visuel, pas l’écran vide', () => {
        const data = valide();
        expect(data.sequences[2].elements![0].texte).toBeNull();
        expect(problemesDe(data)).toEqual([]);
        data.sequences[2].elements![0].visuel = null;
        expect(problemesDe(data)).toContain('séquence 3, écran 1 — écran vide : ni texte ni visuel');
    });

    it('lit encore un visuel décrit d’avant la v2.26, sans en exiger de nouveaux', () => {
        const data = valide();
        data.sequences[2].elements![1].visuel = { nature: 'schema', description: 'Une jauge bloquée dans le rouge.' };
        expect(problemesDe(data)).toEqual([]);
        data.sequences[2].elements![1].visuel = { nature: 'schema', description: '  ' };
        expect(problemesDe(data)).toContain('séquence 3, écran 2 — visuel illisible : ni "illustration", ni "schema"');
    });

    it('tient ses illustrations : connues, montrées, deux au plus', () => {
        const inconnue = valide();
        inconnue.sequences[5].elements![1].visuel = { illustration: 'apres' };
        const p = problemesDe(inconnue);
        expect(p).toContain('séquence 6, écran 2 — illustration « apres » inconnue (attendu : « alarme » ou « reglee »)');
        expect(p).toContain('illustration « reglee » — aucun écran ne la montre : elle serait produite pour rien');
        const trois = valide();
        trois.illustrations!.push({ id: 'troisieme', description: 'Une troisième scène.' });
        trois.sequences[2].elements![1].visuel = { illustration: 'troisieme', cadrage: 'de travers' as any };
        expect(problemesDe(trois)).toEqual([
            'séquence 3, écran 2 — cadrage « de travers » inconnu (attendu : ensemble, haut, bas, gauche, droite, centre)',
            'illustrations — 3 illustrations (max 2) : une scène de la métaphore, et au plus son autre état',
        ]);
        const boucle = valide();
        boucle.illustrations![1].depuis = 'reglee';
        expect(problemesDe(boucle)).toContain('illustration « reglee » — "depuis" désigne « reglee », qui n\'est pas l\'autre illustration');
    });

    it('vérifie ses schémas : des nombres où il en faut, des libellés courts', () => {
        const data = valide();
        data.sequences[4].elements![0].visuel = { schema: 'niveau', de: 50, a: 50 };
        data.sequences[4].elements![1].visuel = { schema: 'liste', items: ['Tension', 'Fatigue', 'Insomnie', 'Doute'] };
        data.sequences[5].elements![0].visuel = { schema: 'opposition', gauche: 'Le jeter sans attendre', droite: 'Le régler' };
        data.sequences[2].elements![1].visuel = { schema: 'spirale' } as any;
        expect(problemesDe(data)).toEqual([
            'séquence 3, écran 2 — schéma inconnu « spirale » (attendu : niveau, compteur, opposition, liste, enchainement)',
            'séquence 5, écran 1 — niveau : "de" et "a" sont deux nombres différents, de 0 à 100',
            'séquence 5, écran 2 — liste : 4 ligne(s) (attendu : 2 à 3)',
            'séquence 6, écran 1 — opposition, côté gauche : 4 mots (max 3) : « Le jeter sans attendre »',
        ]);
    });

    it('borne le nombre de scènes', () => {
        const data = valide();
        data.sequences.splice(4, 1);
        expect(problemesDe(data)).toContain('script — 2 scène(s) (attendu : 3 à 7)');
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
        expect(positionsDesReperes(valide().sequences[2])).toEqual([0, 8]);
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
        expect(md.startsWith('**Illustrations de la métaphore**\n- « alarme » : En haut, un détecteur')).toBe(true);
        expect(md).toContain('- « reglee » (la même scène que « alarme », transformée) : La même pièce');
        expect(md).toContain('**Séquence 3 — Scène — Mécanique (pédagogie)**');
        expect(md).toContain('- Écran 1 : illustration « alarme » — fond neutre — apparaît sur « Le perfectionnisme »');
        expect(md).toContain('- Écran 2 : « Erreur = [danger] » — fond ombre — apparaît sur « une erreur coûtait cher »');
        expect(md).toContain('- Écran 1 : « Le [prix] » — schéma : un niveau qui monte de 20 à 90 % — fond ombre');
        expect(md).toContain('- Écran 1 : illustration « alarme », cadrée en haut — fond neutre');
        expect(md).toContain('**Seconde accroche (publicité)**');
        expect(md).toContain('**Légende de publication**');
    });

    it('dit chaque écran en clair, pour se préparer au tournage', () => {
        const [scene] = [valide().sequences[4]];
        expect(scene.elements!.map(ecranEnClair)).toEqual([
            '« Le prix » — schéma : un niveau qui monte de 20 à 90 %',
            'schéma : « Tension », « Fatigue »',
        ]);
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

describe('le minutage', () => {
    it('enchaîne les séquences sans trou : la voix ne s\u2019arrête jamais', () => {
        const m = minuterReel(valide(), horlogeEstimee(150));
        expect(m.duree).toBeCloseTo(115 * 60 / 150);
        m.sequences.forEach((s, i) => {
            if (i > 0) expect(s.debut).toBe(m.sequences[i - 1].fin);
        });
        expect(m.sequences[0].debut).toBe(0);
        expect(m.sequences[m.sequences.length - 1].fin).toBe(m.duree);
    });

    it('fait apparaître chaque écran au mot de son repère, depuis le début de sa scène', () => {
        const m = minuterReel(valide(), horlogeEstimee(150));
        // Scène 3 : repères aux mots 0 et 8 de sa voix, à 0,4 s le mot.
        expect(m.sequences[2].apparitions).toEqual([0, 3.2].map(x => expect.closeTo(x, 5)));
        expect(m.sequences[0].apparitions).toEqual([]);
    });

    it('fait arriver le premier écran avec la scène, et chaque suivant à son heure (v2.26)', () => {
        expect(debutsDesEcrans([1.2, 3, 5], 8)).toEqual([0, 3, 5]);
        // Un repère introuvable prend sa place à égale distance de ses voisins.
        expect(debutsDesEcrans([0, null, 6], 8)).toEqual([0, 3, 6]);
        expect(debutsDesEcrans([0, null], 8)).toEqual([0, 4]);
        // Un écran ne revient jamais en arrière.
        expect(debutsDesEcrans([0, 5, 4], 8)).toEqual([0, 5, 5]);
    });

    it('laisse sans moment un élément dont le repère est introuvable', () => {
        const data = valide();
        data.sequences[2].elements![1].apparait_sur = 'une faute coûtait';
        expect(minuterReel(data, horlogeEstimee()).sequences[2].apparitions[1]).toBeNull();
    });

    it('borne le débit qu\u2019on lui donne', () => {
        expect(horlogeEstimee(1000)(200)).toBe(60);
        expect(horlogeEstimee(10)(110)).toBe(60);
    });

    it('accepte n\u2019importe quelle horloge — celle de la prise viendra à l\u2019étape 3', () => {
        const prise = (rang: number) => 2 + rang * 0.5;
        const m = minuterReel(valide(), prise);
        expect(m.sequences[0].debut).toBe(2);
        expect(m.sequences[2].apparitions[1]).toBe(4);
    });
});

/**
 * Le coup de poing (SPEC §12.5.3) : quelques mots plein écran, le temps de les
 * dire, sur un passage face caméra du milieu.
 */
describe('le coup de poing', () => {
    const avecCoup = (): ReelExplique => {
        const data = valide();
        data.sequences[1].coup = { texte: 'Pas de la [politesse]', apparait_sur: 'pas de la politesse' };
        return data;
    };

    it('passe le contrôle quand il est à sa place', () => {
        expect(problemesDe(avecCoup())).toEqual([]);
    });

    it('frappe au mot de son repère, et tient le temps de le dire plus un souffle', () => {
        const m = minuterReel(avecCoup(), horlogeEstimee(150));
        // « pas de la politesse » : mots 12 à 15 de la séquence 2 (« n'est » en compte deux), à 0,4 s le mot.
        expect(m.sequences[1].coup!.debut).toBeCloseTo(12 * 0.4);
        expect(m.sequences[1].coup!.fin - m.sequences[1].coup!.debut).toBeCloseTo(4 * 0.4 + 0.4);
        expect(m.sequences[0].coup).toBeNull();
    });

    it('ne tient ni moins qu’il ne faut pour le lire, ni assez pour faire oublier le visage', () => {
        const court = avecCoup();
        court.sequences[1].coup!.apparait_sur = 'politesse';
        const m = minuterReel(court, horlogeEstimee(150));
        expect(m.sequences[1].coup!.fin - m.sequences[1].coup!.debut).toBeCloseTo(COUP_MIN);
        const long = avecCoup();
        long.sequences[1].coup!.apparait_sur = "pas de la politesse : c'est un système d'alarme";
        const l = minuterReel(long, horlogeEstimee(110));
        expect(l.sequences[1].coup!.fin - l.sequences[1].coup!.debut).toBeCloseTo(COUP_MAX);
    });

    it('se refuse sur une scène, sur l’accroche, et au-delà de deux', () => {
        const scene = avecCoup();
        scene.sequences[2].coup = { texte: 'Trop', apparait_sur: 'une alarme incendie' };
        expect(problemesDe(scene)).toContain('séquence 3, coup de poing — un coup de poing frappe sur un passage face caméra : une scène occupe déjà l\'écran');
        const accroche = avecCoup();
        accroche.sequences[0].coup = { texte: 'Trois fois', apparait_sur: 'trois fois' };
        expect(problemesDe(accroche).some(p => p.startsWith('séquence 1, coup de poing — ni sur l\'accroche'))).toBe(true);
        const trois = avecCoup();
        trois.sequences[0].coup = { texte: 'Trois fois', apparait_sur: 'trois fois' };
        trois.sequences[4].coup = { texte: 'En séance', apparait_sur: 'en séance' };
        expect(problemesDe(trois)).toContain('script — 3 coups de poing (max 2) : au-delà, la rupture devient le rythme');
    });

    it('se compte, et cherche son repère dans la voix', () => {
        const long = avecCoup();
        long.sequences[1].coup!.texte = 'Ce n’est pas de la politesse du tout';
        expect(problemesDe(long).some(p => p.startsWith('séquence 2, coup de poing — 36 caractères (max 24)'))).toBe(true);
        const perdu = avecCoup();
        perdu.sequences[1].coup!.apparait_sur = 'de la courtoisie';
        expect(problemesDe(perdu).some(p => p.includes('« de la courtoisie » introuvable'))).toBe(true);
    });

    it('se lit dans le script en texte, pour le Lecteur froid', () => {
        expect(reelToMarkdown(avecCoup())).toContain('Écran — coup de poing : Pas de la [politesse] — frappe sur « pas de la politesse »');
    });
});
