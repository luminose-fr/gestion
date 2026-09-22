/**
 * @vitest-environment jsdom
 *
 * Le socle visuel, monté et lu.
 *
 * Ce que ces tests protègent : la dérive. Les valeurs de l'échelle sont écrites
 * ici en clair, une fois ; si un bouton reprend un padding à lui, c'est ce
 * fichier qui le dit. `Champ` a un retour anticipé (sans étiquette ni aide, il
 * rend le seul contrôle) : il est monté dans les deux états, comme l'exige
 * CLAUDE.md.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import React from 'react';

import { Bouton, Carte, Champ, Etiquette, TitreSection, GABARITS, GOUTTIERE, ecran } from '../components/ui';

afterEach(cleanup);

const boutons = (c: HTMLElement) => Array.from(c.querySelectorAll('button')).map(b => b.className);

describe('Bouton', () => {
  it('a deux tailles, et chacune impose sa taille d\'icône', () => {
    const { container } = render(
      <>
        <Bouton taille="petit">Petit</Bouton>
        <Bouton taille="normal">Normal</Bouton>
      </>,
    );
    const [petit, normal] = boutons(container);
    expect(petit).toContain('px-2.5 py-1.5 text-xs [&_svg]:size-3.5');
    expect(normal).toContain('px-3 py-2 text-sm [&_svg]:size-4');
  });

  it('a toujours le rayon du bouton, jamais rounded-full', () => {
    const { container } = render(<Bouton intention="principale">Publier</Bouton>);
    const [classe] = boutons(container);
    expect(classe).toContain('rounded-lg');
    expect(classe).not.toContain('rounded-full');
  });

  it("n'a pas d'ombre, sauf demande explicite", () => {
    const { container } = render(
      <>
        <Bouton>Sans</Bouton>
        <Bouton posee>Avec</Bouton>
      </>,
    );
    const [sans, avec] = boutons(container);
    expect(sans).not.toContain('shadow');
    expect(avec).toContain('shadow-xs');
  });

  it('laisse le type du bouton au natif — le comportement ne bouge pas', () => {
    const { container } = render(<Bouton>Envoyer</Bouton>);
    expect(container.querySelector('button')!.getAttribute('type')).toBeNull();
  });

  /*
    Une bordure dans chaque intention, sinon les hauteurs divergent ; et une
    seule couleur de bordure par bouton, parce que deux se départageraient
    dans l'ordre de la feuille générée et non dans celui de l'attribut.
  */
  it('porte exactement une couleur de bordure, quelle que soit l\'intention', () => {
    const { container } = render(
      <>
        <Bouton intention="principale">Principale</Bouton>
        <Bouton intention="secondaire">Secondaire</Bouton>
        <Bouton intention="discrete">Discrète</Bouton>
      </>,
    );
    for (const classe of boutons(container)) {
      expect(classe.split(/\s+/)).toContain('border');
      const couleurs = classe
        .split(/\s+/)
        .filter(c => /^border-(?!\d)(?!x-|y-|t-|r-|b-|l-)/.test(c));
      expect(couleurs.length).toBe(1);
    }
  });
});

describe('Bouton — tons de sens', () => {
  const INTENTIONS = ['principale', 'secondaire', 'discrete'] as const;
  const TONS = ['succes', 'alerte', 'erreur'] as const;

  it('passe par les tokens, sans couleur brute', () => {
    for (const ton of TONS) {
      const { container, unmount } = render(
        <>{INTENTIONS.map(i => <Bouton key={i} intention={i} ton={ton}>{i}</Bouton>)}</>,
      );
      for (const classe of boutons(container)) {
        expect(classe).toContain(ton);
        expect(classe).not.toMatch(/green-|emerald-|amber-|red-/);
      }
      unmount();
    }
  });

  it('garde son texte lisible au survol en sombre', () => {
    const { container } = render(<Bouton intention="principale">Publier</Bouton>);
    expect(boutons(container)[0]).toContain('dark:hover:bg-brand-light');
  });

  it('reste lisible en sombre quand il est plein', () => {
    const { container } = render(
      <>{TONS.map(ton => <Bouton key={ton} intention="principale" ton={ton}>{ton}</Bouton>)}</>,
    );
    for (const classe of boutons(container)) {
      expect(classe).toContain('text-white dark:text-dark-bg');
    }
  });

  it('garde une seule couleur de bordure par bouton', () => {
    for (const ton of TONS) {
      const { container, unmount } = render(
        <>{INTENTIONS.map(i => <Bouton key={i} intention={i} ton={ton}>{i}</Bouton>)}</>,
      );
      for (const classe of boutons(container)) {
        const couleurs = classe
          .split(/\s+/)
          .filter(c => /^border-(?!\d)(?!x-|y-|t-|r-|b-|l-)/.test(c));
        expect(couleurs.length).toBe(1);
      }
      unmount();
    }
  });
});

describe('Carte', () => {
  it('a une seule convention de bordure et un seul rayon', () => {
    const { container } = render(<Carte>Contenu</Carte>);
    const classe = (container.firstChild as HTMLElement).className;
    expect(classe).toContain('border-brand-border dark:border-dark-sec-border');
    expect(classe).toContain('rounded-xl');
    expect(classe).not.toContain('border-brand-light');
    expect(classe).not.toContain('dark:border-dark-sec-bg');
  });

  it('a trois densités, plus le tableau qui n\'en a pas', () => {
    const { container } = render(
      <>
        <Carte densite="liste" />
        <Carte densite="contenu" />
        <Carte densite="seule" />
        <Carte densite="tableau" />
      </>,
    );
    const classes = Array.from(container.children).map(c => (c as HTMLElement).className);
    expect(classes[0]).toContain('p-4');
    expect(classes[1]).toContain('p-5');
    expect(classes[2]).toContain('p-6');
    expect(classes[3]).not.toMatch(/\bp-\d/);
    expect(classes[3]).toContain('overflow-hidden');
  });
});

describe('Champ', () => {
  it('rend le seul contrôle quand il n\'a ni étiquette ni aide', () => {
    const { container } = render(<Champ placeholder="Titre" />);
    expect((container.firstChild as HTMLElement).tagName).toBe('INPUT');
  });

  it('rend étiquette, contrôle et aide quand on les lui donne', () => {
    const { container, getByText } = render(
      <Champ id="titre" label="Titre" aide="Visible dans la liste" />,
    );
    expect(container.querySelector('label')!.getAttribute('for')).toBe('titre');
    expect(container.querySelector('input')).not.toBeNull();
    expect(getByText('Visible dans la liste').className).toContain('text-xs');
  });

  it('passe en zone de texte sur demande', () => {
    const { container } = render(<Champ multiligne rows={3} />);
    expect(container.querySelector('textarea')!.rows).toBe(3);
  });

  it('transmet sa référence au contrôle — le focus à l\'ouverture en dépend', () => {
    const ref = React.createRef<HTMLInputElement>();
    render(<Champ ref={ref} placeholder="Titre" />);
    expect(ref.current?.tagName).toBe('INPUT');
    const refEtiquete = React.createRef<HTMLInputElement>();
    render(<Champ ref={refEtiquete} id="t" label="Titre" />);
    expect(refEtiquete.current?.tagName).toBe('INPUT');
  });

  it('aligne sa hauteur sur celle du bouton normal', () => {
    const { container } = render(<Champ />);
    expect(container.querySelector('input')!.className).toContain('px-3 py-2');
  });
});

describe('Etiquette', () => {
  it('ne connaît qu\'une taille', () => {
    const { container } = render(
      <>
        <Etiquette>Section</Etiquette>
        <Etiquette forme="pastille">12</Etiquette>
      </>,
    );
    const classes = Array.from(container.children).map(c => (c as HTMLElement).className);
    expect(classes.every(c => c.includes('text-micro'))).toBe(true);
    expect(classes[1]).toContain('rounded-full');
  });

  it('porte les sens par les tokens, sans couleur brute ni dark:', () => {
    const { container } = render(
      <>
        <Etiquette forme="pastille" ton="succes">Valide</Etiquette>
        <Etiquette forme="pastille" ton="alerte">Trop lisse</Etiquette>
        <Etiquette forme="pastille" ton="erreur">À revoir</Etiquette>
      </>,
    );
    const classes = Array.from(container.children).map(c => (c as HTMLElement).className);
    expect(classes[0]).toContain('bg-succes/10 text-succes');
    expect(classes[1]).toContain('bg-alerte/10 text-alerte');
    expect(classes[2]).toContain('bg-erreur/10 text-erreur');
    for (const c of classes) {
      expect(c).not.toMatch(/green-|emerald-|amber-|red-|dark:/);
    }
  });

  it('réserve les capitales au sur-titre', () => {
    const { container } = render(
      <>
        <Etiquette>Section</Etiquette>
        <Etiquette forme="pastille">Script vidéo YouTube</Etiquette>
      </>,
    );
    const [surtitre, pastille] = Array.from(container.children).map(c => (c as HTMLElement).className);
    expect(surtitre).toContain('uppercase');
    expect(pastille).not.toContain('uppercase');
  });
});

describe('TitreSection', () => {
  it('titre en text-lg, sous-titre en text-xs', () => {
    const { getByText } = render(
      <TitreSection titre="Documents" sousTitre="Le socle du corpus" action={<Bouton>Ajouter</Bouton>} />,
    );
    expect(getByText('Documents').className).toContain('text-lg');
    expect(getByText('Le socle du corpus').className).toContain('text-xs');
    expect(getByText('Ajouter').tagName).toBe('BUTTON');
  });
});

describe('Gabarits', () => {
  it('deux largeurs, toujours centrées', () => {
    expect(Object.values(GABARITS)).toEqual(['max-w-6xl mx-auto', 'max-w-3xl mx-auto']);
    expect(GOUTTIERE).toBe('px-4 md:px-6 py-5');
    expect(ecran('travail')).toBe('px-4 md:px-6 py-5 max-w-3xl mx-auto');
  });
});
