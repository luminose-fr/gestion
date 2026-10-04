/**
 * Un R2 en mémoire, réduit à ce que la route du montage utilise : put, get,
 * delete, et l'envoi en plusieurs parties. Il vérifie ce que R2 vérifie et
 * qui casserait en production : une partie inconnue au moment de fermer, ou
 * un envoi repris après avoir été abandonné.
 */
const lire = async (valeur: unknown): Promise<Uint8Array> => {
    if (valeur instanceof Uint8Array) return valeur;
    if (valeur instanceof ArrayBuffer) return new Uint8Array(valeur);
    if (typeof valeur === 'string') return new TextEncoder().encode(valeur);
    if (valeur && typeof (valeur as any).getReader === 'function') {
        return new Uint8Array(await new Response(valeur as ReadableStream).arrayBuffer());
    }
    throw new Error('valeur non prise en charge par le faux R2');
};

interface Objet { donnees: Uint8Array; type?: string }

export class FauxR2 {
    objets = new Map<string, Objet>();
    envois = new Map<string, { cle: string; type?: string; parties: Map<number, Uint8Array>; abandonne: boolean }>();
    private compteur = 0;

    async put(cle: string, valeur: unknown, options?: { httpMetadata?: { contentType?: string } }) {
        this.objets.set(cle, { donnees: await lire(valeur), type: options?.httpMetadata?.contentType });
        return { key: cle };
    }

    async get(cle: string) {
        const objet = this.objets.get(cle);
        if (!objet) return null;
        return {
            body: new Response(objet.donnees).body,
            size: objet.donnees.length,
            httpEtag: `"${cle}"`,
            writeHttpMetadata: (h: Headers) => { if (objet.type) h.set('content-type', objet.type); },
        };
    }

    async delete(cle: string) { this.objets.delete(cle); }

    async createMultipartUpload(cle: string, options?: { httpMetadata?: { contentType?: string } }) {
        const uploadId = `envoi-${++this.compteur}`;
        this.envois.set(uploadId, { cle, type: options?.httpMetadata?.contentType, parties: new Map(), abandonne: false });
        return { key: cle, uploadId };
    }

    resumeMultipartUpload(cle: string, uploadId: string) {
        const envoi = this.envois.get(uploadId);
        const vivant = () => {
            if (!envoi || envoi.cle !== cle || envoi.abandonne) throw new Error('envoi inconnu ou abandonné');
            return envoi;
        };
        return {
            uploadPart: async (numero: number, valeur: unknown) => {
                vivant().parties.set(numero, await lire(valeur));
                return { partNumber: numero, etag: `etag-${numero}` };
            },
            complete: async (parties: Array<{ partNumber: number; etag: string }>) => {
                const e = vivant();
                const morceaux = parties.map(p => {
                    const d = e.parties.get(p.partNumber);
                    if (!d || p.etag !== `etag-${p.partNumber}`) throw new Error(`partie ${p.partNumber} inconnue`);
                    return d;
                });
                const total = new Uint8Array(morceaux.reduce((n, m) => n + m.length, 0));
                let curseur = 0;
                for (const m of morceaux) { total.set(m, curseur); curseur += m.length; }
                this.objets.set(cle, { donnees: total, type: e.type });
                this.envois.delete(uploadId);
                return { key: cle };
            },
            abort: async () => { if (envoi) envoi.abandonne = true; },
        };
    }
}
