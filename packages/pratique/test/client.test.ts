/**
 * La clé d'un client, sur des identités fictives (SPEC §14.10).
 *
 * La clé attendue est écrite EN TOUTES LETTRES : un test qui la recalculerait
 * avec la fonction qu'il teste ne prouverait rien. Changer une de ces lignes,
 * c'est changer qui est « la même personne » — donc rattacher autrement les
 * réservations à venir. Cela se décide, et ne se corrige pas en passant.
 */
import { describe, it, expect } from 'vitest';
import { cleClient, nomRecherche, normaliserEmail, normaliserNom } from '../src';

const EMILIE = 'emilie.martin@example.org emilie martin';

describe('cleClient', () => {
  it.each([
    ['emilie.martin@example.org', 'Émilie', 'Martin', EMILIE],
    [' Emilie.Martin@Example.org ', 'émilie', 'martin', EMILIE],
    // Les deux cases inversées : la même personne.
    ['emilie.martin@example.org', 'MARTIN', 'Émilie', EMILIE],
    // Espaces en trop, et « É » en forme décomposée (E + accent combinant).
    ['emilie.martin@example.org', '  Émilie  ', '  Martin  ', EMILIE],
    // Un enfant a sa fiche avec l'adresse de sa mère : une AUTRE clé.
    ['emilie.martin@example.org', 'Léo', 'Martin', 'emilie.martin@example.org leo martin'],
    ['eve.dupont@example.org', 'Ève', 'Dupont-Lévêque', 'eve.dupont@example.org dupont eve leveque'],
    // Trait d'union insécable (U+2011).
    ['jeanluc.petit@example.org', 'Jean‑Luc', 'Petit', 'jeanluc.petit@example.org jean luc petit'],
    // Apostrophe typographique (U+2019).
    ['jp.lhote@example.org', 'Jean-Pierre', 'L’Hôte', 'jp.lhote@example.org hote jean l pierre'],
    ['oenone.roux@example.org', 'Œnone', 'Roux', 'oenone.roux@example.org oenone roux'],
  ])('%j, %j %j → %j', (email, prenom, nom, attendue) => {
    expect(cleClient(email, prenom, nom)).toBe(attendue);
  });

  it('sans adresse e-mail, pas de clé : une fiche sans adresse ne se rattache jamais d’elle-même', () => {
    expect(cleClient(null, 'Émilie', 'Martin')).toBeNull();
    expect(cleClient(undefined, 'Émilie', 'Martin')).toBeNull();
    expect(cleClient('', 'Émilie', 'Martin')).toBeNull();
    expect(cleClient('   ', 'Émilie', 'Martin')).toBeNull();
  });

  it('ne contient qu’une espace entre deux éléments, et aucune dans l’adresse', () => {
    const cle = cleClient(' a b@example.org ', ' Émilie  ', 'Martin')!;
    expect(cle).toBe('ab@example.org emilie martin');
    expect(cle.split(' ')[0]).toBe('ab@example.org');
  });
});

describe('normaliserEmail', () => {
  it('retire toute espace et passe en minuscules', () => {
    expect(normaliserEmail(' Emilie.Martin@Example.org ')).toBe('emilie.martin@example.org');
    expect(normaliserEmail('emilie .martin@example.org')).toBe('emilie.martin@example.org');
    expect(normaliserEmail(null)).toBe('');
  });
});

describe('normaliserNom', () => {
  it('retire les espaces aux bords et réduit les espaces multiples', () => {
    expect(normaliserNom('  Jean   Pierre  ')).toBe('Jean Pierre');
  });
  it('ramène l’apostrophe typographique et les traits d’union Unicode à leur forme simple', () => {
    expect(normaliserNom('L’Hôte')).toBe("L'Hôte");
    expect(normaliserNom('Jean‑Luc')).toBe('Jean-Luc');
    expect(normaliserNom('Jean‐Luc')).toBe('Jean-Luc');
  });
  it('conserve les accents et une casse voulue', () => {
    expect(normaliserNom('Dupont-Lévêque')).toBe('Dupont-Lévêque');
    expect(normaliserNom('de La Fontaine')).toBe('de La Fontaine');
  });
  it('recompose une lettre accentuée décomposée', () => {
    expect(normaliserNom('Émilie')).toBe('Émilie');
  });
  it('donne des initiales en capitale à un nom tout en minuscules ou tout en majuscules', () => {
    expect(normaliserNom('émilie')).toBe('Émilie');
    expect(normaliserNom('MARTIN')).toBe('Martin');
    expect(normaliserNom('JEAN-PIERRE')).toBe('Jean-Pierre');
    expect(normaliserNom('l’hôte')).toBe("L'Hôte");
    expect(normaliserNom('ŒNONE')).toBe('Œnone');
  });
  it('laisse vide ce qui est vide', () => {
    expect(normaliserNom('   ')).toBe('');
    expect(normaliserNom(null)).toBe('');
  });
});

describe('nomRecherche', () => {
  it('donne prénom et nom sans accents, en minuscules', () => {
    expect(nomRecherche('Émilie', 'Martin')).toBe('emilie martin');
    expect(nomRecherche('Ève', 'Dupont-Lévêque')).toBe('eve dupont-leveque');
    expect(nomRecherche('Œnone', 'Roux')).toBe('oenone roux');
    expect(nomRecherche(' Jean‑Luc ', ' PETIT ')).toBe('jean-luc petit');
  });
  it('ne laisse pas d’espace au bord quand une moitié manque', () => {
    expect(nomRecherche('Émilie', '')).toBe('emilie');
  });
});
