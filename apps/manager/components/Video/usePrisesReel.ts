import { useCallback, useEffect, useMemo, useState } from 'react';
import { calerSurLaPrise, voixEntiere, type Calage, type ReelExplique } from '@luminose/editorial';
import * as Montage from '../../services/montageService';
import * as Api from '../../services/apiService';
import * as Activite from '../../services/activityService';
import { extraireLeSon, lireLaPrise } from './son';

/**
 * Les prises d'un Reel expliqué : la principale, et la seconde accroche tournée
 * pour la publicité (SPEC §12.5).
 *
 * Déposer une prise la lit (durée, cadre, décodable ici ?), la range, puis la
 * transcrit : le son part, les mots reviennent, et le calage se calcule à la
 * volée — il ne se stocke pas, il se déduit de la transcription et du script.
 * Une nouvelle rédaction recale donc la même prise sans rien retranscrire.
 */

export type EtapePrise = 'lecture' | 'son' | 'transcription';

export interface PriseAffichee {
    prise: Montage.PriseDeposee;
    /** L'URL de lecture du fichier, `undefined` tant qu'il n'est pas relu de la base. */
    url?: string;
    calage: Calage | null;
}

export interface PrisesReel {
    principale?: PriseAffichee;
    accroche?: PriseAffichee;
    enCours: Partial<Record<Montage.RolePrise, { etape: EtapePrise; part: number | null }>>;
    erreurs: Partial<Record<Montage.RolePrise, string>>;
    deposer: (role: Montage.RolePrise, fichier: File) => Promise<void>;
    transcrire: (role: Montage.RolePrise) => Promise<void>;
    retirer: (role: Montage.RolePrise) => Promise<void>;
    /** `null` rend le repère au calage. */
    corrigerRepere: (sequence: number, element: number, secondes: number | null) => Promise<void>;
    indisponible: boolean;
}

/** Le texte sur lequel se cale chaque prise : la voix entière, ou la seule seconde accroche. */
const texteDe = (role: Montage.RolePrise, data: ReelExplique): string =>
    role === 'principale' ? voixEntiere(data) : data.accroche_pub?.voix ?? '';

export function usePrisesReel(contenuId: string | undefined, data: ReelExplique): PrisesReel {
    const [prises, setPrises] = useState<Montage.PriseDeposee[]>([]);
    const [fichiers, setFichiers] = useState<Record<string, Blob>>({});
    const [enCours, setEnCours] = useState<PrisesReel['enCours']>({});
    const [erreurs, setErreurs] = useState<PrisesReel['erreurs']>({});
    const [indisponible, setIndisponible] = useState(false);

    const recharger = useCallback(async () => {
        if (!contenuId) return;
        try {
            const lues = await Montage.listerPrises(contenuId);
            setPrises(lues);
            // Les fichiers ne se relisent que s'ils manquent : un repère corrigé
            // ne doit pas faire relire une vidéo entière.
            const manquants = lues.filter(p => !fichiers[p.cle]);
            if (manquants.length) {
                const lus = await Promise.all(manquants.map(async p => [p.cle, await Montage.lireFichierDePrise(p.cle)] as const));
                setFichiers(f => ({ ...f, ...Object.fromEntries(lus.filter(([, b]) => b)) as Record<string, Blob> }));
            }
            setIndisponible(false);
        } catch {
            setIndisponible(true);
        }
    }, [contenuId, fichiers]);

    useEffect(() => { void recharger(); }, [recharger]);

    const urls = useMemo(
        () => Object.fromEntries(Object.entries(fichiers).map(([cle, blob]) => [cle, URL.createObjectURL(blob)])) as Record<string, string>,
        [fichiers],
    );
    useEffect(() => () => Object.values(urls).forEach(url => URL.revokeObjectURL(url)), [urls]);

    const affichee = useCallback((role: Montage.RolePrise): PriseAffichee | undefined => {
        const prise = prises.find(p => p.role === role);
        if (!prise) return undefined;
        const texte = texteDe(role, data);
        const calage = prise.transcription && texte.trim() ? calerSurLaPrise(texte, prise.transcription.mots) : null;
        return { prise, url: urls[prise.cle], calage };
    }, [prises, urls, data]);

    const principale = useMemo(() => affichee('principale'), [affichee]);
    const accroche = useMemo(() => affichee('accroche'), [affichee]);

    const etape = (role: Montage.RolePrise, valeur: { etape: EtapePrise; part: number | null } | null) =>
        setEnCours(e => {
            const suite = { ...e };
            if (valeur) suite[role] = valeur; else delete suite[role];
            return suite;
        });
    const erreur = (role: Montage.RolePrise, message: string | null) =>
        setErreurs(e => {
            const suite = { ...e };
            if (message) suite[role] = message; else delete suite[role];
            return suite;
        });

    const transcrireFichier = useCallback(async (role: Montage.RolePrise, prise: Montage.PriseDeposee, fichier: Blob) => {
        const temoin = Activite.ouvrir({ label: 'Extraction du son de la prise', part: 0 });
        let audio: string;
        try {
            etape(role, { etape: 'son', part: 0 });
            audio = await extraireLeSon(fichier, part => {
                etape(role, { etape: 'son', part });
                temoin.avancer({ part });
            });
            temoin.fermer(true);
        } catch (e) {
            temoin.fermer(false);
            throw e;
        }
        etape(role, { etape: 'transcription', part: null });
        const transcription = await Api.transcrire(audio);
        await Montage.enregistrerPrise({ ...prise, transcription, transcriteLe: Date.now() });
    }, []);

    const deposer = useCallback(async (role: Montage.RolePrise, fichier: File) => {
        if (!contenuId) return;
        erreur(role, null);
        try {
            etape(role, { etape: 'lecture', part: null });
            const meta = await lireLaPrise(fichier);
            const precedente = prises.find(p => p.role === role);
            const prise: Montage.PriseDeposee = {
                cle: Montage.clePrise(contenuId, role),
                contenuId,
                role,
                nom: fichier.name,
                ...meta,
                transcription: null,
                transcriteLe: null,
                // Une prise remplacée garde ses repères corrigés : on remplace
                // souvent une prise par sa version mieux nettoyée.
                reperes: precedente?.reperes ?? {},
                deposeeLe: Date.now(),
            };
            await Montage.deposerPrise(prise, fichier);
            setFichiers(f => ({ ...f, [prise.cle]: fichier }));
            await recharger();
            await transcrireFichier(role, prise, fichier);
            await recharger();
        } catch (e: any) {
            erreur(role, e?.message ?? String(e));
        } finally {
            etape(role, null);
        }
    }, [contenuId, prises, recharger, transcrireFichier]);

    const transcrire = useCallback(async (role: Montage.RolePrise) => {
        const prise = prises.find(p => p.role === role);
        const fichier = prise && fichiers[prise.cle];
        if (!prise || !fichier) return;
        erreur(role, null);
        try {
            await transcrireFichier(role, prise, fichier);
            await recharger();
        } catch (e: any) {
            erreur(role, e?.message ?? String(e));
        } finally {
            etape(role, null);
        }
    }, [prises, fichiers, recharger, transcrireFichier]);

    const retirer = useCallback(async (role: Montage.RolePrise) => {
        const prise = prises.find(p => p.role === role);
        if (!prise) return;
        await Montage.retirerPrise(prise.cle);
        setFichiers(f => {
            const suite = { ...f };
            delete suite[prise.cle];
            return suite;
        });
        erreur(role, null);
        await recharger();
    }, [prises, recharger]);

    const corrigerRepere = useCallback(async (sequence: number, element: number, secondes: number | null) => {
        const prise = prises.find(p => p.role === 'principale');
        if (!prise) return;
        const reperes = { ...prise.reperes };
        if (secondes === null) delete reperes[`${sequence}:${element}`];
        else reperes[`${sequence}:${element}`] = Math.max(0, Math.round(secondes * 100) / 100);
        await Montage.enregistrerPrise({ ...prise, reperes });
        await recharger();
    }, [prises, recharger]);

    return { principale, accroche, enCours, erreurs, deposer, transcrire, retirer, corrigerRepere, indisponible };
}
