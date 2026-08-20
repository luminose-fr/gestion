#!/usr/bin/env node
/**
 * SPEC §9.3 (NORMATIF) — vérification de la migration.
 *
 * « La migration n'est pas terminée quand le SQL passe. Elle est terminée
 * quand un script a comparé, pour chaque ligne et chaque champ, la valeur
 * Notion et la valeur D1, et affiché zéro écart. »
 *
 * Deux familles de contrôles, volontairement distinctes :
 *
 *   1. COMPARAISON DIRECTE — les champs lus tels quels dans l'export (titre,
 *      statut, plateformes, notes…). Aucune logique partagée avec l'import :
 *      si l'import se trompe, la comparaison le voit.
 *
 *   2. INVARIANTS — sur les champs dérivés (brouillon nettoyé, journal,
 *      messages), où recomparer supposerait de refaire le même calcul. On
 *      vérifie alors des propriétés que la migration DOIT garantir : plus
 *      aucune signature dans le contenu, tout JSON reste du JSON, rien perdu.
 *
 * Usage :
 *   node tools/import-notion/verify.mjs --sqlite <fichier.db>   # local
 *   node tools/import-notion/verify.mjs --remote                # via wrangler
 */

import { readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FIXTURES = join(ROOT, "fixtures");

// ─── Accès à la base ────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const sqliteFile = args.includes("--sqlite") ? args[args.indexOf("--sqlite") + 1] : null;
const remote = args.includes("--remote");

if (!sqliteFile && !remote) {
  console.error("Usage : verify.mjs --sqlite <fichier.db>  |  verify.mjs --remote");
  process.exit(1);
}

const query = (sql) => {
  if (sqliteFile) {
    const out = execFileSync("sqlite3", [sqliteFile, "-json", sql], { encoding: "utf8", maxBuffer: 1 << 28 });
    return out.trim() ? JSON.parse(out) : [];
  }
  const out = execFileSync(
    "npx",
    ["wrangler", "d1", "execute", "DB", "--remote", "--json", "--command", sql],
    { cwd: join(ROOT, "workers", "api"), encoding: "utf8", maxBuffer: 1 << 28 }
  );
  // wrangler préfixe parfois la sortie de bannières : on isole le JSON
  const start = out.indexOf("[");
  const parsed = JSON.parse(out.slice(start));
  return parsed[0]?.results ?? [];
};

// ─── Source ─────────────────────────────────────────────────────────────────

const files = readdirSync(FIXTURES).filter((f) => /^notion-export-.*\.json$/.test(f)).sort();
const exportFile = join(FIXTURES, files[files.length - 1]);
const data = JSON.parse(readFileSync(exportFile, "utf8"));

const plain = (prop) => {
  if (!prop) return "";
  const t = prop.type;
  if (t === "title" || t === "rich_text") return (prop[t] || []).map((x) => x.plain_text).join("");
  if (t === "select") return prop.select?.name ?? "";
  if (t === "multi_select") return (prop.multi_select || []).map((o) => o.name);
  if (t === "checkbox") return prop.checkbox === true;
  if (t === "date") return prop.date?.start ?? null;
  return "";
};

// ─── Rapport ────────────────────────────────────────────────────────────────

const issues = [];
const fail = (id, field, expected, actual) =>
  issues.push({ id, field, expected: String(expected).slice(0, 90), actual: String(actual).slice(0, 90) });

let checks = 0;
const check = (cond, id, field, expected, actual) => {
  checks++;
  if (!cond) fail(id, field, expected, actual);
};

// ─── 1. Comparaison directe, champ par champ ────────────────────────────────

const rows = query("SELECT * FROM contents");
const byId = new Map(rows.map((r) => [r.id, r]));

console.log(`\n▸ Vérification — ${data.databases.content.pages.length} contenus attendus, ${rows.length} en base\n`);

for (const page of data.databases.content.pages) {
  const p = page.properties;
  const row = byId.get(page.id);
  if (!row) {
    fail(page.id, "(ligne)", "présente", "ABSENTE");
    continue;
  }

  const id = page.id;
  check(row.title === plain(p["Titre"]), id, "title", plain(p["Titre"]), row.title);
  check(row.status === (plain(p["Statut"]) || "Idée"), id, "status", plain(p["Statut"]), row.status);
  check(row.notes === plain(p["Notes"]), id, "notes", "(texte)", "(différent)");
  check((row.target_format ?? "") === plain(p["Format cible"]), id, "target_format", plain(p["Format cible"]), row.target_format);
  check((row.objectif ?? "") === plain(p["Objectif"]), id, "objectif", plain(p["Objectif"]), row.objectif);
  check((row.depth ?? "") === plain(p["Profondeur"]), id, "depth", plain(p["Profondeur"]), row.depth);
  check((row.verdict ?? "") === plain(p["Verdict"]), id, "verdict", plain(p["Verdict"]), row.verdict);
  check((row.justification ?? "") === plain(p["Justification"]), id, "justification", "(texte)", "(différent)");
  check((row.suggested_metaphor ?? "") === plain(p["Métaphore Suggérée"]), id, "suggested_metaphor", "(texte)", "(différent)");
  check((row.scheduled_date ?? null) === plain(p["Date de publication"]), id, "scheduled_date", plain(p["Date de publication"]), row.scheduled_date);

  const platforms = plain(p["Plateforme"]);
  check(
    JSON.stringify(Array.isArray(platforms) ? platforms : []) === row.platforms,
    id, "platforms", JSON.stringify(platforms), row.platforms
  );

  // Le booléen « Analysé » devient une date (SPEC §2.8)
  check(
    (plain(p["Analysé"]) === true) === (row.analyzed_at !== null),
    id, "analyzed_at", plain(p["Analysé"]), row.analyzed_at
  );

  check(row.created_at === new Date(page.created_time).getTime(), id, "created_at", page.created_time, row.created_at);
  check(row.updated_at === new Date(page.last_edited_time).getTime(), id, "updated_at", page.last_edited_time, row.updated_at);
  check(row.deleted_at === null, id, "deleted_at", "NULL", row.deleted_at);
}

// ─── 2. Invariants sur les champs dérivés ───────────────────────────────────

const SIGNATURE = /(Généré|Ajusté|Relu) par\s*:/;

for (const row of rows) {
  const id = row.id;

  // Plus AUCUNE signature dans les colonnes de contenu : elles vivent
  // désormais dans le journal (SPEC §2.6).
  for (const col of ["draft", "slides", "strategic_angle"]) {
    if (row[col]) {
      check(!SIGNATURE.test(row[col]), id, `${col} (signature résiduelle)`, "aucune", "présente");
    }
  }

  // Un brouillon qui commençait par « { » doit rester du JSON valide :
  // c'est le contrôle qui attraperait une troncature ou un échappement raté.
  for (const col of ["draft", "slides"]) {
    const v = row[col];
    if (v && v.trimStart().startsWith("{")) {
      let ok = true;
      try { JSON.parse(v); } catch { ok = false; }
      check(ok, id, `${col} (JSON valide)`, "parsable", "cassé");
    }
  }
}

// Aucune matière ne doit avoir disparu en route
const sourceWith = (col) =>
  data.databases.content.pages.filter((pg) => String(plain(pg.properties[col]) || "").trim()).length;

const nonEmpty = (col) => rows.filter((r) => r[col] && String(r[col]).trim()).length;

const draftSources = data.databases.content.pages.filter(
  (pg) => String(plain(pg.properties["Contenu"]) || "").trim() || String(plain(pg.properties["Script vidéo"]) || "").trim()
).length;

check(nonEmpty("draft") === draftSources, "(global)", "nombre de brouillons", draftSources, nonEmpty("draft"));
check(nonEmpty("slides") === sourceWith("Slides"), "(global)", "nombre de slides", sourceWith("Slides"), nonEmpty("slides"));
check(nonEmpty("strategic_angle") === sourceWith("Angle stratégique"), "(global)", "nombre d'angles", sourceWith("Angle stratégique"), nonEmpty("strategic_angle"));

// Sessions Coach : autant de messages en base que dans les sessions source
let expectedMessages = 0;
for (const pg of data.databases.content.pages) {
  const raw = String(plain(pg.properties["Coach Session"]) || "");
  if (!raw.trim()) continue;
  try { expectedMessages += (JSON.parse(raw).messages || []).length; } catch { /* signalé par l'import */ }
}
const actualMessages = query("SELECT COUNT(*) AS n FROM coach_messages")[0].n;
check(actualMessages === expectedMessages, "(global)", "messages Coach", expectedMessages, actualMessages);

// ─── 3. Modèles ─────────────────────────────────────────────────────────────

const modelRows = query("SELECT * FROM ai_models");
const modelsById = new Map(modelRows.map((r) => [r.id, r]));

for (const page of data.databases.models.pages) {
  const p = page.properties;
  const row = modelsById.get(page.id);
  if (!row) { fail(page.id, "(modèle)", "présent", "ABSENT"); continue; }

  check(row.name === plain(p["Nom"]), page.id, "model.name", plain(p["Nom"]), row.name);
  check(row.api_code === plain(p["Code API"]), page.id, "model.api_code", plain(p["Code API"]), row.api_code);
  // « Fournisseur » devient l'AFFICHAGE ; provider est la clé de routage (SPEC §5.3)
  check((row.vendor ?? "") === plain(p["Fournisseur"]), page.id, "model.vendor", plain(p["Fournisseur"]), row.vendor);
  check(row.provider === "onemin", page.id, "model.provider", "onemin", row.provider);
  check((row.cost ?? "") === plain(p["Cout"]), page.id, "model.cost", plain(p["Cout"]), row.cost);
  check((row.best_use_cases ?? "") === plain(p["Meilleurs cas d'utilisation"]), page.id, "model.best_use_cases", "(texte)", "(différent)");
  check((row.is_default === 1) === (plain(p["Défaut"]) === true), page.id, "model.is_default", plain(p["Défaut"]), row.is_default);
}

// ─── Verdict ────────────────────────────────────────────────────────────────

console.log(`  ${checks} contrôles exécutés sur ${rows.length} contenus et ${modelRows.length} modèles`);
console.log(`  ${query("SELECT COUNT(*) AS n FROM generations")[0].n} lignes de journal, ${actualMessages} messages Coach\n`);

if (issues.length === 0) {
  console.log("✅ ZÉRO ÉCART — la migration est fidèle (SPEC §9.3).\n");
  process.exit(0);
}

console.log(`❌ ${issues.length} écart(s) :\n`);
for (const i of issues.slice(0, 40)) {
  console.log(`  ${i.id}`);
  console.log(`    ${i.field}`);
  console.log(`      attendu : ${i.expected}`);
  console.log(`      obtenu  : ${i.actual}`);
}
if (issues.length > 40) console.log(`  … et ${issues.length - 40} autres`);
console.log();
process.exit(1);
