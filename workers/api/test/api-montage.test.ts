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

/**
 * R2 est le seul service qui FACTURE au-delà de son gratuit : un dépôt qui y
 * ferait passer le montage est refusé avant que le moindre octet parte.
 */
describe('le gratuit de R2', () => {
    const declarer = (role: string, taille: number) =>
        appeler('POST', `/api/montage/${contenu}/prises/${role}`, { ...DECLAREE, taille });

    it('refuse le dépôt qui dépasserait les 10 Go, et dit quoi faire', async () => {
        expect((await declarer('principale', 5e9)).status).toBe(201);
        expect((await declarer('accroche', 5e9)).status).toBe(201);
        const image = await appeler('PUT', `/api/montage/${contenu}/visuels/2/1`, octets('png'), {
            'Content-Type': 'image/png', 'Content-Length': '3', 'X-Visuel-Description': 'x',
        });
        expect(image.status).toBe(409);
        const { error } = await json(image);
        expect(error).toContain('gratuits de R2');
        expect(error).toContain('Retirez une prise');
        expect(r2.objets.size).toBe(0);
    });

    it('déduit ce que le dépôt remplace, et compte tous les contenus', async () => {
        expect((await declarer('principale', 5e9)).status).toBe(201);
        expect((await declarer('accroche', 5e9)).status).toBe(201);
        // Remplacer une prise par une autre aussi lourde reste possible : l'ancienne s'efface.
        expect((await declarer('principale', 5e9)).status).toBe(201);
        // Le gratuit est celui du compte : un autre contenu ne trouve plus de place.
        const autre = (await json(await appeler('POST', '/api/contents', { title: 'Un autre Reel' }))).content.id;
        const refus = await appeler('POST', `/api/montage/${autre}/prises/principale`, { ...DECLAREE, taille: 1 });
        expect(refus.status).toBe(409);
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

/** L'espace Vidéos lit tous les montages d'un coup (SPEC §12.4.3). */
describe('GET /api/montage — le résumé', () => {
    it('dit, par contenu, ce qui est monté et le dernier export — en une seule lecture groupée', async () => {
        expect(await json(await appeler('GET', '/api/montage'))).toEqual({
            contenus: {}, stockage: { octets: 0, plafond: R2_GRATUIT, disponible: true },
        });

        await deposer();
        await appeler('PATCH', `/api/montage/${contenu}/prises/principale`, { transcription: { mots: [], texte: '', duree: 1 } });
        await appeler('POST', `/api/montage/${contenu}/prises/accroche`, DECLAREE);
        await appeler('PUT', `/api/montage/${contenu}/visuels/2/1`, octets('png'), {
            'Content-Type': 'image/png', 'Content-Length': '3', 'X-Visuel-Description': 'x',
        });
        expect((await appeler('POST', `/api/montage/${contenu}/exports`, { format: '9:16', version: 'organique', duree: 39.2 })).status).toBe(201);
        // Deux exports la même milliseconde se départageraient au hasard : le second vient après.
        await new Promise(r => setTimeout(r, 5));
        expect((await appeler('POST', `/api/montage/${contenu}/exports`, { format: '4:5', version: 'publicite', duree: 40.8 })).status).toBe(201);

        const resume = await json(await appeler('GET', '/api/montage'));
        expect(resume.contenus[contenu].prises).toEqual(expect.arrayContaining([
            { role: 'principale', pret: true, transcrite: true },
            { role: 'accroche', pret: false, transcrite: false },
        ]));
        expect(resume.contenus[contenu].visuels).toBe(1);
        expect(resume.contenus[contenu].dernierExport).toMatchObject({ format: '4:5', version: 'publicite', duree: 40.8 });
        expect(resume.stockage.octets).toBe(15);
    });

    it('refuse un export mal décrit, ou d’un contenu inconnu', async () => {
        expect((await appeler('POST', `/api/montage/${contenu}/exports`, { format: '16:9', version: 'organique', duree: 1 })).status).toBe(400);
        expect((await appeler('POST', '/api/montage/inconnu/exports', { format: '9:16', version: 'organique', duree: 1 })).status).toBe(404);
    });
});

describe('l’export (§9.4)', () => {
    it('emporte la description du montage, pas ses fichiers', async () => {
        await deposer();
        const data = await json(await appeler('GET', '/api/export'));
        expect(data.montagePrises).toHaveLength(1);
        expect(data.montagePrises[0]).toMatchObject({ nom: 'prise.mov', deletedAt: null });
        expect(data.montageVisuels).toEqual([]);
        expect(data.montageExports).toEqual([]);
    });
});
