/**
 * Les bornes d'un envoi, avant de le confier à gestion (SPEC §14.5 ; contrat
 * §2) : le type, et la taille — tenue sur les octets RÉELLEMENT LUS, pas sur le
 * seul `Content-Length`, qu'un appelant écrit comme il veut.
 */

/** 64 Ko au plus (contrat §2). */
export const TAILLE_MAX = 64 * 1024;

/** `application/json`, paramètres admis (`; charset=utf-8`). */
export const typeJson = (requete: Request): boolean =>
  (requete.headers.get('Content-Type') ?? '').split(';')[0].trim().toLowerCase() === 'application/json';

export type Lecture = { etat: 'lu'; valeur: unknown } | { etat: 'trop_gros' } | { etat: 'illisible' };

/**
 * Lit le corps, au plus `max` octets. Au-delà, la lecture s'arrête et le reste
 * n'est pas lu. Un JSON illisible n'est pas une panne : c'est un envoi invalide.
 */
export const lireCorps = async (requete: Request, max = TAILLE_MAX): Promise<Lecture> => {
  const annonce = Number(requete.headers.get('Content-Length'));
  if (Number.isFinite(annonce) && annonce > max) return { etat: 'trop_gros' };
  if (!requete.body) return { etat: 'illisible' };

  const lecteur = requete.body.getReader();
  const morceaux: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lecteur.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await lecteur.cancel().catch(() => {});
      return { etat: 'trop_gros' };
    }
    morceaux.push(value);
  }
  const octets = new Uint8Array(total);
  let position = 0;
  for (const m of morceaux) { octets.set(m, position); position += m.byteLength; }
  try {
    return { etat: 'lu', valeur: JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(octets)) };
  } catch {
    return { etat: 'illisible' };
  }
};

/** Une promesse bornée dans le temps : au-delà, une panne. */
export const avecDelai = <T>(promesse: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((resoudre, rejeter) => {
    const minuterie = setTimeout(() => rejeter(new Error('porte.delai')), ms);
    promesse.then(
      (v) => { clearTimeout(minuterie); resoudre(v); },
      (e) => { clearTimeout(minuterie); rejeter(e); },
    );
  });
