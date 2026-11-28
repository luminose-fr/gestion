/**
 * Paiements (refonte de la console, lot 8 ; maquettes Paiements, Encaisses,
 * TelPaiements) — `#paiements`, `#paiements/encaisses`.
 *
 * Ce qui reste à encaisser, de la plus ancienne séance à la plus récente,
 * avec le total en tête : il répond à la question de Florent sans compter les
 * lignes (02, T7). Une absence y figure, en rouge : elle reste due, et
 * Florent ne reprend pas la personne avant qu'elle soit réglée (décision du
 * 28/11/2026). « Marquer payé » sur chaque ligne ; la ligne sort de la liste.
 *
 * Les stages ensuite (décision du 28/11/2026) : payés en ligne par Stripe,
 * bientôt Stancer, ils sortent d'ici seuls ; payés en espèces ou par virement,
 * Florent les encaisse à la main, et la facture brouillon est demandée.
 */
import { duree as dureeEnClair, montant as montantEnClair } from '../../lib/format';
import React, { useState } from 'react';
import { Bouton, Carte, Etiquette, FOCUS, Onglets, Pastille, Secondaire } from '../charte';
import * as Clients from '../../services/clientsService';
import type { Seance } from '../../types-clients';
import { aller, euros, EtatLecture, heure, jourEnLettres, messageDe, nomComplet, useAdresse, useLecture } from '../Clients/commun';

type Vue = 'a_encaisser' | 'encaisses';

/** « depuis 9 jours » : l'âge d'une dette se lit d'un coup d'œil. */
const depuis = (s: Seance) => {
  const jours = Math.floor((Date.now() - Date.parse(s.debut)) / 86_400_000);
  return jours <= 0 ? 'aujourd’hui' : jours === 1 ? 'depuis hier' : `depuis ${jours} jours`;
};

const Ligne: React.FC<{ s: Seance; vue: Vue; premiere: boolean; onPaye: (s: Seance) => void; enCours: boolean }> = ({ s, vue, premiere, onPaye, enCours }) => (
  <li className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 md:flex-nowrap ${premiere ? '' : 'border-t border-bord'}`}>
    <a href={`#agenda/${encodeURIComponent(s.id)}`} className={`min-w-0 flex-1 rounded-controle hover:text-marque ${FOCUS}`}>
      <span className="block truncate font-semibold">{nomComplet(s.personne)}</span>
      <span className="block truncate text-secondaire text-second">
        <span className="first-letter:uppercase inline-block">{jourEnLettres(s.debut)}</span>, {heure(s.debut)} · {s.type?.libelle ?? s.libelleImporte ?? 'Type inconnu'}
      </span>
    </a>
    <span className="flex items-center gap-2">
      {s.statut === 'absent' && <Pastille ton="erreur">Absente</Pastille>}
      {vue === 'a_encaisser' && s.etatPaiement === 'attente_especes' && <Pastille ton="alerte">Espèces attendues</Pastille>}
      {vue === 'a_encaisser' && <span className="text-secondaire text-second">{depuis(s)}</span>}
    </span>
    <span className="w-20 text-right font-semibold tabular-nums">{montantEnClair(s.montantCentimes)}</span>
    {vue === 'a_encaisser'
      ? <Bouton taille="petit" disabled={enCours} onClick={() => onPaye(s)}>Marquer payé</Bouton>
      : <Pastille ton="succes">Payé</Pastille>}
  </li>
);

export const PaiementsView: React.FC = () => {
  const [premier] = useAdresse();
  const vue: Vue = premier === 'encaisses' ? 'encaisses' : 'a_encaisser';
  const lecture = useLecture(() => Clients.lirePaiements(vue), [vue]);
  const [enCours, setEnCours] = useState(false);
  const [refus, setRefus] = useState<string | null>(null);

  const encaisserStage = async (inscriptionId: string, moyen: 'especes' | 'virement') => {
    setEnCours(true);
    setRefus(null);
    try { await Clients.encaisserInscription(inscriptionId, moyen); await lecture.recharger(); }
    catch (e) { setRefus(messageDe(e)); }
    finally { setEnCours(false); }
  };

  const marquerPaye = async (s: Seance) => {
    setEnCours(true);
    setRefus(null);
    try { await Clients.modifierSeance(s.id, { etatPaiement: 'payee' }); await lecture.recharger(); }
    catch (e) { setRefus(messageDe(e)); }
    finally { setEnCours(false); }
  };

  return (
    <div className="mx-auto flex max-w-[960px] flex-col gap-4 px-4 py-5 font-charte text-courant text-texte md:px-8 md:py-6">
      <Onglets<Vue> libelle="Paiements" actif={vue} onChange={(v) => aller(v === 'encaisses' ? 'paiements/encaisses' : 'paiements')}
        onglets={[{ id: 'a_encaisser', libelle: 'À encaisser' }, { id: 'encaisses', libelle: 'Encaissés' }]} />
      {refus && <p role="alert" className="text-secondaire font-semibold text-sens-erreur">× {refus}</p>}
      {lecture.phase !== 'prete' ? <EtatLecture lecture={lecture} titre="Lecture des paiements" /> : (
        <>
          <p className="flex flex-wrap items-baseline gap-x-3">
            <span className="text-second">{vue === 'a_encaisser' ? 'Reste à encaisser' : 'Encaissé ces trois derniers mois'}</span>
            {/* Le total compte les séances ET les stages à encaisser (retours du 28/11, §6). */}
            <span className="font-titre text-ecran-tel md:text-ecran tabular-nums">
              {euros(lecture.donnees.totalCentimes + lecture.donnees.inscriptions.reduce((t, i) => t + i.montantCentimes, 0))}
            </span>
            <span className="text-secondaire text-second">
              {[
                `${lecture.donnees.nombre} séance${lecture.donnees.nombre > 1 ? 's' : ''}`,
                lecture.donnees.inscriptions.length ? `${lecture.donnees.inscriptions.length} stage${lecture.donnees.inscriptions.length > 1 ? 's' : ''}` : null,
              ].filter(Boolean).join(' · ')}
            </span>
          </p>
          {lecture.donnees.seances.length === 0 ? (
            <Carte className="px-4 py-4"><p>{vue === 'a_encaisser' ? 'Tout est encaissé. Rien ne vous attend ici.' : 'Aucun encaissement ces trois derniers mois.'}</p></Carte>
          ) : (
            <Carte as="div" className="overflow-hidden">
              <ul>{lecture.donnees.seances.map((s, i) => <Ligne key={s.id} s={s} vue={vue} premiere={i === 0} onPaye={(x) => void marquerPaye(x)} enCours={enCours} />)}</ul>
            </Carte>
          )}
          {lecture.donnees.nombre > lecture.donnees.seances.length && (
            <Secondaire>Les {lecture.donnees.seances.length} premières sont affichées ; le total les compte toutes.</Secondaire>
          )}
          {vue === 'a_encaisser' && lecture.donnees.inscriptions.length > 0 && (
            <section aria-labelledby="titre-stages" className="flex flex-col gap-2">
              <Etiquette as="h2" id="titre-stages">Stages à encaisser · {lecture.donnees.inscriptions.length}</Etiquette>
              <Carte as="div" className="overflow-hidden">
                <ul>
                  {lecture.donnees.inscriptions.map((i, n) => (
                    <li key={i.id} className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 md:flex-nowrap ${n ? 'border-t border-bord' : ''}`}>
                      <a href={`#stages/${encodeURIComponent(i.stage.id)}`} className={`min-w-0 flex-1 rounded-controle hover:text-marque ${FOCUS}`}>
                        <span className="block truncate font-semibold">{nomComplet(i.personne)}</span>
                        <span className="block truncate text-secondaire text-second">{i.stage.nom} · {jourEnLettres(i.stage.debut)}</span>
                      </a>
                      {i.statut === 'retenue' && <Pastille ton="alerte">Place retenue</Pastille>}
                      <span className="w-20 text-right font-semibold tabular-nums">{euros(i.montantCentimes)}</span>
                      <span className="flex gap-1.5">
                        <Bouton taille="petit" intention="borde" disabled={enCours} onClick={() => void encaisserStage(i.id, 'especes')}>Espèces</Bouton>
                        <Bouton taille="petit" intention="borde" disabled={enCours} onClick={() => void encaisserStage(i.id, 'virement')}>Virement</Bouton>
                      </span>
                    </li>
                  ))}
                </ul>
              </Carte>
              <Secondaire>Payé en ligne, un stage sort d’ici seul. Encaisser à la main demande la facture brouillon.</Secondaire>
            </section>
          )}
          <Secondaire>Une séance s’encaisse aussi depuis son écran, en la terminant.</Secondaire>
        </>
      )}
    </div>
  );
};

export default PaiementsView;
