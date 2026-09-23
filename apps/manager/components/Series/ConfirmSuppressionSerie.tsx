/**
 * Supprimer une série, et décider du sort de ses publications.
 *
 * Une confirmation à un seul bouton ne pouvait poser qu'une question, et le
 * code répondait donc toujours la même chose : les publications survivaient,
 * détachées. C'est le bon défaut, mais pas la seule réponse — quand la série
 * entière était une fausse piste, il fallait supprimer ses publications une par
 * une avant de pouvoir l'atteindre.
 *
 * Les deux gestes sont donc offerts ici, nommés par ce qu'ils font, sans qu'on
 * ait à deviner lequel est lequel.
 */
import React, { useState } from 'react';
import { AlertTriangle, Layers, Link2 } from 'lucide-react';
import type { ModeSuppressionSerie } from '@luminose/shared';
import { useEscapeClose } from '../hooks/useEscapeClose';
import { EnCours } from '../Feedback';
import { Bouton } from '../ui';

export const ConfirmSuppressionSerie: React.FC<{
  isOpen: boolean;
  titre: string;
  /** Combien de publications sont rattachées à cette série. */
  nbPublications: number;
  /** Le titre du contenu pilier, s'il y en a un — il ne part JAMAIS avec la série. */
  titrePilier?: string | null;
  onClose: () => void;
  onConfirm: (mode: ModeSuppressionSerie) => void | Promise<void>;
}> = ({ isOpen, titre, nbPublications, titrePilier, onClose, onConfirm }) => {
  /** Le geste en cours, pour que SEUL son bouton tourne. */
  const [enCours, setEnCours] = useState<ModeSuppressionSerie | null>(null);

  useEscapeClose(isOpen, onClose, enCours !== null);

  if (!isOpen) return null;

  const lancer = async (mode: ModeSuppressionSerie) => {
    if (enCours) return;
    setEnCours(mode);
    try {
      await onConfirm(mode);
    } finally {
      setEnCours(null);
    }
  };

  const publications = nbPublications > 1 ? `${nbPublications} publications` : '1 publication';

  return (
    <div
      className="fixed inset-0 z-70 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fade-in"
      onClick={enCours ? undefined : onClose}
    >
      <div
        className="bg-white dark:bg-dark-surface w-full max-w-md rounded-xl shadow-lg border border-brand-border dark:border-dark-sec-border p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-4 text-brand-main dark:text-white">
          <AlertTriangle className="w-6 h-6 text-erreur shrink-0" />
          <h3 className="text-lg font-bold leading-tight">Supprimer « {titre} » ?</h3>
        </div>

        {nbPublications === 0 ? (
          <p className="text-sm text-brand-main/70 dark:text-dark-text/70 mb-6 leading-relaxed">
            Cette série ne contient aucune publication. Il n'y a que le regroupement à supprimer.
          </p>
        ) : (
          <p className="text-sm text-brand-main/70 dark:text-dark-text/70 mb-4 leading-relaxed">
            Cette série contient <strong className="font-bold text-brand-main dark:text-white">{publications}</strong>.
            Que faut-il en faire ?
          </p>
        )}

        {/* Le pilier préexiste à la série : le dire évite d'hésiter devant « tout supprimer ». */}
        {titrePilier && (
          <p className="flex items-start gap-2 text-xs text-brand-main dark:text-dark-text bg-brand-light dark:bg-dark-bg border border-brand-border dark:border-dark-sec-border rounded-lg px-3 py-2 mb-4 leading-relaxed">
            <Link2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              Le contenu pilier <strong className="font-semibold">{titrePilier}</strong> n'est pas dans la série :
              il ne sera pas supprimé, quel que soit votre choix.
            </span>
          </p>
        )}

        <div className="flex flex-col gap-2">
          {nbPublications === 0 ? (
            <Bouton
              onClick={() => void lancer('detacher')}
              disabled={enCours !== null}
              intention="principale"
              ton="erreur"
              posee
            >
              {enCours ? <EnCours label="Suppression…" taille="md" /> : 'Supprimer la série'}
            </Bouton>
          ) : (
            <>
              <Bouton
                onClick={() => void lancer('detacher')}
                disabled={enCours !== null}
                intention="secondaire"
              >
                {enCours === 'detacher'
                  ? <EnCours label="Suppression…" taille="md" />
                  : <><Layers className="w-4 h-4" /> Supprimer, garder les publications</>}
              </Bouton>
              <Bouton
                onClick={() => void lancer('supprimer')}
                disabled={enCours !== null}
                intention="principale"
                ton="erreur"
                posee
              >
                {enCours === 'supprimer'
                  ? <EnCours label="Suppression…" taille="md" />
                  : `Tout supprimer, la série et ses ${publications}`}
              </Bouton>
            </>
          )}

          <Bouton
            onClick={onClose}
            disabled={enCours !== null}
            intention="discrete"
            className="mt-1"
          >
            Annuler
          </Bouton>
        </div>

        {nbPublications > 0 && (
          <p className="text-xs text-brand-main/60 dark:text-dark-text/60 mt-4 leading-relaxed">
            Détachées, les publications restent dans « En cours », « Prêts » ou les archives selon leur
            statut — elles perdent seulement leur rang dans la progression.
          </p>
        )}
      </div>
    </div>
  );
};
