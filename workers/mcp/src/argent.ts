/**
 * L'argent des créations — R3 (cadrage du 02/10/2026) et DG1 (cadrage du
 * 07/10/2026) : euros et micros, et l'ENGAGEMENT, ce que
 * coûterait par jour tout ce qui est actif ou en attente de validation, que le
 * budget soit quotidien ou total. Commun au Search et à Demand Gen : un même
 * plafond, un même calcul.
 */
import { aujourdhui, dateValide, equivalentQuotidien } from './dates';
import { MARQUE } from './regles';
import { lignes } from './outils-ecriture';
import type { Env } from './env';

export const euros = (micros: number) => (micros / 1_000_000).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

/** Au centime : Google refuse un montant en micros qui n'est pas un multiple de 10 000. */
export const enMicros = (montant: number) => Math.round(montant * 100) * 10_000;

type LigneBudget = {
  campaign?: { name?: string; status?: string; startDateTime?: string; endDateTime?: string };
  campaignBudget?: { resourceName?: string; amountMicros?: string; totalAmountMicros?: string; period?: string };
};

/**
 * Ce qu'un budget engage par jour. Quotidien : son montant. Total
 * (`CUSTOM_PERIOD`) : son équivalent quotidien sur les dates de la campagne —
 * zéro une fois sa fin passée, son total entier s'il n'a pas de fin, faute de
 * mieux. Lire `amount_micros` seul, comme avant le 07/10/2026, comptait un
 * budget total pour zéro : l'engagement était sous-estimé.
 */
const parJour = (l: LigneBudget, ce: string): number => {
  const b = l.campaignBudget ?? {};
  if (b.period !== 'CUSTOM_PERIOD') return Number(b.amountMicros ?? 0);
  const total = Number(b.totalAmountMicros ?? 0);
  const fin = l.campaign?.endDateTime?.slice(0, 10);
  if (!fin || !dateValide(fin)) return total;
  if (fin < ce) return 0;
  const debut = l.campaign?.startDateTime?.slice(0, 10);
  return equivalentQuotidien(total, debut && dateValide(debut) && debut <= fin ? debut : ce, fin);
};

/**
 * R3 — l'engagement : les budgets des campagnes actives et des campagnes
 * « [Claude] » en pause, en euros par jour. Un budget compte une fois, même
 * partagé. Une lecture.
 */
export const engagement = async (env: Env, compte: string): Promise<number> => {
  const ce = aujourdhui();
  const budgets = new Map<string, number>();
  for (const l of await lignes<LigneBudget>(env, compte,
    'SELECT campaign.name, campaign.status, campaign.start_date_time, campaign.end_date_time, campaign_budget.resource_name, ' +
    'campaign_budget.period, campaign_budget.amount_micros, campaign_budget.total_amount_micros ' +
    "FROM campaign WHERE campaign.status IN ('ENABLED', 'PAUSED')")) {
    const enJeu = l.campaign?.status === 'ENABLED' || l.campaign?.name?.startsWith(`${MARQUE} `);
    if (enJeu && l.campaignBudget?.resourceName) budgets.set(l.campaignBudget.resourceName, parJour(l, ce));
  }
  return [...budgets.values()].reduce((a, b) => a + b, 0);
};
