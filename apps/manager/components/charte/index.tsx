/**
 * Les composants de la charte de la refonte (docs/refonte, lot 1).
 *
 * Ils portent les échelles de `tokens.css` — et elles ne s'écrivent nulle part
 * ailleurs : un écran refait n'écrit ni couleur, ni taille, ni rayon ; il
 * compose ces composants. Les écrans d'avant gardent `components/ui` jusqu'au
 * lot 9, qui le retire.
 *
 * Accessibilité (04-passation §4) : contraste AA dans les deux thèmes, cibles
 * de 44 px sur l'iPhone (sous `md`), focus visible — contour de 2 px décalé de
 * 2 px —, tout au clavier. Mouvement : 140 ms, retiré si l'on réduit les
 * animations (la variable `--duree` passe à 0).
 */
import React, { useEffect, useId, useRef } from 'react';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

/** Le focus de la charte, sur tout ce qui se manipule. */
export const FOCUS = 'outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marque';
const MOUVEMENT = 'transition-[background-color,border-color,color,transform] duration-[var(--duree)]';

// ─── Bouton ─────────────────────────────────────────────────────────────────

/**
 * Trois intentions. Retours du 28/11/2026 (§1.1) : le bouton bordé, jugé
 * lourd, devient DOUX — fond `--doux`, sans bordure, texte marque ; le bouton
 * discret n'est plus souligné, un fond paraît au survol. Les noms `borde` et
 * `souligne` restent, pour ne pas réécrire chaque écran : ils désignent ces
 * deux intentions. Un choix sélectionné passe en plein.
 */
export type IntentionCharte = 'plein' | 'borde' | 'souligne';
/** 32, 40, 44 px. Sous `md` (l'iPhone), un bouton normal prend 44 px. */
export type TailleCharte = 'petit' | 'normal' | 'tactile';

const INTENTIONS: Record<IntentionCharte, string> = {
  plein: 'border border-marque bg-marque text-sur-marque hover:bg-marque-survol hover:border-marque-survol font-semibold',
  borde: 'border border-transparent bg-doux text-marque hover:bg-doux-survol font-semibold',
  souligne: 'border border-transparent bg-transparent text-marque hover:bg-survole font-semibold !px-2',
};
const TAILLES: Record<TailleCharte, string> = {
  petit: 'h-8 px-3 text-secondaire [&_svg]:size-4',
  normal: 'h-11 md:h-10 px-4 text-courant [&_svg]:size-4',
  tactile: 'h-11 px-4 text-courant [&_svg]:size-5',
};

export type BoutonCharteProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  intention?: IntentionCharte;
  taille?: TailleCharte;
};

/** Un bouton dit ce qu'il fait (« Marquer payé », pas « Valider »). Rayon 8 px, jamais rond. */
export const Bouton = React.forwardRef<HTMLButtonElement, BoutonCharteProps>(
  ({ intention = 'plein', taille = 'normal', className, type = 'button', children, ...reste }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cx(
        'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-controle font-charte',
        'active:translate-y-px disabled:opacity-50 disabled:pointer-events-none',
        INTENTIONS[intention], TAILLES[taille], FOCUS, MOUVEMENT, className,
      )}
      {...reste}
    >
      {/* Un choix sélectionné (radio, bascule) se dit aussi par un signe, pas seulement par la couleur. */}
      {(reste['aria-checked'] === true || reste['aria-pressed'] === true) && <span aria-hidden="true">✓</span>}
      {children}
    </button>
  ),
);
Bouton.displayName = 'Bouton';

// ─── Textes ─────────────────────────────────────────────────────────────────

/** L'étiquette : 12 px, capitales, 600, interlettrage .1em. */
export const Etiquette: React.FC<React.HTMLAttributes<HTMLElement> & { as?: 'p' | 'span' | 'label' | 'h2' | 'h3'; htmlFor?: string }> =
  ({ as: Balise = 'p', className, ...reste }) =>
    <Balise className={cx('font-charte text-etiquette font-semibold uppercase tracking-[.1em] text-second', className)} {...reste} />;

/** Le titre d'un écran : Fraunces 500, 26 px (23 sur l'iPhone). Seul usage de Fraunces avec le titre d'un contenu ouvert. */
export const TitreEcran: React.FC<React.HTMLAttributes<HTMLHeadingElement>> = ({ className, ...reste }) =>
  <h1 className={cx('font-titre font-medium text-ecran-tel md:text-ecran tracking-[-.01em] text-texte text-balance', className)} {...reste} />;

/** Le titre d'une carte : 15 px, 600. */
export const TitreCarte: React.FC<React.HTMLAttributes<HTMLHeadingElement> & { as?: 'h2' | 'h3' }> = ({ as: Balise = 'h2', className, ...reste }) =>
  <Balise className={cx('font-charte text-courant font-semibold text-texte', className)} {...reste} />;

/** Le texte secondaire : 13 px. */
export const Secondaire: React.FC<React.HTMLAttributes<HTMLParagraphElement>> = ({ className, ...reste }) =>
  <p className={cx('font-charte text-secondaire text-second', className)} {...reste} />;

// ─── Pastille ───────────────────────────────────────────────────────────────

export type TonPastille = 'succes' | 'alerte' | 'erreur' | 'neutre';
const TONS: Record<TonPastille, string> = {
  succes: 'border-sens-succes bg-sens-succes-fond text-sens-succes',
  alerte: 'border-sens-alerte bg-sens-alerte-fond text-sens-alerte',
  erreur: 'border-sens-erreur bg-sens-erreur-fond text-sens-erreur',
  neutre: 'border-bord text-second',
};
const SIGNES: Record<TonPastille, string> = { succes: '✓', alerte: '!', erreur: '×', neutre: '○' };

/**
 * Toujours un signe et un libellé (« ✓ Payé », « ! À encaisser », « ○ Prévue »,
 * « × Annulée », « – Absente ») : jamais la couleur seule. `signe` remplace celui du ton ;
 * vide, il n'y en a pas — réservé à ce qui n'a pas de sens à signaler (« Offert »).
 */
export const Pastille: React.FC<{ ton?: TonPastille; signe?: string; children: React.ReactNode; className?: string }> =
  ({ ton = 'neutre', signe, children, className }) => (
    <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-[9px] py-px font-charte text-etiquette leading-[18px] font-semibold', TONS[ton], className)}>
      {(signe ?? SIGNES[ton]) && <span aria-hidden="true">{signe ?? SIGNES[ton]}</span>}{children}
    </span>
  );

// ─── Carte ──────────────────────────────────────────────────────────────────

/** Surface, filet, rayon 12, ombre de carte (thème clair seulement). */
export const Carte: React.FC<React.HTMLAttributes<HTMLElement> & { as?: 'section' | 'div' | 'article' }> =
  ({ as: Balise = 'section', className, ...reste }) =>
    <Balise className={cx('rounded-carte border border-bord bg-surface shadow-carte', className)} {...reste} />;

/** Une ligne de carte qui mène quelque part : le survol et le focus la marquent. */
export const LigneCarte: React.FC<React.AnchorHTMLAttributes<HTMLAnchorElement>> = ({ className, ...reste }) =>
  <a className={cx('flex items-center gap-3 px-4 min-h-11 border-t border-bord first:border-t-0 hover:bg-survole text-texte', FOCUS, MOUVEMENT, className)} {...reste} />;

// ─── Champ ──────────────────────────────────────────────────────────────────

type BaseChamp = { label: string; aide?: React.ReactNode; erreur?: string | null; masquerLabel?: boolean };
const CLASSES_CONTROLE = cx(
  // Retours du 28/11 (§1.3) : un champ plus léger — bordure claire, fond teinté ;
  // la bordure foncée au survol, la marque au focus. Le libellé toujours visible
  // et le fond le désignent : la bordure seule n'atteint plus 3:1, c'est assumé.
  'w-full rounded-controle border border-champ-bord bg-champ-fond px-3 font-charte text-texte placeholder:text-second hover:border-champ focus:border-marque focus:bg-surface',
  'text-champ-tel md:text-courant', // 16 px sur l'iPhone : en dessous, Safari zoome au focus
  'aria-[invalid=true]:border-sens-erreur', FOCUS, MOUVEMENT,
);

export type ChampCharteProps = BaseChamp & React.InputHTMLAttributes<HTMLInputElement>;

/** Un champ et son étiquette ; l'aide et l'erreur sont reliées au champ pour les lecteurs d'écran. */
export const Champ = React.forwardRef<HTMLInputElement, ChampCharteProps>(({ label, aide, erreur, masquerLabel, id, className, ...reste }, ref) => {
  const auto = useId();
  const ident = id ?? auto;
  const decrit = [aide ? `${ident}-aide` : null, erreur ? `${ident}-erreur` : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className={className}>
      <label htmlFor={ident} className={cx('mb-1 block font-charte text-secondaire font-medium text-second', masquerLabel && 'sr-only')}>{label}</label>
      <input ref={ref} id={ident} aria-invalid={erreur ? true : undefined} aria-describedby={decrit} className={cx(CLASSES_CONTROLE, 'h-11 md:h-10')} {...reste} />
      {aide && <p id={`${ident}-aide`} className="mt-1 font-charte text-secondaire text-second">{aide}</p>}
      {erreur && <p id={`${ident}-erreur`} className="mt-1 font-charte text-secondaire text-sens-erreur">{erreur}</p>}
    </div>
  );
});
Champ.displayName = 'Champ';

/** La zone de texte : même bord, même focus ; 16 px partout, comme l'éditeur de notes. */
export const ZoneTexte = React.forwardRef<HTMLTextAreaElement, BaseChamp & React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ label, aide, masquerLabel, id, className, ...reste }, ref) => {
    const auto = useId();
    const ident = id ?? auto;
    return (
      <div className={className}>
        <label htmlFor={ident} className={cx('mb-1 block font-charte text-secondaire font-medium text-second', masquerLabel && 'sr-only')}>{label}</label>
        <textarea ref={ref} id={ident} className={cx(CLASSES_CONTROLE, 'py-2 text-champ-tel md:text-champ-tel min-h-24')} {...reste} />
        {aide && <p className="mt-1 font-charte text-secondaire text-second">{aide}</p>}
      </div>
    );
  },
);
ZoneTexte.displayName = 'ZoneTexte';

/** Une liste de choix, avec le même bord, la même hauteur, le même focus qu'un champ. */
export const Choix = React.forwardRef<HTMLSelectElement, BaseChamp & React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ label, aide, masquerLabel, id, className, children, ...reste }, ref) => {
    const auto = useId();
    const ident = id ?? auto;
    return (
      <div className={className}>
        <label htmlFor={ident} className={cx('mb-1 block font-charte text-secondaire font-medium text-second', masquerLabel && 'sr-only')}>{label}</label>
        {/* Une flèche dessinée, pas celle du système (retours du 28/11, §2.3). */}
        <span className="relative block">
          <select ref={ref} id={ident} className={cx(CLASSES_CONTROLE, 'h-11 md:h-10 cursor-pointer appearance-none pr-9')} {...reste}>{children}</select>
          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
            className="pointer-events-none absolute right-3 top-1/2 -mt-1.5 text-second"><path d="M3 4.5l3 3 3-3" /></svg>
        </span>
        {aide && <p className="mt-1 font-charte text-secondaire text-second">{aide}</p>}
      </div>
    );
  },
);
Choix.displayName = 'Choix';

// ─── Onglets ────────────────────────────────────────────────────────────────

export type Onglet<T extends string> = { id: T; libelle: string; compte?: number };

/**
 * Le second niveau d'un écran, jusqu'à quatre vues (au-delà : une liste à
 * gauche dans l'écran). Flèches gauche et droite, Début et Fin, comme un
 * `tablist` doit les comprendre.
 */
export function Onglets<T extends string>({ onglets, actif, onChange, libelle }: {
  onglets: Onglet<T>[]; actif: T; onChange: (id: T) => void; libelle: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const aller = (i: number) => {
    const n = (i + onglets.length) % onglets.length;
    onChange(onglets[n].id);
    refs.current[n]?.focus();
  };
  return (
    <div role="tablist" aria-label={libelle} className="flex gap-1 border-b border-bord">
      {onglets.map((o, i) => {
        const choisi = o.id === actif;
        return (
          <button
            key={o.id}
            ref={(el) => { refs.current[i] = el; }}
            role="tab"
            type="button"
            aria-selected={choisi}
            tabIndex={choisi ? 0 : -1}
            onClick={() => onChange(o.id)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') { e.preventDefault(); aller(i + 1); }
              if (e.key === 'ArrowLeft') { e.preventDefault(); aller(i - 1); }
              if (e.key === 'Home') { e.preventDefault(); aller(0); }
              if (e.key === 'End') { e.preventDefault(); aller(onglets.length - 1); }
            }}
            className={cx(
              '-mb-px inline-flex h-11 md:h-10 items-center gap-2 border-b-2 px-3 font-charte text-courant',
              choisi ? 'border-marque text-texte font-semibold' : 'border-transparent text-second hover:text-texte',
              FOCUS, MOUVEMENT,
            )}
          >
            {o.libelle}
            {o.compte !== undefined && o.compte > 0 && <span className="text-secondaire text-second tabular-nums">{o.compte}</span>}
          </button>
        );
      })}
    </div>
  );
}

// ─── Section repliable ──────────────────────────────────────────────────────

/**
 * Ce qui sert rarement est replié, et dit en une ligne ce qu'il contient
 * (« Durée, mode et montant · 1 h 30 · en séance · 80 € »).
 */
export const Repliable: React.FC<{ titre: string; resume?: React.ReactNode; ouvert?: boolean; children: React.ReactNode; className?: string }> =
  ({ titre, resume, ouvert, children, className }) => (
    <details open={ouvert} className={cx('group', className)}>
      <summary className={cx('flex min-h-11 md:min-h-10 cursor-pointer list-none items-center gap-2 font-charte [&::-webkit-details-marker]:hidden', FOCUS)}>
        <span aria-hidden="true" className="mx-1 size-[7px] flex-none -rotate-45 border-b-[1.6px] border-r-[1.6px] border-second transition-transform duration-[var(--duree)] group-open:rotate-45" />
        <span className="text-courant font-semibold text-texte">{titre}</span>
        {resume && <span className="truncate text-secondaire text-second">· {resume}</span>}
      </summary>
      <div className="pt-2">{children}</div>
    </details>
  );

// ─── Fenêtre ────────────────────────────────────────────────────────────────

/**
 * Une fenêtre modale : `<dialog>` natif, qui garde le focus et se ferme à
 * Échap. Sur l'iPhone, elle occupe l'écran ; sur le Mac, 560 px au plus.
 * Retour anticipé sans hook (CLAUDE.md) : le dialogue est toujours monté,
 * ouvert ou fermé selon `ouverte`.
 */
export const Fenetre: React.FC<{ ouverte: boolean; titre: string; onFermer: () => void; children: React.ReactNode; actions?: React.ReactNode }> =
  ({ ouverte, titre, onFermer, children, actions }) => {
    const ref = useRef<HTMLDialogElement>(null);
    const titreId = useId();
    useEffect(() => {
      const d = ref.current;
      if (!d) return;
      if (ouverte && !d.open) d.showModal?.();
      if (!ouverte && d.open) d.close?.();
    }, [ouverte]);
    return (
      <dialog
        ref={ref}
        aria-labelledby={titreId}
        onClose={onFermer}
        onCancel={(e) => { e.preventDefault(); onFermer(); }}
        className={cx(
          'm-0 h-full max-h-none w-full max-w-none bg-surface p-0 text-texte backdrop:bg-voile',
          'md:m-auto md:h-fit md:max-h-[85vh] md:max-w-[560px] md:rounded-carte md:shadow-fenetre',
        )}
      >
        {ouverte && (
          <div className="flex h-full flex-col font-charte md:h-auto md:max-h-[85vh]">
            <div className="flex items-center justify-between gap-4 border-b border-bord px-5 py-4">
              <h2 id={titreId} className="text-courant font-semibold">{titre}</h2>
              <Bouton intention="souligne" taille="petit" onClick={onFermer}>Fermer</Bouton>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
            {actions && <div className="flex flex-wrap justify-end gap-2 border-t border-bord px-5 py-4">{actions}</div>}
          </div>
        )}
      </dialog>
    );
  };

// ─── Témoin d'enregistrement ────────────────────────────────────────────────

export type EtatEnregistrement = 'enregistre' | 'en_attente' | 'enregistrement' | 'echec';
const TEMOINS: Record<EtatEnregistrement, { texte: string; classe: string }> = {
  enregistre: { texte: 'Enregistré', classe: 'text-second' },
  en_attente: { texte: 'Modifications en attente…', classe: 'text-second' },
  enregistrement: { texte: 'Enregistrement…', classe: 'text-second' },
  echec: { texte: 'Pas enregistré', classe: 'text-sens-erreur font-semibold' },
};

/** Ce qu'un texte enregistré pendant la frappe dit de lui-même ; annoncé aux lecteurs d'écran. */
export const TemoinEnregistrement: React.FC<{ etat: EtatEnregistrement; detail?: string }> = ({ etat, detail }) => (
  <span role="status" aria-live="polite" className={cx('font-charte text-secondaire', TEMOINS[etat].classe)}>
    {TEMOINS[etat].texte}{detail ? ` — ${detail}` : ''}
  </span>
);

// ─── Le thème ───────────────────────────────────────────────────────────────

export type Theme = 'systeme' | 'clair' | 'sombre';
const CLE_THEME = 'luminose-theme';

export const lireTheme = (): Theme => {
  try {
    const t = localStorage.getItem(CLE_THEME);
    return t === 'clair' || t === 'sombre' ? t : 'systeme';
  } catch { return 'systeme'; }
};

/** Pose le thème sur `<html>` (`data-theme`) et le retient ; « système » suit la préférence de l'appareil. */
export const poserTheme = (t: Theme) => {
  const racine = document.documentElement;
  if (t === 'systeme') racine.removeAttribute('data-theme');
  else racine.setAttribute('data-theme', t === 'sombre' ? 'dark' : 'light');
  try { if (t === 'systeme') localStorage.removeItem(CLE_THEME); else localStorage.setItem(CLE_THEME, t); } catch { /* sans stockage, le thème vaut pour la page */ }
};
