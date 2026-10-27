/**
 * Le fil d'un contenu, mis en phrases (SPEC §13.7) : qui a parlé en dernier, et
 * ce qu'il a dit ou fait. C'est la ligne que la liste Conversations affiche
 * sous chaque titre — « Lecteur froid · Publiable. Sujet perçu : … ».
 *
 * Le fait vient de la conversation Coach, du journal des productions, d'un
 * geste de Florent, ou du montage. Ici, on ne lit pas : on met en mots.
 */
import { isColdReadApplyInstruction } from './coldRead';
import type { Sorte } from './etape';

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
