/**
 * Anki .apkg / .colpkg parser for browser.
 * Supports both legacy (anki2/anki21) and modern (anki21b) formats.
 *
 * Legacy: col.models contains JSON with model definitions
 * Modern (anki21b): separate notetypes, fields, templates tables
 */

import JSZip from 'jszip';
import * as fzstd from 'fzstd';
import initSqlJs, { type Database } from 'sql.js';

export interface AnkiCard {
  front: string;
  back: string;
  cardType: 'basic' | 'cloze';
  tags: string[];
  media: Map<string, string>;
  deckName?: string;
}

export interface AnkiSubdeck {
  name: string;
  card_indices: number[];
  children?: AnkiSubdeck[];
}

export interface AnkiParseResult {
  deckName: string;
  cards: AnkiCard[];
  mediaCount: number;
  subdecks?: AnkiSubdeck[];
  /** Call this to revoke all Blob URLs and free memory */
  cleanup?: () => void;
}

export type AnkiProgressCallback = (message: string, current?: number, total?: number) => void;

interface AnkiModel {
  name: string;
  flds: { name: string; ord: number }[];
  type: number; // 0 = standard, 1 = cloze
  tmpls: { name: string; qfmt: string; afmt: string; ord: number }[];
}

/* ── helpers ── */

/** Yield to event loop so UI can update */
const yieldToUI = () => new Promise<void>(r => setTimeout(r, 0));

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

function isLikelySQLite(bytes: Uint8Array): boolean {
  if (bytes.length < 16) return false;
  const header = Array.from(bytes.slice(0, 16)).map(b => String.fromCharCode(b)).join('');
  return header === 'SQLite format 3\0';
}

function isLikelyZstd(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x28 && bytes[1] === 0xb5 && bytes[2] === 0x2f && bytes[3] === 0xfd;
}

function normalizeAnkiId(value: string | number | null | undefined): string {
  if (value == null) return '';
  const raw = String(value).trim();
  if (!raw) return '';

  if (/^-?\d+(\.0+)?$/.test(raw)) {
    return raw.replace(/\.0+$/, '');
  }

  if (/^-?\d+(\.\d+)?e[+-]?\d+$/i.test(raw)) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) {
      return Math.trunc(parsed).toString();
    }
  }

  return raw;
}

function splitDeckPath(rawDeckName: string): string[] {
  const raw = rawDeckName.trim();
  if (!raw) return [];

  const parts = raw
    .split(/::|\u001f|[\|｜¦]/g)
    .map(part => part.trim())
    .filter(Boolean);

  return parts.length > 0 ? parts : [raw];
}

async function resolveAnkiArchive(file: File): Promise<JSZip> {
  let zip = await JSZip.loadAsync(file);

  for (let depth = 0; depth < 3; depth++) {
    const hasCollection = Object.values(zip.files).some(
      entry => !entry.dir && /(^|\/)collection\.anki(21b|21|2)$/i.test(entry.name)
    );
    if (hasCollection) return zip;

    const innerArchive = Object.values(zip.files).find(
      entry => !entry.dir && /\.(apkg|colpkg|zip)$/i.test(entry.name)
    );
    if (!innerArchive) return zip;

    const innerBlob = await innerArchive.async('blob');
    zip = await JSZip.loadAsync(innerBlob);
  }

  return zip;
}

async function findDatabaseFile(zip: JSZip): Promise<{ dbBytes: Uint8Array; isModernFormat: boolean }> {
  const files = Object.values(zip.files).filter(entry => !entry.dir);

  const candidates = files
    .filter(entry => /(^|\/)collection\.anki(21b|21|2)$/i.test(entry.name))
    .map(entry => {
      const lower = entry.name.toLowerCase();
      const priority = lower.endsWith('collection.anki21b') ? 0 : lower.endsWith('collection.anki21') ? 1 : 2;
      return { entry, priority };
    })
    .sort((a, b) => a.priority - b.priority);

  if (candidates.length === 0) {
    throw new Error('Arquivo .apkg inválido: banco de dados não encontrado');
  }

  let fallback: { dbBytes: Uint8Array; isModernFormat: boolean } | null = null;

  for (const { entry } of candidates) {
    const rawBytes = await entry.async('uint8array');
    const isModernFormat = /collection\.anki21b$/i.test(entry.name);

    let dbBytes = rawBytes;
    if (!isLikelySQLite(dbBytes) && isLikelyZstd(dbBytes)) {
      try {
        dbBytes = fzstd.decompress(dbBytes);
      } catch (error) {
        console.warn('Falha ao descompactar banco Anki em zstd:', error);
      }
    }

    if (!fallback) {
      fallback = { dbBytes, isModernFormat };
    }

    if (isLikelySQLite(dbBytes)) {
      return { dbBytes, isModernFormat };
    }
  }

  return fallback!;
}

/* ── extract media (lazy, Blob URLs, parallel batches) ── */

function parseMediaMapping(zip: JSZip): Record<string, string> {
  return {};  // placeholder, actual parsing is async
}

async function loadMediaMapping(zip: JSZip): Promise<Record<string, string>> {
  if (!zip.files['media']) return {};
  try {
    const mediaText = await zip.files['media'].async('text');
    return JSON.parse(mediaText) as Record<string, string>;
  } catch {
    return {};
  }
}

/** Scan all cards to find which media filenames are actually referenced */
function collectReferencedMedia(cards: AnkiCard[]): Set<string> {
  const refs = new Set<string>();
  const srcRegex = /src="([^"]+)"/g;
  const soundRegex = /\[sound:([^\]]+)\]/g;
  for (const card of cards) {
    for (const html of [card.front, card.back]) {
      let m: RegExpExecArray | null;
      srcRegex.lastIndex = 0;
      while ((m = srcRegex.exec(html))) refs.add(m[1]);
      soundRegex.lastIndex = 0;
      while ((m = soundRegex.exec(html))) refs.add(m[1]);
    }
  }
  return refs;
}

const MIME_MAP: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
};

async function extractMediaLazy(
  zip: JSZip,
  referencedFiles: Set<string>,
  onProgress?: AnkiProgressCallback,
): Promise<{ mediaMap: Map<string, string>; totalMediaCount: number }> {
  const mediaMapping = await loadMediaMapping(zip);
  const totalMediaCount = Object.keys(mediaMapping).length;

  // Filter to only needed files
  const needed = Object.entries(mediaMapping)
    .filter(([_, name]) => referencedFiles.has(name));

  const mediaMap = new Map<string, string>();
  if (needed.length === 0) return { mediaMap, totalMediaCount };

  const BATCH = 20;
  for (let i = 0; i < needed.length; i += BATCH) {
    const batch = needed.slice(i, i + BATCH);
    await Promise.all(batch.map(async ([num, name]) => {
      const file = zip.files[num];
      if (!file) return;
      try {
        const blob = await file.async('blob');
        const ext = name.split('.').pop()?.toLowerCase() || '';
        const mimeType = MIME_MAP[ext] || 'application/octet-stream';
        const typedBlob = new Blob([blob], { type: mimeType });
        mediaMap.set(name, URL.createObjectURL(typedBlob));
      } catch {}
    }));
    const done = Math.min(i + BATCH, needed.length);
    onProgress?.(`Extraindo mídia (${done}/${needed.length})...`, done, needed.length);
  }

  return { mediaMap, totalMediaCount };
}

/* ── parse models from legacy col table ── */

function parseModelsFromCol(db: Database): { models: Record<string, AnkiModel>; deckName: string; deckNamesById: Record<string, string> } {
  const models: Record<string, AnkiModel> = {};
  const deckNamesById: Record<string, string> = {};
  let deckName = 'Anki Import';

  try {
    const colResult = db.exec('SELECT models, decks FROM col LIMIT 1');
    if (colResult.length > 0 && colResult[0].values.length > 0) {
      const modelsRaw = colResult[0].values[0][0] as string;
      if (modelsRaw && modelsRaw.startsWith('{')) {
        const modelsJson = JSON.parse(modelsRaw);
        for (const [mid, model] of Object.entries(modelsJson)) {
          const m = model as any;
          const normalizedMid = normalizeAnkiId(mid);
          models[normalizedMid] = {
            name: m.name || '',
            flds: (m.flds || []).map((f: any) => ({ name: f.name, ord: f.ord })).sort((a: any, b: any) => a.ord - b.ord),
            type: m.type || 0,
            tmpls: (m.tmpls || []).map((t: any) => ({ name: t.name, qfmt: t.qfmt, afmt: t.afmt, ord: t.ord })),
          };
        }
      }

      const decksRaw = colResult[0].values[0][1] as string;
      if (decksRaw && decksRaw.startsWith('{')) {
        const decksJson = JSON.parse(decksRaw) as Record<string, any>;
        for (const [id, deck] of Object.entries(decksJson)) {
          if (deck?.name) deckNamesById[normalizeAnkiId(id)] = String(deck.name);
        }

        const deckEntries = Object.values(decksJson) as any[];
        const nonDefault = deckEntries.find((d: any) => d.name !== 'Default' && d.name !== 'Padrão');
        if (nonDefault) deckName = nonDefault.name;
        else if (deckEntries.length > 0) deckName = deckEntries[0].name;
      }
    }
  } catch (e) {
    console.warn('Failed to parse col table:', e);
  }

  return { models, deckName, deckNamesById };
}

/* ── parse models from anki21b tables (notetypes, fields, templates) ── */

function parseModelsFromTables(db: Database): { models: Record<string, AnkiModel>; deckName: string; deckNamesById: Record<string, string> } {
  const models: Record<string, AnkiModel> = {};
  const deckNamesById: Record<string, string> = {};
  let deckName = 'Anki Import';

  try {
    const tableCheck = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='notetypes'");
    if (tableCheck.length === 0 || tableCheck[0].values.length === 0) {
      return { models, deckName, deckNamesById };
    }

    const ntResult = db.exec('SELECT id, name, config FROM notetypes');
    if (ntResult.length > 0) {
      for (const row of ntResult[0].values) {
        const ntId = normalizeAnkiId(row[0] as string | number);
        const ntName = row[1] as string;
        models[ntId] = { name: ntName, flds: [], type: 0, tmpls: [] };
      }
    }

    const fieldsResult = db.exec('SELECT ntid, ord, name FROM fields ORDER BY ord');
    if (fieldsResult.length > 0) {
      for (const row of fieldsResult[0].values) {
        const ntId = normalizeAnkiId(row[0] as string | number);
        if (models[ntId]) {
          models[ntId].flds.push({ name: row[2] as string, ord: row[1] as number });
        }
      }
    }

    const tmplResult = db.exec('SELECT ntid, ord, name, qfmt, afmt FROM templates ORDER BY ord');
    if (tmplResult.length > 0) {
      for (const row of tmplResult[0].values) {
        const ntId = normalizeAnkiId(row[0] as string | number);
        if (models[ntId]) {
          const qfmt = row[3] as string;
          models[ntId].tmpls.push({
            name: row[2] as string,
            qfmt,
            afmt: row[4] as string,
            ord: row[1] as number,
          });
          if (/\{\{cloze:/i.test(qfmt)) {
            models[ntId].type = 1;
          }
        }
      }
    }

    const decksCheck = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='decks'");
    if (decksCheck.length > 0 && decksCheck[0].values.length > 0) {
      const decksResult = db.exec('SELECT CAST(id AS TEXT), name FROM decks');
      if (decksResult.length > 0) {
        for (const row of decksResult[0].values) {
          const dId = normalizeAnkiId(row[0] as string | number);
          const dName = row[1] as string;
          if (dName) deckNamesById[dId] = dName;
          if (dName && dName !== 'Default' && dName !== 'Padrão' && deckName === 'Anki Import') {
            deckName = dName;
          }
        }
      }
    }
  } catch (e) {
    console.warn('Failed to parse anki21b tables:', e);
  }

  return { models, deckName, deckNamesById };
}


function parseDeckNamesFromDecksTable(db: Database): Record<string, string> {
  const deckNamesById: Record<string, string> = {};

  try {
    const tableCheck = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='decks'");
    if (tableCheck.length === 0 || tableCheck[0].values.length === 0) return deckNamesById;

    const columns = db.exec('PRAGMA table_info(decks)');
    const colSet = new Set<string>();
    if (columns.length > 0) {
      for (const row of columns[0].values) {
        colSet.add(String(row[1]));
      }
    }

    const idCol = colSet.has('id') ? 'id' : colSet.has('deck_id') ? 'deck_id' : colSet.has('did') ? 'did' : null;
    const nameCol = colSet.has('name') ? 'name' : colSet.has('title') ? 'title' : null;

    if (!idCol || !nameCol) return deckNamesById;

    const result = db.exec(`SELECT CAST(${idCol} AS TEXT), ${nameCol} FROM decks`);
    if (result.length === 0) return deckNamesById;

    for (const row of result[0].values) {
      const id = normalizeAnkiId(row[0] as string | number);
      const name = row[1] as string;
      if (id && name) deckNamesById[id] = name;
    }
  } catch (e) {
    console.warn('Failed to parse decks table directly:', e);
  }

  return deckNamesById;
}

/* ── build cards from notes ── */

async function buildCards(
  db: Database,
  models: Record<string, AnkiModel>,
  mediaMap: Map<string, string>,
  deckNamesById: Record<string, string>,
): Promise<AnkiCard[]> {
  const cards: AnkiCard[] = [];

  let cardRows: Array<{
    noteId: string;
    deckId: string;
    templateOrd: number | null;
    mid: string;
    flds: string;
    tags: string;
  }> = [];

  try {
    const noteColsResult = db.exec('PRAGMA table_info(notes)');
    const noteCols = new Set<string>();
    if (noteColsResult.length > 0) {
      for (const row of noteColsResult[0].values) {
        noteCols.add(String(row[1]));
      }
    }

    const cardColsResult = db.exec('PRAGMA table_info(cards)');
    const cardCols = new Set<string>();
    if (cardColsResult.length > 0) {
      for (const row of cardColsResult[0].values) {
        cardCols.add(String(row[1]));
      }
    }

    const notesIdColumn = noteCols.has('id') ? 'id' : noteCols.has('note_id') ? 'note_id' : null;
    const notesModelColumn = noteCols.has('mid') ? 'mid' : noteCols.has('notetype_id') ? 'notetype_id' : null;
    const notesFieldsColumn = noteCols.has('flds') ? 'flds' : noteCols.has('fields') ? 'fields' : null;
    const notesTagsColumn = noteCols.has('tags') ? 'tags' : null;

    const cardNoteColumn = cardCols.has('nid') ? 'nid' : cardCols.has('note_id') ? 'note_id' : null;
    const cardDeckColumn = cardCols.has('did') ? 'did' : cardCols.has('deck_id') ? 'deck_id' : null;
    const cardOrdColumn = cardCols.has('ord') ? 'ord' : cardCols.has('template_idx') ? 'template_idx' : null;

    if (!notesIdColumn || !notesModelColumn || !notesFieldsColumn || !cardNoteColumn || !cardDeckColumn) {
      throw new Error('Estrutura do banco Anki não suportada (notes/cards).');
    }

    const tagsSelect = notesTagsColumn ? `, n.${notesTagsColumn}` : ", ''";
    const ordSelect = cardOrdColumn ? `, c.${cardOrdColumn}` : ', NULL';

    const sql = `SELECT c.${cardNoteColumn}, c.${cardDeckColumn}${ordSelect}, n.${notesModelColumn}, n.${notesFieldsColumn}${tagsSelect}
       FROM cards c
       JOIN notes n ON n.${notesIdColumn} = c.${cardNoteColumn}`;

    console.log('[ANKI] buildCards SQL prepare start');
    const stmt = db.prepare(sql);
    let rowCount = 0;
    while (stmt.step()) {
      const row = stmt.get();
      cardRows.push({
        noteId: normalizeAnkiId(row[0] as string | number),
        deckId: normalizeAnkiId(row[1] as string | number),
        templateOrd: row[2] == null ? null : Number(row[2]),
        mid: normalizeAnkiId(row[3] as string | number),
        flds: (row[4] as string) || '',
        tags: (row[5] as string) || '',
      });
      rowCount++;
      // Yield every 2000 rows to keep browser alive
      if (rowCount % 2000 === 0) {
        await yieldToUI();
        console.log(`[ANKI] buildCards read ${rowCount} rows...`);
      }
    }
    stmt.free();
    console.log(`[ANKI] buildCards SQL done, total rows: ${rowCount}`);
  } catch (error) {
    console.warn('Failed to read cards/notes join, falling back to notes table:', error);
  }

  if (cardRows.length === 0) {
    // Fallback compatível com parsers antigos
    const notesResult = db.exec('SELECT CAST(id AS TEXT), CAST(mid AS TEXT), flds, tags FROM notes');
    if (notesResult.length === 0) return cards;

    for (const row of notesResult[0].values) {
      cardRows.push({
        noteId: normalizeAnkiId(row[0] as string | number),
        deckId: '',
        templateOrd: null,
        mid: normalizeAnkiId(row[1] as string | number),
        flds: (row[2] as string) || '',
        tags: (row[3] as string) || '',
      });
    }
  }

  const CARD_CHUNK = 500;
  for (let ci = 0; ci < cardRows.length; ci++) {
    const row = cardRows[ci];
    const normalizedMid = normalizeAnkiId(row.mid);
    const normalizedDeckId = normalizeAnkiId(row.deckId);
    const model = models[normalizedMid];
    const fieldValues = row.flds.split('\x1f');
    const tags = row.tags.trim().split(/\s+/).filter(Boolean);
    const deckName = normalizedDeckId ? deckNamesById[normalizedDeckId] : undefined;

    if (!model) {
      const front = replaceMediaRefs(fieldValues[0] || '', mediaMap);
      const back = replaceMediaRefs(fieldValues.slice(1).join('<br>'), mediaMap);
      if (front.trim()) {
        cards.push({ front, back, cardType: 'basic', tags, media: mediaMap, deckName });
      }
      continue;
    }

    const fieldMap: Record<string, string> = {};
    model.flds.forEach((f, i) => {
      fieldMap[f.name] = fieldValues[i] || '';
    });

    if (model.type === 1) {
      const frontContent = convertClozeFormat(replaceMediaRefs(fieldValues[0] || '', mediaMap));
      const targetFromOrd = row.templateOrd != null && row.templateOrd >= 0 ? row.templateOrd + 1 : null;

      if (targetFromOrd) {
        cards.push({
          front: frontContent,
          back: JSON.stringify({ clozeTarget: targetFromOrd }),
          cardType: 'cloze',
          tags,
          media: mediaMap,
          deckName,
        });
      } else {
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
              deckName,
            });
          }
        }
      }
      continue;
    }

    if (model.tmpls.length > 0 && row.templateOrd != null && row.templateOrd >= 0) {
      const tmpl = model.tmpls.find(t => t.ord === row.templateOrd);
      if (tmpl) {
        const front = renderTemplate(tmpl.qfmt, fieldMap);
        const back = renderTemplate(tmpl.afmt, fieldMap);
        if (front.trim()) {
          cards.push({
            front: replaceMediaRefs(front, mediaMap),
            back: replaceMediaRefs(back, mediaMap),
            cardType: 'basic',
            tags,
            media: mediaMap,
            deckName,
          });
        }
        continue;
      }
    }

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
            deckName,
          });
        }
      }
    } else {
      const front = replaceMediaRefs(fieldValues[0] || '', mediaMap);
      const back = replaceMediaRefs(fieldValues.slice(1).join('<br>'), mediaMap);
      if (front.trim()) cards.push({ front, back, cardType: 'basic', tags, media: mediaMap, deckName });
    }

    // Yield every CARD_CHUNK cards to keep browser responsive
    if (ci > 0 && ci % CARD_CHUNK === 0) {
      await yieldToUI();
    }
  }
}

function buildSubdecks(cards: AnkiCard[], rootDeckName: string): AnkiSubdeck[] {
  const tree: AnkiSubdeck[] = [];

  const ensureChild = (nodes: AnkiSubdeck[], name: string) => {
    let child = nodes.find(n => n.name === name);
    if (!child) {
      child = { name, card_indices: [], children: [] };
      nodes.push(child);
    }
    return child;
  };

  cards.forEach((card, cardIndex) => {
    if (!card.deckName) return;
    const parts = splitDeckPath(card.deckName);
    if (parts.length === 0) return;

    const relative = parts[0] === rootDeckName ? parts.slice(1) : parts;
    if (relative.length === 0) return;

    let level = tree;
    let current: AnkiSubdeck | null = null;
    for (const part of relative) {
      current = ensureChild(level, part);
      if (!current.children) current.children = [];
      level = current.children;
    }

    if (current) current.card_indices.push(cardIndex);
  });

  const sortTree = (nodes: AnkiSubdeck[]): AnkiSubdeck[] => {
    nodes.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    for (const node of nodes) {
      if (node.children && node.children.length > 0) {
        sortTree(node.children);
      }
    }
    return nodes;
  };

  return sortTree(tree);
}

/* ── main entry point ── */

export async function parseApkgFile(
  file: File,
  onProgress?: AnkiProgressCallback,
): Promise<AnkiParseResult> {
  const t0 = performance.now();
  const log = (msg: string) => console.log(`[ANKI] ${msg} (+${Math.round(performance.now() - t0)}ms)`);
  const elapsed = () => Math.round(performance.now() - t0);

  // Global timeout: 120s
  const TIMEOUT_MS = 120_000;
  const checkTimeout = (stage: string) => {
    if (performance.now() - t0 > TIMEOUT_MS) {
      throw new Error(`Timeout na etapa "${stage}" — arquivo muito grande para processar no navegador (${elapsed()}ms)`);
    }
  };

  try {
    // ── Stage 1: Init SQL.js ──
    onProgress?.('Inicializando...');
    log(`File: ${file.name}, size: ${(file.size / 1024 / 1024).toFixed(2)}MB`);
    await yieldToUI();

    log('initSqlJs start (wasm)');
    let SQL: Awaited<ReturnType<typeof initSqlJs>>;
    try {
      SQL = await initSqlJs({ locateFile: () => '/sql-wasm.wasm' });
    } catch (e) {
      log('initSqlJs FAILED: ' + e);
      throw new Error('Falha ao inicializar o mecanismo SQL. Recarregue a página e tente novamente.');
    }
    log('initSqlJs done (wasm)');
    await yieldToUI();
    checkTimeout('initSqlJs');

    // ── Stage 2: Open ZIP ──
    onProgress?.('Descompactando arquivo...');
    await yieldToUI();
    log('resolveAnkiArchive start');
    let zip: JSZip;
    try {
      zip = await resolveAnkiArchive(file);
    } catch (e) {
      log('resolveAnkiArchive FAILED: ' + e);
      throw new Error('Falha ao descompactar o arquivo. Verifique se o .apkg não está corrompido.');
    }
    const fileCount = Object.keys(zip.files).length;
    log('resolveAnkiArchive done, files: ' + fileCount);
    await yieldToUI();
    checkTimeout('descompactação');

    // ── Stage 3: Find & open SQLite DB ──
    onProgress?.('Lendo banco de dados...');
    await yieldToUI();
    log('findDatabaseFile start');
    let dbBytes: Uint8Array;
    let isModernFormat: boolean;
    try {
      const result = await findDatabaseFile(zip);
      dbBytes = result.dbBytes;
      isModernFormat = result.isModernFormat;
    } catch (e) {
      log('findDatabaseFile FAILED: ' + e);
      throw new Error('Banco de dados SQLite não encontrado no arquivo .apkg.');
    }
    log(`findDatabaseFile done, dbBytes: ${(dbBytes.length / 1024 / 1024).toFixed(2)}MB, modern: ${isModernFormat}`);
    await yieldToUI();
    checkTimeout('findDatabaseFile');

    // ── Stage 4: Open SQLite ──
    onProgress?.('Abrindo banco de dados...');
    await yieldToUI();
    log('SQL.Database start');
    let db: Database;
    try {
      db = new SQL.Database(dbBytes);
    } catch (e) {
      log('SQL.Database FAILED: ' + e);
      throw new Error('Falha ao abrir o banco de dados Anki. O arquivo pode estar corrompido.');
    }
    log('SQL.Database done');
    await yieldToUI();
    checkTimeout('SQL.Database');

    // ── Stage 5: Parse models ──
    onProgress?.('Lendo modelos...');
    await yieldToUI();
    let models: Record<string, AnkiModel> = {};
    let deckName = 'Anki Import';
    let deckNamesById: Record<string, string> = {};

    try {
      if (isModernFormat) {
        const result = parseModelsFromTables(db);
        models = result.models;
        deckName = result.deckName;
        deckNamesById = result.deckNamesById;
      }

      if (Object.keys(models).length === 0) {
        const result = parseModelsFromCol(db);
        models = result.models;
        deckNamesById = Object.keys(deckNamesById).length > 0 ? deckNamesById : result.deckNamesById;
        if (result.deckName !== 'Anki Import') deckName = result.deckName;
      }

      if (Object.keys(models).length === 0) {
        const result = parseModelsFromTables(db);
        models = result.models;
        deckNamesById = Object.keys(deckNamesById).length > 0 ? deckNamesById : result.deckNamesById;
        if (result.deckName !== 'Anki Import') deckName = result.deckName;
      }

      if (Object.keys(deckNamesById).length === 0) {
        const tableDeckNames = parseDeckNamesFromDecksTable(db);
        if (Object.keys(tableDeckNames).length > 0) {
          deckNamesById = tableDeckNames;
          const candidate = Object.values(tableDeckNames).find(name => name !== 'Default' && name !== 'Padrão');
          if (candidate) deckName = candidate;
        }
      }
    } catch (e) {
      log('parseModels FAILED: ' + e);
      // Continue — we can still try buildCards with empty models
    }

    log('Parsing models done, models: ' + Object.keys(models).length + ', decks: ' + Object.keys(deckNamesById).length);
    await yieldToUI();
    checkTimeout('parseModels');

    // ── Stage 6: Build cards ──
    onProgress?.('Processando cartões...');
    await yieldToUI();

    const emptyMedia = new Map<string, string>();
    let cards: AnkiCard[] = [];

    try {
      log('buildCards start');
      cards = await buildCards(db, models, emptyMedia, deckNamesById);
      log('buildCards done, cards: ' + cards.length);
    } catch (e) {
      log('buildCards FAILED: ' + e);
      console.error('Failed to parse notes:', e);
      throw new Error('Erro ao extrair cartões do arquivo Anki. O banco pode ter um formato não suportado.');
    }

    await yieldToUI();
    checkTimeout('buildCards');

    if (cards.length === 0) {
      db.close();
      throw new Error('Nenhum cartão encontrado no arquivo Anki.');
    }

    const rootDeckCounts = new Map<string, number>();
    for (const card of cards) {
      const root = splitDeckPath(card.deckName)[0];
      if (!root) continue;
      rootDeckCounts.set(root, (rootDeckCounts.get(root) || 0) + 1);
    }

    if (rootDeckCounts.size > 0) {
      deckName = [...rootDeckCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    }

    const subdecks = buildSubdecks(cards, deckName);

    db.close();
    log('db closed');
    await yieldToUI();

    // ── Stage 7: Extract referenced media ──
    onProgress?.('Extraindo mídia...');
    await yieldToUI();
    const referencedFiles = collectReferencedMedia(cards);
    log('referencedMedia: ' + referencedFiles.size);

    let mediaMap = new Map<string, string>();
    let totalMediaCount = 0;

    try {
      const result = await extractMediaLazy(zip, referencedFiles, onProgress);
      mediaMap = result.mediaMap;
      totalMediaCount = result.totalMediaCount;
      log('mediaExtracted: ' + mediaMap.size + '/' + totalMediaCount);
    } catch (e) {
      log('extractMedia FAILED (continuing without media): ' + e);
      // Continue without media — cards still work, just without images
    }

    // Replace media references in cards with Blob URLs
    if (mediaMap.size > 0) {
      onProgress?.('Vinculando mídia aos cartões...');
      await yieldToUI();
      for (let i = 0; i < cards.length; i++) {
        cards[i].front = replaceMediaRefs(cards[i].front, mediaMap);
        cards[i].back = replaceMediaRefs(cards[i].back, mediaMap);
        cards[i].media = mediaMap;
        // Yield every 500 cards to keep UI responsive
        if (i % 500 === 0 && i > 0) {
          await yieldToUI();
          checkTimeout('replaceMediaRefs');
        }
      }
      log('media refs replaced');
    }

    log(`DONE — ${cards.length} cards, ${mediaMap.size} media, total ${elapsed()}ms`);

    // Cleanup function to revoke all Blob URLs
    const cleanup = () => {
      for (const url of mediaMap.values()) {
        try { URL.revokeObjectURL(url); } catch {}
      }
    };

    return {
      deckName,
      cards,
      mediaCount: totalMediaCount,
      subdecks: subdecks.length > 0 ? subdecks : undefined,
      cleanup,
    };
  } catch (error) {
    log(`FAILED at ${elapsed()}ms: ${error}`);
    throw error;
  }
}
