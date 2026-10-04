/**
 * Toutes les requêtes GAQL que le serveur construit, lues dans le code source.
 *
 * Le 04/10/2026, ads_elements_creer et ads_elements_associer échouaient à tous
 * les aperçus : la lecture des éléments associés filtrait `campaign_asset` sur
 * `campaign.id` sans le sélectionner, et Google refuse
 * (queryError.EXPECTED_REFERENCED_FIELD_IN_SELECT_CLAUSE). Les tests passaient :
 * leurs simulateurs répondaient à la requête sans la juger. Celui-ci ne simule
 * rien — il lit src/, reconstruit chaque requête avec ses variantes (une branche
 * de condition, une constante du fichier), et vérifie la règle de test/gaql.ts
 * sur chacune. Une requête que l'analyse ne sait pas relire fait échouer le
 * test : elle ne passe pas en silence.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { horsSelect, lireGaql } from './gaql';

const SRC = join(import.meta.dirname, '..', 'src');
const INCONNU = '⟨?⟩';
const MAX_VARIANTES = 64;

type Requete = { ou: string; variantes: string[] };

const produit = (a: string[], b: string[]) => a.flatMap((x) => b.map((y) => x + y)).slice(0, MAX_VARIANTES);

/** Les noms qu'un paramètre lie, déstructuration comprise. */
const noms = (b: ts.BindingName): string[] => (ts.isIdentifier(b) ? [b.text]
  : b.elements.flatMap((e) => (ts.isOmittedExpression(e) ? [] : noms(e.name))));

/** La valeur d'une constante du même fichier, visible depuis ce nœud — ou rien (paramètre, import, autre). */
const resoudre = (id: ts.Identifier): ts.Expression | undefined => {
  for (let n: ts.Node | undefined = id.parent; n; n = n.parent) {
    if (ts.isFunctionLike(n) && n.parameters.some((p) => noms(p.name).includes(id.text))) return undefined;
    const instructions = ts.isSourceFile(n) || ts.isBlock(n) ? n.statements : undefined;
    for (const s of instructions ?? []) {
      if (!ts.isVariableStatement(s) || !(s.declarationList.flags & ts.NodeFlags.Const)) continue;
      const d = s.declarationList.declarations.find((x) => ts.isIdentifier(x.name) && x.name.text === id.text);
      if (d?.initializer) return d.initializer;
    }
  }
  return undefined;
};

/** Toutes les chaînes qu'une expression peut valoir ; ce qui ne se lit pas statiquement vaut INCONNU. */
const variantes = (n: ts.Node, profondeur = 0): string[] => {
  if (profondeur > 20) return [INCONNU];
  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return [n.text];
  if (ts.isParenthesizedExpression(n)) return variantes(n.expression, profondeur + 1);
  if (ts.isTemplateExpression(n)) {
    let acc = [n.head.text];
    for (const s of n.templateSpans) acc = produit(acc, variantes(s.expression, profondeur + 1)).map((x) => x + s.literal.text);
    return acc;
  }
  if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    return produit(variantes(n.left, profondeur + 1), variantes(n.right, profondeur + 1));
  }
  if (ts.isConditionalExpression(n)) return [...variantes(n.whenTrue, profondeur + 1), ...variantes(n.whenFalse, profondeur + 1)];
  if (ts.isIdentifier(n)) {
    const valeur = resoudre(n);
    return valeur ? variantes(valeur, profondeur + 1) : [INCONNU];
  }
  return [INCONNU];
};

const estChaine = (n: ts.Node): boolean =>
  ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateExpression(n) ||
  (ts.isParenthesizedExpression(n) && estChaine(n.expression)) ||
  (ts.isConditionalExpression(n) && estChaine(n.whenTrue) && estChaine(n.whenFalse)) ||
  (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.PlusToken && (estChaine(n.left) || estChaine(n.right)));

/**
 * Ce qui n'est pas une requête envoyée : les descriptions d'outils et leurs
 * `.describe()` — des exemples pour le modèle, qui passent par ads_requete —,
 * et le SQL de D1 (`.prepare()`).
 */
const horsChamp = (n: ts.Node): boolean =>
  (ts.isPropertyAssignment(n) && ts.isIdentifier(n.name) && n.name.text === 'description') ||
  (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && ['describe', 'prepare'].includes(n.expression.name.text));

/** Une chaîne qui a l'air d'une requête : elle doit appartenir à une requête reconnue. */
const ressembleARequete = (t: string) => !t.includes('ads_requete') && (/\bSELECT\s+[a-z_]+\./.test(t) || /\bFROM\s+[a-z_]+\s+WHERE\b/.test(t));

const analyser = (fichier: string) => {
  const source = ts.createSourceFile(fichier, readFileSync(join(SRC, fichier), 'utf8'), ts.ScriptTarget.Latest, true);
  const requetes: Requete[] = [];
  const etendues: [number, number][] = [];
  const fragments: { ou: string; pos: number; texte: string }[] = [];
  const ou = (n: ts.Node) => `${fichier}:${source.getLineAndCharacterOfPosition(n.getStart()).line + 1}`;

  const visiter = (n: ts.Node): void => {
    if (horsChamp(n)) return;
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) {
      if (ressembleARequete(n.text)) fragments.push({ ou: ou(n), pos: n.getStart(), texte: n.text });
    }
    if (estChaine(n)) {
      const v = variantes(n);
      // Une requête se lit entière, depuis l'expression la plus large : ses morceaux n'en sont pas.
      if (v.some((x) => x.trimStart().startsWith('SELECT '))) {
        requetes.push({ ou: ou(n), variantes: v });
        etendues.push([n.getStart(), n.getEnd()]);
        return;
      }
    }
    ts.forEachChild(n, visiter);
  };
  visiter(source);
  const orphelins = fragments.filter((f) => !etendues.some(([a, b]) => f.pos >= a && f.pos < b));
  return { requetes, orphelins };
};

const FICHIERS: string[] = readdirSync(SRC).filter((f: string) => f.endsWith('.ts'));
const analyses = FICHIERS.map(analyser);
const REQUETES = analyses.flatMap((a) => a.requetes);

describe('la règle : un champ du WHERE ou de l’ORDER BY figure dans le SELECT', () => {
  it('la lecture d’une requête', () => {
    // La requête de l'incident, telle quelle.
    const fautive = "SELECT asset.id, campaign_asset.field_type, campaign_asset.status FROM campaign_asset WHERE campaign.id = 24308326683 " +
      "AND campaign_asset.field_type IN ('SITELINK', 'CALLOUT', 'STRUCTURED_SNIPPET') AND campaign_asset.status != 'REMOVED'";
    expect(horsSelect(fautive)).toEqual(['campaign.id']);
    expect(horsSelect(fautive.replace('SELECT ', 'SELECT campaign.id, '))).toEqual([]);
    expect(horsSelect("SELECT ad_group.id FROM ad_group_asset WHERE ad_group.campaign = 'customers/1/campaigns/2'")).toEqual(['ad_group.campaign']);
    // Ce qui est entre guillemets est une valeur ; ORDER BY compte comme WHERE.
    expect(horsSelect("SELECT label.name FROM label WHERE label.name = 'a.b'")).toEqual([]);
    expect(horsSelect('SELECT campaign.id FROM campaign ORDER BY campaign.name LIMIT 5')).toEqual(['campaign.name']);
    expect(lireGaql('UPDATE x SET y = 1')).toBeNull();
  });
});

describe('NORMATIF — toutes les requêtes GAQL du serveur respectent la règle', () => {
  it('l’analyse les trouve toutes, dans chaque fichier qui en construit', () => {
    const fichiers = new Set(REQUETES.map((r) => r.ou.split(':')[0]));
    for (const f of ['ecriture.ts', 'google-ads.ts', 'outils.ts', 'outils-creation.ts', 'outils-ecriture.ts', 'outils-elements.ts', 'outils-listes.ts']) {
      expect(fichiers.has(f), f).toBe(true);
    }
    expect(REQUETES.length).toBeGreaterThanOrEqual(30);
    // Celle de l'incident, et ses deux voisines, avec leurs branches.
    const toutes = REQUETES.flatMap((r) => r.variantes);
    expect(toutes.some((v) => /FROM campaign_asset WHERE campaign\.id = /.test(v))).toBe(true);
    expect(toutes.some((v) => /FROM ad_group_asset WHERE ad_group\.campaign = /.test(v))).toBe(true);
    expect(toutes.some((v) => /FROM ad_group_asset WHERE ad_group\.id = /.test(v))).toBe(true);
  });

  it('aucune chaîne qui ressemble à une requête n’échappe à l’analyse', () => {
    expect(analyses.flatMap((a) => a.orphelins).map((o) => `${o.ou} : ${o.texte}`)).toEqual([]);
  });

  it('chaque variante se relit, avec un SELECT entièrement connu', () => {
    const illisibles = REQUETES.flatMap((r) => r.variantes
      .filter((v) => { const g = lireGaql(v); return !g || g.select.some((c) => c.includes(INCONNU) || !/^[a-z][a-z0-9_.]*$/.test(c)); })
      .map((v) => `${r.ou} : ${v}`));
    expect(illisibles).toEqual([]);
  });

  it('chaque champ du WHERE et de l’ORDER BY est dans le SELECT', () => {
    const fautes = REQUETES.flatMap((r) => r.variantes.flatMap((v) => horsSelect(v).map((champ) => `${r.ou} — ${champ} hors du SELECT : ${v}`)));
    expect(fautes).toEqual([]);
  });
});
