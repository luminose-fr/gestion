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
import { generateContent, surEchecIA, estSignalee, type EchecIA } from '../services/aiService';

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
            .resolves.toBe('La réponse');
        expect(vus).toHaveLength(0);
        desabonner();
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
