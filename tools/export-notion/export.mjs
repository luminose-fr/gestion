#!/usr/bin/env node
/**
 * SPEC §9.4 / phase 0 — LE FILET.
 *
 * Exporte l'INTÉGRALITÉ des bases Notion en JSON brut, avant toute migration.
 * « Brut » est le mot important : on enregistre les objets `page` tels que
 * Notion les renvoie, sans mapping ni interprétation. Un mapping se refait ;
 * une donnée perdue parce qu'on l'a mal comprise au moment de l'export, non.
 *
 * Usage :
 *   NOTION_API_KEY=secret_xxx node tools/export-notion/export.mjs
 *
 * Les identifiants de bases sont lus dans .env.local, sauf surcharge :
 *   NOTION_CONTENT_DB_ID=… NOTION_MODELS_DB_ID=… node tools/export-notion/export.mjs
 *
 * Produit fixtures/notion-export-<date>.json, à commiter.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const NOTION = "https://api.notion.com/v1";
const NOTION_VERSION = "2025-09-03";

// ─── Configuration ───────────────────────────────────────────────────────────

/** Lit .env.local sans dépendance : le tool doit tourner avant tout npm install. */
function readEnvLocal() {
  const path = join(ROOT, ".env.local");
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

const envFile = readEnvLocal();
const API_KEY = process.env.NOTION_API_KEY;
const CONTENT_DB =
  process.env.NOTION_CONTENT_DB_ID || envFile.VITE_NOTION_CONTENT_DB_ID;
const MODELS_DB =
  process.env.NOTION_MODELS_DB_ID || envFile.VITE_NOTION_MODELS_DB_ID;

if (!API_KEY) {
  console.error("✗ NOTION_API_KEY manquant.\n");
  console.error("  NOTION_API_KEY=secret_xxx node tools/export-notion/export.mjs\n");
  console.error("  La clé est le « Internal Integration Secret » de l'intégration Notion.");
  console.error("  C'est la même que le secret NOTION_API_KEY du Worker.");
  process.exit(1);
}
if (!CONTENT_DB || !MODELS_DB) {
  console.error("✗ Identifiants de bases introuvables.");
  console.error("  Attendus dans .env.local : VITE_NOTION_CONTENT_DB_ID, VITE_NOTION_MODELS_DB_ID");
  process.exit(1);
}

// ─── Client Notion ───────────────────────────────────────────────────────────

async function notion(path, init = {}, attempt = 1) {
  const res = await fetch(`${NOTION}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  // Limite de débit : on attend et on rejoue, l'export n'est pas pressé.
  if (res.status === 429 && attempt <= 5) {
    const wait = Number(res.headers.get("Retry-After") || 2) * 1000;
    console.warn(`  … 429, nouvelle tentative dans ${wait / 1000}s`);
    await new Promise((r) => setTimeout(r, wait));
    return notion(path, init, attempt + 1);
  }

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Notion ${res.status} sur ${path} : ${text.slice(0, 400)}`);
  }
  return JSON.parse(text);
}

/**
 * L'API 2025-09-03 impose le détour : une database contient des data sources,
 * et ce sont elles qui portent le schéma et acceptent les requêtes.
 */
async function resolveDataSource(dbId, label) {
  const db = await notion(`/databases/${dbId}`);
  const ds = db.data_sources?.[0];
  if (!ds) throw new Error(`Aucune data source sur la base ${label} (${dbId})`);
  return { dataSourceId: ds.id, database: db };
}

async function queryAll(dataSourceId, label) {
  const pages = [];
  let cursor;
  let round = 0;

  do {
    const body = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;

    const res = await notion(`/data_sources/${dataSourceId}/query`, {
      method: "POST",
      body: JSON.stringify(body),
    });

    pages.push(...(res.results || []));
    cursor = res.has_more ? res.next_cursor : undefined;
    round++;
    process.stdout.write(`\r  ${label} : ${pages.length} pages (${round} requête${round > 1 ? "s" : ""})`);
  } while (cursor);

  process.stdout.write("\n");
  return pages;
}

// ─── Résumé lisible ──────────────────────────────────────────────────────────

const plain = (prop) => {
  if (!prop) return "";
  if (prop.type === "title") return (prop.title || []).map((t) => t.plain_text).join("");
  if (prop.type === "rich_text") return (prop.rich_text || []).map((t) => t.plain_text).join("");
  if (prop.type === "select") return prop.select?.name || "";
  if (prop.type === "checkbox") return prop.checkbox ? "oui" : "non";
  return "";
};

function summarize(contents, models) {
  const byKey = (pages, col) => {
    const counts = {};
    for (const p of pages) {
      const v = plain(p.properties?.[col]) || "(vide)";
      counts[v] = (counts[v] || 0) + 1;
    }
    return counts;
  };

  const table = (title, counts) => {
    console.log(`\n  ${title}`);
    for (const [k, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${String(n).padStart(4)}  ${k}`);
    }
  };

  table("Par statut", byKey(contents, "Statut"));
  table("Par format cible", byKey(contents, "Format cible"));
  table("Par objectif", byKey(contents, "Objectif"));

  const withField = (col) => contents.filter((p) => plain(p.properties?.[col]).trim().length > 0).length;
  console.log("\n  Champs remplis");
  for (const col of ["Contenu", "Script vidéo", "Slides", "Post Court", "Coach Session", "Notes", "Réponses interview"]) {
    console.log(`    ${String(withField(col)).padStart(4)}  ${col}`);
  }

  console.log(`\n  Modèles IA : ${models.length}`);
  for (const m of models) {
    console.log(`    ${plain(m.properties?.["Nom"]) || "(sans nom)"} — ${plain(m.properties?.["Code API"])}`);
  }
}

// ─── Exécution ───────────────────────────────────────────────────────────────

const run = async () => {
  console.log("▸ Export Notion — phase 0 (filet)\n");

  const content = await resolveDataSource(CONTENT_DB, "Contenu");
  const models = await resolveDataSource(MODELS_DB, "Modèles IA");

  const contentPages = await queryAll(content.dataSourceId, "Contenu   ");
  const modelPages = await queryAll(models.dataSourceId, "Modèles IA");

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const out = {
    exportedAt: new Date().toISOString(),
    notionVersion: NOTION_VERSION,
    databases: {
      content: {
        databaseId: CONTENT_DB,
        dataSourceId: content.dataSourceId,
        // Le schéma donne le TYPE réel de chaque colonne — information qu'aucune
        // page ne porte à elle seule, et dont l'import aura besoin.
        schema: (await notion(`/data_sources/${content.dataSourceId}`)).properties,
        pages: contentPages,
      },
      models: {
        databaseId: MODELS_DB,
        dataSourceId: models.dataSourceId,
        schema: (await notion(`/data_sources/${models.dataSourceId}`)).properties,
        pages: modelPages,
      },
    },
  };

  const file = join(ROOT, "fixtures", `notion-export-${stamp}.json`);
  writeFileSync(file, JSON.stringify(out, null, 2));

  summarize(contentPages, modelPages);

  const size = (JSON.stringify(out).length / 1024 / 1024).toFixed(2);
  console.log(`\n✓ ${contentPages.length} contenus + ${modelPages.length} modèles`);
  console.log(`✓ ${file.replace(ROOT + "/", "")} (${size} Mo)`);
  console.log("\n  Relire le résumé ci-dessus, puis commiter le fichier.");
};

run().catch((err) => {
  console.error(`\n✗ ${err.message}`);
  process.exit(1);
});
