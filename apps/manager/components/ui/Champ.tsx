/**
 * Le champ de saisie, et son étiquette.
 *
 * `py-2` et non `py-2.5` — qui était pourtant la valeur la plus répandue :
 * 2.5 n'existe dans les échelles que pour le petit bouton. À paddings égaux, le
 * champ et le bouton normal font tous deux 38 px, bordure comprise : un champ
 * et son bouton posés côte à côte s'alignent.
 */
import React from 'react';
import { Etiquette } from './Etiquette';

/**
 * Les classes du contrôle, exportées pour les cas que le composant ne couvre
 * pas — un `<select>` garde son balisage et ses `<option>`, il prend juste
 * les mêmes classes.
 */
export const CLASSES_CHAMP =
  'w-full px-3 py-2 rounded-lg text-sm ' +
  'bg-brand-light dark:bg-dark-bg ' +
  'border border-brand-border dark:border-dark-sec-border ' +
  'text-brand-main dark:text-white ' +
  'placeholder-brand-main/40 dark:placeholder-dark-text/40 ' +
  'outline-hidden focus:border-brand-main dark:focus:border-white ' +
  'transition-colors disabled:opacity-40';

interface ChampCommun {
  label?: React.ReactNode;
  /** Une aide sous le champ. `text-xs` : c'est du texte d'accompagnement. */
  aide?: React.ReactNode;
  /** L'enveloppe. `className`, lui, va au contrôle. */
  classNameEnveloppe?: string;
}

export type ChampProps =
  | (ChampCommun & { multiligne?: false } & React.InputHTMLAttributes<HTMLInputElement>)
  | (ChampCommun & { multiligne: true } & React.TextareaHTMLAttributes<HTMLTextAreaElement>);

/**
 * La référence traverse jusqu'au contrôle : plusieurs écrans donnent le focus
 * à leur champ à l'ouverture (l'ajout rapide d'idée, par exemple). Sans
 * `forwardRef`, la migration perdrait ce focus sans rien signaler.
 */
export const Champ = React.forwardRef<HTMLInputElement | HTMLTextAreaElement, ChampProps>(
  (props, ref) => {
    /*
      L'union discriminée ne survit pas à la déstructuration du reste des
      props : TypeScript ne sait plus s'il répartit vers <input> ou <textarea>.
      D'où une seule assertion, ici, plutôt qu'une chez chaque appelant.
    */
    const {
      label,
      aide,
      classNameEnveloppe = '',
      className = '',
      multiligne,
      id,
      ...attrs
    } = props as ChampCommun & {
      className?: string;
      multiligne?: boolean;
      id?: string;
    } & Record<string, unknown>;

    const classes = [CLASSES_CHAMP, className].filter(Boolean).join(' ');

    const controle = multiligne ? (
      <textarea
        ref={ref as React.Ref<HTMLTextAreaElement>}
        id={id}
        className={classes}
        {...(attrs as React.TextareaHTMLAttributes<HTMLTextAreaElement>)}
      />
    ) : (
      <input
        ref={ref as React.Ref<HTMLInputElement>}
        id={id}
        className={classes}
        {...(attrs as React.InputHTMLAttributes<HTMLInputElement>)}
      />
    );

    if (!label && !aide) return controle;

    return (
      <div className={classNameEnveloppe || undefined}>
        {label && (
          <Etiquette as="label" htmlFor={id} className="mb-1">
            {label}
          </Etiquette>
        )}
        {controle}
        {aide && (
          <p className="mt-1 text-xs text-brand-main/60 dark:text-dark-text/60">{aide}</p>
        )}
      </div>
    );
  },
);
Champ.displayName = 'Champ';

export default Champ;
