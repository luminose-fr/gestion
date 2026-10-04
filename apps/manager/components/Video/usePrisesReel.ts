import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { calerSurLaPrise, voixEntiere, type Calage, type ReelExplique } from '@luminose/editorial';
import type { PriseDistante, RolePrise } from '@luminose/shared';
import * as Api from '../../services/apiService';
import * as Cache from '../../services/montageService';
import * as Activite from '../../services/activityService';
import { extraireLeSon, lireLaPrise } from './son';
import type { Montage } from './useMontage';

/**
 * Les prises d'un Reel expliqué : la principale, et la seconde accroche tournée
 * pour la publicité (SPEC §12.5).
 *
 * Elles vivent chez Cloudflare (§12.4, v2.8) : déposer une prise la lit ici
 * (durée, cadre, décodable ?), l'envoie dans R2 par parties, la garde en cache
 * local, puis la transcrit — le son part, les mots reviennent et se rangent avec
 * elle. Sur un autre poste, la prise se télécharge une fois et reste en cache.
 *
 * Le calage se calcule à la volée : il se déduit de la transcription et du
 * script, et une nouvelle rédaction recale la même prise sans rien retranscrire.
 */

export type EtapePrise = 'lecture' | 'envoi' | 'telechargement' | 'son' | 'transcription';

export interface PriseAffichee {
    prise: PriseDistante;
    /** L'URL de lecture du fichier, `undefined` tant qu'il n'est pas arrivé. */
    url?: string;
    calage: Calage | null;
}

export interface PrisesReel {
    principale?: PriseAffichee;
    accroche?: PriseAffichee;
    enCours: Partial<Record<RolePrise, { etape: EtapePrise; part: number | null }>>;
    erreurs: Partial<Record<RolePrise, string>>;
    deposer: (role: RolePrise, fichier: File) => Promise<void>;
    transcrire: (role: RolePrise) => Promise<void>;
    retirer: (role: RolePrise) => Promise<void>;
    /** `null` rend le repère au calage. */
    corrigerRepere: (sequence: number, element: number, secondes: number | null) => Promise<void>;
    indisponible: boolean;
}

/** Le texte sur lequel se cale chaque prise : la voix entière, ou la seule seconde accroche. */
const texteDe = (role: RolePrise, data: ReelExplique): string =>
    role === 'principale' ? voixEntiere(data) : data.accroche_pub?.voix ?? '';

/** Une partie qui échoue se rejoue une fois : un réseau domestique hoquette, et 50 Mo à renvoyer valent mieux qu'une prise entière. */
async function uneReprise<T>(travail: () => Promise<T>): Promise<T> {
    try {
        return await travail();
    } catch {
        return travail();
    }
}

export function usePrisesReel(contentId: string | undefined, data: ReelExplique, montage: Montage): PrisesReel {
    const distantes = montage.etat?.prises ?? [];
    const [fichiers, setFichiers] = useState<Record<string, Blob>>({});
    const [enCours, setEnCours] = useState<PrisesReel['enCours']>({});
    const [erreurs, setErreurs] = useState<PrisesReel['erreurs']>({});
    // Ce qui se télécharge déjà : un second rendu ne doit pas relancer le même téléchargement.
    const enRoute = useRef(new Set<string>());

    const etape = (role: RolePrise, valeur: { etape: EtapePrise; part: number | null } | null) =>
        setEnCours(e => {
            const suite = { ...e };
            if (valeur) suite[role] = valeur; else delete suite[role];
            return suite;
        });
    const erreur = (role: RolePrise, message: string | null) =>
        setErreurs(e => {
            const suite = { ...e };
            if (message) suite[role] = message; else delete suite[role];
            return suite;
        });

    // Chaque prise complète arrive en local : depuis le cache s'il la connaît,
    // depuis R2 sinon, une fois.
    useEffect(() => {
        if (!contentId) return;
        for (const prise of distantes) {
            if (!prise.pretLe || fichiers[prise.r2Cle] || enRoute.current.has(prise.r2Cle)) continue;
            enRoute.current.add(prise.r2Cle);
            void (async () => {
                try {
                    let fichier = await Cache.lireEnCache(prise.r2Cle);
                    if (!fichier) {
                        etape(prise.role, { etape: 'telechargement', part: 0 });
                        const temoin = Activite.ouvrir({ label: 'Téléchargement de la prise', part: 0 });
                        try {
                            fichier = await Api.lirePriseDistante(contentId, prise.role, part => {
                                etape(prise.role, { etape: 'telechargement', part });
                                temoin.avancer({ part });
                            });
                            temoin.fermer(true);
                        } catch (e) {
                            temoin.fermer(false);
                            throw e;
                        }
                        await Cache.mettreEnCache(prise.r2Cle, Cache.placeDe(contentId, prise.role), fichier);
                    }
                    setFichiers(f => ({ ...f, [prise.r2Cle]: fichier! }));
                } catch (e: any) {
                    erreur(prise.role, `La prise n'a pas pu être téléchargée : ${e?.message ?? String(e)}`);
                } finally {
                    enRoute.current.delete(prise.r2Cle);
                    etape(prise.role, null);
                }
            })();
        }
    }, [contentId, distantes, fichiers]);

    const urls = useMemo(
        () => Object.fromEntries(Object.entries(fichiers).map(([cle, blob]) => [cle, URL.createObjectURL(blob)])) as Record<string, string>,
        [fichiers],
    );
    useEffect(() => () => Object.values(urls).forEach(url => URL.revokeObjectURL(url)), [urls]);

    const affichee = useCallback((role: RolePrise): PriseAffichee | undefined => {
        const prise = distantes.find(p => p.role === role);
        if (!prise) return undefined;
        const texte = texteDe(role, data);
        const calage = prise.transcription && texte.trim() ? calerSurLaPrise(texte, prise.transcription.mots) : null;
        return { prise, url: urls[prise.r2Cle], calage };
    }, [distantes, urls, data]);

    const principale = useMemo(() => affichee('principale'), [affichee]);
    const accroche = useMemo(() => affichee('accroche'), [affichee]);

    const transcrireFichier = useCallback(async (role: RolePrise, fichier: Blob) => {
        if (!contentId) return;
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
        await Api.majPrise(contentId, role, { transcription });
        await montage.recharger();
    }, [contentId, montage]);

    const deposer = useCallback(async (role: RolePrise, fichier: File) => {
        if (!contentId) return;
        erreur(role, null);
        let ouvert = false;
        try {
            etape(role, { etape: 'lecture', part: null });
            const meta = await lireLaPrise(fichier);
            const { prise, taillePartie } = await Api.declarerPrise(contentId, role, {
                nom: fichier.name, type: fichier.type, taille: fichier.size, ...meta,
            });
            ouvert = true;

            // Des parties de même taille, la dernière exceptée : R2 n'en accepte pas d'autres.
            const total = Math.max(1, Math.ceil(fichier.size / taillePartie));
            const temoin = Activite.ouvrir({ label: 'Envoi de la prise vers Cloudflare', part: 0 });
            const parties: Array<{ numero: number; etag: string }> = [];
            try {
                for (let n = 1; n <= total; n++) {
                    etape(role, { etape: 'envoi', part: (n - 1) / total });
                    temoin.avancer({ part: (n - 1) / total, etape: `Partie ${n}/${total}` });
                    const morceau = fichier.slice((n - 1) * taillePartie, n * taillePartie);
                    parties.push(await uneReprise(() => Api.envoyerPartie(contentId, role, n, morceau)));
                }
                await Api.terminerEnvoi(contentId, role, parties);
                temoin.fermer(true);
            } catch (e) {
                temoin.fermer(false);
                throw e;
            }
            ouvert = false;

            // La prise qu'on vient d'envoyer est déjà là : pas de raison de la retélécharger.
            await Cache.mettreEnCache(prise.r2Cle, Cache.placeDe(contentId, role), fichier);
            setFichiers(f => ({ ...f, [prise.r2Cle]: fichier }));
            await montage.recharger();
            await transcrireFichier(role, fichier);
        } catch (e: any) {
            // Un envoi resté ouvert s'abandonne : une prise à moitié dans R2 n'est bonne à rien.
            if (ouvert) await Api.abandonnerEnvoi(contentId, role).catch(() => undefined);
            erreur(role, e?.message ?? String(e));
            await montage.recharger();
        } finally {
            etape(role, null);
        }
    }, [contentId, montage, transcrireFichier]);

    const transcrire = useCallback(async (role: RolePrise) => {
        const prise = distantes.find(p => p.role === role);
        const fichier = prise && fichiers[prise.r2Cle];
        if (!prise || !fichier) return;
        erreur(role, null);
        try {
            await transcrireFichier(role, fichier);
        } catch (e: any) {
            erreur(role, e?.message ?? String(e));
        } finally {
            etape(role, null);
        }
    }, [distantes, fichiers, transcrireFichier]);

    const retirer = useCallback(async (role: RolePrise) => {
        if (!contentId) return;
        erreur(role, null);
        try {
            await Api.retirerPriseDistante(contentId, role);
            await Cache.oublier(Cache.placeDe(contentId, role));
        } catch (e: any) {
            erreur(role, e?.message ?? String(e));
        }
        await montage.recharger();
    }, [contentId, montage]);

    const corrigerRepere = useCallback(async (sequence: number, element: number, secondes: number | null) => {
        const prise = distantes.find(p => p.role === 'principale');
        if (!contentId || !prise) return;
        const reperes = { ...prise.reperes };
        if (secondes === null) delete reperes[`${sequence}:${element}`];
        else reperes[`${sequence}:${element}`] = Math.max(0, Math.round(secondes * 100) / 100);
        try {
            await Api.majPrise(contentId, 'principale', { reperes });
        } catch (e: any) {
            erreur('principale', e?.message ?? String(e));
        }
        await montage.recharger();
    }, [contentId, distantes, montage]);

    return {
        principale, accroche, enCours, erreurs, deposer, transcrire, retirer, corrigerRepere,
        indisponible: !montage.etat?.stockage.disponible,
    };
}
