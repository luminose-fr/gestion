/**
 * La ligne « Porte publique » de Réglages (SPEC §14.5), sous « Base des
 * clients » et seulement quand la base est reliée.
 *
 * L'interrupteur coupe la porte publique sans rien déployer : coupée, toute
 * commande du site reçoit `ferme`, et la page du site affiche le téléphone de
 * Florent. Couper se confirme ; rouvrir, non — c'est le retour à la normale.
 * Les compteurs disent combien, jamais qui.
 *
 * Hors production, un bricolage d'essai (phase S2b) : fabriquer le lien de
 * questionnaire d'une séance, pour ouvrir la page d'essai, et révoquer ses
 * liens. C2 le remplacera par l'action de la fiche de séance ; en production,
 * il n'existe pas.
 */
import React, { useEffect, useState } from 'react';
import { Bouton, Champ } from '../ui';
import { Carte, Etiquette, FOCUS, Secondaire, TitreCarte } from '../charte';
import { Positions } from '../charte/reglage';
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

type EtatLien =
  | { phase: 'vide' }
  | { phase: 'lien'; lien: string }
  /** Le dernier lien fabriqué reste à portée : le rouvrir après la révocation, c'est l'essai (B5). */
  | { phase: 'revoque'; lien: string | null }
  | { phase: 'erreur'; message: string };

/** Le message d'une erreur de l'API, sans le préfixe « Erreur 409 — ». */
const messageDe = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/^Erreur \d+ — /, '');

/** Le lien d'essai d'une séance, et sa révocation. Hors production seulement. */
export const LienDEssai: React.FC = () => {
  const [seanceId, setSeanceId] = useState('');
  const [etat, setEtat] = useState<EtatLien>({ phase: 'vide' });
  const [enCours, setEnCours] = useState(false);
  const dernierLien = etat.phase === 'lien' || etat.phase === 'revoque' ? etat.lien : null;

  const agir = async (geste: () => Promise<EtatLien>) => {
    setEnCours(true);
    try {
      setEtat(await geste());
    } catch (e) {
      setEtat({ phase: 'erreur', message: messageDe(e) });
    } finally {
      setEnCours(false);
    }
  };
  const id = seanceId.trim();

  return (
    <div className="mt-3" data-lien-essai={etat.phase}>
      <div className="flex items-end gap-2">
        <Champ
          id="porte-lien-essai-seance"
          label="Identifiant de séance"
          value={seanceId}
          onChange={(e) => { setSeanceId(e.target.value); setEtat({ phase: 'vide' }); }}
          classNameEnveloppe="flex-1"
          autoComplete="off"
          spellCheck={false}
        />
        <Bouton type="button" disabled={!id || enCours} onClick={() => agir(async () => ({ phase: 'lien', lien: (await Api.fabriquerLienQuestionnaire(id)).lien }))}>
          Lien d’essai
        </Bouton>
        <Bouton type="button" intention="secondaire" ton="erreur" disabled={!id || enCours} onClick={() => agir(async () => { await Api.revoquerLiensSeance(id); return { phase: 'revoque', lien: dernierLien }; })}>
          Révoquer
        </Bouton>
      </div>
      {dernierLien && (
        <div className="mt-2 flex items-start gap-2">
          <code className="min-w-0 flex-1 select-all break-all text-xs text-second">{dernierLien}</code>
          <Bouton type="button" taille="petit" intention="secondaire" onClick={() => { void navigator.clipboard?.writeText(dernierLien); }}>
            Copier
          </Bouton>
          <Bouton type="button" taille="petit" intention="secondaire" onClick={() => window.open(dernierLien, '_blank', 'noopener,noreferrer')}>
            {etat.phase === 'revoque' ? 'Rouvrir le lien révoqué' : 'Ouvrir'}
          </Bouton>
        </div>
      )}
      {etat.phase === 'revoque' && (
        <p className="mt-2 text-xs text-second">
          Liens révoqués : ceux déjà envoyés pour cette séance ne valent plus.
          {etat.lien ? ' Rouvrez celui-ci depuis ce bouton : recharger la page d’essai ne le rouvre pas, elle a retiré le jeton de son adresse.' : ''}
        </p>
      )}
      {etat.phase === 'erreur' && <p className="mt-2 text-xs font-semibold text-erreur">{etat.message}</p>}
    </div>
  );
};

export const PortePublique: React.FC<{ environnement?: Api.NomEnvironnement; children?: React.ReactNode }> = ({ environnement = 'production', children }) => {
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
      setEchec(`L’interrupteur n’a pas répondu${statut ? ` (${statut})` : ''} — la réception est restée dans son état.`);
    } finally {
      setEnCours(false);
    }
  };

  const portes = etat.phase === 'lue' ? etat.portes : null;
  const tuiles = portes ? [
    { n: portes.commandesDuJour, nom: portes.commandesDuJour > 1 ? 'commandes reçues' : 'commande reçue' },
    { n: portes.ordres.prevu, nom: portes.ordres.prevu > 1 ? 'ordres prévus' : 'ordre prévu' },
    { n: portes.ordres.confieAMake, nom: 'confiés à Make' },
    { n: portes.ordres.echec, nom: 'en échec', alerte: portes.ordres.echec > 0 },
    { n: portes.alertesOuvertes, nom: portes.alertesOuvertes > 1 ? 'alertes ouvertes' : 'alerte ouverte', alerte: portes.alertesOuvertes > 0 },
  ] : [];

  return (
    <div className="flex flex-col gap-5 font-charte" data-porte-publique={portes ? (portes.ouverte ? 'ouverte' : 'coupee') : etat.phase}>
      <Carte as="section" className="flex flex-wrap items-center gap-5 p-5">
        <div className="min-w-60 flex-1">
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className={`size-2.5 rounded-full ${portes ? (portes.ouverte ? 'bg-sens-succes' : 'bg-sens-alerte') : 'bg-second'}`} />
            <TitreCarte>{portes ? (portes.ouverte ? 'Ouverte' : 'Coupée') : etat.phase === 'lecture' ? 'Lecture…' : 'État illisible'}</TitreCarte>
          </div>
          <Secondaire>
            {portes ? (portes.ouverte ? 'Le site enregistre tout ce qu’il reçoit.' : 'Le site reçoit « fermé » à tout envoi, et affiche votre téléphone.')
              : etat.phase === 'erreur' ? `État des portes illisible${statutDe(etat.message) ? ` (${statutDe(etat.message)})` : ''}.` : ' '}
          </Secondaire>
        </div>
        {portes && (
          <Positions libelle="Réception du site" valeur={portes.ouverte ? 'ouverte' : 'coupee'} desactive={enCours}
            options={[{ valeur: 'ouverte', libelle: 'Ouverte' }, { valeur: 'coupee', libelle: 'Coupée' }]}
            onChange={(v) => { if (v === 'coupee' && portes.ouverte) setConfirmer(true); if (v === 'ouverte' && !portes.ouverte) void basculer(true); }} />
        )}
      </Carte>
      {echec && <p role="alert" className="text-secondaire font-semibold text-sens-erreur">× {echec}</p>}

      {portes && (
        <section className="flex flex-col gap-2">
          <Etiquette as="h3">Ces dernières 24 heures</Etiquette>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {tuiles.map((t) => (
              <Carte key={t.nom} className={`flex flex-col gap-0.5 px-3.5 py-3 ${t.alerte ? '!border-sens-alerte' : ''}`}>
                <span className={`font-titre text-ecran-tel font-medium tabular-nums ${t.alerte ? 'text-sens-alerte' : 'text-texte'}`}>{t.n.toLocaleString('fr-FR')}</span>
                <Secondaire>{t.nom}</Secondaire>
              </Carte>
            ))}
          </div>
        </section>
      )}

      {children}

      {portes && environnement !== 'production' && (
        <details className="group rounded-carte border border-bord bg-surface shadow-carte">
          <summary className={`flex min-h-14 cursor-pointer list-none items-center gap-3 px-5 [&::-webkit-details-marker]:hidden ${FOCUS}`}>
            <span aria-hidden="true" className="size-[7px] flex-none -rotate-45 border-b-[1.6px] border-r-[1.6px] border-second transition-transform duration-[var(--duree)] group-open:rotate-45" />
            <span className="flex-1 font-semibold text-texte">Tester la réception</span>
            <span className="hidden text-secondaire text-second sm:inline">Un lien d’essai pour une séance</span>
          </summary>
          <div className="px-5 pb-4"><LienDEssai /></div>
        </details>
      )}

      <ConfirmModal
        isOpen={confirmer}
        onClose={() => setConfirmer(false)}
        onConfirm={() => basculer(false)}
        title="Couper la réception du site ?"
        message="Le site n’enregistrera plus ni réservation, ni questionnaire de santé, ni inscription, ni paiement, jusqu’à ce que vous la rouvriez. Les pages afficheront votre téléphone."
        confirmLabel="Couper la réception"
        isDestructive
      />
    </div>
  );
};

export default PortePublique;
