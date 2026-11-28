/**
 * Aujourd'hui — l'écran d'ouverture (refonte de la console, lot 3 ;
 * docs/refonte/01, §3, et 03, §3.1 ; maquettes Aujourdhui, EtatsAujourdhui).
 *
 * Trois blocs : la prochaine séance et la journée, À traiter, la ligne d'état
 * de la réception du site. Pas d'action principale : chaque ligne est un
 * lien. Rien n'y montre le contenu d'une note ou d'un questionnaire, seulement
 * leur état ; la route ne le renvoie d'ailleurs pas.
 *
 * Premier écran refait : il ne compose que la charte (components/charte) et
 * n'écrit ni couleur, ni taille, ni rayon (DESIGN.md, « La charte »).
 */
import React, { useRef, useState } from 'react';
import { Bouton, Carte, Etiquette, Fenetre, FOCUS, Pastille, Secondaire } from '../charte';
import { ADRESSE_RECEPTION, type Reception } from '../charte/cadre';
import * as Clients from '../../services/clientsService';
import type { ATraiter, Aujourdhui, SeanceDuJour } from '../../types-clients';
import { heure, jourEnLettres, MODES, nomComplet, useLecture } from '../Clients/commun';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
const FOCUS_DEDANS = 'outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-marque';

const adresseSeance = (s: SeanceDuJour) => `#agenda/${encodeURIComponent(s.id)}`;
/** Une ligne d'À traiter mène à l'écran où son geste se fait. */
const adresseDe = (t: ATraiter) =>
  t.sorte === 'questionnaire' && t.seance.questionnaireId ? `#clients/questionnaire/${encodeURIComponent(t.seance.questionnaireId)}`
    : t.sorte === 'rattacher' ? '#clients/rattacher' : adresseSeance(t.seance);
const typeDe = (s: SeanceDuJour) => s.type?.libelle ?? s.libelleImporte ?? 'Type inconnu';

/** « dans 25 min », « dans 2 h 10 », « en cours » ; rien au-delà de la journée. */
const dansCombien = (s: SeanceDuJour, maintenant: number): string | null => {
  const debut = Date.parse(s.debut);
  if (debut <= maintenant) return Date.parse(s.fin) > maintenant ? 'en cours' : null;
  const min = Math.round((debut - maintenant) / 60_000);
  if (min >= 12 * 60) return null;
  if (min < 60) return `dans ${min} min`;
  const h = Math.floor(min / 60);
  const reste = min % 60;
  return `dans ${h} h${reste ? ` ${String(reste).padStart(2, '0')}` : ''}`;
};

/** Les pastilles d'une séance : son état, et ce qu'elle attend — jamais la couleur seule. */
const Pastilles: React.FC<{ s: SeanceDuJour; maintenant: number; className?: string }> = ({ s, maintenant, className }) => {
  const passee = Date.parse(s.fin) <= maintenant;
  return (
    <span className={cx('flex flex-wrap items-center gap-1.5', className)}>
      {s.questionnaire === 'non_relu' && <Pastille ton="alerte">Questionnaire non relu</Pastille>}
      {s.questionnaire === 'pas_recu' && !passee && <Pastille signe="○">Questionnaire pas reçu</Pastille>}
      {s.statut === 'realisee' && s.notesEcrites === false && <Pastille ton="alerte">Notes à écrire</Pastille>}
      {s.statut === 'prevue' && passee && <Pastille ton="alerte">Restée « prévue »</Pastille>}
      {s.statut === 'prevue' && !passee && <Pastille>Prévue</Pastille>}
      {s.statut === 'realisee' && <Pastille ton="succes">Réalisée</Pastille>}
      {s.statut === 'absent' && <Pastille signe="–">Absente</Pastille>}
    </span>
  );
};

const Detail: React.FC<{ s: SeanceDuJour }> = ({ s }) => (
  <>
    <span className="block text-secondaire text-second">
      {typeDe(s)}{s.nature === 'rencontre' ? ` · ${s.dureeMin} min` : ''}{s.mode ? `, ${MODES[s.mode].toLowerCase()}` : ''}
    </span>
    {s.nature === 'rencontre' && (
      <span className="block text-secondaire text-second">Vient de : {s.provenance ?? 'provenance inconnue'}</span>
    )}
  </>
);

// ─── La prochaine séance ────────────────────────────────────────────────────

const Prochaine: React.FC<{ s: SeanceDuJour; maintenant: number }> = ({ s, maintenant }) => {
  const quand = dansCombien(s, maintenant);
  return (
    <section aria-labelledby="titre-prochaine" className="flex flex-col gap-2">
      <Etiquette as="h2" id="titre-prochaine">Prochaine séance</Etiquette>
      <Carte as="div">
        <a href={adresseSeance(s)} className={cx('flex items-start gap-4 rounded-carte px-4 py-3 hover:bg-survole md:items-center', FOCUS)}>
          <span className="flex w-16 flex-none flex-col md:w-24">
            <span className="text-courant font-semibold tabular-nums">{heure(s.debut)}</span>
            {quand
              ? <span className="text-secondaire text-second">{quand}</span>
              : <span className="text-secondaire text-second first-letter:uppercase">{jourEnLettres(s.debut)}</span>}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{nomComplet(s.personne)}</span>
            <Detail s={s} />
            <Pastilles s={s} maintenant={maintenant} className="mt-1.5 md:hidden" />
          </span>
          <Pastilles s={s} maintenant={maintenant} className="hidden justify-end md:flex" />
          <span aria-hidden="true" className="hidden text-second md:inline">›</span>
        </a>
      </Carte>
    </section>
  );
};

// ─── La journée ─────────────────────────────────────────────────────────────

const LigneSeance: React.FC<{ s: SeanceDuJour; maintenant: number; premiere: boolean }> = ({ s, maintenant, premiere }) => (
  <a href={adresseSeance(s)} className={cx(
    'flex items-start gap-4 px-4 py-2.5 hover:bg-survole md:items-center', !premiere && 'border-t border-bord', FOCUS_DEDANS,
  )}>
    <span className="w-12 flex-none text-courant font-semibold tabular-nums">{heure(s.debut)}</span>
    <span className="min-w-0 flex-1">
      <span className="block truncate font-medium">{nomComplet(s.personne)}</span>
      <Detail s={s} />
      <Pastilles s={s} maintenant={maintenant} className="mt-1.5 md:hidden" />
    </span>
    <Pastilles s={s} maintenant={maintenant} className="hidden justify-end md:flex" />
  </a>
);

const Journee: React.FC<{ a: Aujourdhui; maintenant: number }> = ({ a, maintenant }) => {
  const duJour = a.journee.filter((s) => s.debut.slice(0, 10) === a.jour);
  const demain = a.lendemainMatin ? a.journee.filter((s) => s.debut.slice(0, 10) === a.lendemainMatin) : [];
  return (
    <section aria-labelledby="titre-journee" className="flex flex-col gap-2">
      <Etiquette as="h2" id="titre-journee">La journée</Etiquette>
      {duJour.length === 0 ? (
        <Carte className="flex flex-col items-start gap-2 px-4 py-4">
          <p>Pas de séance aujourd’hui.</p>
          {a.prochaine && (
            <Secondaire>
              Prochaine séance : <span className="first-letter:uppercase">{jourEnLettres(a.prochaine.debut)}</span>, {heure(a.prochaine.debut)}, {nomComplet(a.prochaine.personne)}.
            </Secondaire>
          )}
          <a href="#agenda" className={cx('mt-1 inline-flex h-8 items-center rounded-controle border border-marque px-3 text-secondaire font-semibold text-marque hover:bg-actif', FOCUS)}>
            Ouvrir l’agenda
          </a>
        </Carte>
      ) : (
        <Carte as="div" className="overflow-hidden">
          {duJour.map((s, i) => <LigneSeance key={s.id} s={s} maintenant={maintenant} premiere={i === 0} />)}
        </Carte>
      )}
      {demain.length > 0 && (
        <>
          <Secondaire className="mt-2">Demain matin</Secondaire>
          <Carte as="div" className="overflow-hidden">
            {demain.map((s, i) => <LigneSeance key={s.id} s={s} maintenant={maintenant} premiere={i === 0} />)}
          </Carte>
        </>
      )}
    </section>
  );
};

// ─── À traiter ──────────────────────────────────────────────────────────────

/** « séance d'hier, 15 h 30 », « mardi 24 novembre, 10 h ». */
const echeance = (t: ATraiter, jour: string): string => {
  const date = t.seance.debut.slice(0, 10);
  const h = heure(t.seance.debut).replace(/^0/, '').replace(':', ' h ').replace(/ h 00$/, ' h');
  const veille = new Date(`${jour}T12:00:00Z`);
  veille.setUTCDate(veille.getUTCDate() - 1);
  if (date === jour) return `aujourd’hui, ${h}`;
  if (date === veille.toISOString().slice(0, 10)) return `hier, ${h}`;
  return `${jourEnLettres(t.seance.debut)}, ${h}`;
};

const GESTES: Record<ATraiter['sorte'], string> = {
  clore: 'Clore la séance restée « prévue »',
  notes: 'Écrire les notes',
  questionnaire: 'Relire le questionnaire',
  rattacher: 'Rattacher la réservation',
};

const ATraiterBloc: React.FC<{ a: Aujourdhui }> = ({ a }) => {
  const liste = useRef<HTMLDivElement>(null);
  // ↑ ↓ pour parcourir : la liste se lit au clavier sans tabuler ligne à ligne.
  const parcourir = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const liens = [...(liste.current?.querySelectorAll('a') ?? [])];
    const i = liens.indexOf(document.activeElement as HTMLAnchorElement);
    if (i < 0) return;
    e.preventDefault();
    liens[Math.min(liens.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus();
  };
  return (
    <section aria-labelledby="titre-a-traiter" className="flex flex-col gap-2">
      <div className="flex items-baseline gap-3">
        <Etiquette as="h2" id="titre-a-traiter">À traiter{a.aTraiter.length ? ` · ${a.aTraiter.length}` : ''}</Etiquette>
        {a.aTraiter.length > 1 && <Secondaire>du plus en retard au plus lointain</Secondaire>}
      </div>
      {a.aTraiter.length === 0 ? (
        <Carte className="px-4 py-4"><p>Tout est à jour. Rien ne vous attend ici.</p></Carte>
      ) : (
        <Carte as="div" className="overflow-hidden">
          <div ref={liste} onKeyDown={parcourir}>
            {a.aTraiter.map((t, i) => (
              <a key={`${t.sorte}-${t.seance.id}`} href={adresseDe(t)} className={cx(
                'flex flex-wrap items-center gap-x-4 gap-y-0.5 px-4 py-2.5 hover:bg-survole md:flex-nowrap', i > 0 && 'border-t border-bord', FOCUS_DEDANS,
              )}>
                <span className="w-full font-semibold md:w-72 md:flex-none">{GESTES[t.sorte]}</span>
                <span className="min-w-0 flex-1 truncate">{t.sorte === 'rattacher' ? `reçue au nom de ${nomComplet(t.seance.personne)}` : nomComplet(t.seance.personne)}</span>
                <span className="text-secondaire text-second">{t.sorte === 'questionnaire' ? `séance ${echeance(t, a.jour)}` : echeance(t, a.jour)}</span>
                <span aria-hidden="true" className="hidden text-second md:inline">›</span>
              </a>
            ))}
          </div>
        </Carte>
      )}
      {a.aTraiter.length > 1 && <Secondaire className="hidden md:block">↑ ↓ pour parcourir · ↵ pour ouvrir. Une ligne disparaît quand son geste est fait.</Secondaire>}
    </section>
  );
};

// ─── La réception du site ───────────────────────────────────────────────────

/**
 * Ouverte : une ligne discrète en bas, avec le geste pour la couper (qui se
 * confirme). Coupée : en tête, en couleur d'alerte, avec « Rouvrir » (qui ne
 * se confirme pas : c'est le retour à la normale).
 */
const LigneReception: React.FC<{ reception: Reception; enTete: boolean }> = ({ reception, enTete }) => {
  const [confirmer, setConfirmer] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [refus, setRefus] = useState<string | null>(null);
  const p = reception.portes;
  const poser = async (ouverte: boolean) => {
    setEnCours(true);
    setRefus(null);
    try { await reception.poser(ouverte); setConfirmer(false); } catch (e) { setRefus(e instanceof Error ? e.message.replace(/^Erreur \d+ — /, '') : String(e)); } finally { setEnCours(false); }
  };
  const fenetre = (
    <Fenetre ouverte={confirmer} titre="Couper la réception du site ?" onFermer={() => setConfirmer(false)}
      actions={<><Bouton intention="souligne" onClick={() => setConfirmer(false)}>Garder ouverte</Bouton>
        <Bouton onClick={() => void poser(false)} disabled={enCours}>Couper la réception</Bouton></>}>
      <p>Le site n’enregistrera plus ni réservation, ni questionnaire, ni inscription. Sa page affichera votre téléphone.</p>
      <Secondaire className="mt-2">Rien n’est déployé : la rouvrir est immédiat.</Secondaire>
    </Fenetre>
  );
  if (!p) return null;
  if (!p.ouverte) {
    if (!enTete) return null;
    return (
      <Carte as="div" className="!border-sens-alerte !bg-sens-alerte-fond">
        <div role="alert" className="flex flex-wrap items-center gap-3 px-4 py-3 text-sens-alerte">
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">! Réception du site : coupée</span>
            <span className="block text-secondaire">Le site n’enregistre ni réservation, ni questionnaire, ni inscription.</span>
            {refus && <span className="block text-secondaire font-semibold">{refus}</span>}
          </span>
          <Bouton intention="borde" className="!border-sens-alerte !text-sens-alerte" onClick={() => void poser(true)} disabled={enCours}>Rouvrir</Bouton>
        </div>
      </Carte>
    );
  }
  if (enTete) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-bord pt-3 text-secondaire text-second">
      <span aria-hidden="true" className="mx-1 size-2 rounded-full bg-sens-succes" />
      <a href={ADRESSE_RECEPTION} className={cx('rounded-controle hover:text-texte', FOCUS)}>Réception du site : ouverte</a>
      <span aria-hidden="true">·</span>
      <Bouton intention="souligne" taille="petit" onClick={() => setConfirmer(true)}>Couper</Bouton>
      {refus && <span className="font-semibold text-sens-erreur">{refus}</span>}
      {fenetre}
    </div>
  );
};

// ─── L'écran ────────────────────────────────────────────────────────────────

const DATE_HEURE = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' });

export const AujourdhuiView: React.FC<{ reception: Reception }> = ({ reception }) => {
  const lecture = useLecture(Clients.lireAujourdhui, []);
  const maintenant = lecture.phase === 'prete' ? Date.parse(lecture.donnees.maintenant) : Date.now();

  return (
    <div className="mx-auto flex max-w-[880px] flex-col gap-6 px-4 py-5 font-charte text-courant text-texte md:px-8 md:py-8">
      <Etiquette className="first-letter:uppercase">{DATE_HEURE.format(maintenant).replace(':', ' h ')}</Etiquette>
      <LigneReception reception={reception} enTete />

      {lecture.phase === 'chargement' && (
        <Carte as="div" aria-busy="true" className="px-4 py-4">
          <Secondaire>Chargement de la journée</Secondaire>
          <div aria-hidden="true" className="mt-3 flex flex-col gap-2.5">
            {[0, 1, 2].map((i) => <div key={i} className="h-4 rounded-controle bg-bas" style={{ width: `${80 - i * 15}%` }} />)}
          </div>
        </Carte>
      )}
      {lecture.phase === 'nonReliee' && (
        <Carte as="div" className="flex flex-wrap items-center gap-3 px-4 py-4">
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-sens-alerte">! La pratique n’est pas disponible : la base n’est pas reliée.</span>
            <Secondaire>Aujourd’hui, Agenda, Clients et Stages sont grisés dans la barre latérale. L’éditorial fonctionne.</Secondaire>
          </span>
          <a href="#reglages/etat" className={cx('inline-flex h-8 items-center rounded-controle border border-marque px-3 text-secondaire font-semibold text-marque hover:bg-actif', FOCUS)}>
            Voir l’état dans les Réglages
          </a>
        </Carte>
      )}
      {lecture.phase === 'refus' && (
        <Carte as="div" role="alert" className="flex flex-col items-start gap-2 px-4 py-4">
          <p className="font-semibold text-sens-erreur">× La journée n’a pas pu être chargée.</p>
          <Secondaire>{lecture.message} Vos données ne sont pas touchées.</Secondaire>
          <Bouton intention="borde" taille="petit" onClick={() => void lecture.recharger()}>Réessayer</Bouton>
        </Carte>
      )}
      {lecture.phase === 'prete' && (
        <>
          {lecture.donnees.prochaine && lecture.donnees.journee.some((s) => s.id === lecture.donnees.prochaine!.id) && (
            <Prochaine s={lecture.donnees.prochaine} maintenant={maintenant} />
          )}
          <Journee a={lecture.donnees} maintenant={maintenant} />
          <ATraiterBloc a={lecture.donnees} />
        </>
      )}

      <LigneReception reception={reception} enTete={false} />
    </div>
  );
};

export default AujourdhuiView;
