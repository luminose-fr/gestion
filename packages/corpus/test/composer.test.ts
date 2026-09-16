import { describe, expect, it } from 'vitest';
import { charger } from '../src/charger.ts';
import { composer, composerFeuille } from '../src/composer.ts';
import { empreinte } from '../src/hash.ts';
import { separerFrontmatter } from '../src/frontmatter.ts';
import { PROFILS } from '../src/profils.ts';
import type { Document } from '../src/types.ts';

const docs = charger();
const D = '2026-08-26';

describe('frontmatter', () => {
  it('lit les formes que le corpus emploie', () => {
    const { meta, corps } = separerFrontmatter(
      `---\ntype: decision\nnoyau: true\nreview_at: 2027-08\ntouche: [a/b, c]\nvide:\n---\n\n# Titre\n\ncorps`,
    );
    expect(meta.type).toBe('decision');
    expect(meta.noyau).toBe(true);
    expect(meta.review_at).toBe('2027-08');
    expect(meta.touche).toEqual(['a/b', 'c']);
    expect(meta.vide).toBeNull();
    expect(corps.startsWith('# Titre')).toBe(true);
  });

  it('ne casse pas sur un document sans frontmatter', () => {
    const { meta, corps } = separerFrontmatter('# Rien\n\ndu texte');
    expect(meta).toEqual({});
    expect(corps).toBe('# Rien\n\ndu texte');
  });
});

describe('le corpus se charge', () => {
  it('trouve des documents et aucun README', () => {
    expect(docs.length).toBeGreaterThan(15);
    expect(docs.some((d) => d.chemin.endsWith('README'))).toBe(false);
  });
});

describe('la règle de lecture du bloc stratégie — NORMATIF', () => {
  /**
   * Le journal des décisions sur-représente les échecs par construction : un
   * arrêt produit une fiche datée, le fonctionnement normal n'en produit
   * aucune. La règle qui met le lecteur en garde a longtemps vécu dans
   * `strategie/README.md` — que `charger()` ignore. Elle ne protégeait donc
   * personne.
   *
   * Elle est maintenant une fiche, et sa PLACE compte : la composition ordonne
   * par chemin, et une mise en garde qui arrive après les trois fiches d'arrêt
   * qu'elle encadre a déjà échoué. Le nom du fichier est ce qui la tient en
   * tête — un renommage « plus descriptif » la ferait glisser en silence.
   */
  const strategie = composer(docs, 'strategie', D);

  it('la fiche existe et ouvre le profil', () => {
    expect(strategie.documents[0]).toBe('strategie/a-lire-d-abord');
  });

  it('elle précède la première décision', () => {
    const garde = strategie.documents.indexOf('strategie/a-lire-d-abord');
    const premiereDecision = strategie.documents.findIndex((c) =>
      c.startsWith('strategie/decisions/'),
    );
    expect(premiereDecision).toBeGreaterThan(garde);
  });

  it('elle nomme son contrepoids, qui vit dans un autre profil', () => {
    const fiche = docs.find((d) => d.chemin === 'strategie/a-lire-d-abord');
    expect(fiche?.corps).toContain('socle/ce-qui-fonctionne');
    expect(docs.some((d) => d.chemin === 'socle/ce-qui-fonctionne')).toBe(true);
    expect(strategie.documents).not.toContain('socle/ce-qui-fonctionne');
  });
});

describe('l’en-tête ne doit pas verrouiller Florent — NORMATIF', () => {
  /**
   * CE QUE CE TEST EMPÊCHE, ET POURQUOI IL EXISTE.
   *
   * Le 16/09/2026, Florent a voulu réfléchir avec un Gem à d'autres intitulés
   * que « psychopraticien transpersonnel ». Le Gem a refusé : il citait la
   * hiérarchie de l'en-tête — « Identité » en priorité 2, « demande
   * ponctuelle » en priorité 7 — et en concluait que la demande de Florent
   * perdait contre le corpus. Même après « je définis le cadre de Luminose
   * puisque je suis Florent Jaouali », il n'a pas cédé.
   *
   * Il lisait correctement ce qui était écrit. Deux confusions, dans le texte :
   *   - la hiérarchie arbitrait « les règles entre elles » mais ne le disait
   *     pas, et se lisait donc comme arbitrant la conversation ;
   *   - le corpus ne disait nulle part QUI l'écrit, donc rien ne distinguait
   *     un inconnu qui contourne le cadre de l'auteur qui le révise.
   *
   * Un corpus qui empêche son auteur de le rouvrir est une prison, pas une
   * source de vérité.
   */
  const entetes = (['noyau', 'complet', 'strategie'] as const).map(
    (p) => composer(docs, p, D).texte.split('---\n\n\n')[0],
  );

  it('dit qu’il ne fait pas autorité sur la conversation', () => {
    for (const e of entetes) {
      expect(e).toMatch(/ne fait PAS autorité sur la conversation/);
    }
  });

  it('nomme Florent comme auteur, pas comme destinataire de la règle', () => {
    for (const e of entetes) {
      expect(e).toContain('Florent Jaouali');
      expect(e).toMatch(/il en est l’auteur|Florent en est l'auteur/i);
    }
  });

  it('borne la hiérarchie aux règles, pas aux demandes', () => {
    for (const e of entetes) {
      expect(e).toContain("À L'INTÉRIEUR D'UN CONTENU");
      // Le mot qui a fait basculer la lecture : « demande ponctuelle » se lisait
      // comme « la demande de Florent ».
      expect(e).not.toMatch(/\d\.\s*Demande ponctuelle/);
      expect(e).toContain('La consigne ponctuelle de rédaction');
    }
  });

  it('garde le garde-fou : une intention dite n’est pas encore un fait', () => {
    for (const e of entetes) {
      expect(e).toMatch(/ne devient vraie que dans la fiche/);
    }
  });

  it('la feuille de salle porte la même réserve', () => {
    const f = composerFeuille(docs, ['socle/identite'], D);
    expect(f.texte).toMatch(/ne fait pas autorité sur Florent/);
  });
});

describe('le hash', () => {
  it('ne dépend pas de la date — sinon « périmé » ne voudrait rien dire', () => {
    const a = composer(docs, 'complet', '2026-08-26');
    const b = composer(docs, 'complet', '2027-01-01');
    expect(a.hash).toBe(b.hash);
    expect(a.texte).not.toBe(b.texte);
  });

  it('change quand le contenu change', () => {
    const modifie: Document[] = docs.map((d, i) =>
      i === 0 ? { ...d, corps: d.corps + '\nune ligne de plus' } : d,
    );
    expect(composer(modifie, 'complet', D).hash).not.toBe(
      composer(docs, 'complet', D).hash,
    );
  });

  /**
   * NORMATIF — le hash répond à « ce que je collerais a-t-il changé ? ».
   *
   * Il ne portait que sur le corps : une réécriture de l'en-tête changeait le
   * texte des trois packs sans bouger un seul hash, et l'écran d'état aurait
   * annoncé « à jour » des surfaces portant l'ancienne consigne. C'est arrivé
   * le 16/09/2026, sur la consigne qui verrouillait Florent — la pire à
   * laisser traîner.
   */
  it('couvre aussi l’en-tête, pas seulement le corps — NORMATIF', () => {
    const c = composer(docs, 'complet', D);
    const corpsSeul = c.texte.slice(c.texte.indexOf('---\n\n\n') + 6);
    expect(empreinte(corpsSeul)).not.toBe(c.hash);
  });

  it('est propre à chaque profil', () => {
    const h = new Set(
      (['noyau', 'complet', 'strategie'] as const).map(
        (p) => composer(docs, p, D).hash,
      ),
    );
    expect(h.size).toBe(3);
  });
});

describe('les frontières entre profils — NORMATIF', () => {
  it('« strategie » n\'entre JAMAIS dans le profil complet', () => {
    const c = composer(docs, 'complet', D);
    expect(c.documents.every((p) => !p.startsWith('strategie/'))).toBe(true);
  });

  it('l\'inbox n\'entre dans aucun profil', () => {
    for (const p of ['noyau', 'complet', 'strategie'] as const) {
      expect(composer(docs, p, D).documents).not.toContain('inbox');
    }
  });

  it('un document « candidat » reste hors du profil complet', () => {
    const candidats = docs
      .filter((d) => d.meta.statut === 'candidat')
      .map((d) => d.chemin);
    const c = composer(docs, 'complet', D);
    for (const p of candidats) expect(c.documents).not.toContain(p);
  });

  it('le noyau tient sous le plafond d\'un champ d\'instructions', () => {
    const c = composer(docs, 'noyau', D);
    expect(c.documents.length).toBeGreaterThan(0);
    expect(c.taille).toBeLessThanOrEqual(PROFILS.noyau.plafond!);
  });
});

describe('le garde-fou des offres — NORMATIF', () => {
  it('marque « NE PAS PROPOSER » toute offre non active, dans les trois profils', () => {
    const arretees = docs.filter(
      (d) =>
        d.chemin.startsWith('socle/offres/') &&
        ['suspendu', 'termine', 'candidat'].includes(d.meta.statut as string),
    );
    expect(arretees.length).toBeGreaterThan(0);

    for (const p of ['noyau', 'complet', 'strategie'] as const) {
      const t = composer(docs, p, D).texte;
      expect(t).toContain('NE PAS PROPOSER');
      expect(t).toContain('RÈGLE ABSOLUE');
    }
  });

  it('Le Seuil est présent dans le tableau et marqué comme non proposable', () => {
    const t = composer(docs, 'complet', D).texte;
    const ligne = t.split('\n').find((l) => l.includes('Le Seuil') && l.includes('|'));
    expect(ligne).toBeDefined();
    expect(ligne).toContain('suspendu');
    expect(ligne).toContain('NE PAS PROPOSER');
  });
});

/**
 * La feuille de salle — ce que reçoit un rôle du flux éditorial.
 *
 * Les deux premiers tests sont NORMATIFS : ils gardent des décisions, pas des
 * détails d'implémentation. Un rôle qui se met à recevoir quelque chose alors
 * qu'il ne devait rien recevoir est une régression silencieuse — le prompt ne
 * plante pas, il devient seulement un peu moins bon.
 */
describe('la feuille de salle', () => {
  it('« ne reçoit rien » rend une feuille VIDE — NORMATIF', () => {
    for (const rien of [null, []]) {
      const f = composerFeuille(docs, rien, D);
      expect(f.texte).toBe('');
      expect(f.hash).toBe('');
      expect(f.documents).toEqual([]);
    }
  });

  it('sélectionne par préfixe de chemin, pas seulement par bloc', () => {
    const offres = composerFeuille(docs, ['socle/offres'], D);
    expect(offres.documents.length).toBeGreaterThan(3);
    expect(offres.documents.every((p) => p.startsWith('socle/offres/'))).toBe(true);
    // Le socle entier en contient strictement plus.
    expect(composerFeuille(docs, ['socle'], D).documents.length)
      .toBeGreaterThan(offres.documents.length);
  });

  it('porte le garde-fou des offres même quand elle ne sert que la voix — NORMATIF', () => {
    const f = composerFeuille(docs, ['voix'], D);
    expect(f.texte).toContain('NE PAS PROPOSER');
    expect(f.texte).toContain('Le Seuil');
  });

  it('écarte les documents « candidat »', () => {
    const f = composerFeuille(docs, ['strategie'], D);
    const candidats = docs.filter((d) => d.meta.statut === 'candidat').map((d) => d.chemin);
    for (const c of candidats) expect(f.documents).not.toContain(c);
  });

  it('son hash ne dépend pas de la date', () => {
    expect(composerFeuille(docs, ['socle'], '2026-08-26').hash)
      .toBe(composerFeuille(docs, ['socle'], '2027-03-01').hash);
  });
});
