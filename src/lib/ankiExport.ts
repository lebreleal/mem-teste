/**
 * Export cards as a valid Anki .apkg file.
 * An .apkg is a ZIP containing:
 *   - collection.anki2  (SQLite database)
 *   - media              (JSON mapping of index → filename)
 *   - 0, 1, 2...        (actual media files)
 *
 * Uses sql.js (already in deps) for in-browser SQLite.
 */

import JSZip from 'jszip';
import initSqlJs, { type Database as SqlDatabase } from 'sql.js';

interface ExportCard {
  front: string;
  back: string;
  cardType?: string;
}

function fieldChecksum(text: string): number {
  const stripped = text.replace(/<[^>]*>/g, '').trim();
  let h = 0;
  for (let i = 0; i < stripped.length; i++) {
    h = ((h << 5) - h + stripped.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 2147483647;
}

function guid(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let s = '';
  for (let i = 0; i < 10; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

/** Extract all image URLs from HTML content */
function extractImageUrls(html: string): string[] {
  const urls: string[] = [];
  const regex = /<img[^>]+src=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    urls.push(match[1]);
  }
  return urls;
}

/** Download an image and return as ArrayBuffer, or null on failure */
async function downloadImage(url: string): Promise<{ data: ArrayBuffer; ext: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    let ext = 'png';
    if (ct.includes('jpeg') || ct.includes('jpg')) ext = 'jpg';
    else if (ct.includes('gif')) ext = 'gif';
    else if (ct.includes('webp')) ext = 'webp';
    else if (ct.includes('svg')) ext = 'svg';
    const data = await res.arrayBuffer();
    return { data, ext };
  } catch {
    return null;
  }
}

/**
 * Process all cards: download images, replace src with local filenames,
 * and return media entries for the ZIP.
 */
async function processMedia(cards: ExportCard[]): Promise<{
  processedCards: ExportCard[];
  mediaEntries: Map<string, ArrayBuffer>; // filename → data
  mediaMapping: Record<string, string>; // index → filename
}> {
  const mediaEntries = new Map<string, ArrayBuffer>();
  const mediaMapping: Record<string, string> = {};
  const urlToFilename = new Map<string, string>();
  let mediaIndex = 0;

  // Collect all unique URLs
  const allUrls = new Set<string>();
  for (const card of cards) {
    for (const url of extractImageUrls(card.front)) allUrls.add(url);
    for (const url of extractImageUrls(card.back)) allUrls.add(url);
  }

  // Download all images in parallel (max 10 concurrent)
  const urlArray = [...allUrls];
  const batchSize = 10;
  for (let i = 0; i < urlArray.length; i += batchSize) {
    const batch = urlArray.slice(i, i + batchSize);
    const results = await Promise.all(batch.map(async (url) => {
      const result = await downloadImage(url);
      return { url, result };
    }));
    for (const { url, result } of results) {
      if (result) {
        const filename = `image_${mediaIndex}.${result.ext}`;
        mediaEntries.set(filename, result.data);
        mediaMapping[String(mediaIndex)] = filename;
        urlToFilename.set(url, filename);
        mediaIndex++;
      }
    }
  }

  // Replace URLs in card content
  const processedCards = cards.map(card => {
    let front = card.front;
    let back = card.back;
    for (const [url, filename] of urlToFilename) {
      const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(escaped, 'g');
      front = front.replace(re, filename);
      back = back.replace(re, filename);
    }
    return { ...card, front, back };
  });

  return { processedCards, mediaEntries, mediaMapping };
}

async function buildAnki2(deckName: string, cards: ExportCard[]): Promise<Uint8Array> {
  const SQL = await initSqlJs({ locateFile: () => '/sql-wasm.wasm' });
  const db: SqlDatabase = new SQL.Database();

  const now = Math.floor(Date.now() / 1000);
  const modelId = now * 1000;
  const deckId = now * 1000 + 1;

  const model: Record<string, any> = {
    [modelId]: {
      id: modelId,
      name: 'Basic (MemoCards)',
      type: 0,
      mod: now,
      usn: -1,
      sortf: 0,
      did: deckId,
      tmpls: [
        {
          name: 'Card 1',
          ord: 0,
          qfmt: '{{Front}}',
          afmt: '{{FrontSide}}<hr id=answer>{{Back}}',
          bqfmt: '', bafmt: '', did: null, bfont: '', bsize: 0,
        },
      ],
      flds: [
        { name: 'Front', ord: 0, sticky: false, rtl: false, font: 'Arial', size: 20, media: [] },
        { name: 'Back', ord: 1, sticky: false, rtl: false, font: 'Arial', size: 20, media: [] },
      ],
      css: '.card { font-family: arial; font-size: 20px; text-align: center; color: black; background-color: white; }',
      latexPre: '', latexPost: '', latexsvg: false,
      req: [[0, 'any', [0]]],
      tags: [], vers: [],
    },
  };

  const decks: Record<string, any> = {
    '1': { id: 1, name: 'Default', mod: now, usn: -1, lrnToday: [0, 0], revToday: [0, 0], newToday: [0, 0], timeToday: [0, 0], collapsed: false, desc: '', dyn: 0, conf: 1, extendNew: 10, extendRev: 50 },
    [deckId]: { id: deckId, name: deckName, mod: now, usn: -1, lrnToday: [0, 0], revToday: [0, 0], newToday: [0, 0], timeToday: [0, 0], collapsed: false, desc: '', dyn: 0, conf: 1, extendNew: 10, extendRev: 50 },
  };

  const dconf: Record<string, any> = {
    '1': {
      id: 1, name: 'Default', mod: now, usn: -1, maxTaken: 60, autoplay: true,
      timer: 0, replayq: true,
      new: { bury: true, delays: [1, 10], initialFactor: 2500, ints: [1, 4, 7], order: 1, perDay: 20 },
      rev: { bury: true, ease4: 1.3, fuzz: 0.05, ivlFct: 1, maxIvl: 36500, perDay: 200, minSpace: 1 },
      lapse: { delays: [10], leechAction: 0, leechFails: 8, minInt: 1, mult: 0 },
    },
  };

  db.run(`CREATE TABLE col (id integer PRIMARY KEY, crt integer NOT NULL, mod integer NOT NULL, scm integer NOT NULL, ver integer NOT NULL, dty integer NOT NULL, usn integer NOT NULL, ls integer NOT NULL, conf text NOT NULL, models text NOT NULL, decks text NOT NULL, dconf text NOT NULL, tags text NOT NULL);`);
  db.run(`CREATE TABLE notes (id integer PRIMARY KEY, guid text NOT NULL, mid integer NOT NULL, mod integer NOT NULL, usn integer NOT NULL, tags text NOT NULL, flds text NOT NULL, sfld text NOT NULL, csum integer NOT NULL, flags integer NOT NULL, data text NOT NULL);`);
  db.run(`CREATE TABLE cards (id integer PRIMARY KEY, nid integer NOT NULL, did integer NOT NULL, ord integer NOT NULL, mod integer NOT NULL, usn integer NOT NULL, type integer NOT NULL, queue integer NOT NULL, due integer NOT NULL, ivl integer NOT NULL, factor integer NOT NULL, reps integer NOT NULL, lapses integer NOT NULL, left integer NOT NULL, odue integer NOT NULL, odid integer NOT NULL, flags integer NOT NULL, data text NOT NULL);`);
  db.run(`CREATE TABLE revlog (id integer PRIMARY KEY, cid integer NOT NULL, usn integer NOT NULL, ease integer NOT NULL, ivl integer NOT NULL, lastIvl integer NOT NULL, factor integer NOT NULL, time integer NOT NULL, type integer NOT NULL);`);
  db.run(`CREATE TABLE graves (usn integer NOT NULL, oid integer NOT NULL, type integer NOT NULL);`);

  const conf = JSON.stringify({
    activeDecks: [1], curDeck: deckId, newSpread: 0, collapseTime: 1200,
    timeLim: 0, estTimes: true, dueCounts: true, curModel: modelId,
    nextPos: cards.length + 1, sortType: 'noteFld', sortBackwards: false,
    addToCur: true,
  });

  db.run(
    `INSERT INTO col VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [1, now, now * 1000, now * 1000, 11, 0, -1, 0, conf, JSON.stringify(model), JSON.stringify(decks), JSON.stringify(dconf), '{}']
  );

  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    const noteId = now * 1000 + i + 10;
    const cardId = now * 1000 + i + 10 + cards.length;
    const flds = `${c.front}\x1f${c.back}`;
    const sfld = c.front.replace(/<[^>]*>/g, '').trim();
    const csum = fieldChecksum(c.front);

    db.run(
      `INSERT INTO notes VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
      [noteId, guid(), modelId, now, -1, '', flds, sfld, csum, 0, '']
    );
    db.run(
      `INSERT INTO cards VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [cardId, noteId, deckId, 0, now, -1, 0, 0, i, 0, 0, 0, 0, 0, 0, 0, 0, '']
    );
  }

  const data = db.export();
  db.close();
  return data;
}

/**
 * Export a deck as .apkg file and trigger download.
 * Downloads images from cards and embeds them as media in the .apkg.
 */
export async function exportAsApkg(
  deckName: string,
  cards: ExportCard[],
): Promise<void> {
  // Process media: download images, replace URLs with local filenames
  const { processedCards, mediaEntries, mediaMapping } = await processMedia(cards);

  const anki2 = await buildAnki2(deckName, processedCards);

  const zip = new JSZip();
  zip.file('collection.anki2', anki2);
  zip.file('media', JSON.stringify(mediaMapping));

  // Add media files
  for (const [filename, data] of mediaEntries) {
    // Find the index for this filename
    const idx = Object.entries(mediaMapping).find(([, v]) => v === filename)?.[0];
    if (idx !== undefined) {
      zip.file(idx, data);
    }
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${deckName}.apkg`;
  a.click();
  URL.revokeObjectURL(url);
}
