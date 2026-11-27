/**
 * L'état des portes, vu de la console (SPEC §14.5) : l'interrupteur, et des
 * compteurs — rien de ce qu'ils comptent.
 *
 * L'interrupteur coupe la porte publique sans rien déployer : un réglage de la
 * base, que la console change, y compris depuis un téléphone. Coupée, toute
 * commande reçoit `ferme`.
 */
const JOUR = 24 * 3_600_000;

export type EtatDesPortes = {
  ouverte: boolean;
  /** Les commandes publiques acceptées sur 24 heures glissantes — le compte de la borne. */
  commandesDuJour: number;
  ordres: { prevu: number; confieAMake: number; echec: number };
  alertesOuvertes: number;
};

/** En UNE instruction : six sous-comptages, un aller-retour. */
export const etatDesPortes = async (db: D1Database, maintenant: number): Promise<EtatDesPortes> => {
  const l = await db.prepare(`
    SELECT
      (SELECT valeur FROM reglages WHERE cle = 'porte_publique_ouverte') AS ouverte,
      (SELECT COUNT(*) FROM commandes WHERE porte = 'publique' AND created_at > ?1 - ${JOUR}) AS commandes,
      (SELECT COUNT(*) FROM ordres WHERE etat = 'prevu') AS prevu,
      (SELECT COUNT(*) FROM ordres WHERE etat = 'confie_a_make') AS confie,
      (SELECT COUNT(*) FROM ordres WHERE etat = 'echec') AS echec,
      (SELECT COUNT(*) FROM alertes WHERE resolue_le IS NULL) AS alertes`).bind(maintenant)
    .first<Record<string, number | null>>();
  return {
    // Un réglage absent ferme la porte (portes/publique.ts) : l'écran le dit pareil.
    ouverte: Number(l?.ouverte ?? 0) === 1,
    commandesDuJour: Number(l?.commandes ?? 0),
    ordres: { prevu: Number(l?.prevu ?? 0), confieAMake: Number(l?.confie ?? 0), echec: Number(l?.echec ?? 0) },
    alertesOuvertes: Number(l?.alertes ?? 0),
  };
};

/** Couper ou rouvrir la porte publique. Le réglage est recréé s'il manquait. */
export const poserInterrupteur = (db: D1Database, ouverte: boolean, maintenant: number) =>
  db.prepare(`
    INSERT INTO reglages (cle, valeur, created_at, updated_at) VALUES ('porte_publique_ouverte', ?1, ?2, ?2)
    ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur, updated_at = excluded.updated_at`)
    .bind(ouverte ? 1 : 0, maintenant).run();
