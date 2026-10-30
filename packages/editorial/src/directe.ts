/**
 * La vidéo directe sans script (SPEC §12.7) : Florent filme d'un jet, sans
 * script écrit dans l'application, et veut quand même que les silences, les
 * hésitations et les phrases recommencées partent sans Final Cut.
 *
 * Tout le montage repose sur un texte de référence — c'est lui qui dit ce qui
 * est une reprise (§12.5.5). Sans script, on le tire de la transcription : la
 * prise découpée en phrases, les hésitations retirées, et, quand une phrase est
 * redite peu après, seule sa DERNIÈRE version gardée. Le reste de la chaîne —
 * choix des prises, coupes, sous-titres, montage par le texte — n'y voit qu'un
 * script comme un autre : la version écartée devient une reprise, et se coupe.
 */
import type { MotPrononce } from './calage';
import { motsNormalises, type ReelExplique } from './reelExplique';
import { regionsDeParole, recalerSurLeSon, type Enveloppe } from './enveloppe';

/** Ce qui se dit pour réfléchir, pas pour dire. Coupé d'office (§12.5.2). */
export const HESITATIONS = new Set(['euh', 'heu', 'hum', 'hm', 'hmm', 'mmh', 'mh', 'em', 'eum']);

/** Une pause plus longue clôt une phrase, même sans ponctuation : Whisper ne ponctue pas toujours. */
const PAUSE_DE_PHRASE = 0.6;
/** On ne cherche une redite que dans les phrases qui suivent de près : au-delà, c'est un rappel voulu. */
const PORTEE_REDITE = { phrases: 3, secondes: 25 };
/** Une phrase dont 60 % des mots se retrouvent, dans l'ordre, dans une phrase suivante est une première version. */
const SEUIL_REDITE = 0.6;

interface MotDit { texte: string; normalises: string[] }
interface PhraseDite { mots: MotDit[]; debut: number; fin: number }

const normalisesDe = (mots: MotDit[]) => mots.flatMap(m => m.normalises);

/** La plus longue sous-suite commune : les mots d'une version retrouvés dans l'autre, dans l'ordre. */
export function sousSuiteCommune(a: string[], b: string[]): number {
    const precedente = new Array(b.length + 1).fill(0);
    for (let i = 1; i <= a.length; i++) {
        let diagonale = 0;
        for (let j = 1; j <= b.length; j++) {
            const garde = precedente[j];
            precedente[j] = a[i - 1] === b[j - 1] ? diagonale + 1 : Math.max(precedente[j], precedente[j - 1]);
            diagonale = garde;
        }
    }
    return precedente[b.length];
}

/** Les phrases de la prise : une ponctuation forte de Whisper, ou une pause. Les hésitations n'y entrent pas. */
function phrasesDites(mots: MotPrononce[]): PhraseDite[] {
    const phrases: PhraseDite[] = [];
    let courante: PhraseDite | null = null;
    mots.forEach((m, i) => {
        const texte = m.mot.trim();
        const normalises = motsNormalises(texte).filter(x => !HESITATIONS.has(x));
        // Un « ? » que Whisper rend seul rejoint le mot qu'il ponctue.
        if (normalises.length === 0 && /[.?!…]/.test(texte) && courante) {
            courante.mots[courante.mots.length - 1].texte += ` ${texte}`;
        }
        if (normalises.length > 0) {
            courante ??= { mots: [], debut: m.debut, fin: m.fin };
            courante.mots.push({ texte, normalises });
            courante.fin = m.fin;
        }
        const suivant = mots[i + 1];
        const close = /[.?!…]$/.test(texte) || !suivant || suivant.debut - m.fin >= PAUSE_DE_PHRASE;
        if (close && courante) { phrases.push(courante); courante = null; }
    });
    return phrases;
}

/**
 * Le texte de référence d'une vidéo directe sans script, tiré de sa
 * transcription : une seule séquence face caméra, ses phrases dans l'ordre, sans
 * les premières versions de ce qui a été redit.
 *
 * Avec l'enveloppe, les phrases se découpent sur les mots recalés (§12.5.4) :
 * Whisper avale les pauses, et sur la prise du 25/10 une phrase et sa reprise
 * restaient collées — 103 s de vidéo au lieu de 73.
 */
export function scriptDepuisLaTranscription(motsDeWhisper: MotPrononce[], enveloppe?: Enveloppe | null): ReelExplique {
    const mots = enveloppe ? recalerSurLeSon(motsDeWhisper, regionsDeParole(enveloppe)) : motsDeWhisper;
    const phrases = phrasesDites(mots);
    // Combien de mots de chaque phrase on garde, depuis son début.
    const gardes = phrases.map(p => p.mots.length);
    phrases.forEach((p, i) => {
        if (normalisesDe(p.mots).length < 2) return;
        for (let j = i + 1; j <= Math.min(phrases.length - 1, i + PORTEE_REDITE.phrases); j++) {
            if (phrases[j].debut - p.fin > PORTEE_REDITE.secondes) break;
            const reprise = normalisesDe(phrases[j].mots);
            /*
             * La tentative ratée commence quelque part dans la phrase et va jusqu'à
             * sa fin : on recommence là où l'on s'est arrêté. Ce qui la précède a
             * été bien dit et n'est pas refait — sur la prise du 25/10, « la boule
             * au ventre… les larmes… » précédait sans pause la version ratée de
             * « Derrière la digue », et partait avec elle.
             */
            // Le raté commence au point le plus tardif d'où l'on retrouve encore
            // autant de mots de la reprise qu'avec la phrase entière ; il doit en
            // être fait pour 60 % au moins.
            const total = sousSuiteCommune(normalisesDe(p.mots), reprise);
            let debutDuRate = 0;
            for (let k = p.mots.length - 1; k > 0; k--) {
                if (sousSuiteCommune(normalisesDe(p.mots.slice(k)), reprise) === total) { debutDuRate = k; break; }
            }
            const rate = normalisesDe(p.mots.slice(debutDuRate));
            if (rate.length < 2 || total / rate.length < SEUIL_REDITE) continue;
            gardes[i] = Math.min(gardes[i], debutDuRate);
            // Entre une phrase ratée et sa reprise, ce qui se dit de court —
            // « pardon », « je reprends » — appartient au raté.
            for (let k = i + 1; k < j; k++) if (normalisesDe(phrases[k].mots).length <= 3) gardes[k] = 0;
            break;
        }
    });
    // Une élision que Whisper détache (« c », « 'est ») se recolle : le texte de
    // référence se lit, et « c 'est » ne s'écrit pas.
    const joindre = (textes: string[]) => textes.reduce((s, t, k) => k === 0 ? t : /^['’‘-]/.test(t) ? s + t : `${s} ${t}`, '');
    const voix = phrases
        .map((p, i) => joindre(p.mots.slice(0, gardes[i]).map(m => m.texte)))
        .filter(Boolean)
        .map(texte => /[.?!…]$/.test(texte) ? texte : `${texte}.`)
        .join(' ');
    return {
        format: 'Script Reel',
        sequences: voix ? [{ plan: 'camera', role: 'Vidéo directe', voix }] : [],
    };
}
