/**
 * Le montage d'un Reel expliqué, rangé chez Cloudflare (SPEC §12.4, v2.8).
 *
 * Les FICHIERS — prises vidéo, visuels des cartes — vont dans R2 (liaison
 * MONTAGE) ; ce qui les décrit, la transcription et les repères corrigés dans
 * D1. Un montage survit ainsi à des données de site vidées, et se reprend
 * depuis un autre poste.
 *
 * Une prise dépasse souvent les 100 Mo qu'accepte une requête : elle s'envoie
 * en plusieurs parties (`createMultipartUpload`), chacune passant par le Worker
 * — même origine, même jeton de session, aucune clé R2 à poser nulle part.
 *
 * La liaison est FACULTATIVE, comme celle de Workers AI : absente, la lecture
 * de l'état répond quand même (D1), et tout dépôt se refuse en 409 en disant
 * quoi ajouter.
 */
import { Hono } from 'hono';
import {
    ROLES_PRISE, PriseDeclareeSchema, FinEnvoiSchema, MajPriseSchema, TAILLE_PARTIE, VISUEL_MAX, R2_GRATUIT,
    type EtatMontage, type RolePrise,
} from '@luminose/shared';
import type { Env } from '../env';
import { Refus } from '../refus';
import { newId, now, rowToPrise, rowToVisuel } from '../db';

export const montage = new Hono<{ Bindings: Env }>();

const bucket = (env: Env): R2Bucket => {
    if (!env.MONTAGE) {
        throw new Refus(
            'Le montage se range dans R2, et la liaison « MONTAGE » manque à ce Worker : '
            + 'ajoutez [[r2_buckets]] binding = "MONTAGE" à workers/api/wrangler.toml, puis redéployez '
            + '(scripts/deploy.sh crée le bucket).',
            409,
        );
    }
    return env.MONTAGE;
};

const roleDe = (valeur: string): RolePrise => {
    if (!(ROLES_PRISE as readonly string[]).includes(valeur)) {
        throw new Refus(`Rôle de prise inconnu : « ${valeur} » (attendu : ${ROLES_PRISE.join(', ')}).`, 400);
    }
    return valeur as RolePrise;
};

const entier = (valeur: string, nom: string, min: number, max: number): number => {
    const n = Number(valeur);
    if (!Number.isInteger(n) || n < min || n > max) throw new Refus(`${nom} invalide : « ${valeur} ».`, 400);
    return n;
};

/** La longueur annoncée d'un corps binaire : sans elle, R2 ne prend pas le flux. */
const longueur = (entete: string | undefined, max: number, quoi: string): number => {
    const n = Number(entete);
    if (!Number.isFinite(n) || n <= 0) throw new Refus(`${quoi} vide, ou sans longueur annoncée.`, 400);
    if (n > max) throw new Refus(`${quoi} de ${n} octets : ${max} au plus.`, 400);
    return n;
};

/** 1 requête. */
const contenuExiste = async (env: Env, id: string) => {
    const ligne = await env.DB.prepare('SELECT 1 AS ok FROM contents WHERE id = ? AND deleted_at IS NULL').bind(id).first();
    if (!ligne) throw new Refus('Contenu introuvable.', 404);
};

/** 1 requête. */
const priseVivante = (env: Env, contentId: string, role: RolePrise) =>
    env.DB.prepare('SELECT * FROM montage_prises WHERE content_id = ? AND role = ? AND deleted_at IS NULL')
        .bind(contentId, role).first<any>();

/** 1 requête. */
const visuelVivant = (env: Env, contentId: string, sequence: number, element: number) =>
    env.DB.prepare('SELECT * FROM montage_visuels WHERE content_id = ? AND sequence = ? AND element = ? AND deleted_at IS NULL')
        .bind(contentId, sequence, element).first<any>();

/** Le fichier d'une prise retirée : son envoi en cours s'abandonne, l'objet s'efface. Une trace perdue ne bloque rien. */
const effacerFichierDePrise = async (r2: R2Bucket, ligne: any) => {
    if (ligne.envoi_id) {
        await r2.resumeMultipartUpload(ligne.r2_cle, ligne.envoi_id).abort().catch(() => undefined);
    }
    await r2.delete(ligne.r2_cle);
};

const servir = (objet: R2ObjectBody): Response => {
    const entetes = new Headers();
    objet.writeHttpMetadata(entetes);
    entetes.set('etag', objet.httpEtag);
    entetes.set('content-length', String(objet.size));
    return new Response(objet.body, { headers: entetes });
};

// ── L'état d'un montage ──────────────────────────────────────────────

/** 1 batch de 3 lectures. */
montage.get('/:contentId', async (c) => {
    const id = c.req.param('contentId');
    const [prises, visuels, total] = await c.env.DB.batch([
        c.env.DB.prepare('SELECT * FROM montage_prises WHERE content_id = ? AND deleted_at IS NULL ORDER BY role').bind(id),
        c.env.DB.prepare('SELECT * FROM montage_visuels WHERE content_id = ? AND deleted_at IS NULL ORDER BY sequence, element').bind(id),
        // Tous les contenus : c'est le plafond du COMPTE qui compte.
        c.env.DB.prepare(`SELECT (SELECT COALESCE(SUM(taille), 0) FROM montage_prises WHERE deleted_at IS NULL)
                               + (SELECT COALESCE(SUM(taille), 0) FROM montage_visuels WHERE deleted_at IS NULL) AS octets`),
    ]);
    const etat: EtatMontage = {
        prises: (prises.results ?? []).map(rowToPrise),
        visuels: (visuels.results ?? []).map(rowToVisuel),
        stockage: {
            octets: Number((total.results?.[0] as any)?.octets ?? 0),
            plafond: R2_GRATUIT,
            disponible: !!c.env.MONTAGE,
        },
    };
    return c.json(etat);
});

// ── Les prises ───────────────────────────────────────────────────────

/**
 * Déclare une prise et ouvre son envoi. Remplace la précédente du même rôle,
 * dont elle reprend les repères corrigés — on remplace souvent une prise par sa
 * version mieux nettoyée.
 *
 * 3 requêtes (dont un batch).
 */
montage.post('/:contentId/prises/:role', async (c) => {
    const r2 = bucket(c.env);
    const id = c.req.param('contentId');
    const role = roleDe(c.req.param('role'));
    const declaree = PriseDeclareeSchema.parse(await c.req.json());
    await contenuExiste(c.env, id);
    const precedente = await priseVivante(c.env, id, role);

    const cle = `prises/${id}/${role}-${newId()}`;
    const envoi = await r2.createMultipartUpload(cle, {
        httpMetadata: { contentType: declaree.type || 'application/octet-stream' },
    });
    const t = now();
    const ligne = {
        id: newId(), content_id: id, role, nom: declaree.nom, type: declaree.type, taille: declaree.taille,
        duree: declaree.duree, largeur: declaree.largeur, hauteur: declaree.hauteur, r2_cle: cle,
        envoi_id: envoi.uploadId, pret_le: null, transcription: null, transcrite_le: null,
        reperes: precedente?.reperes ?? '{}', created_at: t, updated_at: t,
    };
    await c.env.DB.batch([
        ...(precedente ? [c.env.DB.prepare('UPDATE montage_prises SET deleted_at = ?, updated_at = ? WHERE id = ?').bind(t, t, precedente.id)] : []),
        c.env.DB.prepare(
            `INSERT INTO montage_prises (id, content_id, role, nom, type, taille, duree, largeur, hauteur, r2_cle,
                                         envoi_id, pret_le, transcription, transcrite_le, reperes, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?)`,
        ).bind(ligne.id, id, role, ligne.nom, ligne.type, ligne.taille, ligne.duree, ligne.largeur, ligne.hauteur,
            cle, ligne.envoi_id, ligne.reperes, t, t),
    ]);
    if (precedente) await effacerFichierDePrise(r2, precedente);

    return c.json({ prise: rowToPrise(ligne), taillePartie: TAILLE_PARTIE }, 201);
});

/** Une partie de l'envoi, transmise à R2 telle qu'elle arrive. 1 requête. */
montage.put('/:contentId/prises/:role/parties/:numero', async (c) => {
    const r2 = bucket(c.env);
    const numero = entier(c.req.param('numero'), 'Numéro de partie', 1, 10_000);
    longueur(c.req.header('content-length'), TAILLE_PARTIE, 'Partie');
    const ligne = await priseVivante(c.env, c.req.param('contentId'), roleDe(c.req.param('role')));
    if (!ligne?.envoi_id) throw new Refus('Aucun envoi en cours pour cette prise : redéposez-la.', 409);
    if (!c.req.raw.body) throw new Refus('Partie vide.', 400);
    const partie = await r2.resumeMultipartUpload(ligne.r2_cle, ligne.envoi_id).uploadPart(numero, c.req.raw.body);
    return c.json({ numero: partie.partNumber, etag: partie.etag });
});

/** Ferme l'envoi : le fichier est entier dans R2. 2 requêtes. */
montage.post('/:contentId/prises/:role/terminer', async (c) => {
    const r2 = bucket(c.env);
    const { parties } = FinEnvoiSchema.parse(await c.req.json());
    const ligne = await priseVivante(c.env, c.req.param('contentId'), roleDe(c.req.param('role')));
    if (!ligne?.envoi_id) throw new Refus('Aucun envoi en cours pour cette prise : redéposez-la.', 409);
    await r2.resumeMultipartUpload(ligne.r2_cle, ligne.envoi_id)
        .complete(parties.map(p => ({ partNumber: p.numero, etag: p.etag })));
    const t = now();
    await c.env.DB.prepare('UPDATE montage_prises SET envoi_id = NULL, pret_le = ?, updated_at = ? WHERE id = ?')
        .bind(t, t, ligne.id).run();
    return c.json({ prise: rowToPrise({ ...ligne, envoi_id: null, pret_le: t, updated_at: t }) });
});

/** Abandonne un envoi qui a échoué : rien n'est gardé d'une prise à moitié envoyée. 2 requêtes. */
montage.delete('/:contentId/prises/:role/envoi', async (c) => {
    const r2 = bucket(c.env);
    const ligne = await priseVivante(c.env, c.req.param('contentId'), roleDe(c.req.param('role')));
    if (!ligne?.envoi_id) return c.json({ ok: true });
    await effacerFichierDePrise(r2, ligne);
    const t = now();
    await c.env.DB.prepare('UPDATE montage_prises SET deleted_at = ?, updated_at = ? WHERE id = ?').bind(t, t, ligne.id).run();
    return c.json({ ok: true });
});

/** Le fichier de la prise, en flux. 1 requête. */
montage.get('/:contentId/prises/:role/fichier', async (c) => {
    const r2 = bucket(c.env);
    const ligne = await priseVivante(c.env, c.req.param('contentId'), roleDe(c.req.param('role')));
    if (!ligne?.pret_le) throw new Refus('Aucune prise complète pour ce rôle.', 404);
    const objet = await r2.get(ligne.r2_cle);
    if (!objet) throw new Refus('Le fichier de la prise manque dans R2 : redéposez-la.', 404);
    return servir(objet);
});

/** La transcription, les repères corrigés. D1 seule : 2 requêtes. */
montage.patch('/:contentId/prises/:role', async (c) => {
    const maj = MajPriseSchema.parse(await c.req.json());
    const ligne = await priseVivante(c.env, c.req.param('contentId'), roleDe(c.req.param('role')));
    if (!ligne) throw new Refus('Aucune prise pour ce rôle.', 404);
    const t = now();
    const suite = { ...ligne, updated_at: t };
    const champs: string[] = ['updated_at = ?'];
    const valeurs: unknown[] = [t];
    if (maj.transcription !== undefined) {
        suite.transcription = JSON.stringify(maj.transcription);
        suite.transcrite_le = t;
        champs.push('transcription = ?', 'transcrite_le = ?');
        valeurs.push(suite.transcription, t);
    }
    if (maj.reperes !== undefined) {
        suite.reperes = JSON.stringify(maj.reperes);
        champs.push('reperes = ?');
        valeurs.push(suite.reperes);
    }
    await c.env.DB.prepare(`UPDATE montage_prises SET ${champs.join(', ')} WHERE id = ?`).bind(...valeurs, ligne.id).run();
    return c.json({ prise: rowToPrise(suite) });
});

/** Retire la prise et son fichier : c'est ce qui rend la place dans R2. 2 requêtes. */
montage.delete('/:contentId/prises/:role', async (c) => {
    const r2 = bucket(c.env);
    const ligne = await priseVivante(c.env, c.req.param('contentId'), roleDe(c.req.param('role')));
    if (!ligne) return c.json({ ok: true });
    await effacerFichierDePrise(r2, ligne);
    const t = now();
    await c.env.DB.prepare('UPDATE montage_prises SET deleted_at = ?, updated_at = ? WHERE id = ?').bind(t, t, ligne.id).run();
    return c.json({ ok: true });
});

// ── Les visuels des cartes ───────────────────────────────────────────

const placeDe = (c: { req: { param: (k: string) => string } }) => ({
    id: c.req.param('contentId'),
    sequence: entier(c.req.param('sequence'), 'Séquence', 0, 500),
    element: entier(c.req.param('element'), 'Élément', 0, 50),
});

/**
 * Dépose l'image d'une carte. La description voyage en en-tête, encodée : c'est
 * elle qui dira, après une nouvelle rédaction, si l'image répond encore.
 *
 * 3 requêtes (dont un batch).
 */
montage.put('/:contentId/visuels/:sequence/:element', async (c) => {
    const r2 = bucket(c.env);
    const { id, sequence, element } = placeDe(c);
    const type = c.req.header('content-type') ?? '';
    if (!type.startsWith('image/')) throw new Refus('Seule une image se dépose sur une carte.', 400);
    const taille = longueur(c.req.header('content-length'), VISUEL_MAX, 'Image');
    let description: string;
    try {
        description = decodeURIComponent(c.req.header('x-visuel-description') ?? '').slice(0, 2000);
    } catch {
        throw new Refus('Description du visuel illisible.', 400);
    }
    if (!c.req.raw.body) throw new Refus('Image vide.', 400);
    await contenuExiste(c.env, id);
    const precedent = await visuelVivant(c.env, id, sequence, element);

    const cle = `visuels/${id}/${sequence}-${element}-${newId()}`;
    await r2.put(cle, c.req.raw.body, { httpMetadata: { contentType: type } });
    const t = now();
    const ligne = {
        id: newId(), content_id: id, sequence, element, description, type, taille, r2_cle: cle,
        created_at: t, updated_at: t,
    };
    await c.env.DB.batch([
        ...(precedent ? [c.env.DB.prepare('UPDATE montage_visuels SET deleted_at = ?, updated_at = ? WHERE id = ?').bind(t, t, precedent.id)] : []),
        c.env.DB.prepare(
            `INSERT INTO montage_visuels (id, content_id, sequence, element, description, type, taille, r2_cle, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(ligne.id, id, sequence, element, description, type, taille, cle, t, t),
    ]);
    if (precedent) await r2.delete(precedent.r2_cle);
    return c.json({ visuel: rowToVisuel(ligne) }, 201);
});

/** 1 requête. */
montage.get('/:contentId/visuels/:sequence/:element', async (c) => {
    const r2 = bucket(c.env);
    const { id, sequence, element } = placeDe(c);
    const ligne = await visuelVivant(c.env, id, sequence, element);
    if (!ligne) throw new Refus('Aucun visuel sur cette carte.', 404);
    const objet = await r2.get(ligne.r2_cle);
    if (!objet) throw new Refus("L'image manque dans R2 : redéposez-la.", 404);
    return servir(objet);
});

/** 2 requêtes. */
montage.delete('/:contentId/visuels/:sequence/:element', async (c) => {
    const r2 = bucket(c.env);
    const { id, sequence, element } = placeDe(c);
    const ligne = await visuelVivant(c.env, id, sequence, element);
    if (!ligne) return c.json({ ok: true });
    await r2.delete(ligne.r2_cle);
    const t = now();
    await c.env.DB.prepare('UPDATE montage_visuels SET deleted_at = ?, updated_at = ? WHERE id = ?').bind(t, t, ligne.id).run();
    return c.json({ ok: true });
});
