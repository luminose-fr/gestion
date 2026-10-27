/**
 * Le fil d'un contenu, mis en phrases (SPEC §13.7) : qui a parlé en dernier, et
 * ce qu'il a dit ou fait. C'est la ligne que la liste Conversations affiche
 * sous chaque titre — « Lecteur froid · Publiable. Sujet perçu : … ».
 *
 * Le fait vient de la conversation Coach, du journal des productions, d'un
 * geste de Florent, ou du montage. Ici, on ne lit pas : on met en mots.
 */
import { isColdReadApplyInstruction } from './coldRead';
import { bodyJsonToText, montageDuBrouillon, parseBodyJson } from './formats';
import { dureeEstimee } from './reelExplique';
import { jourCourt, type Sorte } from './etape';

/** Les voix du fil : les rôles de l'IA, Florent, et ce que fait le montage. */
export type RoleDuFil =
    | 'Vous' | 'Analyste' | 'Coach' | 'Verrouilleur' | 'Rédacteur' | 'Lecteur froid'
    | 'Artiste' | 'Éclateur' | 'Contrôle du format' | 'Montage' | 'Sortie';

/** Un fait daté du fil — la forme de `DernierDuFil`, plus le montage. */
export interface FaitDuFil {
    source: 'coach' | 'journal' | 'geste' | 'montage';
    /** Coach : `user` | `assistant`. Journal : la nature. Geste : le statut posé. Montage : `prise` | `transcription` | `export`. */
    nature: string;
    texte: string | null;
    verdict?: string | null;
    /** Le statut d'avant, pour un geste. */
    avant?: string | null;
    /** Durée de la prise, format et version d'un export. */
    duree?: number | null;
    format?: string | null;
    version?: string | null;
    le: number;
}

/** Le montage tel que la liste le connaît, dates comprises. */
export interface MontageDuFil {
    prises: Array<{ role: string; deposeeLe?: number; transcriteLe?: number | null; duree?: number }>;
    dernierExport: { format: string; version: string; le: number } | null;
}

const ROLES_DU_JOURNAL: Record<string, RoleDuFil> = {
    analysis: 'Analyste',
    brief: 'Verrouilleur',
    draft: 'Rédacteur',
    adjustment: 'Rédacteur',
    cold_read: 'Lecteur froid',
    slides: 'Artiste',
    plan_series: 'Éclateur',
};

/** Le premier message d'un atelier est le brief que l'outil compose : Florent ne l'a pas écrit. */
const estLeBriefDOuverture = (texte: string) => texte.startsWith('TITRE :');

/** Une ligne de liste ne montre pas le gras ni les titres du Markdown. */
const sansMarkdown = (texte: string) => texte.replace(/[*_#>`]+/g, '').replace(/\s+/g, ' ').trim();

const minutes = (secondes: number) => `${Math.floor(secondes / 60)}:${String(Math.round(secondes % 60)).padStart(2, '0')}`;

const estVideo = (sorte: Sorte) => sorte === 'video' || sorte === 'video-sans-script';

/** Le plus récent des faits du montage : la prise principale, sa transcription, le dernier export. */
export function dernierFaitDuMontage(montage: MontageDuFil | null | undefined): FaitDuFil | null {
    if (!montage) return null;
    const faits: FaitDuFil[] = [];
    const principale = montage.prises.find(p => p.role === 'principale');
    if (principale?.deposeeLe) faits.push({ source: 'montage', nature: 'prise', texte: null, duree: principale.duree ?? null, le: principale.deposeeLe });
    if (principale?.transcriteLe) faits.push({ source: 'montage', nature: 'transcription', texte: null, le: principale.transcriteLe });
    if (montage.dernierExport) {
        const e = montage.dernierExport;
        faits.push({ source: 'montage', nature: 'export', texte: null, format: e.format, version: e.version, le: e.le });
    }
    return faits.reduce<FaitDuFil | null>((plus, f) => (!plus || f.le > plus.le ? f : plus), null);
}

/** Le dernier fait du fil, montage compris. */
export function dernierFait(fil: FaitDuFil | null | undefined, montage?: MontageDuFil | null): FaitDuFil | null {
    const duMontage = dernierFaitDuMontage(montage);
    if (!fil) return duMontage;
    if (!duMontage) return fil;
    return duMontage.le > fil.le ? duMontage : fil;
}

/** Qui parle, et ce qu'il dit — en une phrase. */
export function resumerLeFait(fait: FaitDuFil, sorte: Sorte): { role: RoleDuFil; texte: string } {
    const texte = fait.texte ? sansMarkdown(fait.texte) : '';

    if (fait.source === 'coach') {
        if (fait.nature === 'user') return { role: 'Vous', texte: estLeBriefDOuverture(texte) ? 'Atelier ouvert.' : texte };
        return { role: 'Coach', texte };
    }

    if (fait.source === 'geste') {
        const avant = fait.avant ?? '';
        if (fait.nature === 'Prêt') return { role: 'Vous', texte: estVideo(sorte) ? 'Prête à tourner.' : 'Bon à publier.' };
        if (fait.nature === 'Publié') return { role: 'Vous', texte: 'Publié.' };
        if (fait.nature === 'Brouillon') return { role: 'Vous', texte: avant === 'Idée' ? 'Mis en chantier.' : 'Repassé en écriture.' };
        return { role: 'Vous', texte: 'Remis dans les idées.' };
    }

    if (fait.source === 'montage') {
        if (fait.nature === 'export') {
            const version = fait.version === 'publicite' ? 'publicité' : 'organique';
            return { role: 'Sortie', texte: `Exportée en ${fait.format ?? '9:16'}, ${version}.` };
        }
        if (fait.nature === 'transcription') return { role: 'Montage', texte: 'Prise transcrite.' };
        return { role: 'Montage', texte: fait.duree ? `Prise déposée (${minutes(fait.duree)}).` : 'Prise déposée.' };
    }

    const role = ROLES_DU_JOURNAL[fait.nature] ?? 'Rédacteur';
    switch (fait.nature) {
        case 'analysis': return { role, texte: 'Idée préparée.' };
        case 'brief': return { role, texte: 'Brief verrouillé.' };
        case 'draft': return { role, texte: estVideo(sorte) ? 'Script rédigé.' : 'Brouillon rédigé.' };
        case 'slides': return { role, texte: 'Slides produites.' };
        case 'plan_series': return { role, texte: 'Plan de série posé.' };
        case 'cold_read': {
            const verdict = fait.verdict ? `${fait.verdict}.` : 'Relu.';
            return { role, texte: texte ? `${verdict} Sujet perçu : ${texte}` : verdict };
        }
        case 'adjustment':
            if (isColdReadApplyInstruction(fait.texte)) return { role, texte: 'Corrections de la relecture appliquées.' };
            return { role, texte: texte ? `Ajusté : ${texte}` : 'Ajusté.' };
        default: return { role, texte };
    }
}

/**
 * Le moment d'un fait, comme une messagerie le dit : l'heure aujourd'hui,
 * « hier », sinon le jour. À l'heure de Paris.
 */
export function momentDuFait(le: number, maintenant: number = Date.now()): string {
    const jour = (ms: number) => new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date(ms));
    if (jour(le) === jour(maintenant)) {
        return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }).format(new Date(le));
    }
    if (jour(le) === jour(maintenant - 86_400_000)) return 'hier';
    return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'Europe/Paris' }).format(new Date(le));
}

// ── Le fil entier, pour le contenu ouvert (SPEC §13.10) ──────────────


/** Une production du journal, telle que `GET /contents/:id/generations` la rend. */
export interface GenerationDuFil {
    id: string;
    kind: string;
    target: string | null;
    instruction: string | null;
    payload: string;
    createdAt: number;
}

export interface MessageCoachDuFil {
    role: 'user' | 'assistant' | string;
    content: string;
    createdAt: number;
}

export interface GesteDuFil { statut: string; avant: string; le: number }

/** Ce que le contenu garde de l'analyse, quand le journal ne la porte pas (contenus d'avant le journal). */
export interface AnalyseDuContenu {
    analyzedAt: number | null;
    verdict: string | null;
    objectif: string | null;
    platforms: string[];
    strategicAngle: string | null;
    suggestedMetaphor: string | null;
    justification: string | null;
}

export type TonDuFil = 'neutre' | 'succes' | 'alerte';

export interface BulleDuFil {
    type: 'bulle';
    id: string;
    role: RoleDuFil;
    /** À gauche, une voix de l'IA ou du montage ; à droite, Florent. */
    de: 'ia' | 'vous';
    le: number;
    texte: string;
    ton: TonDuFil;
    /** Le verdict d'une relecture, en gras dans la bulle. */
    verdict?: string | null;
    /** Ce qu'une relecture ou un contrôle relève, un point par ligne. */
    points?: string[];
    /**
     * Les corrections qu'une relecture propose, prêtes à envoyer au Rédacteur —
     * seulement sur la dernière relecture, si elle juge le texte d'aujourd'hui
     * et qu'elle n'a pas déjà été appliquée.
     */
    corrections?: string | null;
    /** La relecture a été appliquée : son action est remplacée par la date. */
    appliqueeLe?: number | null;
    /** La dernière production d'une colonne, qu'on peut défaire. */
    revenirPossible?: boolean;
    /** Le contrôle du format, qu'on corrige d'un clic. */
    controle?: boolean;
}

/** Un atelier validé se replie en une ligne : on l'a fini, on ne le relit plus. */
export interface AtelierDuFil {
    type: 'atelier';
    id: string;
    messages: number;
    le: number;
    bulles: BulleDuFil[];
}

export type ElementDuFil = BulleDuFil | AtelierDuFil;

export interface EntreeDuFil {
    sorte: Sorte;
    analyse?: AnalyseDuContenu | null;
    generations: GenerationDuFil[];
    coach: MessageCoachDuFil[];
    /** L'atelier est validé : ses messages se replient. */
    atelierValide: boolean;
    gestes?: GesteDuFil[];
    montage?: MontageDuFil | null;
    /** Ce que le contrôle du format relève sur le script d'aujourd'hui. */
    controles?: string[];
    /** L'instant présent : la date du contrôle du format quand le fil n'a encore rien d'autre. */
    maintenant?: number;
}

const lireJson = (texte: string): any | null => {
    try { return JSON.parse(texte); } catch { return null; }
};

/** Ce qu'une rédaction a produit, compté — « 7 slides, 612 caractères ». */
function ceQuiAEteEcrit(payload: string, sorte: Sorte): string {
    const data = parseBodyJson(payload);
    if (!data) return '';
    if (sorte === 'video' || sorte === 'video-sans-script') {
        const reel = montageDuBrouillon(data);
        if (!reel?.sequences.length) return '';
        return ` : ${reel.sequences.length} séquence${reel.sequences.length > 1 ? 's' : ''}, ≈ ${dureeEstimee(reel)} s`;
    }
    if (sorte === 'carrousel' && Array.isArray(data.slides)) {
        const caracteres = data.slides.reduce((n: number, s: any) => n + (typeof s?.texte === 'string' ? s.texte.length : 0), 0);
        return ` : ${data.slides.length} slides, ${caracteres.toLocaleString('fr-FR')} caractères`;
    }
    const mots = bodyJsonToText(payload).split(/\s+/).filter(Boolean).length;
    return mots ? ` : ${mots.toLocaleString('fr-FR')} mots` : '';
}

/** L'analyse en phrases : ce qui oriente l'atelier, et ce qui manque quand l'idée n'était pas prête. */
function ceQueDitLAnalyste(a: {
    verdict?: string | null; objectif?: string | null; plateformes?: string[]; angle?: string | null;
    metaphore?: string | null; justification?: string | null; titre?: string | null;
}): string {
    const lignes: string[] = [];
    const cadre = [a.objectif && `Objectif : ${a.objectif}`, a.plateformes?.length && `Plateformes : ${a.plateformes.join(', ')}`].filter(Boolean);
    if (cadre.length) lignes.push(`${cadre.join(' · ')}.`);
    if (a.titre) lignes.push(`Titre possible : ${a.titre}`);
    // L'angle d'un contenu analysé avant le journal commence par le titre suggéré : il a sa ligne.
    const angle = a.angle?.split(/\n\s*\n/).filter(l => !/^\**\s*Titre suggéré/.test(l.trim())).join(' ');
    if (angle?.trim()) lignes.push(`Angle : ${sansMarkdown(angle)}`);
    if (a.metaphore) lignes.push(`Métaphore : ${a.metaphore}`);
    // Le verdict ne s'affiche plus (SPEC §13.8) ; ce qu'il disait manquer, si.
    if (a.verdict && a.verdict !== 'Valide' && a.justification) lignes.push(`Ce qui manque : ${a.justification}`);
    return lignes.join('\n') || 'Idée préparée.';
}

/** Une relecture en bulle : verdict, ce qu'un inconnu a compris, et ce qui reste à reprendre. */
function bulleDeRelecture(g: GenerationDuFil): BulleDuFil {
    const r = lireJson(g.payload) ?? {};
    const verdict: string = typeof r.verdict === 'string' ? r.verdict : 'Relu';
    const problemes: any[] = Array.isArray(r.problemes) ? r.problemes : [];
    const ko: any[] = Array.isArray(r.controles) ? r.controles.filter((c: any) => c?.statut === 'KO') : [];
    const points = [
        ...problemes.map(p => `${p.localisation ? `${p.localisation} : ` : ''}${p.probleme ?? ''}`.trim()),
        ...ko.map(c => `${c.regle}${c.detail ? ` : ${c.detail}` : ''}`),
    ].filter(Boolean);
    const lecture = r.lecture_naive ?? {};
    const texte = [
        lecture.sujet && `Sujet perçu : ${lecture.sujet}`,
        lecture.auteur && `Auteur perçu : ${lecture.auteur}`,
        lecture.action && `Action perçue : ${lecture.action}`,
    ].filter(Boolean).join('\n');
    const corrections = problemes
        .filter(p => p.correction_proposee)
        .map(p => `${p.localisation ? `[${p.localisation}] ` : ''}${p.correction_proposee}`)
        .join('\n');
    const publiable = verdict === 'Publiable';
    return {
        type: 'bulle', id: g.id, role: 'Lecteur froid', de: 'ia', le: g.createdAt, texte,
        ton: publiable ? 'succes' : 'alerte',
        verdict: publiable ? 'Publiable' : `${verdict}${points.length ? `, ${points.length} point${points.length > 1 ? 's' : ''}` : ''}`,
        points: publiable ? [] : points,
        corrections: corrections || null,
    };
}

function bulleDeGeste(g: GesteDuFil, i: number, sorte: Sorte): BulleDuFil | null {
    if (g.statut === 'Brouillon' && g.avant === 'Idée') return null;
    const texte = g.statut === 'Publié' ? 'Marqué publié.' : resumerLeFait({ source: 'geste', nature: g.statut, texte: null, avant: g.avant, le: g.le }, sorte).texte;
    return { type: 'bulle', id: `geste-${i}`, role: 'Vous', de: 'vous', le: g.le, texte, ton: 'neutre' };
}

/**
 * Le fil d'un contenu ouvert : le journal des productions rendu lisible, les
 * messages du Coach intercalés par date, les gestes de Florent et ce que le
 * montage a fait — du plus ancien au plus récent.
 */
export function composerLeFil(entree: EntreeDuFil): ElementDuFil[] {
    const { sorte, generations } = entree;
    const bulles: BulleDuFil[] = [];
    const ecritures = generations.filter(g => g.target === 'draft' || g.target === 'slides');
    const derniereEcriture = (cible: string) => ecritures.filter(g => g.target === cible).reduce((a, g) => Math.max(a, g.createdAt), 0);
    const relectures = generations.filter(g => g.kind === 'cold_read');
    const derniereRelecture = relectures.reduce<GenerationDuFil | null>((a, g) => (!a || g.createdAt > a.createdAt ? g : a), null);

    // L'analyse : du journal, ou, pour un contenu d'avant le journal, de ses colonnes.
    if (!generations.some(g => g.kind === 'analysis') && entree.analyse?.analyzedAt) {
        const a = entree.analyse;
        bulles.push({
            type: 'bulle', id: 'analyse', role: 'Analyste', de: 'ia', le: a.analyzedAt!, ton: 'neutre',
            texte: ceQueDitLAnalyste({ verdict: a.verdict, objectif: a.objectif, plateformes: a.platforms, angle: a.strategicAngle, metaphore: a.suggestedMetaphor, justification: a.justification }),
        });
    }

    for (const g of generations) {
        switch (g.kind) {
            case 'analysis': {
                const r = lireJson(g.payload) ?? {};
                bulles.push({
                    type: 'bulle', id: g.id, role: 'Analyste', de: 'ia', le: g.createdAt, ton: 'neutre',
                    texte: ceQueDitLAnalyste({
                        verdict: r.verdict, objectif: r.objectif, plateformes: Array.isArray(r.plateformes) ? r.plateformes : [],
                        angle: r.angle_strategique ?? r.angle ?? null, metaphore: r.metaphore_suggeree ?? null,
                        justification: r.justification ?? null, titre: r.titre ?? null,
                    }),
                });
                break;
            }
            case 'brief': {
                const brief = lireJson(g.payload);
                const interdits = Array.isArray(brief?.interdits) ? brief.interdits.length : null;
                const questions = Array.isArray(brief?.questions_ouvertes) ? brief.questions_ouvertes.length : null;
                const detail = interdits !== null
                    ? ` : ${interdits} interdit${interdits > 1 ? 's' : ''}${questions !== null ? `, ${questions} question${questions > 1 ? 's' : ''} ouverte${questions > 1 ? 's' : ''}` : ''}`
                    : '';
                bulles.push({ type: 'bulle', id: g.id, role: 'Verrouilleur', de: 'ia', le: g.createdAt, ton: 'neutre', texte: `Brief verrouillé${detail}.` });
                break;
            }
            case 'draft': {
                const quoi = sorte === 'video' || sorte === 'video-sans-script' ? 'Script rédigé' : 'Brouillon rédigé';
                bulles.push({ type: 'bulle', id: g.id, role: 'Rédacteur', de: 'ia', le: g.createdAt, ton: 'neutre', texte: `${quoi}${ceQuiAEteEcrit(g.payload, sorte)}.` });
                break;
            }
            case 'adjustment': {
                const depuisRelecture = isColdReadApplyInstruction(g.instruction);
                if (g.instruction) {
                    bulles.push({
                        type: 'bulle', id: `${g.id}-demande`, role: 'Vous', de: 'vous', le: g.createdAt - 1, ton: 'neutre',
                        texte: depuisRelecture ? 'Applique les corrections de la relecture.' : g.instruction,
                    });
                }
                const quoi = g.target === 'slides' ? ' les slides' : '';
                bulles.push({ type: 'bulle', id: g.id, role: 'Rédacteur', de: 'ia', le: g.createdAt, ton: 'neutre', texte: `Ajusté${quoi}${g.target === 'draft' ? ceQuiAEteEcrit(g.payload, sorte) : ''}.` });
                break;
            }
            case 'cold_read': {
                const bulle = bulleDeRelecture(g);
                const appliquee = generations.find(a => a.kind === 'adjustment' && isColdReadApplyInstruction(a.instruction) && a.createdAt > g.createdAt);
                bulle.appliqueeLe = appliquee?.createdAt ?? null;
                // Les actions ne vivent que sur la dernière relecture, si elle juge le texte d'aujourd'hui.
                const courante = g === derniereRelecture && g.createdAt >= derniereEcriture('draft');
                if (!courante || bulle.appliqueeLe || bulle.ton === 'succes') bulle.corrections = null;
                bulles.push(bulle);
                break;
            }
            case 'slides': {
                const data = parseBodyJson(g.payload);
                const n = Array.isArray(data?.slides) ? data.slides.length : null;
                bulles.push({ type: 'bulle', id: g.id, role: 'Artiste', de: 'ia', le: g.createdAt, ton: 'neutre', texte: n ? `Slides produites : ${n}, et la Signature.` : 'Slides produites.' });
                break;
            }
            case 'plan_series':
                bulles.push({ type: 'bulle', id: g.id, role: 'Éclateur', de: 'ia', le: g.createdAt, ton: 'neutre', texte: 'Angle et matière posés par le plan de la série.' });
                break;
        }
    }

    // On ne défait que la dernière écriture d'une colonne, s'il y en a une avant elle.
    for (const cible of ['draft', 'slides']) {
        const d = ecritures.filter(g => g.target === cible).sort((a, b) => b.createdAt - a.createdAt);
        if (d.length > 1) {
            const bulle = bulles.find(b => b.id === d[0].id);
            if (bulle) bulle.revenirPossible = true;
        }
    }

    (entree.gestes ?? []).forEach((g, i) => { const b = bulleDeGeste(g, i, sorte); if (b) bulles.push(b); });

    const principale = entree.montage?.prises.find(p => p.role === 'principale');
    if (principale?.deposeeLe) {
        bulles.push({
            type: 'bulle', id: 'prise', role: 'Montage', de: 'ia', le: principale.deposeeLe, ton: 'neutre',
            texte: principale.duree ? `Prise déposée (${minutes(principale.duree)}).` : 'Prise déposée.',
        });
    }
    if (principale?.transcriteLe) {
        bulles.push({ type: 'bulle', id: 'transcription', role: 'Montage', de: 'ia', le: principale.transcriteLe, ton: 'neutre', texte: 'Prise transcrite et calée.' });
    }
    if (entree.montage?.dernierExport) {
        const e = entree.montage.dernierExport;
        bulles.push({
            type: 'bulle', id: 'export', role: 'Sortie', de: 'ia', le: e.le, ton: 'succes',
            texte: `Exportée le ${jourCourt(e.le)} en ${e.format}, ${e.version === 'publicite' ? 'publicité' : 'organique'}.`,
        });
    }

    // La conversation Coach, sans le brief d'ouverture que l'outil compose.
    const atelier: BulleDuFil[] = entree.coach
        .filter(m => !(m.role === 'user' && estLeBriefDOuverture(m.content)))
        .map((m, i) => ({
            type: 'bulle' as const, id: `coach-${i}`, role: m.role === 'user' ? 'Vous' as const : 'Coach' as const,
            de: m.role === 'user' ? 'vous' as const : 'ia' as const, le: m.createdAt, ton: 'neutre' as const, texte: m.content,
        }));

    const parDate = (a: { le: number }, b: { le: number }) => a.le - b.le;
    const elements: ElementDuFil[] = [...bulles];
    if (entree.atelierValide && atelier.length > 0) {
        elements.push({ type: 'atelier', id: 'atelier', messages: atelier.length, le: atelier[0].le, bulles: atelier });
    } else {
        elements.push(...atelier);
    }
    elements.sort(parDate);

    // Le contrôle du format parle du script d'aujourd'hui : il vient en dernier.
    if (entree.controles?.length) {
        const fin = elements.reduce((a, e) => Math.max(a, e.le), 0);
        elements.push({
            type: 'bulle', id: 'controle', role: 'Contrôle du format', de: 'ia', le: fin ? fin + 1 : entree.maintenant ?? Date.now(), ton: 'alerte', controle: true,
            verdict: `${entree.controles.length} point${entree.controles.length > 1 ? 's' : ''} à corriger avant de tourner`,
            texte: '', points: entree.controles,
        });
    }
    return elements;
}
