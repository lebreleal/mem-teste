/**
 * Anki .apkg / .colpkg parser for browser.
 * .apkg files are ZIP archives containing:
 *   - collection.anki21 or collection.anki2 (SQLite DB)
 *   - media (JSON mapping: "0" -> "filename.jpg", ...)
 *   - media files named 0, 1, 2...
 *
 * The SQLite DB has:
 *   - notes table: id, mid (model id), flds (fields separated by \x1f), sfld, tags
 *   - col table: models field (JSON with model definitions including field names and isCloze)
 *
 * We use sql.js (wasm) for SQLite and JSZip for ZIP.
 */

import JSZip from 'jszip';
import initSqlJs, { type Database } from 'sql.js';

export interface AnkiCard {
  front: string;
  back: string;
  cardType: 'basic' | 'cloze';
  tags: string[];
  media: Map<string, string>; // filename -> data URL
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

/**
 * Replace Anki media references like <img src="filename.jpg"> with data URLs
 */
function replaceMediaRefs(html: string, mediaMap: Map<string, string>): string {
  return html.replace(/src="([^"]+)"/g, (match, filename) => {
    const dataUrl = mediaMap.get(filename);
    return dataUrl ? `src="${dataUrl}"` : match;
  });
}

/**
 * Strip Anki template syntax like {{FrontSide}}, {{type:...}}, etc.
 * and extract just the field content
 */
function stripAnkiTemplateSyntax(html: string): string {
  return html
    .replace(/\{\{FrontSide\}\}/gi, '')
    .replace(/\{\{type:[^}]+\}\}/gi, '')
    .replace(/<hr\s*id="answer"\s*\/?>/gi, '')
    .replace(/\{\{#[^}]+\}\}[\s\S]*?\{\{\/[^}]+\}\}/g, '')
    .trim();
}

/**
 * Build card content from a template and field values
 */
function renderTemplate(template: string, fields: Record<string, string>): string {
  let result = template;
  // Replace {{FieldName}} with field values
  for (const [name, value] of Object.entries(fields)) {
    const regex = new RegExp(`\\{\\{${name}\\}\\}`, 'gi');
    result = result.replace(regex, value);
  }
  // Also handle {{text:FieldName}}
  for (const [name, value] of Object.entries(fields)) {
    const regex = new RegExp(`\\{\\{text:${name}\\}\\}`, 'gi');
    result = result.replace(regex, value.replace(/<[^>]*>/g, ''));
  }
  return stripAnkiTemplateSyntax(result);
}

/**
 * Convert cloze format from Anki ({{c1::answer::hint}}) to our format ({{c1::answer}})
 */
function convertClozeFormat(text: string): string {
  // Anki cloze: {{c1::answer::hint}} or {{c1::answer}}
  // Our format: {{c1::answer}}
  return text.replace(/\{\{c(\d+)::([^:}]+)(?:::[^}]*)?\}\}/g, '{{c$1::$2}}');
}

export async function parseApkgFile(file: File): Promise<AnkiParseResult> {
  // Load sql.js with WASM from CDN
  const SQL = await initSqlJs({
    locateFile: () => '/sql-wasm.wasm',
  });

  // Unzip the file
  let zip = await JSZip.loadAsync(file);

  // If this is a wrapper zip containing an .apkg/.colpkg inside, extract it first
  const innerApkg = Object.keys(zip.files).find(
    name => /\.(apkg|colpkg)$/i.test(name) && !zip.files[name].dir
  );
  if (innerApkg && !zip.files['collection.anki21'] && !zip.files['collection.anki2']) {
    const innerBlob = await zip.files[innerApkg].async('blob');
    zip = await JSZip.loadAsync(innerBlob);
  }

  // Find the SQLite database file
  let dbFile: JSZip.JSZipObject | null = null;
  for (const name of ['collection.anki21', 'collection.anki2']) {
    if (zip.files[name]) {
      dbFile = zip.files[name];
      break;
    }
  }
  if (!dbFile) throw new Error('Arquivo .apkg inválido: banco de dados não encontrado');

  // Parse media mapping
  const mediaMapping: Record<string, string> = {};
  if (zip.files['media']) {
    try {
      const mediaText = await zip.files['media'].async('text');
      Object.assign(mediaMapping, JSON.parse(mediaText));
    } catch {}
  }

  // Extract media files as data URLs
  const mediaMap = new Map<string, string>();
  for (const [numericName, actualFilename] of Object.entries(mediaMapping)) {
    const mediaFile = zip.files[numericName];
    if (mediaFile) {
      try {
        const blob = await mediaFile.async('blob');
        const ext = actualFilename.split('.').pop()?.toLowerCase() || '';
        let mimeType = 'application/octet-stream';
        if (['jpg', 'jpeg'].includes(ext)) mimeType = 'image/jpeg';
        else if (ext === 'png') mimeType = 'image/png';
        else if (ext === 'gif') mimeType = 'image/gif';
        else if (ext === 'webp') mimeType = 'image/webp';
        else if (ext === 'svg') mimeType = 'image/svg+xml';
        else if (ext === 'mp3') mimeType = 'audio/mpeg';
        else if (ext === 'wav') mimeType = 'audio/wav';
        else if (ext === 'ogg') mimeType = 'audio/ogg';

        const reader = new FileReader();
        const dataUrl = await new Promise<string>((resolve) => {
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(new Blob([blob], { type: mimeType }));
        });
        mediaMap.set(actualFilename, dataUrl);
      } catch {}
    }
  }

  // Open SQLite database
  const dbBuffer = await dbFile.async('arraybuffer');
  const db: Database = new SQL.Database(new Uint8Array(dbBuffer));

  // Parse models from col table
  const models: Record<string, AnkiModel> = {};
  let deckName = 'Anki Import';
  try {
    const colResult = db.exec('SELECT models, decks FROM col LIMIT 1');
    if (colResult.length > 0 && colResult[0].values.length > 0) {
      const modelsJson = JSON.parse(colResult[0].values[0][0] as string);
      for (const [mid, model] of Object.entries(modelsJson)) {
        const m = model as any;
        models[mid] = {
          name: m.name || '',
          flds: (m.flds || []).map((f: any) => ({ name: f.name, ord: f.ord })).sort((a: any, b: any) => a.ord - b.ord),
          type: m.type || 0,
          tmpls: (m.tmpls || []).map((t: any) => ({ name: t.name, qfmt: t.qfmt, afmt: t.afmt, ord: t.ord })),
        };
      }
      // Get first deck name
      const decksJson = JSON.parse(colResult[0].values[0][1] as string);
      const deckEntries = Object.values(decksJson) as any[];
      const nonDefault = deckEntries.find((d: any) => d.name !== 'Default' && d.name !== 'Padrão');
      if (nonDefault) deckName = nonDefault.name;
      else if (deckEntries.length > 0) deckName = deckEntries[0].name;
    }
  } catch (e) {
    console.warn('Failed to parse col table:', e);
  }

  // Extract notes
  const cards: AnkiCard[] = [];
  try {
    const notesResult = db.exec('SELECT mid, flds, tags FROM notes');
    if (notesResult.length > 0) {
      for (const row of notesResult[0].values) {
        const mid = String(row[0]);
        const fldsStr = row[1] as string;
        const tags = (row[2] as string || '').trim().split(/\s+/).filter(Boolean);
        const fieldValues = fldsStr.split('\x1f');

        const model = models[mid];
        if (!model) {
          // Fallback: treat first field as front, rest as back
          cards.push({
            front: replaceMediaRefs(fieldValues[0] || '', mediaMap),
            back: replaceMediaRefs(fieldValues.slice(1).join('<br>'), mediaMap),
            cardType: 'basic',
            tags,
            media: mediaMap,
          });
          continue;
        }

        // Build field name -> value mapping
        const fieldMap: Record<string, string> = {};
        model.flds.forEach((f, i) => {
          fieldMap[f.name] = fieldValues[i] || '';
        });

        if (model.type === 1) {
          // Cloze card: content is in the first field typically
          const frontContent = convertClozeFormat(replaceMediaRefs(fieldValues[0] || '', mediaMap));
          // Extract unique cloze numbers
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
            // Malformed cloze, import as basic
            cards.push({
              front: replaceMediaRefs(fieldValues[0] || '', mediaMap),
              back: replaceMediaRefs(fieldValues.slice(1).join('<br>'), mediaMap),
              cardType: 'basic',
              tags,
              media: mediaMap,
            });
          }
        } else {
          // Standard card: use templates
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
            // No templates, use raw fields
            cards.push({
              front: replaceMediaRefs(fieldValues[0] || '', mediaMap),
              back: replaceMediaRefs(fieldValues.slice(1).join('<br>'), mediaMap),
              cardType: 'basic',
              tags,
              media: mediaMap,
            });
          }
        }
      }
    }
  } catch (e) {
    console.error('Failed to parse notes:', e);
    throw new Error('Erro ao extrair cartões do arquivo Anki');
  }

  db.close();

  return {
    deckName,
    cards,
    mediaCount: mediaMap.size,
  };
}
