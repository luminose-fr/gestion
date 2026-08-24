/**
 * @vitest-environment jsdom
 *
 * Les échecs d'appel IA s'annoncent TOUS, et de la même façon (SPEC §3.5.1).
 *
 * Ce test existe à cause d'un fait : le 24/08/2026, une « Lecture froide » a
 * échoué faute de crédits et RIEN ne s'est affiché — l'appelant avalait
 * l'erreur pour ne pas bloquer la rédaction. Sept appelants qui doivent chacun
 * penser à afficher, c'est sept occasions d'oublier.
 *
 * Ce qui est vérifié ici n'est donc pas « un message s'affiche » mais « le
 * passage obligé prévient, quoi que fasse l'appelant ».
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { AI_ACTION_CATALOG } from '@luminose/editorial';
import { generateContent, surEchecIA, estSignalee, type EchecIA } from '../services/aiService';
import * as Activite from '../services/activityService';

const reponse = (corps: unknown, status = 200) =>
    new Response(JSON.stringify(corps), { status });

beforeEach(() => {
    localStorage.setItem('session_token', 'jeton-de-test');
});

afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
});

describe('signalement des échecs', () => {
    it('prévient les témoins quand le fournisseur refuse', async () => {
        vi.stubGlobal('fetch', async () => reponse(
            { error: '1min.ai a refusé la requête : The feature requires 33248 credits, but the Luminose team only has 30000 credits' },
            502,
        ));

        const vus: EchecIA[] = [];
        const desabonner = surEchecIA(e => vus.push(e));

        await expect(generateContent({
            modelId: 'm1', prompt: 'Relis ce contenu.', action: 'Relecture à froid',
        })).rejects.toThrow(/33248 credits/);

        expect(vus).toHaveLength(1);
        expect(vus[0].action).toBe('Relecture à froid');
        expect(vus[0].message).toContain('30000 credits');
        expect(vus[0].at).toBeGreaterThan(0);
        desabonner();
    });

    /** Le cœur du correctif : l'appelant n'a plus le pouvoir de rendre l'échec muet. */
    it('prévient même si l’appelant avale l’erreur', async () => {
        vi.stubGlobal('fetch', async () => reponse({ error: 'crédits insuffisants' }, 502));

        const vus: EchecIA[] = [];
        const desabonner = surEchecIA(e => vus.push(e));

        // Exactement ce que faisait `executeColdRead` : catch, console.warn, rien.
        try {
            await generateContent({ modelId: 'm1', prompt: 'x', action: 'Relecture à froid' });
        } catch {
            /* avalée, comme avant */
        }

        expect(vus).toHaveLength(1);
        desabonner();
    });

    it('marque l’erreur pour que l’appelant ne l’affiche pas deux fois', async () => {
        vi.stubGlobal('fetch', async () => reponse({ error: 'refus' }, 502));

        let capturee: unknown = null;
        try {
            await generateContent({ modelId: 'm1', prompt: 'x', action: 'Rédaction' });
        } catch (e) {
            capturee = e;
        }

        expect(estSignalee(capturee)).toBe(true);
        // Ce qui casse APRÈS la réponse n'est pas marqué : l'appelant doit le montrer.
        expect(estSignalee(new Error('JSON invalide'))).toBe(false);
        expect(estSignalee(null)).toBe(false);
    });

    it('sans libellé d’action, l’échec reste annoncé', async () => {
        vi.stubGlobal('fetch', async () => reponse({ error: 'panne' }, 500));

        const vus: EchecIA[] = [];
        const desabonner = surEchecIA(e => vus.push(e));
        await expect(generateContent({ modelId: 'm1', prompt: 'x' })).rejects.toThrow();

        expect(vus[0].action).toBeNull();
        expect(vus[0].message).toBe('panne');
        desabonner();
    });

    it('un témoin défaillant n’empêche pas les autres d’être prévenus', async () => {
        vi.stubGlobal('fetch', async () => reponse({ error: 'refus' }, 502));

        const vus: string[] = [];
        const d1 = surEchecIA(() => { throw new Error('témoin cassé'); });
        const d2 = surEchecIA(e => vus.push(e.message));

        // Et l'erreur d'origine ne doit pas être remplacée par celle du témoin.
        await expect(generateContent({ modelId: 'm1', prompt: 'x' })).rejects.toThrow('refus');
        expect(vus).toEqual(['refus']);
        d1(); d2();
    });

    it('un désabonnement se respecte', async () => {
        vi.stubGlobal('fetch', async () => reponse({ error: 'refus' }, 502));

        const vus: EchecIA[] = [];
        surEchecIA(e => vus.push(e))();

        await expect(generateContent({ modelId: 'm1', prompt: 'x' })).rejects.toThrow();
        expect(vus).toHaveLength(0);
    });

    it('un appel qui aboutit ne prévient personne', async () => {
        vi.stubGlobal('fetch', async () => reponse({ text: 'La réponse', modelLabel: 'GPT' }));

        const vus: EchecIA[] = [];
        const desabonner = surEchecIA(e => vus.push(e));

        await expect(generateContent({ modelId: 'm1', prompt: 'x', action: 'Rédaction' }))
            .resolves.toMatchObject({ text: 'La réponse' });
        expect(vus).toHaveLength(0);
        desabonner();
    });

    /**
     * Un fournisseur muet ne doit pas passer pour un fournisseur gratuit : sans
     * bloc `usage`, le décompte est inconnu, pas nul (SPEC §2.6).
     */
    it('sans décompte du fournisseur, le coût est inconnu — pas zéro', async () => {
        vi.stubGlobal('fetch', async () => reponse({ text: 'x', modelLabel: 'GPT' }));
        const { usage } = await generateContent({ modelId: 'm1', prompt: 'x', action: 'Rédaction' });
        expect(usage).toEqual({ entree: null, sortie: null, coutUsd: null });
    });

    it('le décompte du fournisseur remonte tel quel', async () => {
        vi.stubGlobal('fetch', async () => reponse({
            text: 'x', modelLabel: 'GPT',
            usage: { entree: 1200, sortie: 340, coutUsd: 0.0142 },
        }));
        const { usage } = await generateContent({ modelId: 'm1', prompt: 'x', action: 'Rédaction' });
        expect(usage).toEqual({ entree: 1200, sortie: 340, coutUsd: 0.0142 });
    });

    /** Une coupure réseau n'a pas de corps de réponse : elle doit s'annoncer quand même. */
    it('annonce aussi une coupure de transport', async () => {
        vi.stubGlobal('fetch', async () => { throw new TypeError('Failed to fetch'); });

        const vus: EchecIA[] = [];
        const desabonner = surEchecIA(e => vus.push(e));
        await expect(generateContent({ modelId: 'm1', prompt: 'x', action: 'Plan de série' })).rejects.toThrow();

        expect(vus).toHaveLength(1);
        expect(vus[0].action).toBe('Plan de série');
        desabonner();
    });
});

/**
 * Le témoin d'attente vit au MÊME endroit que le signalement d'échec, et pour
 * la même raison (SPEC §3.5.1). Ce qui est vérifié ici n'est pas « un bandeau
 * s'affiche » mais « le passage obligé ouvre et referme le témoin, quoi que
 * fasse l'appelant ».
 */
describe('témoin d’appel en cours', () => {
    it('s’ouvre pendant l’appel, se referme après, et NOMME l’action et le persona', async () => {
        Activite.enregistrerModeles([{ id: 'm1', name: 'GPT-5.2 Pro' }]);
        let relacher: (() => void) | null = null;
        vi.stubGlobal('fetch', async () => {
            await new Promise<void>(r => { relacher = r; });
            return reponse({ text: 'ok', modelLabel: 'x' });
        });

        const appel = generateContent({ modelId: 'm1', prompt: 'p', action: 'Relecture à froid' });
        await vi.waitFor(() => expect(Activite.tachesEnCours()).toHaveLength(1));

        const tache = Activite.tachesEnCours()[0];
        expect(tache.nature).toBe('ia');
        expect(tache.label).toBe('Relecture à froid');
        expect(tache.persona).toBe('Lecteur froid');
        expect(tache.modele).toBe('GPT-5.2 Pro');

        relacher!();
        await appel;
        expect(Activite.tachesEnCours()).toHaveLength(0);
    });

    it('se referme aussi quand l’appel échoue', async () => {
        vi.stubGlobal('fetch', async () => reponse({ error: 'refus' }, 502));
        await expect(generateContent({ modelId: 'm1', prompt: 'p', action: 'Rédaction' })).rejects.toThrow();
        expect(Activite.tachesEnCours()).toHaveLength(0);
    });

    /**
     * Le persona se DÉDUIT du libellé. Un libellé qui ne correspond à rien
     * laisse le bandeau à moitié muet, sans que rien ne casse : c'est le genre
     * d'écart qu'on ne voit qu'en le cherchant.
     */
    it('tous les libellés employés dans l’application désignent une action connue', () => {
        const connus = new Set<string>(AI_ACTION_CATALOG.map(a => a.label));
        const racine = join(import.meta.dirname, '..');
        const parcourir = (dir: string): string[] =>
            readdirSync(dir)
                .filter(e => e !== 'node_modules' && e !== 'dist' && e !== 'test')
                .flatMap(e => {
                    const p = join(dir, e);
                    return statSync(p).isDirectory() ? parcourir(p)
                        : /\.tsx?$/.test(p) ? [p] : [];
                });

        // Le découpage de sous-titres n'est pas une action éditoriale : il n'a
        // ni persona ni modèle réglable, et n'a donc rien à faire au catalogue.
        const horsCatalogue = new Set(['Découpe des sous-titres']);

        const orphelins = parcourir(racine).flatMap(f => {
            const src = readFileSync(f, 'utf8');
            return [...src.matchAll(/action:\s*'([^']+)'/g)]
                .map(m => m[1])
                .filter(label => !connus.has(label) && !horsCatalogue.has(label))
                .map(label => `${f.replace(racine + '/', '')} → ${label}`);
        });
        expect(orphelins).toEqual([]);
    });
});
