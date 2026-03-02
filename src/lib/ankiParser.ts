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

export interface AnkiCardProgress {
  state: number;       // 0=new, 1=learning, 2=review, 3=relearning
  stability: number;   // from ivl (days)
  difficulty: number;  // from factor (converted to FSRS 1-10 scale)
  scheduledDate: string; // ISO string
  learningStep: number;
  lastReviewedAt?: string;
}

export interface AnkiReviewLogEntry {
  cardIndex: number;   // index in the cards output array
  rating: number;      // 1-4
  reviewedAt: string;  // ISO string
  stability: number;
  difficulty: number;
  scheduledDate: string;
  state: number | null;
  elapsedMs: number | null;
}

export interface AnkiParseResult {
  deckName: string;
  cards: AnkiCard[];
  mediaCount: number;
  /** Number of media files referenced in cards but not found in the archive */
  missingMediaCount: number;
  subdecks?: AnkiSubdeck[];
  progress?: AnkiCardProgress[];
  revlog?: AnkiReviewLogEntry[];
  hasProgress?: boolean;
  /** Call this to revoke all Blob URLs and free memory */
  cleanup?: () => void;
}

export type AnkiProgressCallback = (message: string, current?: number, total?: number) => void;

interface AnkiModel {
  id: string;
  name: string;
  type: number;
  flds: Array<{ name: string; ord: number }>;
  tmpls: Array<{ name: string; qfmt: string; afmt: string; ord: number }>;
}

async function yieldToUI() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

function replaceMediaRefs(html: string, mediaMap: Map<string, string>): string {
  return html.replace(/src="([^"]+)"/gi, (match, filename) => {
    const blobUrl = mediaMap.get(filename);
    return blobUrl ? `src="${blobUrl}"` : match;
  });
}

function stripAnkiTemplateSyntax(text: string): string {
  return text
    .replace(/\{\{[^}]+\}\}/g, '')
    .replace(/<[^>]+>/g, '')
    .trim();
}

function renderTemplate(template: string, fields: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(fields)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'gi');
    result = result.replace(regex, value || '');
  }
  result = result.replace(/\{\{[^}]+\}\}/g, '');
  return result;
}

function convertClozeFormat(text: string): string {
  return text.replace(/\{\{c(\d+)::([^}]+)\}\}/g, '{{c$1::$2}}');
}

function isLikelySQLite(bytes: Uint8Array): boolean {
  if (bytes.length < 16) return false;
  const header = String.fromCharCode(...bytes.slice(0, 16));
  return header.startsWith('SQLite format 3');
}

function isLikelyZstd(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  return bytes[0] === 0x28 && bytes[1] === 0xb5 && bytes[2] === 0x2f && bytes[3] === 0xfd;
}

function normalizeAnkiId(val: string | number): string {
  return String(val);
}

function splitDeckPath(deckName: string): string[] {
  return deckName.split('::').map(s => s.trim()).filter(Boolean);
}

async function resolveAnkiArchive(file: File): Promise<JSZip> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (isLikelyZstd(bytes)) {
    const decompressed = fzstd.decompress(bytes);
    return await JSZip.loadAsync(decompressed);
  }
  return await JSZip.loadAsync(bytes);
}

async function findDatabaseFile(zip: JSZip): Promise<{ dbBytes: Uint8Array; isModernFormat: boolean }> {
  const allFiles = Object.keys(zip.files);
  console.log('[ANKI] ZIP contains files:', allFiles.join(', '));

  // Check for anki21b / anki21 first (modern format)
  const collectionAnki21 = zip.file('collection.anki21') || zip.file('collection.anki21b');
  if (collectionAnki21) {
    console.log('[ANKI] Found modern collection file:', collectionAnki21.name);
    const bytes = await collectionAnki21.async('uint8array');
    console.log('[ANKI] collection.anki21 size:', bytes.length, 'isSQLite:', isLikelySQLite(bytes), 'isZstd:', isLikelyZstd(bytes));
    if (isLikelySQLite(bytes)) {
      return { dbBytes: bytes, isModernFormat: true };
    }
    if (isLikelyZstd(bytes)) {
      const decompressed = fzstd.decompress(bytes);
      console.log('[ANKI] Decompressed anki21 size:', decompressed.length, 'isSQLite:', isLikelySQLite(decompressed));
      return { dbBytes: decompressed, isModernFormat: true };
    }
    console.warn('[ANKI] collection.anki21 exists but is neither SQLite nor zstd');
  }

  const collectionAnki2 = zip.file('collection.anki2');
  if (collectionAnki2) {
    const bytes = await collectionAnki2.async('uint8array');
    console.log('[ANKI] Using collection.anki2, size:', bytes.length);
    if (isLikelySQLite(bytes)) {
      return { dbBytes: bytes, isModernFormat: false };
    }
  }

  throw new Error('Arquivo de banco de dados não encontrado no .apkg');
}

async function parseMediaMapping(zip: JSZip): Promise<Record<string, string>> {
  const mediaFile = zip.file('media');
  if (!mediaFile) return {};
  try {
    const bytes = await mediaFile.async('uint8array');
    // Try JSON first (Legacy formats)
    try {
      const text = new TextDecoder().decode(bytes);
      const parsed = JSON.parse(text);
      if (typeof parsed === 'object' && parsed !== null) {
        return parsed;
      }
    } catch {
      // Not JSON — try Protobuf (⚡ Latest format)
    }

    // Parse Protobuf MediaEntries: repeated MediaEntry entries = 1;
    // MediaEntry: string name = 1; uint32 size = 2; bytes sha1 = 3;
    // We only need the names, indexed by position.
    const result: Record<string, string> = {};
    let entryIndex = 0;
    let offset = 0;

    while (offset < bytes.length) {
      const [fieldTag, newOffset] = readVarint(bytes, offset);
      offset = newOffset;
      const fieldNum = fieldTag >> 3;
      const wireType = fieldTag & 0x7;

      if (wireType === 2) { // length-delimited
        const [len, lenOffset] = readVarint(bytes, offset);
        offset = lenOffset;
        if (fieldNum === 1) {
          // This is a MediaEntry sub-message
          const entryBytes = bytes.subarray(offset, offset + len);
          const name = parseMediaEntryName(entryBytes);
          if (name) {
            result[String(entryIndex)] = name;
          }
          entryIndex++;
        }
        offset += len;
      } else if (wireType === 0) { // varint
        const [, vOffset] = readVarint(bytes, offset);
        offset = vOffset;
      } else {
        // Unknown wire type, bail
        break;
      }
    }

    if (Object.keys(result).length > 0) {
      console.log('[ANKI] Parsed protobuf media mapping:', Object.keys(result).length, 'entries');
      return result;
    }
  } catch (err) {
    console.warn('[ANKI] Failed to parse media mapping:', err);
  }
  return {};
}

function readVarint(bytes: Uint8Array, offset: number): [number, number] {
  let result = 0;
  let shift = 0;
  while (offset < bytes.length) {
    const byte = bytes[offset++];
    result |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) break;
    shift += 7;
    if (shift > 35) break; // safety
  }
  return [result >>> 0, offset];
}

function parseMediaEntryName(bytes: Uint8Array): string | null {
  let offset = 0;
  while (offset < bytes.length) {
    const [fieldTag, newOffset] = readVarint(bytes, offset);
    offset = newOffset;
    const fieldNum = fieldTag >> 3;
    const wireType = fieldTag & 0x7;

    if (wireType === 2) {
      const [len, lenOffset] = readVarint(bytes, offset);
      offset = lenOffset;
      if (fieldNum === 1) {
        // string name = 1
        return new TextDecoder().decode(bytes.subarray(offset, offset + len));
      }
      offset += len;
    } else if (wireType === 0) {
      const [, vOffset] = readVarint(bytes, offset);
      offset = vOffset;
    } else {
      break;
    }
  }
  return null;
}

async function loadMediaMapping(zip: JSZip): Promise<Map<string, string>> {
  const mapping = await parseMediaMapping(zip);
  // mapping is { "0": "image.jpg", "1": "photo.png" }
  // We need numericKey → filename so extractMediaLazy can look up by zip entry name
  const result = new Map<string, string>();
  for (const [key, value] of Object.entries(mapping)) {
    result.set(key, value);
  }
  return result;
}

function collectReferencedMedia(cards: AnkiCard[]): Set<string> {
  const referenced = new Set<string>();
  const srcRegex = /src="([^"]+)"/gi;
  for (const card of cards) {
    let match;
    while ((match = srcRegex.exec(card.front)) !== null) {
      referenced.add(match[1]);
    }
    while ((match = srcRegex.exec(card.back)) !== null) {
      referenced.add(match[1]);
    }
  }
  return referenced;
}

const MIME_MAP: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  mp4: 'video/mp4',
  webm: 'video/webm',
};

async function extractMediaLazy(
  zip: JSZip,
  referencedFiles: Set<string>,
  onProgress?: AnkiProgressCallback,
): Promise<{ mediaMap: Map<string, string>; totalMediaCount: number }> {
  const mediaMap = new Map<string, string>();
  const keyToName = await loadMediaMapping(zip);
  const allMediaFiles = Object.keys(zip.files).filter(name => /^\d+$/.test(name));
  const totalMediaCount = allMediaFiles.length;
  console.log('[ANKI] mediaMapping entries:', keyToName.size, ', numbered ZIP files:', totalMediaCount);

  let processed = 0;
  for (const key of allMediaFiles) {
    const filename = keyToName.get(key);
    if (!filename || !referencedFiles.has(filename)) {
      processed++;
      continue;
    }

    const zipEntry = zip.file(key);
    if (!zipEntry) {
      processed++;
      continue;
    }

    try {
      const bytes = await zipEntry.async('uint8array');
      const ext = filename.split('.').pop()?.toLowerCase() || '';
      const mimeType = MIME_MAP[ext] || 'application/octet-stream';
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: mimeType });
      const blobUrl = URL.createObjectURL(blob);
      mediaMap.set(filename, blobUrl);
    } catch (err) {
      console.warn(`Failed to extract media ${filename}:`, err);
    }

    processed++;
    if (processed % 10 === 0) {
      onProgress?.('Extraindo mídia...', processed, totalMediaCount);
      await yieldToUI();
    }
  }

  return { mediaMap, totalMediaCount };
}

function parseModelsFromCol(db: Database): { models: Record<string, AnkiModel>; deckName: string; deckNamesById: Record<string, string> } {
  const models: Record<string, AnkiModel> = {};
  let deckName = 'Anki Import';
  const deckNamesById: Record<string, string> = {};

  try {
    const colResult = db.exec('SELECT models, decks FROM col LIMIT 1');
    if (colResult.length === 0 || colResult[0].values.length === 0) {
      return { models, deckName, deckNamesById };
    }

    const row = colResult[0].values[0];
    const modelsJson = row[0] as string;
    const decksJson = row[1] as string;

    if (modelsJson) {
      const modelsObj = JSON.parse(modelsJson);
      for (const [id, model] of Object.entries(modelsObj)) {
        const m = model as any;
        models[normalizeAnkiId(id)] = {
          id: normalizeAnkiId(id),
          name: m.name || 'Unknown',
          type: m.type || 0,
          flds: (m.flds || []).map((f: any) => ({ name: f.name, ord: f.ord })),
          tmpls: (m.tmpls || []).map((t: any) => ({ name: t.name, qfmt: t.qfmt, afmt: t.afmt, ord: t.ord })),
        };
      }
    }

    if (decksJson) {
      const decksObj = JSON.parse(decksJson);
      for (const [id, deck] of Object.entries(decksObj)) {
        const d = deck as any;
        const name = d.name || 'Default';
        deckNamesById[normalizeAnkiId(id)] = name;
        if (name !== 'Default' && name !== 'Padrão') {
          deckName = name;
        }
      }
    }
  } catch (err) {
    console.warn('parseModelsFromCol failed:', err);
  }

  return { models, deckName, deckNamesById };
}

function parseModelsFromTables(db: Database): { models: Record<string, AnkiModel>; deckName: string; deckNamesById: Record<string, string> } {
  const models: Record<string, AnkiModel> = {};
  let deckName = 'Anki Import';
  const deckNamesById: Record<string, string> = {};

  try {
    const notetypesResult = db.exec('SELECT CAST(id AS TEXT), name, config FROM notetypes');
    if (notetypesResult.length > 0) {
      // Check if templates table has qfmt/afmt columns (absent in anki21b)
      let hasQfmt = false;
      try {
        const tmplCols = db.exec('PRAGMA table_info(templates)');
        if (tmplCols.length > 0) {
          const colNames = new Set(tmplCols[0].values.map(r => String(r[1])));
          hasQfmt = colNames.has('qfmt') && colNames.has('afmt');
        }
      } catch {}

      for (const row of notetypesResult[0].values) {
        const id = normalizeAnkiId(row[0] as string);
        const name = (row[1] as string) || 'Unknown';
        const configJson = row[2] as string;
        let type = 0;
        try {
          const config = JSON.parse(configJson);
          type = config.type || 0;
        } catch {}

        const fieldsResult = db.exec(`SELECT name, ord FROM fields WHERE notetype_id = ${id} ORDER BY ord`);
        const flds = fieldsResult.length > 0
          ? fieldsResult[0].values.map(r => ({ name: r[0] as string, ord: Number(r[1]) }))
          : [];

        let tmpls: Array<{ name: string; qfmt: string; afmt: string; ord: number }> = [];
        if (hasQfmt) {
          const templatesResult = db.exec(`SELECT name, qfmt, afmt, ord FROM templates WHERE notetype_id = ${id} ORDER BY ord`);
          tmpls = templatesResult.length > 0
            ? templatesResult[0].values.map(r => ({ name: r[0] as string, qfmt: r[1] as string, afmt: r[2] as string, ord: Number(r[3]) }))
            : [];
        } else {
          // anki21b: templates table has config blob instead of qfmt/afmt — use empty templates (fallback to field-based rendering)
          try {
            const templatesResult = db.exec(`SELECT name, ord FROM templates WHERE notetype_id = ${id} ORDER BY ord`);
            tmpls = templatesResult.length > 0
              ? templatesResult[0].values.map(r => ({ name: r[0] as string, qfmt: '', afmt: '', ord: Number(r[1]) }))
              : [];
          } catch {}
        }

        models[id] = { id, name, type, flds, tmpls };
      }
    }
  } catch (err) {
    console.warn('parseModelsFromTables failed:', err);
  }

  return { models, deckName, deckNamesById };
}

function parseDeckNamesFromDecksTable(db: Database): Record<string, string> {
  const deckNamesById: Record<string, string> = {};
  try {
    const decksResult = db.exec('SELECT CAST(id AS TEXT), name FROM decks');
    if (decksResult.length > 0) {
      for (const row of decksResult[0].values) {
        deckNamesById[normalizeAnkiId(row[0] as string)] = (row[1] as string) || 'Default';
      }
    }
  } catch {}
  return deckNamesById;
}

/* ── build cards from notes ── */

async function buildCards(
  db: Database,
  models: Record<string, AnkiModel>,
  mediaMap: Map<string, string>,
  deckNamesById: Record<string, string>,
): Promise<{ cards: AnkiCard[]; ankiCardIds: string[] }> {
  const cards: AnkiCard[] = [];
  const ankiCardIds: string[] = [];

  let cardRows: Array<{
    noteId: string;
    deckId: string;
    templateOrd: number | null;
    mid: string;
    flds: string;
    tags: string;
    ankiCardId: string;
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

    const sql = `SELECT c.${cardNoteColumn}, c.${cardDeckColumn}${ordSelect}, n.${notesModelColumn}, n.${notesFieldsColumn}${tagsSelect}, CAST(c.id AS TEXT)
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
        ankiCardId: normalizeAnkiId(row[6] as string | number),
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
    if (notesResult.length === 0) return { cards, ankiCardIds };

    for (const row of notesResult[0].values) {
      cardRows.push({
        noteId: normalizeAnkiId(row[0] as string | number),
        deckId: '',
        templateOrd: null,
        mid: normalizeAnkiId(row[1] as string | number),
        flds: (row[2] as string) || '',
        tags: (row[3] as string) || '',
        ankiCardId: '',
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
        ankiCardIds.push(row.ankiCardId);
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
        ankiCardIds.push(row.ankiCardId);
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
            ankiCardIds.push(row.ankiCardId);
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
          ankiCardIds.push(row.ankiCardId);
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
          ankiCardIds.push(row.ankiCardId);
        }
      }
    } else {
      const front = replaceMediaRefs(fieldValues[0] || '', mediaMap);
      const back = replaceMediaRefs(fieldValues.slice(1).join('<br>'), mediaMap);
      if (front.trim()) {
        cards.push({ front, back, cardType: 'basic', tags, media: mediaMap, deckName });
        ankiCardIds.push(row.ankiCardId);
      }
    }

    // Yield every CARD_CHUNK cards to keep browser responsive
    if (ci > 0 && ci % CARD_CHUNK === 0) {
      await yieldToUI();
    }
  }

  return { cards, ankiCardIds };
}

function buildSubdecks(cards: AnkiCard[], rootDeckName: string): AnkiSubdeck[] {
  const deckMap = new Map<string, { indices: number[]; children: Map<string, any> }>();

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    if (!card.deckName) continue;

    const parts = splitDeckPath(card.deckName);
    if (parts.length === 0) continue;

    let currentPath = '';
    for (let j = 0; j < parts.length; j++) {
      const part = parts[j];
      const parentPath = currentPath;
      currentPath = currentPath ? `${currentPath}::${part}` : part;

      if (!deckMap.has(currentPath)) {
        deckMap.set(currentPath, { indices: [], children: new Map() });
      }

      if (j === parts.length - 1) {
        deckMap.get(currentPath)!.indices.push(i);
      }

      if (parentPath && deckMap.has(parentPath)) {
        deckMap.get(parentPath)!.children.set(currentPath, true);
      }
    }
  }

  function buildTree(path: string): AnkiSubdeck | null {
    const node = deckMap.get(path);
    if (!node) return null;

    const parts = splitDeckPath(path);
    const name = parts[parts.length - 1];

    const children: AnkiSubdeck[] = [];
    for (const childPath of node.children.keys()) {
      const child = buildTree(childPath);
      if (child) children.push(child);
    }

    return {
      name,
      card_indices: node.indices,
      children: children.length > 0 ? children : undefined,
    };
  }

  const rootPaths = new Set<string>();
  for (const path of deckMap.keys()) {
    const parts = splitDeckPath(path);
    if (parts.length > 0) {
      rootPaths.add(parts[0]);
    }
  }

  const result: AnkiSubdeck[] = [];
  for (const rootPath of rootPaths) {
    const tree = buildTree(rootPath);
    if (tree) result.push(tree);
  }

  return result;
}

/* ── progress extraction helpers ── */

function extractCollectionCreatedAt(db: Database): number {
  // Try legacy `col` table first
  try {
    const tableCheck = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='col'");
    if (tableCheck.length > 0 && tableCheck[0].values.length > 0) {
      const result = db.exec('SELECT crt FROM col LIMIT 1');
      if (result.length > 0 && result[0].values.length > 0) {
        const crt = Number(result[0].values[0][0]) || 0;
        if (crt > 0) {
          console.log('[ANKI] crt from col table:', crt, new Date(crt * 1000).toISOString());
          return crt;
        }
      }
    }
  } catch {}

  // Modern format (anki21b): try `config` table with key='_crt'
  try {
    const tableCheck = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='config'");
    if (tableCheck.length > 0 && tableCheck[0].values.length > 0) {
      // config table may have key/val columns
      const cols = db.exec('PRAGMA table_info(config)');
      const colNames = new Set(cols.length > 0 ? cols[0].values.map(r => String(r[1])) : []);
      if (colNames.has('key') && colNames.has('val')) {
        // Try to get creation_offset or creationOffset from config
        const result = db.exec("SELECT key, val FROM config");
        if (result.length > 0) {
          for (const row of result[0].values) {
            const key = String(row[0]);
            if (key === 'creationOffset' || key === 'creation_offset' || key === '_crt') {
              const val = Number(row[1]);
              if (val > 1e9) {
                console.log(`[ANKI] crt from config table (${key}):`, val, new Date(val * 1000).toISOString());
                return val;
              }
            }
          }
        }
      }
    }
  } catch {}

  // Fallback: estimate from earliest card due date or earliest revlog
  try {
    const revResult = db.exec('SELECT MIN(id) FROM revlog');
    if (revResult.length > 0 && revResult[0].values.length > 0) {
      const minId = Number(revResult[0].values[0][0]);
      if (minId > 1e12) {
        // revlog id is timestamp in ms
        const crt = Math.floor(minId / 1000) - 86400; // subtract 1 day as buffer
        console.log('[ANKI] crt estimated from revlog:', crt, new Date(crt * 1000).toISOString());
        return crt;
      }
    }
  } catch {}

  // Last fallback: estimate from earliest note id (also timestamp in ms in Anki)
  try {
    const noteResult = db.exec('SELECT MIN(id) FROM notes');
    if (noteResult.length > 0 && noteResult[0].values.length > 0) {
      const minId = Number(noteResult[0].values[0][0]);
      if (minId > 1e12) {
        const crt = Math.floor(minId / 1000);
        console.log('[ANKI] crt estimated from notes:', crt, new Date(crt * 1000).toISOString());
        return crt;
      }
    }
  } catch {}

  console.warn('[ANKI] Could not determine collection creation time, using 0');
  return 0;
}

function extractRawCardProgress(db: Database): Map<string, { type: number; ivl: number; due: number; factor: number; queue: number }> {
  const map = new Map<string, { type: number; ivl: number; due: number; factor: number; queue: number }>();
  try {
    const cols = db.exec('PRAGMA table_info(cards)');
    const colSet = new Set<string>();
    if (cols.length > 0) for (const r of cols[0].values) colSet.add(String(r[1]));

    const hasType = colSet.has('type');
    const hasIvl = colSet.has('ivl');
    const hasDue = colSet.has('due');
    const hasFactor = colSet.has('factor');
    const hasQueue = colSet.has('queue');

    if (!hasType && !hasIvl) return map;

    const selectCols = ['CAST(id AS TEXT)'];
    if (hasType) selectCols.push('type'); else selectCols.push('0');
    if (hasIvl) selectCols.push('ivl'); else selectCols.push('0');
    if (hasDue) selectCols.push('due'); else selectCols.push('0');
    if (hasFactor) selectCols.push('factor'); else selectCols.push('0');
    if (hasQueue) selectCols.push('queue'); else selectCols.push('0');

    const stmt = db.prepare(`SELECT ${selectCols.join(', ')} FROM cards`);
    while (stmt.step()) {
      const r = stmt.get();
      map.set(normalizeAnkiId(r[0] as string), {
        type: Number(r[1]) || 0,
        ivl: Number(r[2]) || 0,
        due: Number(r[3]) || 0,
        factor: Number(r[4]) || 0,
        queue: Number(r[5]) || 0,
      });
    }
    stmt.free();
    // Diagnostic: log sample of raw progress values
    const sample = [...map.entries()].slice(0, 5);
    console.log('[ANKI] Raw progress sample:', sample.map(([id, v]) => ({ id, ...v })));
  } catch (e) {
    console.warn('[ANKI] extractRawCardProgress failed:', e);
  }
  return map;
}

function extractRawRevlog(db: Database): Array<{ cid: string; ease: number; ivl: number; factor: number; time: number; type: number; reviewedAt: number }> {
  const entries: Array<{ cid: string; ease: number; ivl: number; factor: number; time: number; type: number; reviewedAt: number }> = [];
  try {
    const tableCheck = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='revlog'");
    if (tableCheck.length === 0 || tableCheck[0].values.length === 0) return entries;

    const stmt = db.prepare('SELECT id, CAST(cid AS TEXT), ease, ivl, factor, time, type FROM revlog ORDER BY id');
    while (stmt.step()) {
      const r = stmt.get();
      entries.push({
        cid: normalizeAnkiId(r[1] as string),
        ease: Number(r[2]) || 3,
        ivl: Number(r[3]) || 0,
        factor: Number(r[4]) || 0,
        time: Number(r[5]) || 0,
        type: Number(r[6]) || 0,
        reviewedAt: Number(r[0]) || 0,
      });
    }
    stmt.free();
    console.log(`[ANKI] extractRawRevlog: ${entries.length} entries`);
  } catch (e) {
    console.warn('[ANKI] extractRawRevlog failed:', e);
  }
  return entries;
}

function ankiFactorToFsrsDifficulty(factor: number): number {
  if (factor <= 0) return 5;
  return Math.round(Math.max(1, Math.min(10, 11 - factor / 250)) * 100) / 100;
}

function ankiDueToScheduledDate(due: number, type: number, crt: number): string {
  if (type === 0) return new Date().toISOString();
  if (type === 1 || type === 3) {
    // Learning/relearning: due is seconds since epoch or relative
    if (due > 1e9) return new Date(due * 1000).toISOString();
    return new Date().toISOString();
  }
  // Review card (type === 2): due is day number
  // In Anki, for review cards, "due" is always days since collection creation (crt)
  // BUT if the deck was exported from a newer Anki version, due might be days since epoch
  
  // Strategy 1: Try as days since crt
  if (crt > 0) {
    const dayStart = Math.floor(crt / 86400) * 86400;
    const ts = (dayStart + due * 86400) * 1000;
    const now = Date.now();
    // Accept dates from 20 years in the past to 10 years in the future
    if (ts > now - 365.25 * 86400000 * 20 && ts < now + 365.25 * 86400000 * 10) {
      return new Date(ts).toISOString();
    }
  }
  
  // Strategy 2: due as absolute days since Unix epoch (common in some Anki versions)
  if (due > 10000 && due < 40000) {
    // 10000 days ~ 1997, 40000 days ~ 2079
    const ts = due * 86400 * 1000;
    const now = Date.now();
    if (ts > now - 365.25 * 86400000 * 20 && ts < now + 365.25 * 86400000 * 10) {
      return new Date(ts).toISOString();
    }
  }
  
  // Strategy 3: due might be relative days from now (small numbers)
  if (due >= -365 && due <= 3650) {
    const ts = Date.now() + due * 86400 * 1000;
    return new Date(ts).toISOString();
  }

  return new Date().toISOString();
}

function buildProgressData(
  ankiCardIds: string[],
  rawProgressMap: Map<string, { type: number; ivl: number; due: number; factor: number; queue: number }>,
  crt: number,
  rawRevlog?: Array<{ cid: string; ease: number; ivl: number; factor: number; time: number; type: number; reviewedAt: number }>,
): { progress: AnkiCardProgress[]; hasProgress: boolean } {
  let hasProgress = false;
  let loggedSamples = 0;
  let stateCounts = { s0: 0, s1: 0, s2: 0, s3: 0, noRaw: 0 };

  // Build per-card best-review from revlog for more accurate scheduling
  // We want the last review with a MEANINGFUL interval (ivl > 1), not reset/learn entries
  const bestReviewByCard = new Map<string, { ivl: number; factor: number; reviewedAt: number; type: number }>();
  const lastReviewByCard = new Map<string, { ivl: number; factor: number; reviewedAt: number; type: number }>();
  if (rawRevlog && rawRevlog.length > 0) {
    for (const entry of rawRevlog) {
      // Track absolute last review
      const existingLast = lastReviewByCard.get(entry.cid);
      if (!existingLast || entry.reviewedAt > existingLast.reviewedAt) {
        lastReviewByCard.set(entry.cid, { ivl: entry.ivl, factor: entry.factor, reviewedAt: entry.reviewedAt, type: entry.type });
      }
      // Track best review: prefer entries with meaningful intervals (type=1 review with ivl>1)
      if (entry.ivl > 1 && (entry.type === 1 || entry.type === 2)) {
        const existingBest = bestReviewByCard.get(entry.cid);
        if (!existingBest || entry.reviewedAt > existingBest.reviewedAt) {
          bestReviewByCard.set(entry.cid, { ivl: entry.ivl, factor: entry.factor, reviewedAt: entry.reviewedAt, type: entry.type });
        }
      }
    }
    console.log(`[ANKI] Revlog analysis: lastReview=${lastReviewByCard.size} cards, bestReview(ivl>1)=${bestReviewByCard.size} cards`);
    // Log samples
    const sampleBest = [...bestReviewByCard.entries()].slice(0, 3);
    for (const [cid, v] of sampleBest) {
      const reviewDate = v.reviewedAt > 1e12 ? new Date(v.reviewedAt).toISOString() : new Date(v.reviewedAt * 1000).toISOString();
      console.log(`[ANKI] Best review sample: cid=${cid} ivl=${v.ivl} factor=${v.factor} type=${v.type} reviewedAt=${reviewDate}`);
    }
    if (sampleBest.length === 0) {
      const sampleLast = [...lastReviewByCard.entries()].slice(0, 3);
      for (const [cid, v] of sampleLast) {
        const reviewDate = v.reviewedAt > 1e12 ? new Date(v.reviewedAt).toISOString() : new Date(v.reviewedAt * 1000).toISOString();
        console.log(`[ANKI] Last review sample (no best found): cid=${cid} ivl=${v.ivl} factor=${v.factor} type=${v.type} reviewedAt=${reviewDate}`);
      }
    }
  }

  // Detect if cards table data is suspicious (all same ivl for review cards)
  const reviewIvls = new Set<number>();
  for (const [, raw] of rawProgressMap) {
    if (raw.type === 2) reviewIvls.add(raw.ivl);
  }
  const cardsTableSuspicious = reviewIvls.size <= 1 && (bestReviewByCard.size > 0 || lastReviewByCard.size > 0);
  if (cardsTableSuspicious) {
    console.log(`[ANKI] Cards table data looks suspicious (review cards have ${reviewIvls.size} unique ivls). Using revlog for scheduling.`);
  }

  const progress = ankiCardIds.map(ankiId => {
    const raw = rawProgressMap.get(ankiId);
    if (!raw || (raw.type === 0 && raw.ivl === 0)) {
      stateCounts.noRaw++;
      return { state: 0, stability: 0, difficulty: 0, scheduledDate: new Date().toISOString(), learningStep: 0 };
    }
    hasProgress = true;
    if (raw.type === 0) stateCounts.s0++;
    else if (raw.type === 1) stateCounts.s1++;
    else if (raw.type === 2) stateCounts.s2++;
    else if (raw.type === 3) stateCounts.s3++;

    // Try to use revlog data for more accurate scheduling
    // Prefer bestReview (last review with ivl>1) over lastReview (which might be a reset/learn entry)
    const bestReview = bestReviewByCard.get(ankiId);
    const lastReview = lastReviewByCard.get(ankiId);
    const revlogSource = bestReview || lastReview;
    let stability: number;
    let scheduledDate: string;
    let lastReviewedAt: string | undefined;
    let difficulty: number;

    if (revlogSource && (cardsTableSuspicious || raw.type === 2)) {
      // Use revlog-derived data
      const ivlDays = Math.abs(revlogSource.ivl);
      stability = Math.max(1, ivlDays);
      difficulty = ankiFactorToFsrsDifficulty(revlogSource.factor);
      const reviewMs = revlogSource.reviewedAt > 1e12
        ? revlogSource.reviewedAt
        : revlogSource.reviewedAt * 1000;
      lastReviewedAt = new Date(reviewMs).toISOString();
      // scheduled = last review + interval
      const scheduledMs = reviewMs + stability * 86400000;
      scheduledDate = new Date(scheduledMs).toISOString();
    } else {
      // Fallback to cards table data
      scheduledDate = ankiDueToScheduledDate(raw.due, raw.type, crt);
      stability = Math.max(0, raw.ivl);
      difficulty = ankiFactorToFsrsDifficulty(raw.factor);
      lastReviewedAt = raw.type === 2 && stability > 0
        ? new Date(new Date(scheduledDate).getTime() - stability * 86400000).toISOString()
        : undefined;
    }

    if (loggedSamples < 5) {
      console.log(`[ANKI] Progress #${loggedSamples}: ankiId=${ankiId} type=${raw.type} stability=${stability} scheduled=${scheduledDate} lastReviewed=${lastReviewedAt || 'N/A'} source=${bestReview ? 'best_revlog' : revlogSource ? 'last_revlog' : 'cards_table'}`);
      loggedSamples++;
    }

    return {
      state: raw.type,
      stability,
      difficulty,
      scheduledDate,
      learningStep: raw.type === 1 || raw.type === 3 ? 1 : 0,
      lastReviewedAt,
    };
  });
  console.log('[ANKI] buildProgressData states:', stateCounts, 'crt:', crt, 'hasProgress:', hasProgress, 'usedRevlog:', cardsTableSuspicious);
  return { progress, hasProgress };
}

function buildRevlogData(
  rawRevlog: Array<{ cid: string; ease: number; ivl: number; factor: number; time: number; type: number; reviewedAt: number }>,
  ankiCardIdToIndices: Map<string, number[]>,
  crt: number,
): AnkiReviewLogEntry[] {
  const entries: AnkiReviewLogEntry[] = [];
  for (const raw of rawRevlog) {
    const indices = ankiCardIdToIndices.get(raw.cid);
    if (!indices || indices.length === 0) continue;

    const rating = Math.max(1, Math.min(4, raw.ease));
    const reviewedAt = raw.reviewedAt > 1e12
      ? new Date(raw.reviewedAt).toISOString()
      : new Date(raw.reviewedAt * 1000).toISOString();
    const stability = Math.max(0, raw.ivl);
    const difficulty = ankiFactorToFsrsDifficulty(raw.factor);
    // Map Anki revlog type to our state: 0=learn→1, 1=review→2, 2=relearn→3, 3=filtered→2
    const state = raw.type === 0 ? 1 : raw.type === 1 ? 2 : raw.type === 2 ? 3 : 2;

    for (const idx of indices) {
      entries.push({
        cardIndex: idx,
        rating,
        reviewedAt,
        stability,
        difficulty,
        scheduledDate: reviewedAt,
        state,
        elapsedMs: raw.time > 0 ? raw.time : null,
      });
    }
  }
  return entries;
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
    }

    log('Parsing models done, models: ' + Object.keys(models).length + ', decks: ' + Object.keys(deckNamesById).length);
    await yieldToUI();
    checkTimeout('parseModels');

    // ── Stage 6: Build cards ──
    onProgress?.('Processando cartões...');
    await yieldToUI();

    const emptyMedia = new Map<string, string>();
    let cards: AnkiCard[] = [];
    let ankiCardIds: string[] = [];

    try {
      log('buildCards start');
      const buildResult = await buildCards(db, models, emptyMedia, deckNamesById);
      cards = buildResult.cards;
      ankiCardIds = buildResult.ankiCardIds;
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
      const root = splitDeckPath(card.deckName || '')[0];
      if (!root) continue;
      rootDeckCounts.set(root, (rootDeckCounts.get(root) || 0) + 1);
    }

    if (rootDeckCounts.size > 0) {
      deckName = [...rootDeckCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    }

    const subdecks = buildSubdecks(cards, deckName);

    // ── Stage 6.5: Extract progress + revlog ──
    onProgress?.('Extraindo progresso...');
    await yieldToUI();

    const crt = extractCollectionCreatedAt(db);
    const rawProgressMap = extractRawCardProgress(db);
    const rawRevlog = extractRawRevlog(db);

    // Build ankiCardId → output indices mapping
    const ankiCardIdToIndices = new Map<string, number[]>();
    ankiCardIds.forEach((id, idx) => {
      if (!id) return;
      const existing = ankiCardIdToIndices.get(id) || [];
      existing.push(idx);
      ankiCardIdToIndices.set(id, existing);
    });

    const { progress, hasProgress } = buildProgressData(ankiCardIds, rawProgressMap, crt, rawRevlog);
    const revlog = rawRevlog.length > 0 ? buildRevlogData(rawRevlog, ankiCardIdToIndices, crt) : [];

    log(`Progress: hasProgress=${hasProgress}, rawProgress=${rawProgressMap.size}, revlog entries: ${revlog.length}`);

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
    }

    // Replace media references in cards with Blob URLs
    if (mediaMap.size > 0) {
      onProgress?.('Vinculando mídia aos cartões...');
      await yieldToUI();
      for (let i = 0; i < cards.length; i++) {
        cards[i].front = replaceMediaRefs(cards[i].front, mediaMap);
        cards[i].back = replaceMediaRefs(cards[i].back, mediaMap);
        cards[i].media = mediaMap;
        if (i % 500 === 0 && i > 0) {
          await yieldToUI();
          checkTimeout('replaceMediaRefs');
        }
      }
      log('media refs replaced');
    }

    log(`DONE — ${cards.length} cards, ${mediaMap.size} media, progress=${hasProgress}, revlog=${revlog.length}, total ${elapsed()}ms`);

    const cleanup = () => {
      for (const url of mediaMap.values()) {
        try { URL.revokeObjectURL(url); } catch {}
      }
    };

    // Only report missing media if the ZIP actually contained some media files
    // (totalMediaCount > 0). If it has zero, the export simply didn't include media.
    const missingMediaCount = totalMediaCount > 0 ? Math.max(0, referencedFiles.size - mediaMap.size) : 0;

    return {
      deckName,
      cards,
      mediaCount: mediaMap.size,
      missingMediaCount: missingMediaCount > 0 ? missingMediaCount : 0,
      subdecks: subdecks.length > 0 ? subdecks : undefined,
      progress: hasProgress ? progress : undefined,
      revlog: revlog.length > 0 ? revlog : undefined,
      hasProgress,
      cleanup,
    };
  } catch (error) {
    log(`FAILED at ${elapsed()}ms: ${error}`);
    throw error;
  }
}
