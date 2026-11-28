/**
 * Les contrôles des réglages (retours du 28/11/2026, §2.2 à §2.5 —
 * docs/refonte/05-retours-28-novembre.md ; maquettes Reglages*).
 *
 * Une règle s'écrit en phrase, le champ dans la phrase : « Un SMS de rappel
 * part [2 jours ▾] avant la séance. » Les valeurs utiles étant peu
 * nombreuses, une liste plutôt qu'un nombre libre ; un compteur garde ses
 * − et +. Ce qui change porte un contour de la marque, et une barre collée au
 * bas de l'écran propose d'enregistrer ou d'annuler.
 */
import React from 'react';
import { Bouton, FOCUS } from './index';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

/** Le contour d'un champ modifié et pas encore enregistré. */
export const MODIFIE = '!border-marque ring-1 ring-marque';

const CADRE = 'h-11 md:h-10 rounded-controle border border-champ-bord bg-champ-fond font-charte text-texte text-champ-tel md:text-courant hover:border-champ';

export const FlecheListe: React.FC = () => (
  <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
    className="pointer-events-none absolute right-3 top-1/2 -mt-1.5 text-second"><path d="M3 4.5l3 3 3-3" /></svg>
);

export type OptionValeur = readonly [number, string];

/**
 * Une liste de valeurs dans une phrase. Règle de reprise (§2.3) : une valeur
 * enregistrée hors de la liste s'affiche telle quelle, comme option choisie,
 * plutôt que d'être remplacée — « 36 heures » reste « 36 heures ».
 */
export const ListeValeurs: React.FC<{
  id: string; libelle: string; valeur: number; options: readonly OptionValeur[];
  /** Le libellé d'une valeur hors liste. */
  horsListe: (v: number) => string;
  onChange: (v: number) => void; modifie?: boolean; className?: string;
}> = ({ id, libelle, valeur, options, horsListe, onChange, modifie, className }) => {
  const connue = options.some(([v]) => v === valeur);
  const toutes = connue ? options : [...options, [valeur, horsListe(valeur)] as const].sort((a, b) => a[0] - b[0]);
  return (
    <span className={cx('relative inline-flex align-middle', className)}>
      <select id={id} aria-label={libelle} value={String(valeur)} onChange={(e) => onChange(Number(e.target.value))}
        className={cx(CADRE, 'w-full cursor-pointer appearance-none pl-3 pr-9 focus:border-marque focus:bg-surface', FOCUS, modifie && MODIFIE)}>
        {toutes.map(([v, t]) => <option key={v} value={String(v)}>{t}</option>)}
      </select>
      <FlecheListe />
    </span>
  );
};

/** Un compteur : un champ court, − et + (quotas, personnes prévenues, tentatives). */
export const Compteur: React.FC<{
  id: string; libelle: string; valeur: number; onChange: (v: number) => void;
  min?: number; max?: number; pas?: number; modifie?: boolean;
}> = ({ id, libelle, valeur, onChange, min = 0, max = 100_000, pas = 1, modifie }) => {
  const borne = (v: number) => Math.min(max, Math.max(min, v));
  const bouton = 'w-9 flex-none font-semibold text-marque hover:bg-doux disabled:text-second disabled:hover:bg-transparent outline-none focus-visible:bg-doux';
  return (
    <span className={cx('inline-flex items-stretch overflow-hidden align-middle', CADRE, 'focus-within:border-marque', modifie && MODIFIE)}>
      <button type="button" className={bouton} aria-label={`${libelle} : un de moins`} disabled={valeur <= min} onClick={() => onChange(borne(valeur - pas))}>−</button>
      <input id={id} aria-label={libelle} inputMode="numeric" value={String(valeur)}
        onChange={(e) => { const n = Number(e.target.value.replace(/\D/g, '')); if (Number.isFinite(n)) onChange(borne(n)); }}
        className="w-14 border-0 bg-transparent text-center font-semibold tabular-nums outline-none" />
      <button type="button" className={bouton} aria-label={`${libelle} : un de plus`} disabled={valeur >= max} onClick={() => onChange(borne(valeur + pas))}>+</button>
    </span>
  );
};

/** Un champ court suffixé (« 80 € »). */
export const ChampSuffixe: React.FC<React.InputHTMLAttributes<HTMLInputElement> & { suffixe: string; modifie?: boolean }> =
  ({ suffixe, modifie, className, ...reste }) => (
    <span className={cx('inline-flex items-center pr-3 text-second', CADRE, 'focus-within:border-marque focus-within:bg-surface', modifie && MODIFIE, className)}>
      <input {...reste} className="h-full w-20 border-0 bg-transparent pl-3 pr-1 text-right text-texte outline-none" />{suffixe}
    </span>
  );

/** Une phrase qui porte ses champs. */
export const Phrase: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div className={cx('flex min-h-11 flex-wrap items-center gap-2 font-charte text-courant text-texte', className)}>{children}</div>
);

/** Quelques positions exclusives dans un même cadre (Ouverte · Coupée ; le lieu d'un type). */
export function Positions<T extends string>({ valeur, options, onChange, libelle, libelleId, desactive }: {
  valeur: T; options: { valeur: T; libelle: string }[]; onChange: (v: T) => void;
  libelle?: string; libelleId?: string; desactive?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={libelle} aria-labelledby={libelleId}
      className="inline-flex flex-wrap gap-0.5 self-start rounded-carte bg-bas p-0.75 font-charte"
      onKeyDown={(e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        const i = options.findIndex((o) => o.valeur === valeur);
        const n = (i + (e.key === 'ArrowRight' ? 1 : -1) + options.length) % options.length;
        onChange(options[n].valeur);
        (e.currentTarget.querySelectorAll('button')[n] as HTMLButtonElement | undefined)?.focus();
      }}>
      {options.map((o) => {
        const choisi = o.valeur === valeur;
        return (
          <button key={o.valeur} type="button" role="radio" aria-checked={choisi} tabIndex={choisi ? 0 : -1} disabled={desactive}
            onClick={() => onChange(o.valeur)}
            className={cx('h-8.5 whitespace-nowrap rounded-controle px-3.5 text-courant', FOCUS,
              choisi ? 'bg-surface font-semibold text-texte shadow-carte ring-1 ring-bord' : 'font-medium text-second hover:text-texte')}>
            {choisi ? `✓ ${o.libelle}` : o.libelle}
          </button>
        );
      })}
    </div>
  );
}

/**
 * La barre d'enregistrement : elle n'apparaît que lorsque quelque chose a
 * changé, collée au bas de l'écran (§2.4). Plus de bouton grisé en haut de carte.
 */
export const BarreEnregistrer: React.FC<{
  modifications: number; enCours?: boolean; refus?: string | null; onAnnuler: () => void; onEnregistrer: () => void;
}> = ({ modifications, enCours, refus, onAnnuler, onEnregistrer }) => {
  if (modifications === 0 && !refus) return null;
  return (
    <div role="status" className="sticky bottom-4 z-10 flex flex-wrap items-center gap-2 rounded-carte border border-marque bg-surface py-2.5 pl-5 pr-3 font-charte shadow-fenetre">
      <span className="min-w-0 flex-1 font-medium text-texte">
        {refus ? <span className="text-sens-erreur">× {refus}</span>
          : `${modifications} modification${modifications > 1 ? 's' : ''} non enregistrée${modifications > 1 ? 's' : ''}`}
      </span>
      <Bouton intention="borde" onClick={onAnnuler} disabled={enCours}>Annuler</Bouton>
      <Bouton onClick={onEnregistrer} disabled={enCours || modifications === 0}>{enCours ? 'Enregistrement…' : 'Enregistrer'}</Bouton>
    </div>
  );
};
