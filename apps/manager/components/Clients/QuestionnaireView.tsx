/**
 * Un questionnaire de santé (refonte de la console, lot 8 ; maquettes
 * Questionnaire, QuestionnaireRelu) — `#clients/questionnaire/<id>`.
 *
 * Le seul écran qui montre les réponses. En tête, les contre-indications
 * déclarées (les « oui ») ; puis toutes les réponses. « Marquer relu » est
 * l'action principale ; « À revoir avec la personne » la garde à traiter.
 * Il s'ouvre depuis la séance, la fiche et Aujourd'hui.
 */
import { Bandeau } from '../charte/bandeau';
import React, { useState } from 'react';
import { Bouton, Carte, Etiquette, FOCUS, Pastille, Secondaire, TitreCarte, TitreEcran } from '../charte';
import * as Clients from '../../services/clientsService';
import { dateCourte, EtatLecture, messageDe, nomComplet, useLecture } from './commun';

const CONTEXTES: Record<string, string> = {
  seance: 'pour une séance', decouverte: 'pour une découverte', groupe: 'pour un stage', journee_externe: 'pour une journée chez un organisateur',
};

export const QuestionnaireView: React.FC<{ id: string }> = ({ id }) => {
  const lecture = useLecture(() => Clients.lireQuestionnaireSante(id), [id]);
  const [enCours, setEnCours] = useState(false);
  const [refus, setRefus] = useState<string | null>(null);

  if (lecture.phase !== 'prete') return <div className="mx-auto max-w-[960px] px-4 py-5 md:px-8"><EtatLecture lecture={lecture} titre="Lecture du questionnaire" /></div>;
  const q = lecture.donnees;
  const aRegarder = q.questions.filter((r) => r.aRegarder);

  const agir = async (action: () => Promise<unknown>) => {
    setEnCours(true);
    setRefus(null);
    try { await action(); await lecture.recharger(); } catch (e) { setRefus(messageDe(e)); } finally { setEnCours(false); }
  };

  const retour = q.seanceId ? { href: `#agenda/${encodeURIComponent(q.seanceId)}`, libelle: 'La séance' }
    : q.clientId ? { href: `#clients/${encodeURIComponent(q.clientId)}`, libelle: 'La fiche' } : { href: '#aujourdhui', libelle: 'Aujourd’hui' };

  return (
    <div className="mx-auto flex max-w-[960px] flex-col gap-5 px-4 py-5 font-charte text-courant text-texte md:px-8 md:py-6">
      <Bandeau fil={retour} titre={`Questionnaire de santé · ${nomComplet(q.personne)}`}
        actions={<>
          {!q.aRevoir && <Bouton intention="borde" disabled={enCours} onClick={() => void agir(() => Clients.marquerQuestionnaireARevoir(id))}>À revoir avec la personne</Bouton>}
          {!q.reluLe && <Bouton disabled={enCours} onClick={() => void agir(() => Clients.marquerQuestionnaireRelu(id))}>Marquer relu</Bouton>}
        </>} />

      <header className="flex flex-col gap-4 md:flex-row md:items-start">
        <div className="min-w-0 flex-1">
          <p className="text-second">Reçu le {dateCourte(q.recuLe)}, {CONTEXTES[q.contexte] ?? q.contexte}{q.version ? ` · version ${q.version === 'complet' ? 'complète' : 'de suivi'}` : ''}.</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {q.reluLe ? <Pastille ton="succes">Relu le {dateCourte(q.reluLe)}</Pastille>
              : q.aRevoir ? <Pastille ton="alerte">À revoir avec la personne</Pastille>
                : <Pastille ton="alerte">Non relu</Pastille>}
            {q.aRapprocher && <Pastille ton="alerte">À rattacher à une fiche</Pastille>}
          </div>
        </div>
      </header>

      {refus && <p role="alert" className="text-secondaire font-semibold text-sens-erreur">× {refus}</p>}

      <Carte as="section" aria-labelledby="titre-contre" className={aRegarder.length ? '!border-sens-alerte overflow-hidden' : 'overflow-hidden'}>
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <TitreCarte id="titre-contre">Contre-indications déclarées</TitreCarte>
          {aRegarder.length ? <Pastille ton="alerte">{aRegarder.length} à regarder</Pastille> : <Pastille ton="succes">Aucune</Pastille>}
        </div>
        {aRegarder.map((r) => (
          <div key={r.cle} className="border-t border-bord bg-sens-alerte-fond px-4 py-2.5">
            <p className="font-semibold">! {r.libelle}</p>
            <p className="whitespace-pre-wrap">{r.reponse}</p>
          </div>
        ))}
      </Carte>

      <Carte as="section" aria-labelledby="titre-reponses" className="overflow-hidden">
        <div className="px-4 py-3"><TitreCarte id="titre-reponses">Toutes les réponses</TitreCarte></div>
        <dl>
          {q.questions.map((r) => (
            <div key={r.cle} className="grid gap-1 border-t border-bord px-4 py-2.5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-4">
              <dt className="text-second">{r.libelle}</dt>
              <dd className={`whitespace-pre-wrap ${r.aRegarder ? 'font-semibold' : ''}`}>{r.reponse || '—'}</dd>
            </div>
          ))}
          {q.informations && (
            <div className="border-t border-bord px-4 py-2.5">
              <Etiquette as="h3" className="mb-1">Autre chose à signaler</Etiquette>
              <p className="whitespace-pre-wrap">{q.informations}</p>
            </div>
          )}
        </dl>
      </Carte>
      <Secondaire>Ces réponses ne s’affichent qu’ici : aucune liste, aucune recherche ne les montre.</Secondaire>
    </div>
  );
};

export default QuestionnaireView;
