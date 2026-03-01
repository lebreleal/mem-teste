import { useState, useMemo, useRef, useCallback } from 'react';
import { sanitizeHtml } from '@/lib/sanitize';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, FileText, Download, ChevronRight, Sparkles, AlertTriangle, Package, Loader2, FolderTree, X, Check } from 'lucide-react';
import ankiLogo from '@/assets/anki-logo.svg';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { AnkiParseResult } from '@/lib/ankiParser';

type ImportSource = null | 'csv' | 'anki';
type FieldSep = 'tab' | 'comma' | 'custom';
type CardSep = 'newline' | 'semicolon' | 'custom';

interface ParsedCard {
  front: string;
  back: string;
  cardType?: string;
}

export interface SubdeckOrganization {
  name: string;
  card_indices: number[];
  children?: SubdeckOrganization[];
}

interface DetectedDeckNode {
  name: string;
  count: number;
  children: DetectedDeckNode[];
}

interface ImportCardsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (deckName: string, cards: { frontContent: string; backContent: string; cardType: string }[], subdecks?: SubdeckOrganization[]) => void;
  loading?: boolean;
}

/**
 * RFC 4180 compliant CSV parser
 */
function parseCSV(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let i = 0;
  const len = text.length;
  while (i < len) {
    const row: string[] = [];
    while (i < len) {
      let field = '';
      if (i < len && text[i] === '"') {
        i++;
        while (i < len) {
          if (text[i] === '"') {
            if (i + 1 < len && text[i + 1] === '"') { field += '"'; i += 2; }
            else { i++; break; }
          } else { field += text[i]; i++; }
        }
        while (i < len && text[i] !== delimiter.charAt(0) && text[i] !== '\n' && text[i] !== '\r') i++;
      } else {
        while (i < len && text[i] !== delimiter.charAt(0) && text[i] !== '\n' && text[i] !== '\r') { field += text[i]; i++; }
      }
      row.push(field.trim());
      if (i < len && text.substring(i, i + delimiter.length) === delimiter) { i += delimiter.length; continue; }
      if (i < len && text[i] === '\r') i++;
      if (i < len && text[i] === '\n') i++;
      break;
    }
    if (row.length === 1 && row[0] === '' && i <= len) continue;
    rows.push(row);
  }
  return rows;
}

const splitHierarchyName = (rawName: string): string[] => {
  const raw = rawName.trim();
  if (!raw) return [];

  const parts = raw
    .split(/::|\u001f|[\|｜¦]/g)
    .map(part => part.trim())
    .filter(Boolean);

  return parts.length > 0 ? parts : [raw];
};

function normalizeSubdeckHierarchy(nodes: SubdeckOrganization[]): SubdeckOrganization[] {
  type MutableNode = {
    name: string;
    cardSet: Set<number>;
    children: Map<string, MutableNode>;
  };

  const createNode = (name: string): MutableNode => ({
    name,
    cardSet: new Set<number>(),
    children: new Map<string, MutableNode>(),
  });

  const root = new Map<string, MutableNode>();

  const ensurePath = (target: Map<string, MutableNode>, path: string[]): MutableNode => {
    let level = target;
    let current: MutableNode | null = null;

    for (const segment of path) {
      const key = segment.toLocaleLowerCase('pt-BR');
      let next = level.get(key);
      if (!next) {
        next = createNode(segment);
        level.set(key, next);
      }
      current = next;
      level = next.children;
    }

    return current!;
  };

  const absorb = (target: Map<string, MutableNode>, node: SubdeckOrganization) => {
    const path = splitHierarchyName(node.name);
    if (path.length === 0) return;

    const current = ensurePath(target, path);

    for (const idx of node.card_indices) {
      if (Number.isInteger(idx) && idx >= 0) current.cardSet.add(idx);
    }

    if (node.children?.length) {
      for (const child of node.children) {
        absorb(current.children, child);
      }
    }
  };

  for (const node of nodes) {
    absorb(root, node);
  }

  const toOutput = (map: Map<string, MutableNode>): SubdeckOrganization[] => {
    return [...map.values()]
      .map((node) => {
        const children = toOutput(node.children);
        return {
          name: node.name,
          card_indices: [...node.cardSet],
          children: children.length > 0 ? children : undefined,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  };

  return toOutput(root);
}

const ImportCardsDialog = ({ open, onOpenChange, onImport, loading }: ImportCardsDialogProps) => {
  const [source, setSource] = useState<ImportSource>(null);
  const [deckName, setDeckName] = useState('');
  const { toast } = useToast();

  // CSV state
  const [rawText, setRawText] = useState('');
  const [fieldSep, setFieldSep] = useState<FieldSep>('comma');
  const [fieldSepCustom, setFieldSepCustom] = useState('-');
  const [cardSep, setCardSep] = useState<CardSep>('newline');
  const [cardSepCustom, setCardSepCustom] = useState('\\n\\n');
  const [useRFC, setUseRFC] = useState(true);

  // AI auto-detect state
  const [autoDetecting, setAutoDetecting] = useState(false);
  const [autoDetected, setAutoDetected] = useState(false);

  // AI organize subdecks state
  const [organizing, setOrganizing] = useState(false);
  const [subdecks, setSubdecks] = useState<SubdeckOrganization[] | null>(null);

  // Anki state
  const [ankiLoading, setAnkiLoading] = useState(false);
  const [ankiProgress, setAnkiProgress] = useState('');
  const [ankiResult, setAnkiResult] = useState<AnkiParseResult | null>(null);
  const ankiCleanupRef = useRef<(() => void) | null>(null);

  const csvFileRef = useRef<HTMLInputElement>(null);
  const ankiFileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    // Revoke Blob URLs to free memory
    if (ankiCleanupRef.current) {
      ankiCleanupRef.current();
      ankiCleanupRef.current = null;
    }
    setSource(null);
    setRawText('');
    setDeckName('');
    setFieldSep('comma');
    setCardSep('newline');
    setUseRFC(true);
    setAutoDetected(false);
    setAnkiResult(null);
    setAnkiProgress('');
    setSubdecks(null);
    setOrganizing(false);
  };

  const handleClose = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const getFieldSepChar = (): string => {
    if (fieldSep === 'tab') return '\t';
    if (fieldSep === 'comma') return ',';
    return fieldSepCustom;
  };

  const getCardSepPattern = (): string => {
    if (cardSep === 'newline') return '\n';
    if (cardSep === 'semicolon') return ';';
    return cardSepCustom.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
  };

  const parsedCards: ParsedCard[] = useMemo(() => {
    if (!rawText.trim()) return [];
    const fieldDelimiter = getFieldSepChar();
    if (useRFC && (fieldSep === 'comma' || fieldSep === 'tab')) {
      const rows = parseCSV(rawText, fieldDelimiter);
      return rows.filter(row => row.length >= 1 && row[0].trim()).map(row => ({
        front: row[0] || '', back: row.slice(1).join(' | ').trim(),
      })).filter(c => c.front);
    }
    const cardDelimiter = getCardSepPattern();
    const entries = rawText.split(cardDelimiter).filter(s => s.trim());
    return entries.map(entry => {
      const parts = entry.split(fieldDelimiter);
      return { front: (parts[0] || '').trim(), back: (parts.slice(1).join(fieldDelimiter) || '').trim() };
    }).filter(c => c.front);
  }, [rawText, fieldSep, fieldSepCustom, cardSep, cardSepCustom, useRFC]);

  // AI auto-detect format
  const autoDetectFormat = useCallback(async (text: string) => {
    if (!text.trim() || text.length < 10) return;
    setAutoDetecting(true);
    try {
      const { data, error } = await supabase.functions.invoke('detect-import-format', {
        body: { sample: text.slice(0, 2000) },
      });
      if (error) throw error;
      if (data?.fieldSep) {
        if (data.fieldSep === 'tab') { setFieldSep('tab'); setUseRFC(true); }
        else if (data.fieldSep === 'comma') { setFieldSep('comma'); setUseRFC(true); }
        else { setFieldSep('custom'); setFieldSepCustom(data.fieldSep); setUseRFC(false); }
      }
      if (data?.cardSep) {
        if (data.cardSep === 'newline' || data.cardSep === 'double_newline') setCardSep('newline');
        else if (data.cardSep === 'semicolon') setCardSep('semicolon');
        else { setCardSep('custom'); setCardSepCustom(data.cardSep); }
      }
      setAutoDetected(true);
    } catch (err) {
      console.error('Auto-detect failed:', err);
      const firstLine = text.split('\n')[0] || '';
      if (firstLine.includes('\t')) { setFieldSep('tab'); setUseRFC(true); }
      else { setFieldSep('comma'); setUseRFC(true); }
    } finally {
      setAutoDetecting(false);
    }
  }, []);

  // AI organize into subdecks
  const organizeWithAI = useCallback(async (cards: ParsedCard[]) => {
    if (cards.length < 5) {
      toast({ title: 'Poucos cartões para organizar', description: 'São necessários pelo menos 5 cartões.', variant: 'destructive' });
      return;
    }
    setOrganizing(true);
    try {
      const { data, error } = await supabase.functions.invoke('organize-import', {
        body: {
          cards: cards.map(c => ({ front: c.front, back: c.back })),
          deckName: deckName || undefined,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.subdecks && data.subdecks.length > 0) {
        setSubdecks(normalizeSubdeckHierarchy(data.subdecks as SubdeckOrganization[]));
        toast({ title: `${data.subdecks.length} subdecks identificados pela IA!` });
      } else {
        toast({ title: 'Não foi possível identificar temas distintos', variant: 'destructive' });
      }
    } catch (err: any) {
      console.error('Organize failed:', err);
      toast({ title: 'Erro ao organizar', description: err.message, variant: 'destructive' });
    } finally {
      setOrganizing(false);
    }
  }, [toast, deckName]);

  // CSV file upload
  const handleCsvFormatClick = () => {
    setSource('csv');
    setTimeout(() => csvFileRef.current?.click(), 100);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = ev.target?.result as string;
      if (text) {
        setRawText(text);
        setSubdecks(null);
        if (!deckName) {
          const name = file.name.replace(/\.[^.]+$/, '').replace(/_/g, ' ');
          setDeckName(name.charAt(0).toUpperCase() + name.slice(1));
        }
        await autoDetectFormat(text);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Anki format
  const handleAnkiFormatClick = () => {
    setSource('anki');
    setTimeout(() => ankiFileRef.current?.click(), 100);
  };

  const handleAnkiUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setAnkiLoading(true);
    setAnkiProgress('Abrindo arquivo...');
    try {
      const { parseApkgFile } = await import('@/lib/ankiParser');
      const result = await parseApkgFile(file, (msg) => {
        setAnkiProgress(msg);
      });
      // Store cleanup for Blob URL revocation
      if (result.cleanup) {
        ankiCleanupRef.current = result.cleanup;
      }
      setAnkiResult(result);
      setSubdecks(result.subdecks ? normalizeSubdeckHierarchy(result.subdecks as SubdeckOrganization[]) : null);
      if (!deckName) setDeckName(result.deckName);
      toast({
        title: `${result.cards.length} cartões encontrados`,
        description: result.mediaCount > 0 ? `${result.mediaCount} arquivos de mídia extraídos` : undefined,
      });
    } catch (err: any) {
      console.error('Anki parse error:', err);
      toast({ title: 'Erro ao ler arquivo Anki', description: err.message, variant: 'destructive' });
      setSource(null);
    } finally {
      setAnkiLoading(false);
      setAnkiProgress('');
    }
  };


  const handleImport = () => {
    if (source === 'anki' && ankiResult) {
      if (!deckName.trim()) return;
      const cards = ankiResult.cards.map(c => ({
        frontContent: c.front,
        backContent: c.back,
        cardType: c.cardType,
      }));
      onImport(deckName.trim(), cards, subdecks ?? undefined);
      reset();
      return;
    }
    if (parsedCards.length === 0 || !deckName.trim()) return;
    const cards = parsedCards.map(c => ({
      frontContent: c.front,
      backContent: c.back,
      cardType: c.cardType || 'basic',
    }));
    onImport(deckName.trim(), cards, subdecks ?? undefined);
    reset();
  };

  // Detect potential issues
  const hasIssues = useMemo(() => {
    if (parsedCards.length === 0) return false;
    const emptyBacks = parsedCards.filter(c => !c.back.trim()).length;
    const veryShortFronts = parsedCards.filter(c => c.front.length < 3).length;
    return emptyBacks > parsedCards.length * 0.1 || veryShortFronts > 5;
  }, [parsedCards]);

  const activeCards = source === 'anki' ? (ankiResult?.cards || []) : parsedCards;
  const cardCount = activeCards.length;

  // Hidden file inputs
  const fileInputs = (
    <>
      <input ref={csvFileRef} type="file" accept=".csv,.tsv,.txt" className="hidden" onChange={handleFileUpload} />
      <input ref={ankiFileRef} type="file" accept=".apkg,.colpkg,.ofc,.zip" className="hidden" onChange={handleAnkiUpload} />
    </>
  );

  // Count total cards in a subdeck tree (incluindo nós intermediários)
  const countTreeCards = (sd: SubdeckOrganization): number => {
    const own = sd.card_indices.length;
    const fromChildren = sd.children?.reduce((sum, c) => sum + countTreeCards(c), 0) ?? 0;
    return own + fromChildren;
  };

  const hasHierarchy = subdecks?.some(sd => sd.children && sd.children.length > 0);

  const subdeckStats = useMemo(() => {
    if (!subdecks || subdecks.length === 0) return null;

    const walk = (nodes: SubdeckOrganization[], depth: number): { decks: number; cards: number; maxDepth: number } => {
      return nodes.reduce((acc, node) => {
        const child = node.children?.length ? walk(node.children, depth + 1) : { decks: 0, cards: 0, maxDepth: depth };
        return {
          decks: acc.decks + 1 + child.decks,
          cards: acc.cards + node.card_indices.length + child.cards,
          maxDepth: Math.max(acc.maxDepth, child.maxDepth, depth),
        };
      }, { decks: 0, cards: 0, maxDepth: depth });
    };

    return walk(subdecks, 1);
  }, [subdecks]);

  const splitDeckPathLabel = (rawDeckName: string): string[] => {
    return splitHierarchyName(rawDeckName);
  };

  const normalizeDeckTitle = (value: string): string => {
    return value
      .replace(/^[\-•]+\s*/, '')
      .replace(/\s+/g, ' ')
      .replace(/^([a-zA-Z])\.(\S)/, '$1. $2')
      .trim();
  };

  const getDeckNodeTitle = (rawDeckName: string): string => {
    const parts = splitDeckPathLabel(rawDeckName);
    const last = parts[parts.length - 1] || rawDeckName;
    return normalizeDeckTitle(last);
  };

  const detectedAnkiHierarchy = useMemo(() => {
    if (source !== 'anki' || !ankiResult || ankiResult.cards.length === 0) {
      return { nodes: [] as DetectedDeckNode[], deckCount: 0, maxDepth: 0 };
    }

    type MutableNode = { name: string; count: number; children: Map<string, MutableNode> };
    const roots = new Map<string, MutableNode>();

    const ensure = (map: Map<string, MutableNode>, name: string): MutableNode => {
      const existing = map.get(name);
      if (existing) return existing;
      const created: MutableNode = { name, count: 0, children: new Map() };
      map.set(name, created);
      return created;
    };

    for (const card of ankiResult.cards) {
      const raw = card.deckName?.trim() || deckName.trim() || 'Anki Import';
      const parts = splitDeckPathLabel(raw);
      if (parts.length === 0) continue;

      let level = roots;
      for (const part of parts) {
        const node = ensure(level, part);
        node.count += 1;
        level = node.children;
      }
    }

    const toArray = (map: Map<string, MutableNode>): DetectedDeckNode[] => {
      return [...map.values()]
        .map((node) => ({
          name: node.name,
          count: node.count,
          children: toArray(node.children),
        }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    };

    const nodes = toArray(roots);

    const stats = (items: DetectedDeckNode[], depth: number): { deckCount: number; maxDepth: number } => {
      return items.reduce((acc, item) => {
        const child = item.children.length > 0 ? stats(item.children, depth + 1) : { deckCount: 0, maxDepth: depth };
        return {
          deckCount: acc.deckCount + 1 + child.deckCount,
          maxDepth: Math.max(acc.maxDepth, child.maxDepth, depth),
        };
      }, { deckCount: 0, maxDepth: depth });
    };

    return {
      nodes,
      ...stats(nodes, 1),
    };
  }, [ankiResult, deckName, source]);

  const DetectedAnkiNode = ({ node, depth = 0 }: { node: DetectedDeckNode; depth?: number }) => {
    const hasChildren = node.children.length > 0;

    return (
      <div style={{ marginLeft: depth > 0 ? `${depth * 14}px` : undefined }}>
        <div className="flex items-center justify-between rounded-md bg-background/80 px-3 py-1.5">
          <span className={`text-xs ${depth === 0 ? 'font-medium text-foreground' : 'text-muted-foreground'} flex items-center gap-1.5`}>
            {hasChildren && <FolderTree className="h-3 w-3 text-primary/70" />}
            {normalizeDeckTitle(node.name)}
          </span>
          <span className="text-[10px] text-muted-foreground">{node.count} cartões</span>
        </div>

        {hasChildren && (
          <div className="mt-0.5 space-y-0.5">
            {node.children.map((child, index) => (
              <DetectedAnkiNode key={`${child.name}-${index}`} node={child} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    );
  };


  // Recursive node renderer for subdeck preview
  const SubdeckNode = ({ node, depth = 0 }: { node: SubdeckOrganization; depth?: number }) => {
    const hasChildren = node.children && node.children.length > 0;
    const totalInBranch = countTreeCards(node);
    return (
      <div style={{ marginLeft: depth > 0 ? `${depth * 16}px` : undefined }}>
        <div className="flex items-center justify-between rounded-md bg-background/80 px-3 py-1.5">
          <span className={`text-xs ${depth === 0 ? 'font-medium text-foreground' : 'text-muted-foreground'} flex items-center gap-1.5`}>
            {hasChildren && <FolderTree className="h-3 w-3 text-primary/70" />}
            {getDeckNodeTitle(node.name)}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {hasChildren ? `${totalInBranch} cartões` : `${node.card_indices.length} cartões`}
          </span>
        </div>
        {hasChildren && (
          <div className="mt-0.5 space-y-0.5">
            {node.children!.map((child, j) => (
              <SubdeckNode key={j} node={child} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    );
  };

  // Subdeck organization preview component
  const SubdeckPreview = () => {
    if (!subdecks || subdecks.length === 0 || !subdeckStats) return null;

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-semibold flex items-center gap-1.5">
            <FolderTree className="h-4 w-4 text-primary" />
            Organização sugerida ({subdeckStats.decks} decks)
          </Label>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-muted-foreground" onClick={() => setSubdecks(null)}>
            <X className="h-3 w-3 mr-1" />
            Remover
          </Button>
        </div>
        <div className="max-h-48 overflow-y-auto space-y-1 rounded-lg border border-primary/20 bg-primary/5 p-2">
          {subdecks.map((sd, i) => (
            <SubdeckNode key={i} node={sd} />
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">
          {hasHierarchy
            ? `Serão criados ${subdeckStats.decks} deck(s), ${subdeckStats.cards} cartões e profundidade máxima ${subdeckStats.maxDepth}.`
            : `Serão criados ${subdeckStats.decks} subdeck(s) com ${subdeckStats.cards} cartões, incluindo subníveis.`}
        </p>
      </div>
    );
  };

  // AI organize button
  const OrganizeButton = ({ cards }: { cards: ParsedCard[] | { front: string; back: string }[] }) => {
    if (cards.length < 5) return null;
    return (
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 text-xs border-primary/30 text-primary hover:bg-primary/5"
        onClick={() => organizeWithAI(cards.map(c => ({ front: c.front, back: c.back })))}
        disabled={organizing}
      >
        {organizing ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Organizando...
          </>
        ) : subdecks ? (
          <>
            <Check className="h-3.5 w-3.5" />
            Reorganizar com IA
          </>
        ) : (
          <>
            <FolderTree className="h-3.5 w-3.5" />
            Organizar em subdecks com IA
          </>
        )}
      </Button>
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        {fileInputs}

        {!source ? (
          <>
            <DialogHeader>
              <DialogTitle className="font-display">Importar cartões</DialogTitle>
              <DialogDescription>Escolha o formato do arquivo:</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              {/* CSV / TSV / TXT */}
              <button
                onClick={handleCsvFormatClick}
                className="flex w-full items-center gap-4 rounded-xl border border-border p-4 text-left transition-colors hover:bg-muted/50"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent">
                  <FileText className="h-5 w-5 text-accent-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-card-foreground">CSV / TSV / TXT</p>
                  <p className="text-xs text-muted-foreground">Separado por vírgula, tab ou personalizado</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </button>

              {/* Anki */}
              <button
                onClick={handleAnkiFormatClick}
                className="flex w-full items-center gap-4 rounded-xl border border-border p-4 text-left transition-colors hover:bg-muted/50"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent p-1.5">
                  <img src={ankiLogo} alt="Anki" className="h-full w-full object-contain" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-card-foreground">Anki</p>
                  <p className="text-xs text-muted-foreground">Formatos .apkg, .colpkg, .ofc</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </button>
            </div>
          </>
        ) : source === 'anki' ? (
          /* ── Anki import flow ── */
          <>
            <DialogHeader>
              <DialogTitle className="font-display flex items-center gap-2">
                <button onClick={() => { setSource(null); setAnkiResult(null); setSubdecks(null); }} className="rounded-full p-1 hover:bg-muted transition-colors">
                  <ArrowLeft className="h-4 w-4" />
                </button>
                Importar do Anki
              </DialogTitle>
            </DialogHeader>

            {ankiLoading ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">{ankiProgress || 'Analisando arquivo Anki...'}</p>
              </div>
            ) : ankiResult ? (
              <div className="space-y-4">
                <div>
                  <Label className="mb-1.5 block">Nome do baralho</Label>
                  <Input value={deckName} onChange={e => setDeckName(e.target.value)} placeholder="Nome do baralho" maxLength={100} />
                </div>

                {ankiResult.mediaCount > 0 && (
                  <div className="flex items-center gap-2 rounded-xl bg-primary/5 border border-primary/20 px-3 py-2">
                    <Package className="h-4 w-4 text-primary" />
                    <span className="text-xs text-foreground">{ankiResult.mediaCount} arquivos de mídia incluídos</span>
                  </div>
                )}

                {/* AI organize button */}
                <OrganizeButton cards={ankiResult.cards} />

                {/* Subdeck preview */}
                <SubdeckPreview />

                {/* Hierarquia detectada no arquivo Anki */}
                {detectedAnkiHierarchy.nodes.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold flex items-center gap-1.5">
                      <FolderTree className="h-4 w-4 text-primary" />
                      Estrutura original do arquivo ({detectedAnkiHierarchy.deckCount} decks)
                    </Label>
                    <div className="max-h-48 overflow-y-auto space-y-1 rounded-lg border border-border bg-muted/20 p-2">
                      {detectedAnkiHierarchy.nodes.map((node, index) => (
                        <DetectedAnkiNode key={`${node.name}-${index}`} node={node} />
                      ))}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Profundidade máxima detectada: {detectedAnkiHierarchy.maxDepth} nível(is).
                    </p>
                  </div>
                )}

                {/* Preview */}
                <div>
                  <Label className="mb-2 block text-sm font-semibold">
                    Prévia ({ankiResult.cards.length} cartões)
                  </Label>
                  <div className="max-h-48 overflow-y-auto space-y-2">
                    {ankiResult.cards.slice(0, 20).map((card, i) => (
                      <div key={i} className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                            card.cardType === 'cloze' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                          }`}>
                            {card.cardType === 'cloze' ? 'Cloze' : 'Básico'}
                          </span>
                          {card.deckName && (
                            <span
                              className="text-[10px] px-1.5 py-0.5 rounded bg-accent text-accent-foreground"
                              title={splitDeckPathLabel(card.deckName).map(normalizeDeckTitle).join(' › ')}
                            >
                              {getDeckNodeTitle(card.deckName)}
                            </span>
                          )}
                          {card.tags.length > 0 && (
                            <span className="text-[10px] text-muted-foreground">{card.tags.slice(0, 3).join(', ')}</span>
                          )}
                        </div>
                        <p className="font-medium text-card-foreground text-xs line-clamp-2"
                           dangerouslySetInnerHTML={{ __html: sanitizeHtml(card.front.replace(/<img[^>]*>/g, '[imagem]')) }} />
                        {card.cardType !== 'cloze' && card.back && (
                          <p className="mt-1 text-muted-foreground text-xs line-clamp-2"
                             dangerouslySetInnerHTML={{ __html: sanitizeHtml(card.back.replace(/<img[^>]*>/g, '[imagem]')) }} />
                        )}
                      </div>
                    ))}
                    {ankiResult.cards.length > 20 && (
                      <p className="text-center text-xs text-muted-foreground">...e mais {ankiResult.cards.length - 20} cartões</p>
                    )}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => handleClose(false)}>Cancelar</Button>
                  <Button onClick={handleImport} disabled={!deckName.trim() || loading}>
                    {loading ? 'Importando...' : subdecks && subdeckStats
                      ? `Importar (${subdeckStats.decks} decks / ${subdeckStats.cards} cartões)`
                      : `Importar (${ankiResult.cards.length})`
                    }
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <p className="text-sm text-muted-foreground">Selecione um arquivo .apkg, .colpkg ou .ofc</p>
                <Button variant="outline" onClick={() => ankiFileRef.current?.click()}>
                  <Download className="h-4 w-4 mr-2" /> Selecionar arquivo
                </Button>
              </div>
            )}
          </>
        ) : (
          /* ── CSV import flow ── */
          <>
            <DialogHeader>
              <DialogTitle className="font-display flex items-center gap-2">
                <button onClick={() => setSource(null)} className="rounded-full p-1 hover:bg-muted transition-colors">
                  <ArrowLeft className="h-4 w-4" />
                </button>
                Importar cartões
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <Label className="mb-1.5 block">Nome do baralho</Label>
                <Input value={deckName} onChange={e => setDeckName(e.target.value)} placeholder="Ex: Ginecologia" maxLength={100} />
              </div>

              {/* File upload + text */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <Label>Importe seus dados</Label>
                  <label className="cursor-pointer text-xs text-primary hover:underline flex items-center gap-1">
                    <Download className="h-3 w-3" />
                    Carregar arquivo
                    <input type="file" accept=".csv,.tsv,.txt" className="hidden" onChange={handleFileUpload} />
                  </label>
                </div>
                <Textarea
                  value={rawText}
                  onChange={e => { setRawText(e.target.value); setAutoDetected(false); setSubdecks(null); }}
                  placeholder={"Pergunta,Resposta\nPergunta 2,Resposta 2"}
                  rows={5}
                  className="font-mono text-xs"
                />
              </div>

              {/* AI auto-detect indicator */}
              {autoDetecting && (
                <div className="flex items-center gap-2 rounded-xl bg-primary/5 border border-primary/20 px-3 py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="text-xs text-foreground">IA analisando formato...</span>
                </div>
              )}

              {autoDetected && !autoDetecting && (
                <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-3 py-2">
                  <Sparkles className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">Formato detectado pela IA ✓</span>
                </div>
              )}

              {/* Separators */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="mb-2 block text-xs font-semibold text-muted-foreground">Entre a frente e o verso</Label>
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input type="radio" name="fieldSep" checked={fieldSep === 'tab'} onChange={() => { setFieldSep('tab'); setUseRFC(true); }} className="accent-primary" />
                      Tab
                    </label>
                    <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input type="radio" name="fieldSep" checked={fieldSep === 'comma'} onChange={() => { setFieldSep('comma'); setUseRFC(true); }} className="accent-primary" />
                      Vírgula
                    </label>
                    <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input type="radio" name="fieldSep" checked={fieldSep === 'custom'} onChange={() => { setFieldSep('custom'); setUseRFC(false); }} className="accent-primary" />
                      <Input
                        value={fieldSepCustom}
                        onChange={e => { setFieldSepCustom(e.target.value); setFieldSep('custom'); setUseRFC(false); }}
                        className="h-7 w-24 text-xs"
                        placeholder="Personalizado: -"
                      />
                    </label>
                  </div>
                </div>

                <div>
                  <Label className="mb-2 block text-xs font-semibold text-muted-foreground">Entre cartões</Label>
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input type="radio" name="cardSep" checked={cardSep === 'newline'} onChange={() => setCardSep('newline')} className="accent-primary" />
                      Nova linha
                    </label>
                    <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input type="radio" name="cardSep" checked={cardSep === 'semicolon'} onChange={() => setCardSep('semicolon')} className="accent-primary" />
                      Ponto e vírgula
                    </label>
                    <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input type="radio" name="cardSep" checked={cardSep === 'custom'} onChange={() => setCardSep('custom')} className="accent-primary" />
                      <Input
                        value={cardSepCustom}
                        onChange={e => { setCardSepCustom(e.target.value); setCardSep('custom'); }}
                        className="h-7 w-24 text-xs"
                        placeholder="Personalizado"
                      />
                    </label>
                  </div>
                </div>
              </div>

              {/* Issue warning */}
              {parsedCards.length > 0 && hasIssues && (
                <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/5 p-3">
                  <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-xs font-medium text-foreground">Possíveis erros de parsing detectados</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Ajuste os separadores acima ou edite o texto.</p>
                  </div>
                </div>
              )}

              {/* AI Organize button */}
              {parsedCards.length >= 5 && (
                <OrganizeButton cards={parsedCards} />
              )}

              {/* Subdeck preview */}
              <SubdeckPreview />

              {/* Preview */}
              <div>
                <Label className="mb-2 block text-sm font-semibold">Prévia dos cartões ({parsedCards.length})</Label>
                {parsedCards.length > 0 ? (
                  <div className="max-h-48 overflow-y-auto space-y-2">
                    {parsedCards.slice(0, 20).map((card, i) => (
                      <div key={i} className={`rounded-lg border p-3 text-sm ${
                        !card.back?.trim() ? 'border-warning/50 bg-warning/5' : 'border-border bg-muted/30'
                      }`}>
                        <p className="font-medium text-card-foreground text-xs">{card.front}</p>
                        {card.back ? (
                          <p className="mt-1 text-muted-foreground text-xs line-clamp-3">{card.back}</p>
                        ) : (
                          <p className="mt-1 text-warning text-[11px] italic">Sem verso</p>
                        )}
                      </div>
                    ))}
                    {parsedCards.length > 20 && (
                      <p className="text-center text-xs text-muted-foreground">...e mais {parsedCards.length - 20} cartões</p>
                    )}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
                    Cole ou carregue dados acima para visualizar
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => handleClose(false)}>Cancelar</Button>
                <Button onClick={handleImport} disabled={parsedCards.length === 0 || !deckName.trim() || loading}>
                  {loading ? 'Importando...' : subdecks && subdeckStats
                    ? `Importar (${subdeckStats.decks} decks / ${subdeckStats.cards} cartões)`
                    : `Importar ${parsedCards.length > 0 ? `(${parsedCards.length})` : ''}`
                  }
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ImportCardsDialog;
