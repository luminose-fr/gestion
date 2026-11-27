/**
 * La ligne « Base des clients » de Réglages (SPEC §14.2, règle 2 ; §14.8).
 *
 * Elle dit si la liaison `CLIENTS` est posée dans cet environnement, et, si
 * oui, combien de fiches, de séances et d'évènements la base porte — trois
 * nombres, rien de ce qu'ils comptent. Hors production, elle rappelle que ce
 * sont des données fictives.
 *
 * L'état se lit en deux temps : `/api/environnement` d'abord, qui ne coûte
 * aucune requête métier ; `/api/clients/etat` ensuite, et seulement si la base
 * est reliée — sinon la route répondrait 409, et l'écran n'a pas à provoquer
 * un refus pour apprendre ce qu'il sait déjà.
 */
import React, { useEffect, useState } from 'react';
import { Database } from 'lucide-react';
import { Carte, Etiquette } from '../ui';
import * as Api from '../../services/apiService';
import { PortePublique } from './PortePublique';

type Etat =
  | { phase: 'lecture' }
  | { phase: 'erreur'; message: string }
  | { phase: 'lue'; environnement: Api.Environnement; effectifs: Api.EtatBaseClients | null };

const nombre = (n: number, un: string, plusieurs: string) =>
  `${n.toLocaleString('fr-FR')} ${n > 1 ? plusieurs : un}`;

export const BaseClients: React.FC = () => {
  const [etat, setEtat] = useState<Etat>({ phase: 'lecture' });

  useEffect(() => {
    let vivant = true;
    (async () => {
      const environnement = await Api.fetchEnvironnement();
      const effectifs = environnement?.clientsReliee ? await Api.fetchEtatBaseClients() : null;
      if (vivant) setEtat({ phase: 'lue', environnement, effectifs });
    })().catch((e: unknown) => {
      if (vivant) setEtat({ phase: 'erreur', message: e instanceof Error ? e.message : String(e) });
    });
    return () => { vivant = false; };
  }, []);

  const reliee = etat.phase === 'lue' && etat.environnement?.clientsReliee === true;
  const fictives = etat.phase === 'lue' && reliee && etat.environnement.nom !== 'production';
  const statut = etat.phase === 'erreur' ? /^Erreur \d+/.exec(etat.message)?.[0] ?? null : null;

  return (
    <Carte densite="contenu" data-base-clients={etat.phase === 'lue' ? (reliee ? 'reliee' : 'non-reliee') : etat.phase}>
      <div className="flex items-baseline justify-between gap-4">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-brand-main dark:text-white">
          <Database className="size-4 shrink-0" aria-hidden />
          Base des clients
        </span>
        {etat.phase === 'lecture' && <span className="text-xs text-brand-main dark:text-dark-text">Lecture…</span>}
        {etat.phase === 'lue' && (
          <Etiquette forme="pastille" ton={reliee ? 'succes' : 'neutre'} as="span">
            {reliee ? 'Reliée' : 'Non reliée'}
          </Etiquette>
        )}
      </div>

      {/* Le statut seul : le détail d'une panne commune à la section (un jeton
          d'analytics absent…) s'affiche déjà au-dessus, et le répéter ici
          n'apprendrait rien. */}
      {etat.phase === 'erreur' && (
        <p className="mt-2 text-xs font-semibold text-erreur">
          État illisible{statut ? ` (${statut})` : ''} — le reste de la console n’en dépend pas.
        </p>
      )}

      {etat.phase === 'lue' && reliee && etat.effectifs && (
        <p className="mt-2 text-xs tabular-nums text-brand-main dark:text-dark-text">
          {nombre(etat.effectifs.fiches, 'fiche', 'fiches')}
          {' · '}{nombre(etat.effectifs.seances, 'séance', 'séances')}
          {' · '}{nombre(etat.effectifs.evenements, 'évènement', 'évènements')}
          {fictives && <> — <strong className="font-semibold">données fictives</strong></>}
        </p>
      )}

      {/* Les portes n'existent que là où la base est reliée : ailleurs, la route
          répondrait 409, et l'écran n'a pas à provoquer un refus. */}
      {reliee && <PortePublique />}

      {etat.phase === 'lue' && !reliee && (
        <p className="mt-2 text-xs text-brand-main dark:text-dark-text">
          La liaison <code>CLIENTS</code> n’est pas posée dans cet environnement : le reste de la console
          fonctionne à l’identique. En production, elle ne le sera qu’après les protections de la phase S4.
        </p>
      )}
    </Carte>
  );
};

export default BaseClients;
