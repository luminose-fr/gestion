/**
 * Le cadre de la console (refonte, lot 2 — docs/refonte/01, §3, et 04, §4) :
 * la barre latérale du Mac, la barre du bas de l'iPhone, « Ajouter », l'écran
 * « Plus », la ligne d'état de la réception du site, et le second niveau.
 *
 * Le cadre ne connaît pas les écrans : il reçoit l'entrée active et rend la
 * main par `onNaviguer`. Les liens portent tout de même leur adresse, pour
 * qu'un clic du milieu ou « Copier le lien » fassent ce qu'on attend.
 */
import React, { useEffect, useId, useRef, useState } from 'react';
import { Carte, Etiquette, FOCUS, Pastille } from './index';
import * as Api from '../../services/apiService';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

/** Le focus d'une entrée de liste : le contour se dessine en dedans, pour ne pas mordre sur la voisine. */
const FOCUS_DEDANS = 'outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-marque';

// ─── Les entrées ────────────────────────────────────────────────────────────

export type IdNav =
  | 'aujourdhui' | 'agenda' | 'clients' | 'paiements' | 'stages' | 'professionnels' | 'psychedeliques'
  | 'contenus' | 'corpus' | 'reglages' | 'plus';

/** Les tracés des maquettes (Nav.dc.html), sur une grille de 16. */
const TRACES: Record<IdNav | 'ajouter' | 'replier' | 'idee' | 'fiche' | 'rechercher', string> = {
  aujourdhui: 'M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M8 5a3 3 0 100 6 3 3 0 000-6z',
  agenda: 'M3 4h10v9H3zM3 7h10M6 2v3M10 2v3',
  paiements: 'M2 4h12v8H2zM2 7h12',
  clients: 'M8 8a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM3 13.5c.5-2.5 2.5-3.5 5-3.5s4.5 1 5 3.5',
  stages: 'M5 7a2 2 0 100-4 2 2 0 000 4zM11 7a2 2 0 100-4 2 2 0 000 4zM1.5 13c.3-2 1.7-3 3.5-3s3.2 1 3.5 3M10 10.1c.3-.1.7-.1 1-.1 1.8 0 3.2 1 3.5 3',
  professionnels: 'M3 5h10v8H3zM6 5V3h4v2',
  psychedeliques: 'M4 2h8v12H4zM6 5h4M6 8h.01M8 8h.01M10 8h.01M6 11h.01M8 11h.01M10 11h.01',
  contenus: 'M3 3h10v10H3zM5 6h6M5 8.5h6M5 11h3',
  corpus: 'M3 3h3.5v10H3zM6.5 3H10v10H6.5zM10.6 4.2l2.4-.6 2 9-2.4.6z',
  reglages: 'M3 5h6M12 5h1M3 11h1M7 11h6M10.5 3.5v3M5.5 9.5v3',
  plus: 'M3 4.5h10M3 8h10M3 11.5h10',
  ajouter: 'M8 3v10M3 8h10',
  rechercher: 'M7 12A5 5 0 107 2a5 5 0 000 10zM11 11l3 3',
  replier: 'M2.5 3h11v10h-11zM6 3v10',
  idee: 'M8 2a4 4 0 00-2.5 7.1V11h5V9.1A4 4 0 008 2zM6.5 13.5h3',
  fiche: 'M8 8a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM3 13.5c.5-2.5 2.5-3.5 5-3.5M12 10v4M10 12h4',
};

export const Icone: React.FC<{ trace: keyof typeof TRACES; taille?: number }> = ({ trace, taille = 16 }) => (
  <svg aria-hidden="true" width={taille} height={taille} viewBox="0 0 16 16" fill="none" stroke="currentColor"
    strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" className="flex-none">
    <path d={TRACES[trace]} />
  </svg>
);

type Entree = { id: IdNav; libelle: string; adresse: string; base?: boolean };

/**
 * L'ordre suit la fréquence (01, §3, règle 3). `base` : l'entrée lit la base
 * des clients, et se grise tant qu'elle n'est pas reliée (la production,
 * jusqu'à la phase S4). Une entrée n'entre qu'avec son écran : une entrée qui
 * ne mène nulle part n'a pas sa place.
 */
export const AUJOURDHUI: Entree = { id: 'aujourdhui', libelle: 'Aujourd’hui', adresse: '#aujourdhui', base: true };
export const PRATIQUE: Entree[] = [
  { id: 'agenda', libelle: 'Agenda', adresse: '#agenda', base: true },
  { id: 'clients', libelle: 'Clients', adresse: '#clients', base: true },
  { id: 'paiements', libelle: 'Paiements', adresse: '#paiements', base: true },
  { id: 'stages', libelle: 'Stages', adresse: '#stages', base: true },
  { id: 'professionnels', libelle: 'Professionnels', adresse: '#professionnels', base: true },
  { id: 'psychedeliques', libelle: 'Psychédéliques', adresse: '#psychedeliques' },
];
export const EDITORIAL: Entree[] = [
  { id: 'contenus', libelle: 'Contenus', adresse: '#social/conversations' },
  { id: 'corpus', libelle: 'Corpus', adresse: '#corpus/etat' },
];
const REGLAGES: Entree = { id: 'reglages', libelle: 'Réglages', adresse: '#reglages/models' };

const RAISON_BASE = 'La base des clients n’est pas reliée ici';

/** Un clic simple navigue par l'application ; un clic du milieu ou avec ⌘ ouvre l'adresse ailleurs. */
const suivre = (e: React.MouseEvent, agir: () => void) => {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  agir();
};

// ─── La réception du site ───────────────────────────────────────────────────

/**
 * L'interrupteur de la porte publique (SPEC §14.5), lu pour la ligne d'état.
 * Il n'existe que si la base est reliée ; il se relit quand la fenêtre revient
 * au premier plan, pour qu'une coupure faite ailleurs se voie.
 */
export type Reception = {
  portes: Api.EtatDesPortes | null;
  /** Couper ou rouvrir ; l'état revient de la route, pas d'une supposition. */
  poser: (ouverte: boolean) => Promise<void>;
};

export const useReception = (baseReliee: boolean | null): Reception => {
  const [portes, setPortes] = useState<Api.EtatDesPortes | null>(null);
  useEffect(() => {
    if (!baseReliee) { setPortes(null); return; }
    let vivant = true;
    const lire = () => Api.fetchEtatDesPortes()
      .then(p => { if (vivant && typeof p?.ouverte === 'boolean') setPortes(p); })
      .catch(() => { if (vivant) setPortes(null); });
    lire();
    const auRetour = () => { if (document.visibilityState === 'visible') lire(); };
    document.addEventListener('visibilitychange', auRetour);
    return () => { vivant = false; document.removeEventListener('visibilitychange', auRetour); };
  }, [baseReliee]);
  const poser = async (ouverte: boolean) => {
    const p = await Api.poserInterrupteurDesPortes(ouverte);
    if (typeof p?.ouverte === 'boolean') setPortes(p);
  };
  return { portes, poser };
};

/** Où l'interrupteur se pose aujourd'hui : Réglages → Quotas, carte « Base des clients ». */
export const ADRESSE_RECEPTION = '#reglages/quotas';

const Point: React.FC<{ ouverte: boolean }> = ({ ouverte }) => (
  <span aria-hidden="true" className={cx('mx-1 size-2 flex-none rounded-full', ouverte ? 'bg-sens-succes' : 'bg-sens-alerte')} />
);

// ─── La barre latérale (Mac) ────────────────────────────────────────────────

const CLE_REPLIEE = 'luminose-barre-repliee';

/** La barre s'ouvre dépliée (01, §3, règle 1) ; repliée, elle le reste d'une visite à l'autre. */
export const useBarreRepliee = (): [boolean, (v: boolean) => void] => {
  const [repliee, setRepliee] = useState(() => {
    try { return localStorage.getItem(CLE_REPLIEE) === '1'; } catch { return false; }
  });
  const poser = (v: boolean) => {
    setRepliee(v);
    try { if (v) localStorage.setItem(CLE_REPLIEE, '1'); else localStorage.removeItem(CLE_REPLIEE); } catch { /* sans stockage, pour la page */ }
  };
  return [repliee, poser];
};

const LienBarre: React.FC<{
  entree: Entree; actif: boolean; repliee: boolean; grisee: boolean; compte?: number; onNaviguer: (id: IdNav) => void;
}> = ({ entree, actif, repliee, grisee, compte, onNaviguer }) => {
  const base = cx(
    'flex h-9 items-center gap-[10px] rounded-controle px-3 font-medium',
    repliee && 'justify-center px-0',
  );
  if (grisee) {
    return (
      <span aria-disabled="true" title={`${entree.libelle} — ${RAISON_BASE}`} className={cx(base, 'cursor-not-allowed text-second opacity-60')}>
        <Icone trace={entree.id} />
        {!repliee && <span className="flex-1 truncate">{entree.libelle}</span>}
      </span>
    );
  }
  return (
    <a
      href={entree.adresse}
      aria-current={actif ? 'page' : undefined}
      aria-label={repliee ? entree.libelle : undefined}
      title={repliee ? (compte ? `${entree.libelle} — ${compte} à voir` : entree.libelle) : undefined}
      onClick={(e) => suivre(e, () => onNaviguer(entree.id))}
      className={cx(
        base, 'relative transition-colors duration-[var(--duree)]', FOCUS_DEDANS,
        actif ? 'bg-actif font-semibold text-marque' : 'text-texte hover:bg-survole',
      )}
    >
      <Icone trace={entree.id} />
      {!repliee && <span className="flex-1 truncate">{entree.libelle}</span>}
      {!!compte && (repliee
        ? <span aria-hidden="true" className="absolute right-1.5 top-1.5 size-2 rounded-full bg-marque" />
        : <span className="text-secondaire font-normal text-second tabular-nums">{compte}</span>)}
    </a>
  );
};

const TitreGroupe: React.FC<{ nom: string; repliee: boolean }> = ({ nom, repliee }) => (
  <div className="mt-3.5 min-h-[2px] border-t border-bord px-2.5 pb-1.5 pt-3">
    {!repliee && <Etiquette as="h2">{nom}</Etiquette>}
  </div>
);

export const BarreLaterale: React.FC<{
  actif: IdNav | null;
  onNaviguer: (id: IdNav) => void;
  baseReliee: boolean | null;
  reception: Api.EtatDesPortes | null;
  /** Ce qui attend un regard dans Réglages (la veille des modèles, SPEC §5.7). */
  compteReglages?: number;
  /** Un contenu ouvert prend la largeur : la barre se replie, sans changer le choix retenu. */
  forcerRepliee?: boolean;
  /** Ouvre la recherche (⌘K). */
  onRechercher?: () => void;
}> = ({ actif, onNaviguer, baseReliee, reception, compteReglages, forcerRepliee = false, onRechercher }) => {
  const [choix, setChoix] = useBarreRepliee();
  const repliee = choix || forcerRepliee;
  const lien = (e: Entree) => (
    <LienBarre key={e.id} entree={e} actif={actif === e.id} repliee={repliee}
      grisee={!!e.base && baseReliee === false} onNaviguer={onNaviguer} />
  );

  return (
    <nav aria-label="Navigation principale" className={cx(
      'hidden md:flex flex-none flex-col gap-0.5 overflow-y-auto border-r border-bord bg-bas px-2 py-3 font-charte text-courant text-texte',
      repliee ? 'w-14' : 'w-[232px]',
    )}>
      <div className={cx('mb-2 flex h-10 items-center gap-2', repliee ? 'justify-center' : 'pl-3')}>
        {!repliee && <span className="flex-1 font-titre text-[19px] leading-none tracking-[-.01em]">Luminose</span>}
        {!forcerRepliee && (
          <button type="button" onClick={() => setChoix(!choix)} aria-label={repliee ? 'Déplier la barre latérale' : 'Replier la barre latérale'}
            title={repliee ? 'Déplier la barre latérale' : 'Replier la barre latérale'}
            className={cx('flex size-8 items-center justify-center rounded-controle text-second hover:bg-survole', FOCUS)}>
            <Icone trace="replier" />
          </button>
        )}
      </div>

      {lien(AUJOURDHUI)}
      <TitreGroupe nom="Pratique" repliee={repliee} />
      {PRATIQUE.map(lien)}
      <TitreGroupe nom="Éditorial" repliee={repliee} />
      {EDITORIAL.map(lien)}

      <div className="min-h-6 flex-1" />
      {onRechercher && (
        <button type="button" onClick={onRechercher} aria-label="Rechercher (⌘K)" title={repliee ? 'Rechercher (⌘K)' : undefined}
          className={cx('flex h-9 items-center gap-[10px] rounded-controle px-3 font-medium text-texte hover:bg-survole', repliee && 'justify-center px-0', FOCUS_DEDANS)}>
          <Icone trace="rechercher" />
          {!repliee && <><span className="flex-1 text-left">Rechercher</span><kbd className="text-secondaire font-normal text-second">⌘K</kbd></>}
        </button>
      )}
      <LienBarre entree={REGLAGES} actif={actif === 'reglages'} repliee={repliee} grisee={false} compte={compteReglages} onNaviguer={onNaviguer} />

      {reception && (
        <a href={ADRESSE_RECEPTION} onClick={(e) => suivre(e, () => onNaviguer('reglages'))}
          aria-label={`Réception du site : ${reception.ouverte ? 'ouverte' : 'coupée'}`}
          title={repliee ? `Réception du site : ${reception.ouverte ? 'ouverte' : 'coupée'}` : undefined}
          className={cx(
            'mt-1.5 flex items-center gap-2 rounded-controle border-t border-bord px-3 pb-1 pt-2.5 text-secondaire', FOCUS_DEDANS,
            reception.ouverte ? 'text-second' : 'font-semibold text-sens-alerte',
            repliee && 'justify-center px-0',
          )}>
          <Point ouverte={reception.ouverte} />
          {!repliee && <span>{reception.ouverte ? 'Réception du site : ouverte' : '! Réception du site : coupée'}</span>}
        </a>
      )}
    </nav>
  );
};

// ─── La barre du bas (iPhone) ───────────────────────────────────────────────

/**
 * Aujourd'hui · Agenda · + · Clients · Plus (01, §3). Sans la base des
 * clients, la première place revient à Contenus, l'écran d'ouverture : une
 * barre de trois cases grisées ne servirait à rien.
 */
const PLUS: Entree = { id: 'plus', libelle: 'Plus', adresse: '#plus' };
const entreesDuBas = (baseReliee: boolean | null): Entree[] =>
  [baseReliee === false ? EDITORIAL[0] : AUJOURDHUI, PRATIQUE[0], PRATIQUE[1], PLUS];

export const BarreDuBas: React.FC<{
  actif: IdNav | null;
  onNaviguer: (id: IdNav) => void;
  onAjouter: () => void;
  baseReliee: boolean | null;
}> = ({ actif, onNaviguer, onAjouter, baseReliee }) => {
  const BAS = entreesDuBas(baseReliee);
  const case_ = (e: Entree) => {
    const grisee = !!e.base && baseReliee === false;
    const choisi = actif === e.id;
    const classes = cx('flex h-[50px] flex-col items-center justify-center gap-1 rounded-controle', FOCUS_DEDANS,
      choisi ? 'font-semibold text-marque' : 'text-second', grisee && 'opacity-50');
    const corps = <><Icone trace={e.id} taille={20} /><span>{e.libelle}</span></>;
    return grisee
      ? <span key={e.id} aria-disabled="true" title={RAISON_BASE} className={classes}>{corps}</span>
      : <a key={e.id} href={e.adresse} aria-current={choisi ? 'page' : undefined} onClick={(ev) => suivre(ev, () => onNaviguer(e.id))} className={classes}>{corps}</a>;
  };
  return (
    <nav aria-label="Navigation" className="md:hidden grid flex-none grid-cols-5 items-center border-t border-bord bg-surface px-2 pt-1.5 pb-[max(8px,env(safe-area-inset-bottom))] font-charte text-etiquette font-medium">
      {case_(BAS[0])}
      {case_(BAS[1])}
      <button type="button" onClick={onAjouter} aria-label="Ajouter : noter une idée, nouvelle fiche, poser un rendez-vous"
        className={cx('flex h-[50px] items-center justify-center rounded-controle', FOCUS)}>
        <span className="flex h-11 w-[52px] items-center justify-center rounded-controle bg-marque text-sur-marque"><Icone trace="ajouter" taille={22} /></span>
      </button>
      {case_(BAS[2])}
      {case_(BAS[3])}
    </nav>
  );
};

// ─── « Ajouter » (iPhone) ───────────────────────────────────────────────────

export type Geste = 'idee' | 'fiche' | 'rendez-vous';

const GESTES: { id: Geste; nom: string; detail: string; trace: 'idee' | 'fiche' | 'agenda'; base?: boolean }[] = [
  { id: 'idee', nom: 'Noter une idée', detail: 'Pour un contenu', trace: 'idee' },
  { id: 'fiche', nom: 'Nouvelle fiche', detail: 'Pendant l’entretien préalable', trace: 'fiche', base: true },
  { id: 'rendez-vous', nom: 'Poser un rendez-vous', detail: 'Choisir la personne, puis le créneau', trace: 'agenda', base: true },
];

/**
 * La feuille du « + » : trois gestes, posée sur la barre du bas. `<dialog>`
 * natif, comme la Fenêtre : le focus y reste, Échap la ferme. Toujours montée,
 * ouverte ou fermée selon `ouverte` (pas de hook après un retour anticipé).
 */
export const FeuilleAjouter: React.FC<{
  ouverte: boolean; onFermer: () => void; onGeste: (g: Geste) => void; baseReliee: boolean | null;
}> = ({ ouverte, onFermer, onGeste, baseReliee }) => {
  const ref = useRef<HTMLDialogElement>(null);
  const titre = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (ouverte && !d.open) d.showModal?.();
    if (!ouverte && d.open) d.close?.();
  }, [ouverte]);
  return (
    <dialog ref={ref} aria-labelledby={titre} onClose={onFermer} onCancel={(e) => { e.preventDefault(); onFermer(); }}
      onClick={(e) => { if (e.target === e.currentTarget) onFermer(); }}
      className="mx-0 mb-0 mt-auto w-full max-w-none rounded-t-carte border border-b-0 border-bord bg-surface p-0 text-texte backdrop:bg-voile md:mx-auto md:mb-auto md:max-w-[420px] md:rounded-carte md:border-b">
      {ouverte && (
        <div className="flex flex-col px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-2 font-charte text-courant">
          <div className="flex min-h-11 items-center">
            <Etiquette as="h2" className="flex-1 pl-1"><span id={titre}>Ajouter</span></Etiquette>
            <button type="button" onClick={onFermer} className={cx('h-11 px-1 font-medium text-marque underline underline-offset-[3px]', FOCUS)}>Fermer</button>
          </div>
          {GESTES.map((g) => {
            const grise = !!g.base && baseReliee === false;
            return (
              <button key={g.id} type="button" disabled={grise} onClick={() => onGeste(g.id)}
                className={cx('flex min-h-16 items-center gap-3.5 border-t border-bord px-1 py-2 text-left hover:bg-survole disabled:opacity-50', FOCUS_DEDANS)}>
                <span className="flex size-10 flex-none items-center justify-center rounded-controle bg-actif text-marque"><Icone trace={g.trace} taille={20} /></span>
                <span className="flex flex-1 flex-col">
                  <span className="font-semibold">{g.nom}</span>
                  <span className="text-secondaire text-second">{grise ? RAISON_BASE : g.detail}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </dialog>
  );
};

// ─── L'écran « Plus » (iPhone) ──────────────────────────────────────────────

export const EcranPlus: React.FC<{
  onNaviguer: (id: IdNav) => void;
  baseReliee: boolean | null;
  reception: Api.EtatDesPortes | null;
  compteReglages?: number;
  onRechercher?: () => void;
}> = ({ onNaviguer, baseReliee, reception, compteReglages, onRechercher }) => {
  const BAS = entreesDuBas(baseReliee);
  const groupes: { nom: string; entrees: Entree[] }[] = [
    { nom: 'Pratique', entrees: PRATIQUE.filter(e => !BAS.includes(e)) },
    { nom: 'Éditorial', entrees: EDITORIAL.filter(e => !BAS.includes(e)) },
    { nom: 'Console', entrees: [REGLAGES] },
  ];
  return (
    <div className="mx-auto flex max-w-[560px] flex-col gap-3 px-4 py-4 font-charte text-courant text-texte">
      {reception && (reception.ouverte ? (
        <Carte as="div">
          <a href={ADRESSE_RECEPTION} onClick={(e) => suivre(e, () => onNaviguer('reglages'))}
            className={cx('flex min-h-11 items-center gap-2.5 rounded-carte px-3.5 py-2', FOCUS)}>
            <Point ouverte />
            <span className="flex-1">Réception du site : ouverte</span>
            <span className="text-secondaire text-second">{reception.commandesDuJour} reçu{reception.commandesDuJour > 1 ? 's' : ''} sur 24 h</span>
          </a>
        </Carte>
      ) : (
        <Carte as="div" className="!border-sens-alerte !bg-sens-alerte-fond">
          <a href={ADRESSE_RECEPTION} role="alert" onClick={(e) => suivre(e, () => onNaviguer('reglages'))}
            className={cx('flex min-h-11 items-center gap-2.5 rounded-carte px-3.5 py-2 font-semibold text-sens-alerte', FOCUS)}>
            <span className="flex-1">! Réception du site : coupée</span>
            <span className="text-secondaire underline underline-offset-[3px]">Rouvrir</span>
          </a>
        </Carte>
      ))}
      {groupes.filter(g => g.entrees.length).map((g) => (
        <section key={g.nom} className="flex flex-col gap-1.5">
          <Etiquette as="h2" className="px-1">{g.nom}</Etiquette>
          <Carte as="div" className="overflow-hidden">
            {g.entrees.map((e, i) => {
              const grisee = !!e.base && baseReliee === false;
              const classes = cx('flex min-h-12 items-center gap-3 px-3.5', i > 0 && 'border-t border-bord', FOCUS_DEDANS);
              const corps = <><Icone trace={e.id} taille={18} /><span className="flex-1 font-medium">{e.libelle}</span></>;
              return grisee
                ? <span key={e.id} aria-disabled="true" className={cx(classes, 'opacity-50')}>{corps}<span className="text-secondaire text-second">non reliée</span></span>
                : <a key={e.id} href={e.adresse} onClick={(ev) => suivre(ev, () => onNaviguer(e.id))} className={cx(classes, 'hover:bg-survole')}>
                    {corps}
                    {e.id === 'reglages' && !!compteReglages && <Pastille ton="alerte">{compteReglages} à voir</Pastille>}
                  </a>;
            })}
          </Carte>
        </section>
      ))}
      {onRechercher && (
        <button type="button" onClick={onRechercher}
          className={cx('flex min-h-12 items-center gap-3 rounded-carte border border-bord bg-surface px-3.5 shadow-carte', FOCUS)}>
          <Icone trace="rechercher" taille={18} /><span className="flex-1 text-left font-medium">Rechercher</span>
        </button>
      )}
    </div>
  );
};

// ─── Le second niveau ───────────────────────────────────────────────────────

export type EntreeSecondNiveau<T extends string> = { id: T; libelle: string; compte?: number };

/**
 * Au-delà de quatre vues, une liste à gauche DANS l'écran (01, §3, règle 4) —
 * Réglages, les documents du Corpus. Sur l'iPhone, la même liste se range en
 * une rangée qui défile, l'entrée active amenée à la vue.
 */
export function ListeSecondNiveau<T extends string>({ entrees, actif, onChoisir, libelle }: {
  entrees: EntreeSecondNiveau<T>[]; actif: T | null; onChoisir: (id: T) => void; libelle: string;
}) {
  const actifRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    actifRef.current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [actif]);
  return (
    <nav aria-label={libelle} className={cx(
      'flex flex-none gap-1 overflow-x-auto border-b border-bord bg-fond px-3 py-2 font-charte [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
      'md:w-[220px] md:flex-col md:overflow-x-visible md:overflow-y-auto md:border-b-0 md:border-r md:px-2 md:py-4',
    )}>
      <Etiquette as="h2" className="hidden px-3 pb-2 md:block">{libelle}</Etiquette>
      {entrees.map((e) => {
        const choisi = e.id === actif;
        return (
          <button key={e.id} ref={choisi ? actifRef : undefined} type="button" aria-current={choisi ? 'page' : undefined}
            onClick={() => onChoisir(e.id)}
            className={cx(
              'flex h-11 md:h-9 flex-none items-center justify-between gap-2 whitespace-nowrap rounded-controle px-3 text-courant md:text-left', FOCUS_DEDANS,
              choisi ? 'bg-actif font-semibold text-marque' : 'text-texte hover:bg-survole',
            )}>
            <span className="truncate">{e.libelle}</span>
            {!!e.compte && <span className="text-secondaire font-normal text-second tabular-nums">{e.compte}</span>}
          </button>
        );
      })}
    </nav>
  );
}
