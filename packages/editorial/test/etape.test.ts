/**
 * L'étape d'un contenu — SPEC §13. Un test par ligne des tableaux : les
 * libellés des listes (§13.3) et la règle d'arrivée (§13.4). Les listes, le
 * sélecteur et l'arrivée lisent tous ce calcul : s'il ment, tout ment.
 */
import { describe, it, expect } from 'vitest';
import {
    etapeCourante, sorteDuContenu, etapesDuFil, visuelsAProduire, jourCourt,
    type ContenuPourEtape, type EntreeEtape, type MontagePourEtape,
} from '../src/etape';
import { TargetFormat, VIDEO_DIRECTE, verifierReelExplique, type ReelExplique } from '../src/index';

const MAINTENANT = Date.parse('2026-10-27T10:00:00Z');
const JOUR = 86_400_000;

const contenu = (champs: Partial<ContenuPourEtape> = {}): ContenuPourEtape => ({
    status: 'Brouillon', targetFormat: TargetFormat.ARTICLE_LONG_SEO, draft: null, slides: null,
    analyzedAt: null, serieId: null, seriePosition: null, scheduledDate: null, coachStatus: null,
    ...champs,
});

const calcul = (entree: Partial<EntreeEtape> & { contenu: ContenuPourEtape }) =>
    etapeCourante({ maintenant: MAINTENANT, ...entree });

const BROUILLON = JSON.stringify({ format: 'Post Texte', accroche: 'Une accroche.', corps: 'Un corps.' });
const SCRIPT_REEL = JSON.stringify({ format: 'Script Reel', sections: [{ role: 'Accroche', texte: 'Vous ne savez pas si je suis le bon praticien.' }] });

/** Un Reel expliqué qui tient : deux visuels à produire. */
const reel = (): ReelExplique => ({
    format: 'Reel expliqué',
    sequences: [
        { plan: 'camera', role: 'Accroche', voix: "Vous relisez trois fois un message avant de l'envoyer ?" },
        { plan: 'camera', role: 'Ancrage', voix: "En séance, je l'entends presque chaque semaine. Et ce n'est pas de la politesse : c'est un système d'alarme qui s'est réglé trop fort." },
        {
            plan: 'scene', role: 'Mécanique', registre: 'pedagogie',
            voix: "Le perfectionnisme fonctionne comme une alarme incendie. Elle était utile quand vous étiez enfant et qu'une erreur coûtait cher. Aujourd'hui, elle sonne pour une virgule. Et chaque fois qu'elle sonne, vous payez en fatigue.",
            titre: 'Une alarme [trop sensible]',
            elements: [
                { type: 'carte', taille: 'petite', ton: 'ombre', texte: 'Enfant : erreur = danger', apparait_sur: 'quand vous étiez enfant' },
                { type: 'carte', taille: 'petite', ton: 'ombre', texte: 'Adulte : une [virgule]', apparait_sur: 'elle sonne pour une virgule' },
                { type: 'carte', taille: 'grande', ton: 'ombre', texte: 'Le prix : la [fatigue]', visuel: { nature: 'schema', description: "Une jauge d'alarme bloquée dans le rouge." }, apparait_sur: 'vous payez en fatigue' },
            ],
        },
        {
            plan: 'scene', role: 'Bascule', registre: 'humour',
            voix: "Imaginez un détecteur de fumée qui se déclenche dès que vous allumez une bougie. Vous ne le jetez pas : vous le réglez.",
            titre: 'On ne le jette [pas]',
            elements: [
                { type: 'carte', taille: 'grande', ton: 'neutre', texte: null, visuel: { nature: 'illustration', description: "Un détecteur de fumée paniqué au plafond." }, apparait_sur: 'dès que vous allumez une bougie' },
                { type: 'pastille', ton: 'lumiere', texte: 'On le [règle]', apparait_sur: 'vous le réglez' },
            ],
        },
        { plan: 'camera', role: "Appel à l'action", voix: "C'est ce travail-là qu'on fait en séance : baisser le volume, sans couper le son. Si ça vous parle, tout est sur luminose.fr, lien en bio." },
    ],
    accroche_pub: { voix: "Relire trois fois un message avant de l'envoyer : on croit que c'est de la politesse." },
    legende: { texte: 'Trois relectures pour un message de deux lignes.', cta: 'Lien en bio → luminose.fr', hashtags: ['#perfectionnisme'] },
} as ReelExplique);

const video = (champs: Partial<ContenuPourEtape> = {}) =>
    contenu({ targetFormat: TargetFormat.REEL_EXPLIQUE, draft: JSON.stringify(reel()), ...champs });

const montage = (champs: Partial<MontagePourEtape> = {}): MontagePourEtape => ({ prises: [], visuels: 0, dernierExport: null, ...champs });
const prise = (pret = true, transcrite = true) => ({ role: 'principale', pret, transcrite });

describe('la sorte, et son fil d’étapes (§13.2)', () => {
    it('se lit au registre, sans nommer de format', () => {
        expect(sorteDuContenu(contenu())).toBe('ecrit');
        expect(sorteDuContenu(contenu({ targetFormat: TargetFormat.CARROUSEL_SLIDE }))).toBe('carrousel');
        expect(sorteDuContenu(video())).toBe('video');
        expect(sorteDuContenu(contenu({ targetFormat: TargetFormat.SCRIPT_VIDEO_REEL_SHORT }))).toBe('video');
        expect(sorteDuContenu(contenu({ targetFormat: VIDEO_DIRECTE.format, draft: VIDEO_DIRECTE.brouillon() }))).toBe('video-sans-script');
        // Un contenu sans format s'écrit.
        expect(sorteDuContenu(contenu({ targetFormat: null }))).toBe('ecrit');
    });

    it('donne au sélecteur les étapes de chaque sorte', () => {
        expect(etapesDuFil('ecrit')).toEqual(['ouverture', 'atelier', 'brouillon', 'publication']);
        expect(etapesDuFil('carrousel')).toEqual(['ouverture', 'atelier', 'brouillon', 'slides', 'publication']);
        expect(etapesDuFil('video')).toEqual(['ouverture', 'atelier', 'script', 'tournage', 'montage', 'publication']);
        expect(etapesDuFil('video-sans-script')).toEqual(['montage', 'publication']);
    });

    it('compte les visuels que les scènes réclament', () => {
        expect(verifierReelExplique(reel())).toEqual([]);
        expect(visuelsAProduire(reel())).toBe(2);
        expect(visuelsAProduire(null)).toBe(0);
    });
});

describe('les libellés d’une vidéo (§13.3)', () => {
    it('publiée : la date, passée ou à venir', () => {
        const passee = new Date(MAINTENANT - 15 * JOUR).toISOString().slice(0, 10);
        const avenir = new Date(MAINTENANT + 7 * JOUR).toISOString().slice(0, 10);
        expect(calcul({ contenu: video({ status: 'Publié', scheduledDate: passee }) }).libelle).toBe('Publié le 12 oct.');
        expect(calcul({ contenu: video({ status: 'Publié', scheduledDate: avenir }) }).libelle).toBe('Programmé le 3 nov.');
    });

    it('un export en cours, puis le dernier export', () => {
        const exportee = montage({ prises: [prise()], dernierExport: { format: '9:16', version: 'organique', le: MAINTENANT - 7 * JOUR } });
        expect(calcul({ contenu: video(), montage: exportee, enCours: { export: 40 } }).libelle).toBe('Export en cours · 40 %');
        expect(calcul({ contenu: video(), montage: exportee }).libelle).toBe('Exportée le 20 oct. · 9:16');
    });

    it('l’envoi de la prise, puis sa transcription', () => {
        expect(calcul({ contenu: video(), enCours: { envoi: 62 } }).libelle).toBe('Envoi de la prise · 62 %');
        expect(calcul({ contenu: video(), montage: montage({ prises: [prise(true, false)] }), enCours: { transcription: true } }).libelle).toBe('Transcription en cours');
        expect(calcul({ contenu: video(), montage: montage({ prises: [prise(true, false)] }) }).libelle).toBe('Prise déposée · à transcrire');
        expect(calcul({ contenu: video(), montage: montage({ prises: [prise(false, false)] }) }).libelle).toBe('Envoi interrompu · à redéposer');
    });

    it('la prise calée : les visuels qui manquent, ou prête à exporter', () => {
        expect(calcul({ contenu: video(), montage: montage({ prises: [prise()] }) }).libelle).toBe('Montage · 2 visuels à déposer');
        expect(calcul({ contenu: video(), montage: montage({ prises: [prise()], visuels: 1 }) }).libelle).toBe('Montage · 1 visuel à déposer');
        expect(calcul({ contenu: video(), montage: montage({ prises: [prise()], visuels: 2 }) }).libelle).toBe('Montage · prête à exporter');
        const directe = contenu({ targetFormat: TargetFormat.SCRIPT_VIDEO_REEL_SHORT, draft: SCRIPT_REEL });
        expect(calcul({ contenu: directe, montage: montage({ prises: [prise()] }) }).libelle).toBe('Montage · prête à exporter');
    });

    it('une vidéo directe sans script attend sa prise', () => {
        const sansScript = contenu({ targetFormat: VIDEO_DIRECTE.format, draft: VIDEO_DIRECTE.brouillon() });
        expect(calcul({ contenu: sansScript }).libelle).toBe('Montage · déposez la prise');
    });

    it('prête à tourner, tant qu’aucune prise n’est déposée', () => {
        expect(calcul({ contenu: video({ status: 'Prêt' }) }).libelle).toBe('Prête à tourner');
    });

    it('un script qui ne tient pas, puis un script écrit', () => {
        const casse = reel();
        casse.sequences[2].elements![0] = { type: 'carte', taille: 'petite', ton: 'ombre', texte: null, apparait_sur: 'quand vous étiez enfant' } as any;
        const n = verifierReelExplique(casse).length;
        expect(n).toBeGreaterThan(0);
        expect(calcul({ contenu: video({ draft: JSON.stringify(casse) }) }).libelle).toBe(`Script · ${n} point${n > 1 ? 's' : ''} à corriger`);
        expect(calcul({ contenu: video() }).libelle).toBe('Script écrit');
    });
});

describe('les libellés d’un écrit ou d’un carrousel (§13.3)', () => {
    const post = (champs: Partial<ContenuPourEtape> = {}) =>
        contenu({ targetFormat: TargetFormat.POST_TEXTE_COURT, draft: BROUILLON, ...champs });
    const carrousel = (champs: Partial<ContenuPourEtape> = {}) =>
        contenu({ targetFormat: TargetFormat.CARROUSEL_SLIDE, draft: BROUILLON, ...champs });
    const publiable = { verdict: 'Publiable', points: 0, le: MAINTENANT - JOUR };
    const aRetoucher = { verdict: 'À retoucher', points: 2, le: MAINTENANT - JOUR };

    it('bon à publier', () => {
        expect(calcul({ contenu: post({ status: 'Prêt' }) }).libelle).toBe('Bon à publier');
    });

    it('un carrousel : slides prêtes, ou à produire après une relecture Publiable', () => {
        expect(calcul({ contenu: carrousel({ slides: '{"slides":[]}' }) }).libelle).toBe('Slides prêtes');
        expect(calcul({ contenu: carrousel(), relecture: publiable }).libelle).toBe('Relu : Publiable · slides à produire');
    });

    it('la dernière relecture, si elle vise le brouillon d’aujourd’hui', () => {
        expect(calcul({ contenu: post(), relecture: publiable, brouillonLe: MAINTENANT - 2 * JOUR }).libelle).toBe('Brouillon · relu : Publiable');
        expect(calcul({ contenu: post(), relecture: aRetoucher, brouillonLe: MAINTENANT - 2 * JOUR }).libelle).toBe('Brouillon · relu : 2 points');
    });

    it('un brouillon plus récent que la relecture n’est pas relu', () => {
        expect(calcul({ contenu: post(), relecture: publiable, brouillonLe: MAINTENANT }).libelle).toBe('Brouillon · pas encore relu');
        expect(calcul({ contenu: post() }).libelle).toBe('Brouillon · pas encore relu');
    });

    it('un format qui ne se relit pas à froid ne promet pas de relecture', () => {
        expect(calcul({ contenu: contenu({ draft: BROUILLON }) }).libelle).toBe('Brouillon écrit');
    });
});

describe('les libellés d’avant le brouillon (§13.3)', () => {
    it('l’atelier en cours compte ses tours', () => {
        expect(calcul({ contenu: contenu({ coachStatus: 'in_progress' }), session: { messages: 9, tours: 4 } }).libelle).toBe('Atelier · 4 tours');
        expect(calcul({ contenu: contenu({ coachStatus: 'in_progress' }), session: { messages: 2, tours: 1 } }).libelle).toBe('Atelier · 1 tour');
    });

    it('un atelier validé sans brouillon : la rédaction est à relancer', () => {
        expect(calcul({ contenu: contenu({ coachStatus: 'validated' }), session: { messages: 9, tours: 4 } }).libelle).toBe('Rédaction à relancer');
    });

    it('à ouvrir, préparée par l’Analyste ou par le plan de série', () => {
        expect(calcul({ contenu: contenu({ analyzedAt: MAINTENANT }) }).libelle).toBe('À ouvrir · préparée');
        expect(calcul({ contenu: contenu({ serieId: 's1', seriePosition: 2 }) }).libelle).toBe('À ouvrir · préparée');
        expect(calcul({ contenu: contenu() }).libelle).toBe('À ouvrir');
    });

    it('dans Idées : préparée ou à préparer', () => {
        expect(calcul({ contenu: contenu({ status: 'Idée', analyzedAt: MAINTENANT }) }).libelle).toBe('Préparée');
        expect(calcul({ contenu: contenu({ status: 'Idée' }) }).libelle).toBe('À préparer');
    });
});

describe('la règle d’arrivée (§13.4)', () => {
    const exportee = montage({ prises: [prise()], dernierExport: { format: '9:16', version: 'organique', le: MAINTENANT } });

    it('1. publié : Publication', () => {
        expect(calcul({ contenu: contenu({ status: 'Publié', draft: BROUILLON }) }).etape).toBe('publication');
        expect(calcul({ contenu: video({ status: 'Publié' }) }).etape).toBe('publication');
    });

    it('2. vidéo exportée : Publication', () => {
        expect(calcul({ contenu: video(), montage: exportee }).etape).toBe('publication');
    });

    it('3. vidéo avec une prise, même interrompue, ou sans script : Montage', () => {
        expect(calcul({ contenu: video(), montage: montage({ prises: [prise(false, false)] }) }).etape).toBe('montage');
        expect(calcul({ contenu: contenu({ targetFormat: VIDEO_DIRECTE.format, draft: VIDEO_DIRECTE.brouillon() }) }).etape).toBe('montage');
    });

    it('4. vidéo prête à tourner : Tournage', () => {
        expect(calcul({ contenu: video({ status: 'Prêt' }) }).etape).toBe('tournage');
    });

    it('5. écrit ou carrousel bon à publier : Publication', () => {
        expect(calcul({ contenu: contenu({ status: 'Prêt', draft: BROUILLON }) }).etape).toBe('publication');
        expect(calcul({ contenu: contenu({ status: 'Prêt', targetFormat: TargetFormat.CARROUSEL_SLIDE, draft: BROUILLON, slides: '{}' }) }).etape).toBe('publication');
    });

    it('6. un brouillon : l’étape d’écriture — Brouillon, Script, ou Slides si elles existent', () => {
        expect(calcul({ contenu: contenu({ draft: BROUILLON }) }).etape).toBe('brouillon');
        expect(calcul({ contenu: video() }).etape).toBe('script');
        expect(calcul({ contenu: contenu({ targetFormat: TargetFormat.CARROUSEL_SLIDE, draft: BROUILLON }) }).etape).toBe('brouillon');
        expect(calcul({ contenu: contenu({ targetFormat: TargetFormat.CARROUSEL_SLIDE, draft: BROUILLON, slides: '{}' }) }).etape).toBe('slides');
    });

    it('7. aucune session coach : Ouverture', () => {
        expect(calcul({ contenu: contenu() }).etape).toBe('ouverture');
        expect(calcul({ contenu: contenu({ status: 'Idée' }) }).etape).toBe('ouverture');
    });

    it('8. sinon : Atelier', () => {
        expect(calcul({ contenu: contenu({ coachStatus: 'in_progress' }), session: { messages: 4, tours: 2 } }).etape).toBe('atelier');
        expect(calcul({ contenu: contenu({ coachStatus: 'validated' }) }).etape).toBe('atelier');
    });
});

describe('le geste qui attend (§13.5)', () => {
    it('vidéo : publier l’exportée, monter celle qui a une prise, tourner la prête', () => {
        expect(calcul({ contenu: video(), montage: montage({ prises: [prise()], dernierExport: { format: '9:16', version: 'organique', le: MAINTENANT } }) }).geste).toBe('publier');
        expect(calcul({ contenu: video(), montage: montage({ prises: [prise()] }) }).geste).toBe('monter');
        expect(calcul({ contenu: contenu({ targetFormat: VIDEO_DIRECTE.format, draft: VIDEO_DIRECTE.brouillon() }) }).geste).toBe('monter');
        expect(calcul({ contenu: video({ status: 'Prêt' }) }).geste).toBe('tourner');
        expect(calcul({ contenu: video() }).geste).toBe('ecrire');
    });

    it('écrit : publier le prêt, écrire le reste ; un publié n’attend rien', () => {
        expect(calcul({ contenu: contenu({ status: 'Prêt', draft: BROUILLON }) }).geste).toBe('publier');
        expect(calcul({ contenu: contenu({ draft: BROUILLON }) }).geste).toBe('ecrire');
        expect(calcul({ contenu: contenu({ status: 'Publié' }) }).geste).toBe('publie');
    });
});

describe('la barre de progression (§13.2)', () => {
    it('un écrit relisible : ouvert, atelier, brouillon, relu, bon à publier', () => {
        const post = contenu({ targetFormat: TargetFormat.POST_TEXTE_COURT });
        expect(calcul({ contenu: post }).progression).toEqual({ segments: ['encours', 'avenir', 'avenir', 'avenir', 'avenir'], complet: false });
        expect(calcul({ contenu: { ...post, draft: BROUILLON } }).progression.segments).toEqual(['fait', 'fait', 'fait', 'encours', 'avenir']);
        expect(calcul({ contenu: { ...post, draft: BROUILLON, status: 'Prêt' } }).progression).toEqual({ segments: ['fait', 'fait', 'fait', 'fait', 'fait'], complet: true });
    });

    it('un écrit qui ne se relit pas n’a pas de segment « relu »', () => {
        expect(calcul({ contenu: contenu({ draft: BROUILLON }) }).progression.segments).toEqual(['fait', 'fait', 'fait', 'encours']);
    });

    it('un carrousel a un segment de slides', () => {
        const c = contenu({ targetFormat: TargetFormat.CARROUSEL_SLIDE, draft: BROUILLON });
        expect(calcul({ contenu: c, relecture: { verdict: 'Publiable', points: 0, le: MAINTENANT } }).progression.segments)
            .toEqual(['fait', 'fait', 'fait', 'fait', 'encours', 'avenir']);
    });

    it('une vidéo : ouvert, atelier, prête à tourner, prise déposée, exportée', () => {
        expect(calcul({ contenu: video(), montage: montage({ prises: [prise()] }) }).progression.segments)
            .toEqual(['fait', 'fait', 'fait', 'fait', 'encours']);
        expect(calcul({ contenu: video(), montage: montage({ prises: [prise()], dernierExport: { format: '9:16', version: 'organique', le: MAINTENANT } }) }).progression.complet).toBe(true);
    });

    it('une vidéo sans script : prise calée, exportée', () => {
        const sansScript = contenu({ targetFormat: VIDEO_DIRECTE.format, draft: VIDEO_DIRECTE.brouillon() });
        expect(calcul({ contenu: sansScript }).progression.segments).toEqual(['encours', 'avenir']);
        expect(calcul({ contenu: sansScript, montage: montage({ prises: [prise()] }) }).progression.segments).toEqual(['fait', 'encours']);
    });

    it('un contenu publié est complet, même jamais monté', () => {
        expect(calcul({ contenu: video({ status: 'Publié' }) }).progression.complet).toBe(true);
    });
});

describe('les dates courtes', () => {
    it('se lisent en français, à l’heure de Paris', () => {
        expect(jourCourt(Date.parse('2026-10-12T22:30:00Z'))).toBe('13 oct.');
    });
});
