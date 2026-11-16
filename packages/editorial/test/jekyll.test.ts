/**
 * L'article composé pour le site Jekyll.
 *
 * Ce que ces tests protègent : le fichier sort de l'application pour être posé
 * tel quel dans `_posts/` du dépôt luminose.fr. Une faute ici ne se voit pas à
 * l'écran — elle se voit au build du site, ou pire, en ligne. Le gabarit est
 * celui de `2026-07-05-stress-installation-electrique.html`, désigné comme
 * référence le 23/09/2026.
 */
import { describe, it, expect } from 'vitest';
import { composerArticleJekyll, slugifier, typographier, enBlocsHtml } from '../src/jekyll';
import { getFormatDef } from '../src/formats';
import { BREATHWORK } from '../src/config';

const ARTICLE = {
  format: 'Article',
  titre_h1: 'Le stress : visite guidée de votre installation électrique intérieure',
  slug: 'Stress installation électrique',
  categorie: 'stress',
  tag: 'exclusif',
  meta_description: 'Stress aigu, chronique ou post-traumatique ? Apprenez à distinguer les stress — et comment les travailler en thérapie.',
  resume: [
    '« Je suis stressé. » Tout le monde comprend, personne ne sait ce que ça veut dire.',
    'Petit tour du propriétaire de votre **installation électrique intérieure**.',
  ],
  introduction: '« Je suis stressé. » Vous l\'avez dit cette semaine.\n\nEt pourtant, personne ne sait ce que vous venez de dire.',
  sections: [
    { sous_titre_h2: 'Le courant normal : le stress qui vous garde en vie', contenu: 'Première surprise : le stress n\'est pas une panne.\n\nVoir l\'[anxiété](post:2023-01-26-troubles-anxieux-hypnose).' },
    { sous_titre_h2: 'La théorie polyvagale : que se passe-t-il dans le corps ?', contenu: 'Trois circuits :\n- **Le circuit ventral** : la maison habitée.\n- **Le circuit dorsal** : la coupure.' },
    { sous_titre_h2: 'On répare comment ?', contenu: 'On lit les plans, puis la [méditation](/meditation.html).' },
  ],
  conclusion: 'L\'ordre a son importance.',
  cta: {
    titre: 'Alors, c\'est quoi, votre stress ?',
    texte: 'Une surtension passagère ?\n\nJe vous propose un premier échange offert.',
    chute: 'Trouver la panne, c\'est déjà le début de la réparation.',
  },
  faq: [
    {
      question: 'Quelle est la différence entre stress aigu et stress chronique ?',
      reponse: 'Le stress aigu est une réaction brève à un danger ou à une exigence précise : le corps mobilise son énergie, puis revient au calme une fois la situation passée. Le stress chronique, lui, dure des semaines ou des mois sans retour au calme. C\'est cette absence de récupération, plus que l\'intensité, qui finit par user le corps et le moral.',
    },
    {
      question: 'Le stress est-il toujours mauvais ?',
      reponse: 'Non. Selye distinguait dès 1956 un stress qui mobilise et un stress qui épuise. Une dose de stress aide à se concentrer, à réagir vite, à donner le meilleur de soi face à un examen ou une échéance. Il devient un problème quand il ne redescend plus, ou quand il se déclenche sans danger réel.',
    },
    {
      question: 'Quand consulter pour du stress ?',
      reponse: 'Quand le stress ne redescend plus, qu\'il abîme le sommeil, l\'appétit ou les relations, ou qu\'il se déclenche sans raison apparente. Un premier rendez-vous avec votre médecin permet d\'écarter une cause physique. Un accompagnement en séance peut ensuite aider à comprendre ce qui entretient la tension et à retrouver un rythme plus vivable.',
    },
  ],
  references: ['Selye, H. (1956). *The Stress of Life*. McGraw-Hill.', 'Laborit, H. (1979). *L\'Inhibition de l\'action*. Masson.'],
  illustrations: [
    { emplacement: 'banniere', fichier: 'peu-importe', alt: 'Un tableau électrique', prompt: 'Nouvelle image indépendante… Format carré 1:1.' },
    { emplacement: 'apres_section_2', fichier: 'Trois Circuits', alt: 'Trois circuits', prompt: 'Trois circuits… Format 4:3.' },
  ],
  post_reseaux: {
    texte: '« Je suis stressé. » Tout le monde comprend. Personne ne sait ce que ça veut dire.',
    cta: 'L\'article fait le tour des quatre pannes. → https://www.luminose.fr/blog/xxx',
    hashtags: ['#stress', 'chargementale', '# thérapie'],
  },
};

const livrer = (data: any = ARTICLE) => composerArticleJekyll(data, { date: '2026-10-01' })!;

describe('le fichier', () => {
  it('porte le nom que Jekyll attend : date puis slug', () => {
    expect(livrer().fichier.nom).toBe('2026-10-01-stress-installation-electrique.html');
  });

  it('écrit le front matter de la fiche canal Blog, valeurs à deux-points entre guillemets', () => {
    const debut = livrer().fichier.contenu.split('\n').slice(0, 14).join('\n');
    expect(debut).toBe([
      '---',
      'layout: colonne',
      'title: "Le stress : visite guidée de votre installation électrique intérieure"',
      'image_name: stress-installation-electrique',
      'image: /images/blog/stress-installation-electrique.jpg',
      'section: blog',
      'category: stress',
      'tag: exclusif',
      'description: "Stress aigu, chronique ou post-traumatique ? Apprenez à distinguer les stress — et comment les travailler en thérapie."',
      'summary: |',
      '  <p>«&nbsp;Je suis stressé.&nbsp;» Tout le monde comprend, personne ne sait ce que ça veut dire.</p>',
      '  <p>Petit tour du propriétaire de votre <strong>installation électrique intérieure</strong>.</p>',
      '---',
      '',
    ].join('\n'));
  });

  it('échappe les guillemets du YAML', () => {
    const { contenu } = livrer({ ...ARTICLE, titre_h1: 'Le "vrai" stress' }).fichier;
    expect(contenu).toContain('title: "Le \\"vrai\\" stress"');
  });

  it('suit le gabarit de l’article de référence, dans l’ordre', () => {
    const { contenu } = livrer().fichier;
    const reperes = [
      '<section class="section article">',
      '  <div class="container">',
      '    <div class="content">',
      '      <h1>Le stress : visite guidée de votre installation électrique intérieure</h1>',
      '      {% include liens-partage.html %}',
      '      <div class="columns summary-container">',
      '          <span class="banner-image-container"><img class="banner" src="/images/blog/{{ page.image_name }}.jpg" srcset="/images/blog/{{ page.image_name }}.jpg, /images/blog/{{ page.image_name }}@2x.jpg 2x" alt="{{ page.title }}"></span>',
      '        <div class="column is-7 purple-border">',
      '            <h3>En résumé</h3>',
      '            {{ page.summary }}',
      '      <h2>Le courant normal : le stress qui vous garde en vie</h2>',
      '      <div class="highlight">',
      '        <h2 class="subtitle">Alors, c\'est quoi, votre stress&nbsp;?</h2>',
      '        <p><strong>Trouver la panne, c\'est déjà le début de la réparation.</strong></p>',
      '        <p class="has-text-centered">{% bouton_rendez_vous is-white %}</p>',
      '      <h2>Questions fréquentes</h2>',
      '      <h3>Quelle est la différence entre stress aigu et stress chronique&nbsp;?</h3>',
      '      <script type="application/ld+json">',
      '      </script>',
      '      <h2>Références pour aller plus loin</h2>',
      '      {% include liens-partage.html %}',
      '    {% include bandeaux/bandeau-auteur.html %}',
      '    {% include bandeaux/bandeau-temoignages.html %}',
      '    {% include bandeaux/bandeau-plus-loin-hypnose.html %}',
      '</section>',
    ];
    let depuis = 0;
    for (const repere of reperes) {
      const ou = contenu.indexOf(repere, depuis);
      expect(ou, `repère introuvable ou déplacé : ${repere}`).toBeGreaterThanOrEqual(0);
      depuis = ou + repere.length;
    }
  });

  it('place la conclusion à la fin de la dernière section, avant l’encadré', () => {
    const { contenu } = livrer().fichier;
    expect(contenu.indexOf('L\'ordre a son importance.')).toBeGreaterThan(contenu.indexOf('On répare comment'));
    expect(contenu.indexOf('L\'ordre a son importance.')).toBeLessThan(contenu.indexOf('<div class="highlight">'));
  });

  it('convertit les liens internes en post_url, et laisse les pages telles quelles', () => {
    const { contenu } = livrer().fichier;
    expect(contenu).toContain('<a href="{% post_url 2023-01-26-troubles-anxieux-hypnose %}">anxiété</a>');
    expect(contenu).toContain('<a href="/meditation.html">méditation</a>');
  });

  it('met les références en italique là où le modèle a mis des étoiles', () => {
    expect(livrer().fichier.contenu).toContain('<li>Selye, H. (1956). <em>The Stress of Life</em>. McGraw-Hill.</li>');
  });

  it('insère une illustration de corps après la section désignée', () => {
    const { contenu } = livrer().fichier;
    const image = contenu.indexOf('<p><img class="banner" src="/images/blog/trois-circuits.jpg"');
    expect(image).toBeGreaterThan(contenu.indexOf('La théorie polyvagale'));
    expect(image).toBeLessThan(contenu.indexOf('On répare comment'));
  });

  it('n’a aucun avertissement quand la grille est remplie', () => {
    expect(livrer().avertissements).toEqual([]);
  });
});

describe('ce qui rend l’article citable (16/11/2026)', () => {
  /** Le bloc FAQPage tel que le site le servira, relu comme un moteur le lirait. */
  const jsonLd = (contenu: string) => {
    const bloc = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(contenu);
    expect(bloc, 'bloc JSON-LD introuvable').not.toBeNull();
    return JSON.parse(bloc![1]);
  };

  it('déclare la FAQ en données structurées, en texte sans balisage', () => {
    const faq = jsonLd(livrer({
      ...ARTICLE,
      faq: [{ question: 'Le **stress** est-il utile ?', reponse: 'Oui, voir la [méditation](/meditation.html) et *Selye*.' }],
    }).fichier.contenu);
    expect(faq).toEqual({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: [{
        '@type': 'Question',
        name: 'Le stress est-il utile ?',
        acceptedAnswer: { '@type': 'Answer', text: 'Oui, voir la méditation et Selye.' },
      }],
    });
  });

  it('ne laisse passer ni une balise qui fermerait le script, ni du Liquid qui casserait le build', () => {
    const { contenu } = livrer({
      ...ARTICLE,
      faq: [{ question: 'Et </script> ?', reponse: 'Écrire {{ page.title }} ou {% include x %} reste du texte.' }],
    }).fichier;
    const bloc = contenu.slice(contenu.indexOf('<script type="application/ld+json">'));
    const json = bloc.slice(bloc.indexOf('>') + 1, bloc.indexOf('</script>'));
    expect(json).not.toMatch(/\{\{|\{%|<\/?script/);
    expect(jsonLd(contenu).mainEntity[0]).toMatchObject({
      name: 'Et </script> ?',
      acceptedAnswer: { text: 'Écrire {{ page.title }} ou {% include x %} reste du texte.' },
    });
  });

  it('place la FAQ après l’encadré final et avant les références', () => {
    const { contenu } = livrer().fichier;
    const faq = contenu.indexOf('<h2>Questions fréquentes</h2>');
    expect(faq).toBeGreaterThan(contenu.indexOf('{% bouton_rendez_vous is-white %}'));
    expect(faq).toBeLessThan(contenu.indexOf('<h2>Références pour aller plus loin</h2>'));
  });

  it('n’écrit ni section ni bloc quand l’article n’a pas de FAQ — et le dit', () => {
    const livrable = livrer({ ...ARTICLE, faq: [] });
    expect(livrable.fichier.contenu).not.toContain('Questions fréquentes');
    expect(livrable.fichier.contenu).not.toContain('application/ld+json');
    expect(livrable.avertissements.join(' ')).toContain('Pas de questions fréquentes');
  });

  it('signale une FAQ hors gabarit : trop courte, question sans « ? », réponse trop longue', () => {
    const longue = Array(120).fill('mot').join(' ');
    const { avertissements } = livrer({ ...ARTICLE, faq: [{ question: 'Une affirmation', reponse: longue }] });
    expect(avertissements).toEqual([
      '1 question(s) fréquente(s) — la grille en demande 3 à 5.',
      'Question fréquente n°1 sans point d’interrogation.',
      'Réponse n°1 : 120 mots — la grille en demande 40 à 80, pour qu’elle se cite seule.',
    ]);
  });

  it('signale des titres de section qui ne posent aucune question', () => {
    const sections = ARTICLE.sections.map((s, i) => ({ ...s, sous_titre_h2: `Le circuit n°${i + 1}` }));
    expect(livrer({ ...ARTICLE, sections }).avertissements).toContain('0 titre(s) de section en question — la grille en demande au moins deux.');
  });

  it('signale « hypnothérapeute » : l’hypnose est un outil, pas le titre de Florent', () => {
    const { avertissements } = livrer({ ...ARTICLE, conclusion: 'En tant qu’hypnothérapeute, je vois ça souvent.' });
    expect(avertissements.join(' ')).toContain('« hypnothérapeute » apparaît');
  });

  it('signale les mots de la guérison, pour relecture — mais pas « soignant »', () => {
    const { avertissements } = livrer({ ...ARTICLE, conclusion: 'L’hypnose guérit. La guérison vient. Parlez-en à un soignant.' });
    expect(avertissements).toContain('« guérit », « guérison » — à relire : aucun résultat ne doit être promis (cadre déontologique).');
  });

  it('signale le breathwork nommé sans sa forme exacte, et se tait quand elle y est', () => {
    const sans = livrer({ ...ARTICLE, conclusion: 'La respiration holotropique aussi.' });
    expect(sans.avertissements.join(' ')).toContain(`« ${BREATHWORK} » à la première mention`);
    const avec = livrer({ ...ARTICLE, conclusion: `Le ${BREATHWORK} aussi. La respiration holotropique, donc.` });
    expect(avec.avertissements).toEqual([]);
  });
});

describe('le balisage léger', () => {
  it('sépare la phrase d’introduction de la liste qui la suit', () => {
    expect(enBlocsHtml('Trois circuits :\n- **Le ventral** : habité.\n- Le dorsal', '')).toEqual([
      '<p>Trois circuits&nbsp;:</p>',
      '<ul>\n  <li><strong>Le ventral</strong>&nbsp;: habité.</li>\n  <li>Le dorsal</li>\n</ul>',
    ]);
  });

  it('échappe le HTML du texte mais tolère strong et em', () => {
    expect(enBlocsHtml('A < B & <strong>C</strong> <script>', '')).toEqual([
      '<p>A &lt; B &amp; <strong>C</strong> &lt;script&gt;</p>',
    ]);
  });

  it('ne garde que les liens sûrs : une cible javascript: retombe sur son libellé', () => {
    expect(enBlocsHtml('[clic](javascript:void) et [écrire](mailto:a@b.fr) et [site](https://x.fr)', '')).toEqual([
      '<p>clic et <a href="mailto:a@b.fr">écrire</a> et <a href="https://x.fr">site</a></p>',
    ]);
  });

  it('pose les insécables sans toucher aux entités ni aux URLs', () => {
    expect(typographier('Vraiment ? Oui : « non » ! https://x.fr/?a=1')).toBe('Vraiment&nbsp;? Oui&nbsp;: «&nbsp;non&nbsp;»&nbsp;! https://x.fr/?a=1');
    expect(typographier('déjà&nbsp;: posé')).toBe('déjà&nbsp;: posé');
  });

  it('fabrique des slugs sans accents ni ponctuation', () => {
    expect(slugifier('L\'Ombre : ce colocataire invisible !')).toBe('l-ombre-ce-colocataire-invisible');
  });
});

describe('les illustrations', () => {
  it('nomme toujours la bannière d’après le slug : c’est image_name', () => {
    const [banniere, corps] = livrer().illustrations;
    expect(banniere).toMatchObject({ apresSection: null, fichier: 'stress-installation-electrique' });
    expect(corps).toMatchObject({ apresSection: 2, fichier: 'trois-circuits' });
  });

  it('signale une bannière sans prompt', () => {
    const { avertissements } = livrer({ ...ARTICLE, illustrations: [] });
    expect(avertissements.join(' ')).toContain('/images/blog/stress-installation-electrique.jpg');
  });
});

describe('les posts d’accompagnement', () => {
  it('ajoute l’adresse exacte de l’article, et retire celle que le modèle aurait inventée', () => {
    const [facebook] = livrer().posts;
    expect(facebook.plateforme).toBe('Facebook · LinkedIn');
    expect(facebook.texte).toContain('L\'article fait le tour des quatre pannes.\n→ https://www.luminose.fr/blog/stress/stress-installation-electrique.html');
    expect(facebook.texte).not.toContain('blog/xxx');
  });

  it('renvoie au lien en bio sur Instagram, adresse en clair', () => {
    const instagram = livrer().posts[1];
    expect(instagram.texte).toContain('→ Lien en bio (luminose.fr/blog/stress/stress-installation-electrique.html)');
  });

  it('normalise les hashtags', () => {
    expect(livrer().posts[0].texte.endsWith('#stress #chargementale #thérapie')).toBe(true);
  });
});

describe('les articles rédigés avant cette grille', () => {
  const ANCIEN = {
    format: 'Article',
    titre_h1: 'L\'Ombre : ce colocataire invisible',
    introduction: 'Imaginez une maison.',
    sections: [{ sous_titre_h2: 'La cave', contenu: 'Tout ce qu\'on range.' }],
    conclusion: 'Ouvrez la porte.',
    cta: 'Prenez rendez-vous.',
  };

  it('livrent quand même un fichier, en disant ce qui manque', () => {
    const livrable = livrer(ANCIEN);
    expect(livrable.fichier.nom).toBe('2026-10-01-l-ombre-ce-colocataire-invisible.html');
    expect(livrable.fichier.contenu).toContain('category: a-completer');
    expect(livrable.avertissements.length).toBeGreaterThanOrEqual(4);
    expect(livrable.posts).toEqual([]);
  });

  it('ne livrent rien sans titre ni section', () => {
    expect(composerArticleJekyll({ format: 'Article', titre_h1: 'Seul' }, { date: '2026-10-01' })).toBeNull();
    expect(composerArticleJekyll(null, { date: '2026-10-01' })).toBeNull();
  });
});

describe('le registre', () => {
  it('sait que l’article se livre, et que le post court ne se livre pas', () => {
    expect(getFormatDef('Article')?.livrable).toBe(composerArticleJekyll);
    expect(getFormatDef('Post Texte')?.livrable).toBeUndefined();
  });
});
