/**
 * Rattacher (refonte de la console, lot 8 ; maquette Rattacher) —
 * `#clients/rattacher`.
 *
 * Une réservation ou un questionnaire de santé reçu sans fiche (« à
 * rapprocher », §14.4) : l'identité que la personne a envoyée, les fiches
 * semblables proposées d'emblée, ou une autre fiche choisie à la main. Le
 * geste ferme l'alerte, et la ligne sort d'Aujourd'hui. Aucune réponse de
 * santé ne s'affiche ici : seulement qui a écrit, et quand.
 */
import React, { useEffect, useState } from 'react';
import { Bouton, Carte, FOCUS, Secondaire, TitreCarte } from '../charte';
import * as Clients from '../../services/clientsService';
import type { FicheSemblable } from '../../types-clients';
import { ChoixFiche, type FicheChoisie } from './ChoixFiche';
import { aller, dateCourte, EtatLecture, heure, jourEnLettres, messageDe, useLecture } from './commun';
import { proposerSaisie } from './NouvelleFicheView';

type Recu = { cle: string; titre: string; detail: string; prenom: string; nom: string; email: string; rattacher: (clientId: string) => Promise<unknown> };

const Element: React.FC<{ recu: Recu; premiere: boolean; onFait: () => void }> = ({ recu, premiere, onFait }) => {
  const [semblables, setSemblables] = useState<FicheSemblable[] | null>(null);
  const [choisie, setChoisie] = useState<FicheChoisie | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [refus, setRefus] = useState<string | null>(null);

  useEffect(() => {
    let vivant = true;
    Clients.fichesSemblables({ prenom: recu.prenom, nom: recu.nom, email: recu.email })
      .then((r) => { if (vivant) setSemblables(r.fiches); })
      .catch(() => { if (vivant) setSemblables([]); });
    return () => { vivant = false; };
  }, [recu.prenom, recu.nom, recu.email]);

  const rattacher = async (clientId: string) => {
    setEnCours(true);
    setRefus(null);
    try { await recu.rattacher(clientId); onFait(); } catch (e) { setRefus(messageDe(e)); setEnCours(false); }
  };

  return (
    <li className={`flex flex-col gap-3 px-4 py-3 ${premiere ? '' : 'border-t border-bord'}`}>
      <div>
        <p className="font-semibold">{recu.titre}</p>
        <Secondaire>{recu.detail}</Secondaire>
      </div>
      {semblables && semblables.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-secondaire font-semibold">Fiches semblables</p>
          {semblables.map((f) => (
            <div key={f.id} className="flex flex-wrap items-center gap-2">
              <a href={`#clients/${encodeURIComponent(f.id)}`} className={`min-w-0 flex-1 truncate underline-offset-[3px] hover:underline ${FOCUS}`}>
                {f.prenom} {f.nom}{f.ville ? ` · ${f.ville}` : ''}
              </a>
              <Bouton taille="petit" disabled={enCours} onClick={() => void rattacher(f.id)}>Rattacher à cette fiche</Bouton>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <ChoixFiche id={`rattacher-${recu.cle}`} label="Une autre fiche" valeur={choisie} onChange={setChoisie} />
        {choisie && <Bouton taille="petit" disabled={enCours} onClick={() => void rattacher(choisie.id)}>Rattacher</Bouton>}
        <Bouton taille="petit" intention="souligne" onClick={() => { proposerSaisie(`${recu.prenom} ${recu.nom}`.trim()); aller('clients/nouvelle'); }}>Créer la fiche</Bouton>
      </div>
      {refus && <p role="alert" className="text-secondaire font-semibold text-sens-erreur">× {refus}</p>}
    </li>
  );
};

export const RattacherView: React.FC = () => {
  const lecture = useLecture(Clients.lireARattacher, []);
  if (lecture.phase !== 'prete') return <div className="mx-auto max-w-[960px] px-4 py-5 md:px-8"><EtatLecture lecture={lecture} /></div>;
  const { seances, sante } = lecture.donnees;
  const recus: { titre: string; items: Recu[] }[] = [
    { titre: 'Réservations reçues sans fiche', items: seances.map((s) => ({
      cle: `s-${s.id}`, prenom: s.personne.prenom ?? '', nom: s.personne.nom ?? '', email: s.email ?? '',
      titre: `Reçue au nom de ${[s.personne.prenom, s.personne.nom].filter(Boolean).join(' ') || 'quelqu’un sans nom'}`,
      detail: [`${s.type?.libelle ?? 'Rendez-vous'}, ${jourEnLettres(s.debut)} à ${heure(s.debut)}`, s.email, s.telephone].filter(Boolean).join(' · '),
      rattacher: (clientId: string) => Clients.rattacherSeance(s.id, clientId),
    })) },
    { titre: 'Questionnaires de santé reçus sans fiche', items: sante.map((q) => ({
      cle: `q-${q.id}`, prenom: q.prenom ?? '', nom: q.nom ?? '', email: q.email ?? '',
      titre: `Envoyé au nom de ${[q.prenom, q.nom].filter(Boolean).join(' ') || 'quelqu’un sans nom'}`,
      detail: [`reçu le ${dateCourte(q.recuLe)}`, q.email].filter(Boolean).join(' · '),
      rattacher: (clientId: string) => Clients.rattacherEnvoiSante(q.id, clientId),
    })) },
  ];
  return (
    <div className="mx-auto flex max-w-[960px] flex-col gap-5 px-4 py-5 font-charte text-courant text-texte md:px-8 md:py-6">
      <a href="#aujourdhui" className={`self-start rounded-controle text-secondaire text-second hover:text-texte ${FOCUS}`}>‹ Aujourd’hui</a>
      {seances.length + sante.length === 0 && <Carte className="px-4 py-4"><p>Rien à rattacher. Chaque réservation et chaque questionnaire a sa fiche.</p></Carte>}
      {recus.filter((g) => g.items.length).map((g) => (
        <Carte as="section" key={g.titre} className="overflow-hidden">
          <div className="px-4 py-3"><TitreCarte>{g.titre}</TitreCarte></div>
          <ul className="border-t border-bord">{g.items.map((r, i) => <Element key={r.cle} recu={r} premiere={i === 0} onFait={() => void lecture.recharger()} />)}</ul>
        </Carte>
      ))}
    </div>
  );
};

export default RattacherView;
