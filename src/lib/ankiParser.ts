/**
 * Anki .apkg / .colpkg parser for browser.
 * Supports both legacy (anki2/anki21) and modern (anki21b) formats.
 *
 * Legacy: col.models contains JSON with model definitions
 * Modern (anki21b): separate notetypes, fields, templates tables
 */

import JSZip from 'jszip';
import initSqlJs, { type Database } from 'sql.js/dist/sql-asm.js';

export interface AnkiCard {
  front: string;
  back: string;
  cardType: 'basic' | 'cloze';
  tags: string[];
  media: Map<string, string>;
}

export interface AnkiParseResult {
  deckName: string;
  cards: AnkiCard[];
  mediaCount: number;
}

interface AnkiModel {
  name: string;
  flds: { name: string; ord: number }[];
  type: number; // 0 = standard, 1 = cloze
  tmpls: { name: string; qfmt: string; afmt: string; ord: number }[];
}

/* ── helpers ── */

function replaceMediaRefs(html: string, mediaMap: Map<string, string>): string {
  return html.replace(/src="([^"]+)"/g, (match, filename) => {
    const dataUrl = mediaMap.get(filename);
    return dataUrl ? `src="${dataUrl}"` : match;
  });
}

function stripAnkiTemplateSyntax(html: string): string {
  return html
    .replace(/\{\{FrontSide\}\}/gi, '')
    .replace(/\{\{type:[^}]+\}\}/gi, '')
    .replace(/<hr\s*id="answer"\s*\/?>/gi, '')
    .replace(/\{\{#[^}]+\}\}[\s\S]*?\{\{\/[^}]+\}\}/g, '')
    .trim();
}

function renderTemplate(template: string, fields: Record<string, string>): string {
  const esc = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let result = template;

  // Conditional sections {{#Field}}...{{/Field}}
  result = result.replace(/\{\{#([^}]+)\}\}([\s\S]*?)\{\{\/\1\}\}/gi, (_m, name: string, content: string) => {
    return fields[name]?.trim() ? content : '';
  });
  // Inverse {{^Field}}...{{/Field}}
  result = result.replace(/\{\{\^([^}]+)\}\}([\s\S]*?)\{\{\/\1\}\}/gi, (_m, name: string, content: string) => {
    return fields[name]?.trim() ? '' : content;
  });

  for (const [name, value] of Object.entries(fields)) {
    const e = esc(name);
    result = result.replace(new RegExp(`\\{\\{${e}\\}\\}`, 'gi'), value);
    result = result.replace(new RegExp(`\\{\\{text:${e}\\}\\}`, 'gi'), value.replace(/<[^>]*>/g, ''));
    result = result.replace(new RegExp(`\\{\\{cloze:${e}\\}\\}`, 'gi'), value);
  }
  return stripAnkiTemplateSyntax(result);
}

function convertClozeFormat(text: string): string {
  return text.replace(/\{\{c(\d+)::([^:}]+)(?:::[^}]*)?\}\}/g, '{{c$1::$2}}');
}

/* ── extract media ── */

async function extractMedia(zip: JSZip): Promise<Map<string, string>> {
  const mediaMapping: Record<string, string> = {};
  if (zip.files['media']) {
    try {
      const mediaText = await zip.files['media'].async('text');
      Object.assign(mediaMapping, JSON.parse(mediaText));
    } catch {}
  }

  const mediaMap = new Map<string, string>();
  for (const [numericName, actualFilename] of Object.entries(mediaMapping)) {
    const mediaFile = zip.files[numericName];
    if (!mediaFile) continue;
    try {
      const blob = await mediaFile.async('blob');
      const ext = actualFilename.split('.').pop()?.toLowerCase() || '';
      const mimeMap: Record<string, string> = {
        jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
        gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
        mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
      };
      const mimeType = mimeMap[ext] || 'application/octet-stream';
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(new Blob([blob], { type: mimeType }));
      });
      mediaMap.set(actualFilename, dataUrl);
    } catch {}
  }
  return mediaMap;
}

/* ── parse models from legacy col table ── */

function parseModelsFromCol(db: Database): { models: Record<string, AnkiModel>; deckName: string } {
  const models: Record<string, AnkiModel> = {};
  let deckName = 'Anki Import';
  try {
    const colResult = db.exec('SELECT models, decks FROM col LIMIT 1');
    if (colResult.length > 0 && colResult[0].values.length > 0) {
      const modelsRaw = colResult[0].values[0][0] as string;
      // In anki21b, models might be empty or binary — guard against that
      if (modelsRaw && modelsRaw.startsWith('{')) {
        const modelsJson = JSON.parse(modelsRaw);
        for (const [mid, model] of Object.entries(modelsJson)) {
          const m = model as any;
          models[mid] = {
            name: m.name || '',
            flds: (m.flds || []).map((f: any) => ({ name: f.name, ord: f.ord })).sort((a: any, b: any) => a.ord - b.ord),
            type: m.type || 0,
            tmpls: (m.tmpls || []).map((t: any) => ({ name: t.name, qfmt: t.qfmt, afmt: t.afmt, ord: t.ord })),
          };
        }
      }
      const decksRaw = colResult[0].values[0][1] as string;
      if (decksRaw && decksRaw.startsWith('{')) {
        const decksJson = JSON.parse(decksRaw);
        const deckEntries = Object.values(decksJson) as any[];
        const nonDefault = deckEntries.find((d: any) => d.name !== 'Default' && d.name !== 'Padrão');
        if (nonDefault) deckName = nonDefault.name;
        else if (deckEntries.length > 0) deckName = deckEntries[0].name;
      }
    }
  } catch (e) {
    console.warn('Failed to parse col table:', e);
  }
  return { models, deckName };
}

/* ── parse models from anki21b tables (notetypes, fields, templates) ── */

function parseModelsFromTables(db: Database): { models: Record<string, AnkiModel>; deckName: string } {
  const models: Record<string, AnkiModel> = {};
  let deckName = 'Anki Import';

  try {
    // Check if notetypes table exists
    const tableCheck = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='notetypes'");
    if (tableCheck.length === 0 || tableCheck[0].values.length === 0) {
      return { models, deckName };
    }

    // Read notetypes
    const ntResult = db.exec('SELECT id, name, config FROM notetypes');
    if (ntResult.length > 0) {
      for (const row of ntResult[0].values) {
        const ntId = String(row[0]);
        const ntName = row[1] as string;
        // config is protobuf binary — we can detect cloze from template content later
        models[ntId] = { name: ntName, flds: [], type: 0, tmpls: [] };
      }
    }

    // Read fields
    const fieldsResult = db.exec('SELECT ntid, ord, name FROM fields ORDER BY ord');
    if (fieldsResult.length > 0) {
      for (const row of fieldsResult[0].values) {
        const ntId = String(row[0]);
        if (models[ntId]) {
          models[ntId].flds.push({ name: row[2] as string, ord: row[1] as number });
        }
      }
    }

    // Read templates
    const tmplResult = db.exec('SELECT ntid, ord, name, qfmt, afmt FROM templates ORDER BY ord');
    if (tmplResult.length > 0) {
      for (const row of tmplResult[0].values) {
        const ntId = String(row[0]);
        if (models[ntId]) {
          const qfmt = row[3] as string;
          models[ntId].tmpls.push({
            name: row[2] as string,
            qfmt,
            afmt: row[4] as string,
            ord: row[1] as number,
          });
          // Detect cloze type from template containing {{cloze:
          if (/\{\{cloze:/i.test(qfmt)) {
            models[ntId].type = 1;
          }
        }
      }
    }

    // Try to get deck name from decks table
    const decksCheck = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='decks'");
    if (decksCheck.length > 0 && decksCheck[0].values.length > 0) {
      const decksResult = db.exec('SELECT id, name FROM decks');
      if (decksResult.length > 0) {
        for (const row of decksResult[0].values) {
          const dName = row[1] as string;
          if (dName && dName !== 'Default' && dName !== 'Padrão') {
            deckName = dName;
            break;
          }
        }
      }
    }
  } catch (e) {
    console.warn('Failed to parse anki21b tables:', e);
  }

  return { models, deckName };
}

/* ── build cards from notes ── */

function buildCards(
  db: Database,
  models: Record<string, AnkiModel>,
  mediaMap: Map<string, string>,
): AnkiCard[] {
  const cards: AnkiCard[] = [];

  const notesResult = db.exec('SELECT mid, flds, tags FROM notes');
  if (notesResult.length === 0) return cards;

  for (const row of notesResult[0].values) {
    const mid = String(row[0]);
    const fldsStr = row[1] as string;
    const tags = (row[2] as string || '').trim().split(/\s+/).filter(Boolean);
    const fieldValues = fldsStr.split('\x1f');

    const model = models[mid];
    if (!model) {
      // Fallback: first field = front, rest = back
      const front = replaceMediaRefs(fieldValues[0] || '', mediaMap);
      const back = replaceMediaRefs(fieldValues.slice(1).join('<br>'), mediaMap);
      if (front.trim()) {
        cards.push({ front, back, cardType: 'basic', tags, media: mediaMap });
      }
      continue;
    }

    // Build field name -> value mapping
    const fieldMap: Record<string, string> = {};
    model.flds.forEach((f, i) => {
      fieldMap[f.name] = fieldValues[i] || '';
    });

    if (model.type === 1) {
      // Cloze
      const frontContent = convertClozeFormat(replaceMediaRefs(fieldValues[0] || '', mediaMap));
      const clozeNums = new Set<number>();
      frontContent.replace(/\{\{c(\d+)::/g, (_, n) => { clozeNums.add(parseInt(n)); return ''; });

      if (clozeNums.size > 0) {
        for (const cNum of clozeNums) {
          cards.push({
            front: frontContent,
            back: JSON.stringify({ clozeTarget: cNum }),
            cardType: 'cloze',
            tags,
            media: mediaMap,
          });
        }
      } else {
        const front = replaceMediaRefs(fieldValues[0] || '', mediaMap);
        const back = replaceMediaRefs(fieldValues.slice(1).join('<br>'), mediaMap);
        if (front.trim()) cards.push({ front, back, cardType: 'basic', tags, media: mediaMap });
      }
    } else {
      // Standard
      if (model.tmpls.length > 0) {
        for (const tmpl of model.tmpls) {
          const front = renderTemplate(tmpl.qfmt, fieldMap);
          const back = renderTemplate(tmpl.afmt, fieldMap);
          if (front.trim()) {
            cards.push({
              front: replaceMediaRefs(front, mediaMap),
              back: replaceMediaRefs(back, mediaMap),
              cardType: 'basic',
              tags,
              media: mediaMap,
            });
          }
        }
      } else {
        // No templates — use raw fields
        const front = replaceMediaRefs(fieldValues[0] || '', mediaMap);
        const back = replaceMediaRefs(fieldValues.slice(1).join('<br>'), mediaMap);
        if (front.trim()) cards.push({ front, back, cardType: 'basic', tags, media: mediaMap });
      }
    }
  }

  return cards;
}

/* ── main entry point ── */

export async function parseApkgFile(file: File): Promise<AnkiParseResult> {
  const SQL = await initSqlJs();

  // Unzip
  let zip = await JSZip.loadAsync(file);

  // If wrapper zip containing .apkg/.colpkg inside, extract it first
  const innerApkg = Object.keys(zip.files).find(
    name => /\.(apkg|colpkg)$/i.test(name) && !zip.files[name].dir
  );
  if (innerApkg && !zip.files['collection.anki21'] && !zip.files['collection.anki21b'] && !zip.files['collection.anki2']) {
    const innerBlob = await zip.files[innerApkg].async('blob');
    zip = await JSZip.loadAsync(innerBlob);
  }

  // Find the SQLite database file — prefer anki21b (modern), then anki21, then anki2
  let dbFile: JSZip.JSZipObject | null = null;
  let isModernFormat = false;
  for (const name of ['collection.anki21b', 'collection.anki21', 'collection.anki2']) {
    if (zip.files[name]) {
      dbFile = zip.files[name];
      isModernFormat = name === 'collection.anki21b';
      break;
    }
  }
  if (!dbFile) throw new Error('Arquivo .apkg inválido: banco de dados não encontrado');

  // Extract media
  const mediaMap = await extractMedia(zip);

  // Open DB
  const dbBuffer = await dbFile.async('arraybuffer');
  const db: Database = new SQL.Database(new Uint8Array(dbBuffer));

  // Parse models — try modern tables first, fallback to legacy col table
  let models: Record<string, AnkiModel> = {};
  let deckName = 'Anki Import';

  if (isModernFormat) {
    const result = parseModelsFromTables(db);
    models = result.models;
    deckName = result.deckName;
  }

  // If no models found from tables, try legacy col table
  if (Object.keys(models).length === 0) {
    const result = parseModelsFromCol(db);
    models = result.models;
    if (result.deckName !== 'Anki Import') deckName = result.deckName;
  }

  // If STILL no models, try tables anyway (some anki21 files also have them)
  if (Object.keys(models).length === 0) {
    const result = parseModelsFromTables(db);
    models = result.models;
    if (result.deckName !== 'Anki Import') deckName = result.deckName;
  }

  // Build cards
  let cards: AnkiCard[] = [];
  try {
    cards = buildCards(db, models, mediaMap);
  } catch (e) {
    console.error('Failed to parse notes:', e);
    throw new Error('Erro ao extrair cartões do arquivo Anki');
  }

  db.close();

  return { deckName, cards, mediaCount: mediaMap.size };
}
