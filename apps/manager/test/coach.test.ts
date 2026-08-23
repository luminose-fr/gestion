/**
 * Lecture de la réponse du Coach.
 *
 * Le 23/08/2026, Claude Opus 5 via OpenRouter a rendu DEUX blocs JSON dans une
 * même réponse : une première tentative, la phrase « Correction — je dois
 * respecter le format de sortie », puis le bloc complet. L'extraction allait
 * du premier « { » au dernier « } », avalait la prose intercalaire, et
 * l'Atelier affichait le JSON brut à la place du message.
 *
 * Ce n'était pas un écart entre 1min.ai et OpenRouter : le même modèle aurait
 * produit le même écran chez l'un comme chez l'autre.
 */
import { describe, it, expect } from 'vitest';
import { parseCoachReply } from '../services/coachService';

const DOUBLE_BLOC = `{
  "message": "Le squelette tient : la métaphore est filée."
}

Correction — je dois respecter le format de sortie :

{
  "message": "Le squelette tient, et je touche à trois endroits seulement.",
  "quick_replies": [
    "La phrase qui revient, c'est plutôt : ...",
    "Oui pour le « moi aussi », garde-le",
    "Go, passe à l'Éditeur"
  ],
  "ready_for_editor": false
}`;

describe('réponse du Coach', () => {
  it('lit la DERNIÈRE version quand le modèle se corrige', () => {
    const reply = parseCoachReply(DOUBLE_BLOC);
    expect(reply.message).toBe('Le squelette tient, et je touche à trois endroits seulement.');
    expect(reply.quickReplies).toHaveLength(3);
    expect(reply.readyForEditor).toBe(false);
    // Le symptôme d'origine : le message ne doit jamais contenir le JSON.
    expect(reply.message).not.toContain('quick_replies');
  });

  it('lit une réponse ordinaire, avec ou sans balises markdown', () => {
    const nu = '{"message":"Direct","quick_replies":["Oui"],"ready_for_editor":true}';
    expect(parseCoachReply(nu).message).toBe('Direct');
    expect(parseCoachReply('```json\n' + nu + '\n```').readyForEditor).toBe(true);
  });

  it('ne se laisse pas tromper par une accolade DANS le message', () => {
    const avecAccolade = '{"message":"Le gabarit {titre} reste tel quel.","quick_replies":[],"ready_for_editor":false}';
    expect(parseCoachReply(avecAccolade).message).toBe('Le gabarit {titre} reste tel quel.');
  });

  it('retombe sur le texte brut quand rien ne parse — plutôt que rien du tout', () => {
    const casse = 'Je réfléchis à voix haute, sans JSON.';
    const reply = parseCoachReply(casse);
    expect(reply.message).toBe(casse);
    expect(reply.quickReplies).toEqual([]);
  });

  it('ignore un dernier bloc illisible et reprend le précédent', () => {
    const bancal = '{"message":"Version lisible","quick_replies":[],"ready_for_editor":false}\n\n{"message": "tronqué…';
    expect(parseCoachReply(bancal).message).toBe('Version lisible');
  });
});
