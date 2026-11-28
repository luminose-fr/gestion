/**
 * Durées, heures, délais et montants : UNE fonction par sorte, partout
 * (listes, résumés, champs, e-mails) — retours du 28/11/2026, §1.5
 * (docs/refonte/05-retours-28-novembre.md).
 *
 * - durée : `20 min`, `45 min` ; dès une heure, `1 h`, `1 h 15`, `2 h` —
 *   jamais `60 min`, `90 min` ni `1h30` ;
 * - heure : `9 h 30`, `13 h` dans le choix des créneaux (comme le site),
 *   `09:30` dans les listes et l'agenda ;
 * - délai stocké en heures : `72` → `3 jours`, `168` → `1 semaine`,
 *   `720` → `30 jours`, `12` → `12 heures`, `4392` → `6 mois` ;
 * - montant nul : `offert`, jamais `0 €`.
 */

export const duree = (minutes: number): string => {
  if (!Number.isFinite(minutes)) return '—';
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const reste = m % 60;
  return reste ? `${h} h ${String(reste).padStart(2, '0')}` : `${h} h`;
};

const PARIS = 'Europe/Paris';
const HEURE_LISTE = new Intl.DateTimeFormat('fr-FR', { timeZone: PARIS, hour: '2-digit', minute: '2-digit' });

/** `09:30`, l'heure d'une liste ou de l'agenda. */
export const heureListe = (iso: string | number): string => HEURE_LISTE.format(typeof iso === 'number' ? iso : Date.parse(iso));

/** `9 h 30`, `13 h` : l'heure d'un créneau à choisir, comme sur le site. */
export const heureCreneau = (iso: string | number): string => {
  const [h, m] = heureListe(iso).split(':');
  return m === '00' ? `${Number(h)} h` : `${Number(h)} h ${m}`;
};

/**
 * Un délai stocké en heures, dit dans l'unité qui se lit. `retenue` : une
 * semaine se dit `7 jours` (« retenue 7 jours »), pas `1 semaine`.
 */
export const delai = (heures: number, { retenue = false }: { retenue?: boolean } = {}): string => {
  if (!Number.isFinite(heures)) return '—';
  if (heures === 0) return 'aucun';
  if (heures < 24 || heures % 24 !== 0) {
    if (heures < 1) return `${Math.round(heures * 60)} min`;
    return `${heures.toLocaleString('fr-FR')} heure${heures > 1 ? 's' : ''}`;
  }
  const jours = heures / 24;
  if (jours % 365 === 0) return jours === 365 ? '1 an' : `${jours / 365} ans`;
  if (jours >= 28 && Math.abs(jours / 30.5 - Math.round(jours / 30.5)) < 0.05 && jours !== 30) {
    const mois = Math.round(jours / 30.5);
    return `${mois} mois`;
  }
  if (!retenue && jours % 7 === 0) return jours === 7 ? '1 semaine' : `${jours / 7} semaines`;
  return `${jours} jour${jours > 1 ? 's' : ''}`;
};

/** `80 €`, `80,50 €` ; zéro : `offert`. */
export const montant = (centimes: number | null | undefined): string => {
  if (centimes === null || centimes === undefined) return '—';
  if (centimes === 0) return 'offert';
  return (centimes / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: centimes % 100 ? 2 : 0 });
};
