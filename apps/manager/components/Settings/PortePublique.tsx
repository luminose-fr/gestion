/**
 * La ligne « Porte publique » de Réglages (SPEC §14.5), sous « Base des
 * clients » et seulement quand la base est reliée.
 *
 * L'interrupteur coupe la porte publique sans rien déployer : coupée, toute
 * commande du site reçoit `ferme`, et la page du site affiche le téléphone de
 * Florent. Couper se confirme ; rouvrir, non — c'est le retour à la normale.
 * Les compteurs disent combien, jamais qui.
 */
import React, { useEffect, useState } from 'react';
import { DoorOpen } from 'lucide-react';
import { Bouton, Etiquette } from '../ui';
import { ConfirmModal } from '../CommonModals';
import * as Api from '../../services/apiService';

type Etat =
  | { phase: 'lecture' }
  | { phase: 'erreur'; message: string }
  | { phase: 'lue'; portes: Api.EtatDesPortes };

const nombre = (n: number, un: string, plusieurs: string) => `${n.toLocaleString('fr-FR')} ${n > 1 ? plusieurs : un}`;
const statutDe = (e: unknown) => /^Erreur \d+/.exec(e instanceof Error ? e.message : String(e))?.[0] ?? null;

/** Une réponse qui n'a pas la forme attendue se dit comme une erreur, sans casser la section. */
const verifiee = (p: Api.EtatDesPortes): Api.EtatDesPortes => {
  if (typeof p?.ouverte !== 'boolean' || typeof p?.ordres?.prevu !== 'number') throw new Error('Réponse inattendue');
  return p;
};

export const PortePublique: React.FC = () => {
  const [etat, setEtat] = useState<Etat>({ phase: 'lecture' });
  const [confirmer, setConfirmer] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [echec, setEchec] = useState<string | null>(null);

  useEffect(() => {
    let vivant = true;
    Api.fetchEtatDesPortes()
      .then(verifiee)
      .then((portes) => { if (vivant) setEtat({ phase: 'lue', portes }); })
      .catch((e: unknown) => { if (vivant) setEtat({ phase: 'erreur', message: e instanceof Error ? e.message : String(e) }); });
    return () => { vivant = false; };
  }, []);

  const basculer = async (ouverte: boolean) => {
    setEnCours(true);
    setEchec(null);
    try {
      setEtat({ phase: 'lue', portes: verifiee(await Api.poserInterrupteurDesPortes(ouverte)) });
    } catch (e) {
      const statut = statutDe(e);
      setEchec(`L’interrupteur n’a pas répondu${statut ? ` (${statut})` : ''} — la porte est restée dans son état.`);
    } finally {
      setEnCours(false);
    }
  };

  const portes = etat.phase === 'lue' ? etat.portes : null;

  return (
    <div className="mt-3 border-t border-brand-border pt-3 dark:border-dark-sec-border" data-porte-publique={portes ? (portes.ouverte ? 'ouverte' : 'coupee') : etat.phase}>
      <div className="flex items-center justify-between gap-4">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-brand-main dark:text-white">
          <DoorOpen className="size-4 shrink-0" aria-hidden />
          Porte publique
        </span>
        {etat.phase === 'lecture' && <span className="text-xs text-brand-main dark:text-dark-text">Lecture…</span>}
        {portes && (
          <div className="flex items-center gap-2">
            <Etiquette forme="pastille" ton={portes.ouverte ? 'succes' : 'alerte'} as="span">
              {portes.ouverte ? 'Ouverte' : 'Coupée'}
            </Etiquette>
            {portes.ouverte ? (
              <Bouton type="button" taille="petit" ton="erreur" disabled={enCours} onClick={() => setConfirmer(true)}>
                Couper
              </Bouton>
            ) : (
              <Bouton type="button" taille="petit" disabled={enCours} onClick={() => basculer(true)}>
                Rouvrir
              </Bouton>
            )}
          </div>
        )}
      </div>

      {etat.phase === 'erreur' && (
        <p className="mt-2 text-xs font-semibold text-erreur">
          État des portes illisible{statutDe(etat.message) ? ` (${statutDe(etat.message)})` : ''}.
        </p>
      )}

      {portes && (
        <p className="mt-2 text-xs tabular-nums text-brand-main dark:text-dark-text">
          {nombre(portes.commandesDuJour, 'commande', 'commandes')} sur 24 h
          {' · '}{nombre(portes.ordres.prevu, 'ordre prévu', 'ordres prévus')}
          {' · '}{nombre(portes.ordres.confieAMake, 'confié à Make', 'confiés à Make')}
          {' · '}{nombre(portes.ordres.echec, 'en échec', 'en échec')}
          {' · '}{nombre(portes.alertesOuvertes, 'alerte ouverte', 'alertes ouvertes')}
        </p>
      )}

      {portes && !portes.ouverte && (
        <p className="mt-2 text-xs text-brand-main dark:text-dark-text">
          Le site reçoit « fermé » à tout envoi, et affiche votre téléphone.
        </p>
      )}

      {echec && <p className="mt-2 text-xs font-semibold text-erreur">{echec}</p>}

      <ConfirmModal
        isOpen={confirmer}
        onClose={() => setConfirmer(false)}
        onConfirm={() => basculer(false)}
        title="Couper la porte publique ?"
        message="Plus aucun envoi du site ne sera reçu, pas même un questionnaire de santé, jusqu’à ce que vous la rouvriez. Les pages afficheront votre téléphone."
        confirmLabel="Couper la porte"
        isDestructive
      />
    </div>
  );
};

export default PortePublique;
