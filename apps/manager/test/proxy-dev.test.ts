/**
 * Le proxy de développement et l'origine qu'il présente au Worker.
 *
 * Pourquoi ce fichier existe : du 31/10 au 07/11/2026, la connexion locale
 * était cassée pour tout le monde — 403 « Origine refusée » — sans qu'aucun
 * test ne bronche. Le Worker vérifiait l'origine des écritures, et le proxy
 * de Vite lui transmettait celle de la page (:7860) sur une requête adressée
 * à :8787. Le Worker n'a pas à connaître l'origine de développement (SPEC
 * §1.2) : c'est le proxy qui traduit, et c'est ici qu'on le vérifie.
 *
 * Les cas de refus comptent autant que la traduction : un proxy qui
 * réécrirait toute origine rendrait la vérification du Worker aveugle en
 * local, pour n'importe quel site ouvert dans le même navigateur.
 */
import { describe, it, expect } from 'vitest';
import { origineVueParLeWorker } from '../proxy-dev';

const CIBLE = 'http://localhost:8787';

describe('origine présentée au Worker par le proxy de développement', () => {
  it('traduit la page servie par ce serveur Vite en origine du Worker', () => {
    expect(origineVueParLeWorker('http://localhost:7860', 'localhost:7860', CIBLE)).toBe('http://localhost:8787');
  });

  it('vaut aussi pour la page ouverte par l’adresse de la VM', () => {
    expect(origineVueParLeWorker('http://192.168.64.4:7860', '192.168.64.4:7860', 'http://localhost:8788'))
      .toBe('http://localhost:8788');
  });

  it('ne garde de la cible que son origine', () => {
    expect(origineVueParLeWorker('http://localhost:7860', 'localhost:7860', 'http://localhost:8787/un/chemin'))
      .toBe('http://localhost:8787');
  });

  it('laisse intacte une origine étrangère, pour que le Worker la refuse', () => {
    expect(origineVueParLeWorker('https://attaque.example', 'localhost:7860', CIBLE)).toBeUndefined();
  });

  it('laisse intacte une origine qui ne diffère que par le port', () => {
    expect(origineVueParLeWorker('http://localhost:5173', 'localhost:7860', CIBLE)).toBeUndefined();
  });

  it('n’invente pas d’origine quand le navigateur n’en envoie pas', () => {
    expect(origineVueParLeWorker(undefined, 'localhost:7860', CIBLE)).toBeUndefined();
  });

  it('laisse intacte une origine illisible ou opaque', () => {
    expect(origineVueParLeWorker('null', 'localhost:7860', CIBLE)).toBeUndefined();
    expect(origineVueParLeWorker('pas une url', 'localhost:7860', CIBLE)).toBeUndefined();
  });
});
