#!/usr/bin/env node
/**
 * SPEC §9 / phase 4 — import Notion → D1.
 *
 * Lit l'export brut de la phase 0 et produit un fichier SQL d'instructions
 * `INSERT OR REPLACE` à identifiants DÉTERMINISTES : le fichier est
 * ré-exécutable autant de fois que nécessaire sans jamais créer de doublon.
 * C'est ce qui permet de répéter la migration jusqu'à ce qu'elle soit juste.
 *
 * Usage :
 *   node tools/import-notion/import.mjs                  # dernier export
 *   node tools/import-notion/import.mjs <fichier.json>
 *
 * Puis :
 *   cd workers/api
 *   npx wrangler d1 execute DB --remote --file=../../tools/import-notion/import.sql
 */

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FIXTURES = join(ROOT, "fixtures");

// ─── Lecture des propriétés Notion ──────────────────────────────────────────

const plain = (prop) => {
  if (!prop) return "";
  const t = prop.type;
  if (t === "title" || t === "rich_text") return (prop[t] || []).map((x) => x.plain_text).join("");
  if (t === "select") return prop.select?.name ?? "";
  if (t === "multi_select") return (prop.multi_select || []).map((o) => o.name);
  if (t === "checkbox") return prop.checkbox === true;
  if (t === "date") return prop.date?.start ?? null;
  if (t === "number") return prop.number ?? null;
  return "";
};

const text = (props, col) => {
  const v = plain(props[col]);
  return typeof v === "string" ? v : "";
};

// ─── Signatures → journal des générations (SPEC §2.6) ───────────────────────

/**
 * Une signature est concaténée APRÈS le JSON, à la toute fin du champ. Toutes
 * les formes rencontrées dans l'export, recensées exhaustivement :
 *
 *   88×  « Généré par : Claude Fable 5 - le 18/08/2026 13:45:31 »
 *   18×  « Généré par : Claude Opus 4.5 - Contexte par défaut - le 23/03/2026 … »
 *    3×  « Ajusté par : Claude Opus 4.8 — le 03/07/2026 15:33:40 »   (cadratin)
 *    1×  « Prompts ajustés (slide 6) par : Claude Opus 4.6 - … »
 *
 * Cette dernière forme a coûté un JSON cassé lors du premier passage : le
 * motif ne la reconnaissait pas, la signature restait collée au contenu, et
 * le brouillon ne parsait plus. D'où un motif qui accepte TOUT en-tête se
 * terminant par « par : », plutôt qu'une liste de verbes attendus.
 *
 * Les soulignés d'italique ont parfois survécu à l'aller-retour Notion,
 * parfois non : le motif les rend optionnels.
 *
 * ANCRAGE EN FIN DE CHAÎNE, impérativement. Les sessions Coach contiennent des
 * signatures EN PLEIN MILIEU du texte — l'angle stratégique y a été recopié
 * avec la sienne. Les retirer casserait la conversation.
 */
const SIGNATURE = /\n*_?\s*([A-ZÀ-Ÿ][^\n:]{0,60}?)\s+par\s*:\s*([^\n]*?)\s*_?\s*$/;

/** « 18/08/2026 13:45:31 » → epoch ms (heure locale de la machine). */
export const parseFrenchDate = (s) => {
  const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})[\s,]+(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const [, d, mo, y, h, mi, sec] = m;
  return new Date(+y, +mo - 1, +d, +h, +mi, +(sec || 0)).getTime();
};

/**
 * Sépare le contenu de sa provenance.
 * Retourne { clean, signature: { verb, modelLabel, at } | null }.
 */
export const splitSignature = (raw) => {
  if (!raw) return { clean: raw, signature: null };
  const m = raw.match(SIGNATURE);
  if (!m) return { clean: raw, signature: null };

  const [, header, rest] = m;
  // « Ajusté », « Prompts ajustés (slide 6) », « Généré »… : seul compte le
  // fait qu'il s'agisse d'un ajustement ou d'une génération initiale.
  const verb = /ajust/i.test(header) ? "Ajusté" : "Généré";
  // « Modèle - Contexte - le <date> » ou « Modèle — le <date> »
  const modelLabel = rest.split(/\s+[-—]\s+/)[0].trim();
  const at = parseFrenchDate(rest);

  return {
    clean: raw.slice(0, m.index).replace(/\s+$/, ""),
    signature: { verb, modelLabel: modelLabel || "inconnu", at },
  };
};

// ─── Génération SQL ─────────────────────────────────────────────────────────

export const sql = (v) => {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "1" : "0";
  return `'${String(v).replace(/'/g, "''")}'`;
};

const insert = (table, row) => {
  const cols = Object.keys(row);
  return `INSERT OR REPLACE INTO ${table} (${cols.join(", ")}) VALUES (${cols.map((c) => sql(row[c])).join(", ")});`;
};

// ─── Conversion d'un contenu ────────────────────────────────────────────────

const isoToMs = (iso) => (iso ? new Date(iso).getTime() : null);

const convertContent = (page, stats) => {
  const p = page.properties;
  const id = page.id;
  const createdAt = isoToMs(page.created_time) ?? Date.now();
  const updatedAt = isoToMs(page.last_edited_time) ?? createdAt;

  const statements = [];
  const generations = [];

  /** Nettoie un champ et journalise sa provenance s'il en porte une. */
  const take = (col, kind, target) => {
    const raw = text(p, col);
    if (!raw.trim()) return null;
    const { clean, signature } = splitSignature(raw);
    if (signature) {
      stats.signatures++;
      generations.push({
        // Identifiant déterministe : ré-exécuter n'ajoute pas de doublon
        id: `gen-${id}-${col.replace(/[^a-zA-Z]/g, "").toLowerCase()}`,
        content_id: id,
        kind: signature.verb === "Ajusté" ? "adjustment" : kind,
        target: target ?? null,
        model_id: null,
        model_label: signature.modelLabel,
        instruction: null,
        payload: clean,
        created_at: signature.at ?? updatedAt,
      });
    }
    return clean;
  };

  // Contenu et Script vidéo aboutissent dans la MÊME colonne (SPEC §2.5).
  //
  // La spec supposait qu'aucun contenu ne remplit les deux. L'export a
  // démenti : deux pages au format Reel portent le brouillon JSON dans
  // « Script vidéo » ET une ancienne version en prose dans « Contenu »,
  // vestige d'avant les formats structurés.
  //
  // On départage par la DONNÉE plutôt qu'en redupliquant le registre des
  // formats : le vrai brouillon est celui qui parse en JSON. Le champ écarté
  // n'est pas perdu — il rejoint legacy_json.
  const body = take("Contenu", "draft", "draft");
  const script = take("Script vidéo", "draft", "draft");

  const isJson = (v) => {
    if (!v) return false;
    try { JSON.parse(v); return true; } catch { return false; }
  };

  let draft = body ?? script ?? null;
  let discardedDraft = null;
  if (body && script) {
    stats.bothDraftFields.push(id);
    // « Script vidéo » l'emporte à égalité : c'est le champ le plus spécifique
    const keepScript = isJson(script) || !isJson(body);
    draft = keepScript ? script : body;
    discardedDraft = keepScript ? body : script;
  }

  const slides = take("Slides", "slides", "slides");
  const angle = take("Angle stratégique", "analysis", null);

  // Post Court est ABANDONNÉ : dérivation pure de draft (SPEC §2.8)
  if (text(p, "Post Court").trim()) stats.postCourtDropped++;

  // Champs de l'ancien flow Interviewer → legacy_json (SPEC §2.8)
  const answers = text(p, "Réponses interview");
  const questions = text(p, "Questions interview");
  const hasLegacy = answers.trim() || questions.trim() || discardedDraft;
  const legacy = hasLegacy
    ? JSON.stringify({
        answers: answers || null,
        questions: questions || null,
        // Ancienne version en prose, supplantée par le brouillon structuré
        discardedDraft: discardedDraft || null,
      })
    : null;
  if (legacy) stats.legacyKept++;

  // Session Coach : éclatée en état + lignes de messages (SPEC §2.7)
  let coachStatus = null, coachFormat = null, coachBrief = null, coachValidatedAt = null;
  const coachRaw = text(p, "Coach Session");
  if (coachRaw.trim()) {
    try {
      const s = JSON.parse(coachRaw);
      coachStatus = s.status ?? null;
      coachFormat = s.formatCible ?? null;
      coachBrief = s.brief ?? null;
      coachValidatedAt = isoToMs(s.validatedAt);

      (s.messages || []).forEach((m, i) => {
        stats.coachMessages++;
        statements.push(insert("coach_messages", {
          id: `msg-${id}-${String(i).padStart(3, "0")}`,
          content_id: id,
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content ?? "",
          raw: m.raw ?? null,
          quick_replies: JSON.stringify(m.quickReplies ?? []),
          ready_for_editor: m.readyForEditor ? 1 : 0,
          created_at: isoToMs(m.timestamp) ?? createdAt,
        }));
      });
      stats.coachSessions++;
    } catch (e) {
      stats.coachUnparsable.push(id);
    }
  }

  const analysed = plain(p["Analysé"]) === true;
  const platforms = plain(p["Plateforme"]);

  statements.unshift(insert("contents", {
    id,
    title: text(p, "Titre"),
    status: text(p, "Statut") || "Idée",
    platforms: JSON.stringify(Array.isArray(platforms) ? platforms : []),
    target_format: text(p, "Format cible") || null,
    objectif: text(p, "Objectif") || null,
    depth: text(p, "Profondeur") || null,
    // Le booléen devient une date : on n'a que last_edited_time comme repère
    analyzed_at: analysed ? updatedAt : null,
    verdict: text(p, "Verdict") || null,
    strategic_angle: angle,
    justification: text(p, "Justification") || null,
    suggested_metaphor: text(p, "Métaphore Suggérée") || null,
    notes: text(p, "Notes"),
    draft,
    slides,
    coach_status: coachStatus,
    coach_format_cible: coachFormat,
    coach_brief: coachBrief,
    coach_validated_at: coachValidatedAt,
    serie_id: null,
    angle: null,
    scheduled_date: plain(p["Date de publication"]),
    legacy_json: legacy,
    created_at: createdAt,
    updated_at: updatedAt,
    deleted_at: null,
  }));

  return [...statements, ...generations.map((g) => insert("generations", g))];
};

// ─── Conversion d'un modèle ─────────────────────────────────────────────────

const convertModel = (page) => {
  const p = page.properties;
  const createdAt = isoToMs(page.created_time) ?? Date.now();
  const quality = text(p, "Qualité pour le texte");

  return insert("ai_models", {
    id: page.id,
    name: text(p, "Nom") || "Modèle sans nom",
    api_code: text(p, "Code API"),
    // Tout passe par 1min.ai aujourd'hui ; « Fournisseur » devient l'affichage
    // et `provider` la clé de routage vers l'adaptateur (SPEC §5.3).
    provider: "onemin",
    vendor: text(p, "Fournisseur") || null,
    cost: text(p, "Cout") || null,
    strengths: text(p, "Forces") || null,
    best_use_cases: text(p, "Meilleurs cas d'utilisation") || null,
    text_quality: quality && Number.isFinite(Number(quality)) ? Number(quality) : null,
    is_default: plain(p["Défaut"]) === true ? 1 : 0,
    created_at: createdAt,
    updated_at: isoToMs(page.last_edited_time) ?? createdAt,
    deleted_at: null,
  });
};

// ─── Exécution ──────────────────────────────────────────────────────────────

// Le fichier est aussi importé par ses tests : on ne migre que s'il est lancé
// directement.
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (!isMain) { /* importé pour tests */ } else {

const latestExport = () => {
  const files = readdirSync(FIXTURES).filter((f) => /^notion-export-.*\.json$/.test(f)).sort();
  if (!files.length) {
    console.error("✗ Aucun export dans fixtures/. Lancez d'abord tools/export-notion.");
    process.exit(1);
  }
  return join(FIXTURES, files[files.length - 1]);
};

const file = process.argv[2] ? join(process.cwd(), process.argv[2]) : latestExport();
const data = JSON.parse(readFileSync(file, "utf8"));

const stats = {
  signatures: 0, coachSessions: 0, coachMessages: 0, coachUnparsable: [],
  legacyKept: 0, postCourtDropped: 0, bothDraftFields: [],
};

const lines = [
  `-- Import Notion → D1, généré le ${new Date().toISOString()}`,
  `-- Source : ${file.replace(ROOT + "/", "")} (export du ${data.exportedAt})`,
  `--`,
  `-- INSERT OR REPLACE + identifiants déterministes : ré-exécutable sans doublon.`,
  `-- Les identifiants de page Notion sont conservés (SPEC §2.4).`,
  ``,
];

for (const page of data.databases.content.pages) lines.push(...convertContent(page, stats));
lines.push("");
for (const page of data.databases.models.pages) lines.push(convertModel(page));

const out = join(ROOT, "tools", "import-notion", "import.sql");
writeFileSync(out, lines.join("\n") + "\n");

// ─── Rapport ────────────────────────────────────────────────────────────────

const nContents = data.databases.content.pages.length;
const nModels = data.databases.models.pages.length;

console.log(`\n▸ Import généré — ${out.replace(ROOT + "/", "")}\n`);
console.log(`  ${nContents} contenus, ${nModels} modèles`);
console.log(`  ${stats.signatures} signatures converties en lignes du journal`);
console.log(`  ${stats.coachSessions} sessions Coach → ${stats.coachMessages} messages`);
console.log(`  ${stats.legacyKept} contenus avec matière d'interview conservée`);
console.log(`  ${stats.postCourtDropped} champs « Post Court » abandonnés (dérivés de draft)`);
console.log(`  ${(readFileSync(out).length / 1024).toFixed(0)} Ko de SQL`);

if (stats.coachUnparsable.length) {
  console.log(`\n  ⚠ ${stats.coachUnparsable.length} session(s) Coach illisible(s) :`);
  for (const id of stats.coachUnparsable) console.log(`      ${id}`);
}
if (stats.bothDraftFields.length) {
  console.log(`\n  ℹ ${stats.bothDraftFields.length} contenu(s) remplissaient Contenu ET Script vidéo.`);
  console.log(`     Le brouillon JSON a été retenu, l'autre version conservée dans legacy_json :`);
  for (const id of stats.bothDraftFields) console.log(`      ${id}`);
}

console.log(`\n  Appliquer :`);
console.log(`    cd workers/api && npx wrangler d1 execute DB --remote --file=../../tools/import-notion/import.sql\n`);
}
