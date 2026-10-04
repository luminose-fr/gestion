/**
 * Le montage rangé chez Cloudflare (SPEC §12.4, v2.8).
 *
 * Ce qui est vérifié : une prise s'envoie en parties et se relit entière ; la
 * remplacer garde ses repères et efface l'ancien fichier ; un envoi raté ne
 * laisse rien ; la liaison absente se dit (409) sans empêcher de LIRE l'état ;
 * et rien ne passe la frontière qui ne soit une partie bornée, une image, ou
 * des repères bien formés.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import app from '../src/index';
import { createSessionToken } from '../src/auth';
import { TAILLE_PARTIE, R2_GRATUIT } from '@luminose/shared';
import { makeEnv } from './helpers/d1';
import { FauxR2 } from './helpers/r2';

let env: any;
let r2: FauxR2;
let token: string;
let contenu: string;

const appeler = (methode: string, chemin: string, corps?: unknown, entetes: Record<string, string> = {}) =>
    app.fetch(new Request(`https://api.test${chemin}`, {
        method: methode,
        headers: { 'X-Session-Token': token, ...(corps !== undefined && !(corps instanceof Uint8Array) ? { 'Content-Type': 'application/json' } : {}), ...entetes },
        body: corps === undefined ? undefined : corps instanceof Uint8Array ? corps : JSON.stringify(corps),
    }), env);

const octets = (texte: string) => new TextEncoder().encode(texte);
const json = async (r: Response) => await r.json() as any;

const DECLAREE = { nom: 'prise.mov', type: 'video/quicktime', taille: 6, duree: 41.2, largeur: 1080, hauteur: 1920 };

/** Une prise envoyée en deux parties, et fermée. */
const deposer = async (role = 'principale', parties = ['abc', 'def']) => {
    const declaree = await appeler('POST', `/api/montage/${contenu}/prises/${role}`, DECLAREE);
    expect(declaree.status).toBe(201);
    const recues = [];
    for (const [i, p] of parties.entries()) {
        const r = await appeler('PUT', `/api/montage/${contenu}/prises/${role}/parties/${i + 1}`, octets(p), { 'Content-Length': String(p.length) });
        expect(r.status).toBe(200);
        recues.push(await json(r));
    }
    const fin = await appeler('POST', `/api/montage/${contenu}/prises/${role}/terminer`, { parties: recues });
    expect(fin.status).toBe(200);
    return (await json(fin)).prise;
};

beforeEach(async () => {
    r2 = new FauxR2();
    env = { ...makeEnv(), MONTAGE: r2 };
    token = await createSessionToken(env);
    const cree = await appeler('POST', '/api/contents', { title: 'Le perfectionnisme' });
    contenu = (await json(cree)).content.id;
});

describe('GET /api/montage/:id', () => {
    it('rend un état vide, et le plafond du compte', async () => {
        expect(await json(await appeler('GET', `/api/montage/${contenu}`))).toEqual({
            prises: [], visuels: [], stockage: { octets: 0, plafond: R2_GRATUIT, disponible: true },
        });
    });

    it('se lit sans R2, en disant que rien ne peut se déposer', async () => {
        delete env.MONTAGE;
        const res = await appeler('GET', `/api/montage/${contenu}`);
        expect(res.status).toBe(200);
        expect((await json(res)).stockage.disponible).toBe(false);
    });
});

describe('les prises', () => {
    it('s’envoient en parties, se ferment, et se relisent entières', async () => {
        const prise = await deposer();
        expect(prise.pretLe).toEqual(expect.any(Number));
        expect(prise.r2Cle).toMatch(new RegExp(`^prises/${contenu}/principale-`));

        const fichier = await appeler('GET', `/api/montage/${contenu}/prises/principale/fichier`);
        expect(fichier.status).toBe(200);
        expect(await fichier.text()).toBe('abcdef');
        expect(fichier.headers.get('content-type')).toBe('video/quicktime');

        const etat = await json(await appeler('GET', `/api/montage/${contenu}`));
        expect(etat.prises).toHaveLength(1);
        expect(etat.stockage.octets).toBe(6);
    });

    it('gardent transcription et repères, validés à la frontière', async () => {
        await deposer();
        const transcription = { mots: [{ mot: 'Vous', debut: 0.1, fin: 0.3 }], texte: 'Vous', duree: 41.2 };
        const t = await appeler('PATCH', `/api/montage/${contenu}/prises/principale`, { transcription });
        expect((await json(t)).prise.transcription).toEqual(transcription);
        const r = await appeler('PATCH', `/api/montage/${contenu}/prises/principale`, { reperes: { '2:0': 12.5 } });
        const prise = (await json(r)).prise;
        expect(prise.reperes).toEqual({ '2:0': 12.5 });
        expect(prise.transcription).toEqual(transcription);

        expect((await appeler('PATCH', `/api/montage/${contenu}/prises/principale`, { reperes: { 'scene': 1 } })).status).toBe(400);
        expect((await appeler('PATCH', `/api/montage/${contenu}/prises/principale`, {})).status).toBe(400);
    });

    it('remplacées, reprennent les repères corrigés et effacent l’ancien fichier', async () => {
        const premiere = await deposer();
        await appeler('PATCH', `/api/montage/${contenu}/prises/principale`, { reperes: { '2:0': 12.5 } });
        const seconde = await deposer('principale', ['xyz']);
        expect(seconde.reperes).toEqual({ '2:0': 12.5 });
        expect(seconde.transcription).toBeNull();
        expect(r2.objets.has(premiere.r2Cle)).toBe(false);
        expect(r2.objets.has(seconde.r2Cle)).toBe(true);
        expect((await json(await appeler('GET', `/api/montage/${contenu}`))).prises).toHaveLength(1);
    });

    it('un envoi abandonné ne laisse rien', async () => {
        await appeler('POST', `/api/montage/${contenu}/prises/accroche`, DECLAREE);
        await appeler('PUT', `/api/montage/${contenu}/prises/accroche/parties/1`, octets('abc'), { 'Content-Length': '3' });
        expect((await appeler('DELETE', `/api/montage/${contenu}/prises/accroche/envoi`)).status).toBe(200);
        expect((await json(await appeler('GET', `/api/montage/${contenu}`))).prises).toEqual([]);
        expect(r2.objets.size).toBe(0);
    });

    it('se retirent avec leur fichier : c’est ce qui rend la place', async () => {
        const prise = await deposer();
        expect((await appeler('DELETE', `/api/montage/${contenu}/prises/principale`)).status).toBe(200);
        expect(r2.objets.has(prise.r2Cle)).toBe(false);
        expect((await json(await appeler('GET', `/api/montage/${contenu}`))).stockage.octets).toBe(0);
        expect((await appeler('GET', `/api/montage/${contenu}/prises/principale/fichier`)).status).toBe(404);
    });

    it('refusent ce qui n’est pas un envoi en règle', async () => {
        expect((await appeler('PUT', `/api/montage/${contenu}/prises/principale/parties/1`, octets('a'), { 'Content-Length': '1' })).status).toBe(409);
        await appeler('POST', `/api/montage/${contenu}/prises/principale`, DECLAREE);
        expect((await appeler('PUT', `/api/montage/${contenu}/prises/principale/parties/0`, octets('a'), { 'Content-Length': '1' })).status).toBe(400);
        expect((await appeler('PUT', `/api/montage/${contenu}/prises/principale/parties/1`, octets('a'), { 'Content-Length': String(TAILLE_PARTIE + 1) })).status).toBe(400);
        expect((await appeler('POST', `/api/montage/${contenu}/prises/figurant`, DECLAREE)).status).toBe(400);
        expect((await appeler('POST', `/api/montage/${contenu}/prises/principale`, { ...DECLAREE, taille: -1 })).status).toBe(400);
        expect((await appeler('POST', '/api/montage/inconnu/prises/principale', DECLAREE)).status).toBe(404);
    });

    it('disent quoi ajouter quand R2 manque', async () => {
        delete env.MONTAGE;
        const res = await appeler('POST', `/api/montage/${contenu}/prises/principale`, DECLAREE);
        expect(res.status).toBe(409);
        expect((await json(res)).error).toContain('[[r2_buckets]] binding = "MONTAGE"');
    });
});

describe('les visuels', () => {
    const deposerImage = (texte: string, description = "Une jauge d'alarme.") =>
        appeler('PUT', `/api/montage/${contenu}/visuels/2/1`, octets(texte), {
            'Content-Type': 'image/png', 'Content-Length': String(texte.length), 'X-Visuel-Description': encodeURIComponent(description),
        });

    it('se déposent avec leur description, se relisent, se remplacent', async () => {
        const premier = (await json(await deposerImage('png1'))).visuel;
        expect(premier).toMatchObject({ sequence: 2, element: 1, description: "Une jauge d'alarme.", type: 'image/png', taille: 4 });
        const image = await appeler('GET', `/api/montage/${contenu}/visuels/2/1`);
        expect(await image.text()).toBe('png1');

        const second = (await json(await deposerImage('png22', 'Une autre jauge.'))).visuel;
        expect(r2.objets.has(premier.r2Cle)).toBe(false);
        const etat = await json(await appeler('GET', `/api/montage/${contenu}`));
        expect(etat.visuels).toEqual([expect.objectContaining({ id: second.id, description: 'Une autre jauge.' })]);
        expect(etat.stockage.octets).toBe(5);

        expect((await appeler('DELETE', `/api/montage/${contenu}/visuels/2/1`)).status).toBe(200);
        expect(r2.objets.size).toBe(0);
    });

    it('n’acceptent qu’une image', async () => {
        const res = await appeler('PUT', `/api/montage/${contenu}/visuels/2/1`, octets('mp4'), { 'Content-Type': 'video/mp4', 'Content-Length': '3' });
        expect(res.status).toBe(400);
    });
});

describe('l’export (§9.4)', () => {
    it('emporte la description du montage, pas ses fichiers', async () => {
        await deposer();
        const data = await json(await appeler('GET', '/api/export'));
        expect(data.montagePrises).toHaveLength(1);
        expect(data.montagePrises[0]).toMatchObject({ nom: 'prise.mov', deletedAt: null });
        expect(data.montageVisuels).toEqual([]);
    });
});
