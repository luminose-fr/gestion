/**
 * L'environnement de test lui-même, pris comme un objet de test.
 *
 * Pourquoi ce fichier existe : le 01/09/2026, dix-huit tests sans rapport avec
 * le stockage ont échoué sur « localStorage.setItem is not a function ». La
 * cause était que Node 25 expose son propre `localStorage` global, lequel
 * masque celui de jsdom. Le correctif tient en un drapeau posé dans la config
 * vitest — mais la première tentative l'avait placé sous `poolOptions`,
 * supprimé dans Vitest 4, et Vitest s'est contenté d'un avertissement de
 * dépréciation : la configuration paraissait bonne et n'agissait pas.
 *
 * Ce test vérifie donc le CÂBLAGE, pas la fonctionnalité. Le jour où Vitest
 * renommera l'option, où Node retirera le drapeau, ou où quelqu'un nettoiera
 * la config sans savoir, c'est cette ligne-ci qui tombera — et elle dira
 * pourquoi, au lieu de laisser dix-huit tests étrangers échouer en chœur.
 */
import { describe, it, expect } from 'vitest';

describe('environnement de test', () => {
  it('neutralise le Web Storage natif de Node — NORMATIF', () => {
    expect(process.execArgv).toContain('--no-experimental-webstorage');
  });
});
