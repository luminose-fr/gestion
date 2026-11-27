/**
 * Ce que la porte reçoit de son environnement (workers/porte/wrangler.toml).
 *
 * Ni base, ni secret, ni KV (SPEC §14.3) : des variables publiques, les
 * liaisons de service vers les entrées nommées de gestion, et les limiteurs de
 * fréquence. Tout est facultatif au sens du type : la racine du wrangler.toml,
 * jamais déployée, n'a rien — et ce qui manque est une panne, jamais une porte
 * ouverte.
 */
import type { PortePublique, PorteService } from '@luminose/contrat';

/** Un limiteur de la liaison `ratelimits` — ce que la porte en emploie. */
export type Limiteur = { limit(options: { key: string }): Promise<{ success: boolean }> };

export type Env = {
  ENVIRONNEMENT?: string;
  /** L'origine exacte du site de cet environnement, admise sur la porte publique (§14.5). */
  ORIGINE_SITE?: string;
  /**
   * Recette seulement : l'origine de la page d'essai (essai-recette), que la porte
   * sert elle-même, et la seconde origine admise. Depuis que la recette a un vrai
   * site (recette.luminose.fr, v3.3), la page d'essai n'en tient plus lieu.
   */
  ORIGINE_ESSAI?: string;
  /** L'origine de la porte elle-même, que la page d'essai appelle (recette seulement). */
  ORIGINE_PORTE?: string;

  GESTION_PUBLIQUE?: PortePublique;
  GESTION_SERVICE?: PorteService;

  /** 10 envois par minute et par adresse — choix du brief, à confirmer. */
  LIMITE_QUESTIONNAIRES?: Limiteur;
  /** 30 vérifications de lien par minute et par adresse — choix du brief, à confirmer. */
  LIMITE_LIENS?: Limiteur;
  /** Phase R1 : 60 lectures de créneaux par minute et par adresse. */
  LIMITE_CRENEAUX?: Limiteur;
  /** Phase R1 : 10 réservations par minute et par adresse. */
  LIMITE_RESERVATIONS?: Limiteur;
};
