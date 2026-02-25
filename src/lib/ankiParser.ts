/**
 * Anki .apkg / .colpkg parser for browser.
 * Supports both legacy (anki2/anki21) and modern (anki21b) formats.
 *
 * Legacy: col.models contains JSON with model definitions
 * Modern (anki21b): separate notetypes, fields, templates tables
 */

import JSZip from 'jszip';
import * as fzstd from 'fzstd';
import initSqlJs, { type Database } from 'sql.js/dist/sql-asm.js';

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

function buildCards(
  db: Database,
  models: Record<string, AnkiModel>,
  mediaMap: Map<string, string>,
  deckNamesById: Record<string, string>,
): AnkiCard[] {
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

    const rowsResult = db.exec(
      `SELECT CAST(c.${cardNoteColumn} AS TEXT), CAST(c.${cardDeckColumn} AS TEXT)${ordSelect}, CAST(n.${notesModelColumn} AS TEXT), n.${notesFieldsColumn}${tagsSelect}
       FROM cards c
       JOIN notes n ON CAST(n.${notesIdColumn} AS TEXT) = CAST(c.${cardNoteColumn} AS TEXT)`
    );

    if (rowsResult.length > 0) {
      cardRows = rowsResult[0].values.map((row) => ({
        noteId: normalizeAnkiId(row[0] as string | number),
        deckId: normalizeAnkiId(row[1] as string | number),
        templateOrd: row[2] == null ? null : Number(row[2]),
        mid: normalizeAnkiId(row[3] as string | number),
        flds: (row[4] as string) || '',
        tags: (row[5] as string) || '',
      }));
    }
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

  for (const row of cardRows) {
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
  }

  return cards;
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
    const parts = card.deckName.split('::').map(p => p.trim()).filter(Boolean);
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

  return tree;
}

/* ── main entry point ── */

export async function parseApkgFile(file: File): Promise<AnkiParseResult> {
  const SQL = await initSqlJs();

  // Open package (supports wrapper .zip/.apkg recursively)
  const zip = await resolveAnkiArchive(file);

  // Extract media
  const mediaMap = await extractMedia(zip);

  // Find and open SQLite DB
  const { dbBytes, isModernFormat } = await findDatabaseFile(zip);
  const db: Database = new SQL.Database(dbBytes);

  // Parse models — try modern tables first, fallback to legacy col table
  let models: Record<string, AnkiModel> = {};
  let deckName = 'Anki Import';
  let deckNamesById: Record<string, string> = {};

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
  let cards: AnkiCard[] = [];

  try {
    cards = buildCards(db, models, mediaMap, deckNamesById);
  } catch (e) {
    console.error('Failed to parse notes:', e);
    throw new Error('Erro ao extrair cartões do arquivo Anki');
  }

  const rootDeckCounts = new Map<string, number>();
  for (const card of cards) {
    const root = card.deckName?.split('::')[0]?.trim();
    if (!root) continue;
    rootDeckCounts.set(root, (rootDeckCounts.get(root) || 0) + 1);
  }

  if (rootDeckCounts.size > 0) {
    deckName = [...rootDeckCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }

  const subdecks = buildSubdecks(cards, deckName);

  db.close();

  return {
    deckName,
    cards,
    mediaCount: mediaMap.size,
    subdecks: subdecks.length > 0 ? subdecks : undefined,
  };
}
