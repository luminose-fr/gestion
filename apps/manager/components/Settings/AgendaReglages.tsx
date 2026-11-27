/**
 * Réglages → Agenda Google (SPEC §14.12).
 *
 * Trois temps, une fois : poser l'identifiant et le secret du client OAuth
 * (créé par Florent dans Google Cloud), partir chez Google autoriser gestion,
 * revenir ici relié. Le secret ne revient jamais : l'écran ne dit que « posé »,
 * et le compte connecté.
 *
 * Fonctionnel d'abord : le visuel de la console sera repris en entier.
 */
import React, { useState } from 'react';
import { CalendarCheck, Unlink } from 'lucide-react';
import { Bouton, Carte, Champ, TitreSection } from '../ui';
import * as Clients from '../../services/clientsService';
import { Avis, EtatLecture, messageDe, useLecture } from '../Clients/commun';

/** Ce que le retour de Google a dit, lu dans l'adresse (`#reglages/agenda?agenda=…`). */
const ISSUES: Record<string, { ton: 'neutre' | 'erreur'; texte: string }> = {
  relie: { ton: 'neutre', texte: 'Votre agenda est relié.' },
  refuse: { ton: 'erreur', texte: 'Google n’a pas donné l’autorisation. Recommencez, et acceptez l’accès à l’agenda.' },
  lien_echu: { ton: 'erreur', texte: 'La demande a expiré (dix minutes). Recommencez.' },
  echec: { ton: 'erreur', texte: 'Google a refusé l’échange. Vérifiez l’identifiant, le secret et l’adresse de retour du client OAuth.' },
};

const issueDeLAdresse = () => new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('agenda');

export const AgendaReglages: React.FC = () => {
  const lecture = useLecture(() => Clients.lireAgenda(), []);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [refus, setRefus] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [issue] = useState(issueDeLAdresse);

  if (lecture.phase !== 'prete') return <EtatLecture lecture={lecture} />;
  const etat = lecture.donnees;

  const poser = async () => {
    setEnCours(true);
    setRefus(null);
    try {
      await Clients.poserClientAgenda(clientId.trim(), clientSecret.trim());
      setClientId('');
      setClientSecret('');
      await lecture.recharger();
    } catch (e) {
      setRefus(messageDe(e));
    } finally {
      setEnCours(false);
    }
  };

  const oublier = async () => {
    try { await Clients.oublierAgenda(); await lecture.recharger(); } catch (e) { setRefus(messageDe(e)); }
  };

  return (
    <div className="space-y-4">
      {issue && ISSUES[issue] && <Avis ton={ISSUES[issue].ton}>{ISSUES[issue].texte}</Avis>}

      <Carte densite="contenu" rythme>
        <TitreSection
          as="h3"
          titre="L’agenda"
          sousTitre={etat.relie
            ? `Relié${etat.compte ? ` : ${etat.compte}` : ''}. La réservation lit les plages occupées de l’agenda principal, et y écrit chaque rendez-vous, avec un lien Meet en visio.`
            : 'Pas encore relié. La réservation fait sans lui : elle ne lit ni n’écrit rien dans Google.'}
        />
        <div className="flex flex-wrap gap-2">
          {etat.clientPose && (
            <a href={Clients.adresseConnexionAgenda()} className="inline-flex">
              <Bouton intention="principale" taille="petit"><CalendarCheck /> {etat.relie ? 'Reconnecter mon agenda' : 'Connecter mon agenda'}</Bouton>
            </a>
          )}
          {etat.relie && <Bouton intention="secondaire" taille="petit" onClick={oublier}><Unlink /> Oublier l’autorisation</Bouton>}
        </div>
      </Carte>

      <Carte densite="contenu" rythme>
        <TitreSection
          as="h3"
          titre="Le client OAuth"
          sousTitre={etat.clientPose
            ? 'Posé. Le remplacer oublie l’autorisation : il faudra reconnecter l’agenda.'
            : 'Créé dans Google Cloud (Identifiants → ID client OAuth → Application Web). Rien ne revient de ces champs une fois posés.'}
        />
        <Champ id="agenda-client-id" label="ID client" autoComplete="off" value={clientId} onChange={(e) => setClientId((e.target as HTMLInputElement).value)} />
        <Champ id="agenda-client-secret" label="Code secret du client" type="password" autoComplete="off" value={clientSecret}
          onChange={(e) => setClientSecret((e.target as HTMLInputElement).value)} />
        {refus && <Avis ton="erreur">{refus}</Avis>}
        <div className="flex justify-end">
          <Bouton intention="principale" taille="petit" disabled={enCours || clientId.trim().length < 10 || clientSecret.trim().length < 10} onClick={poser}>
            {enCours ? 'Enregistrement…' : 'Poser le client'}
          </Bouton>
        </div>
      </Carte>
    </div>
  );
};

export default AgendaReglages;
