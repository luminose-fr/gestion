/**
 * Les dates d'une campagne — DG1 (cadrage du 07/10/2026). Sans dépendance :
 * l'outil s'en sert pour préparer, la table fermée pour revérifier.
 */

/** Le fuseau du compte Luminose : c'est lui qui borne les dates d'une campagne. */
const FUSEAU = 'Europe/Paris';

/** La date du jour dans le fuseau du compte, « AAAA-MM-JJ ». */
export const aujourdhui = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: FUSEAU, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now()));

/** Une date « AAAA-MM-JJ » qui existe au calendrier — « 2026-02-30 » n'en est pas une. */
export const dateValide = (d: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const t = new Date(`${d}T00:00:00Z`);
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d;
};

/** Le nombre de jours de `debut` à `fin`, l'un et l'autre compris. */
export const joursEntre = (debut: string, fin: string): number =>
  Math.round((Date.parse(`${fin}T00:00:00Z`) - Date.parse(`${debut}T00:00:00Z`)) / 86_400_000) + 1;

/**
 * DG1 — l'équivalent quotidien d'un budget total : le total réparti sur ses
 * jours, arrondi au centime supérieur. Au micro, 300,01 € sur trente jours
 * ferait 10,0003 € : refusé sous un plafond de 10 € par un message qui
 * afficherait « 10,00 € ».
 */
export const equivalentQuotidien = (totalMicros: number, debut: string, fin: string): number =>
  Math.ceil(totalMicros / (joursEntre(debut, fin) * 10_000)) * 10_000;

/** « 2026-10-10 » → « 10/10/2026 ». */
export const dateFr = (d: string): string => d.split('-').reverse().join('/');
