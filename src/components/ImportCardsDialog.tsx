import { useState, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, FileText, Download, ChevronRight, Sparkles, Brain, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useEnergy } from '@/hooks/useEnergy';
import { useAIModel } from '@/hooks/useAIModel';
import AIModelSelector from '@/components/AIModelSelector';
import { useToast } from '@/hooks/use-toast';

type ImportSource = null | 'csv';
type FieldSep = 'tab' | 'comma' | 'custom';
type CardSep = 'newline' | 'semicolon' | 'custom';

interface ParsedCard {
  front: string;
  back: string;
}

interface ImportCardsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (deckName: string, cards: { frontContent: string; backContent: string; cardType: string }[]) => void;
  loading?: boolean;
}

/**
 * RFC 4180 compliant CSV parser that handles:
 * - Quoted fields with embedded newlines
 * - Escaped quotes ("" inside quoted fields)
 * - Mixed quoted and unquoted fields
 */
function parseCSV(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let i = 0;
  const len = text.length;

  while (i < len) {
    const row: string[] = [];
    
    while (i < len) {
      let field = '';
      
      // Skip leading whitespace before a potential quote
      const startI = i;
      
      if (i < len && text[i] === '"') {
        // Quoted field
        i++; // skip opening quote
        while (i < len) {
          if (text[i] === '"') {
            if (i + 1 < len && text[i + 1] === '"') {
              field += '"';
              i += 2; // skip escaped quote
            } else {
              i++; // skip closing quote
              break;
            }
          } else {
            field += text[i];
            i++;
          }
        }
        // Skip to delimiter or end of line
        while (i < len && text[i] !== delimiter.charAt(0) && text[i] !== '\n' && text[i] !== '\r') {
          i++;
        }
      } else {
        // Unquoted field
        while (i < len && text[i] !== delimiter.charAt(0) && text[i] !== '\n' && text[i] !== '\r') {
          field += text[i];
          i++;
        }
      }
      
      row.push(field.trim());
      
      if (i < len && text.substring(i, i + delimiter.length) === delimiter) {
        i += delimiter.length; // skip delimiter
        continue; // next field in same row
      }
      
      // End of row
      if (i < len && text[i] === '\r') i++;
      if (i < len && text[i] === '\n') i++;
      break;
    }
    
    // Skip completely empty rows
    if (row.length === 1 && row[0] === '' && i <= len) {
      continue;
    }
    
    rows.push(row);
  }
  
  return rows;
}

const ImportCardsDialog = ({ open, onOpenChange, onImport, loading }: ImportCardsDialogProps) => {
  const [source, setSource] = useState<ImportSource>(null);
  const [deckName, setDeckName] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { energy, spendEnergy } = useEnergy();
  const { model, setModel, getCost } = useAIModel();

  // CSV state
  const [rawText, setRawText] = useState('');
  const [fieldSep, setFieldSep] = useState<FieldSep>('comma');
  const [fieldSepCustom, setFieldSepCustom] = useState('-');
  const [cardSep, setCardSep] = useState<CardSep>('newline');
  const [cardSepCustom, setCardSepCustom] = useState('\\n\\n');
  const [useRFC, setUseRFC] = useState(true); // RFC 4180 mode for proper CSV

  // AI enhancement state
  const [enhancing, setEnhancing] = useState(false);
  const [enhanced, setEnhanced] = useState(false);
  const [enhancedCards, setEnhancedCards] = useState<ParsedCard[]>([]);

  const AI_COST = 2;

  const reset = () => {
    setSource(null);
    setRawText('');
    setDeckName('');
    setFieldSep('comma');
    setCardSep('newline');
    setUseRFC(true);
    setEnhanced(false);
    setEnhancedCards([]);
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
    if (enhanced && enhancedCards.length > 0) return enhancedCards;
    if (!rawText.trim()) return [];

    const fieldDelimiter = getFieldSepChar();

    // Use RFC 4180 parser for CSV with quoted fields
    if (useRFC && (fieldSep === 'comma' || fieldSep === 'tab')) {
      const rows = parseCSV(rawText, fieldDelimiter);
      return rows
        .filter(row => row.length >= 1 && row[0].trim())
        .map(row => ({
          front: row[0] || '',
          back: row.slice(1).join(' | ').trim(),
        }))
        .filter(c => c.front);
    }

    // Legacy simple split mode
    const cardDelimiter = getCardSepPattern();
    const entries = rawText.split(cardDelimiter).filter(s => s.trim());
    return entries.map(entry => {
      const parts = entry.split(fieldDelimiter);
      return {
        front: (parts[0] || '').trim(),
        back: (parts.slice(1).join(fieldDelimiter) || '').trim(),
      };
    }).filter(c => c.front);
  }, [rawText, fieldSep, fieldSepCustom, cardSep, cardSepCustom, useRFC, enhanced, enhancedCards]);

  // AI enhance
  const handleEnhance = async () => {
    if (parsedCards.length === 0) return;
    if (energy < AI_COST) {
      toast({ title: 'Créditos IA insuficientes', description: `Necessário: ${AI_COST} créditos`, variant: 'destructive' });
      return;
    }

    setEnhancing(true);
    try {
      const { data, error } = await supabase.functions.invoke('enhance-import', {
        body: { cards: parsedCards.map(c => ({ front: c.front, back: c.back })), aiModel: model, energyCost: AI_COST },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const corrected = data.cards as ParsedCard[];
      setEnhancedCards(corrected);
      setEnhanced(true);
      queryClient.invalidateQueries({ queryKey: ['energy'] });
      toast({ title: '✨ Cards aprimorados pela IA!', description: `${parsedCards.length} → ${corrected.length} cards` });
    } catch (err: any) {
      console.error(err);
      toast({ title: 'Erro ao aprimorar', description: err.message, variant: 'destructive' });
    } finally {
      setEnhancing(false);
    }
  };

  const handleImport = () => {
    if (parsedCards.length === 0 || !deckName.trim()) return;
    onImport(deckName.trim(), parsedCards.map(c => ({
      frontContent: c.front,
      backContent: c.back,
      cardType: 'basic',
    })));
    reset();
  };

  // File upload handler
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      if (text) {
        setRawText(text);
        setEnhanced(false);
        setEnhancedCards([]);
        // Auto-detect separator
        const firstLine = text.split('\n')[0] || '';
        if (firstLine.includes('\t')) {
          setFieldSep('tab');
        } else {
          setFieldSep('comma');
        }
        setUseRFC(true);
        // Auto-set deck name from filename
        if (!deckName) {
          const name = file.name.replace(/\.[^.]+$/, '').replace(/_/g, ' ');
          setDeckName(name.charAt(0).toUpperCase() + name.slice(1));
        }
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Detect potential issues
  const hasIssues = useMemo(() => {
    if (parsedCards.length === 0) return false;
    const emptyBacks = parsedCards.filter(c => !c.back.trim()).length;
    const veryShortFronts = parsedCards.filter(c => c.front.length < 3).length;
    return emptyBacks > parsedCards.length * 0.1 || veryShortFronts > 5;
  }, [parsedCards]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        {!source ? (
          <>
            <DialogHeader>
              <DialogTitle className="font-display">Importar cartões</DialogTitle>
              <DialogDescription>Você pode importar cartões de:</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <button
                onClick={() => setSource('csv')}
                className="flex w-full items-center gap-4 rounded-xl border border-border p-4 text-left transition-colors hover:bg-muted/50"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent">
                  <FileText className="h-5 w-5 text-accent-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-card-foreground">CSV / TSV / TXT</p>
                  <p className="text-xs text-muted-foreground">Importar de qualquer documento separado por vírgula ou tab</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </button>
            </div>
          </>
        ) : (
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
              {/* Deck name */}
              <div>
                <Label className="mb-1.5 block">Nome do baralho</Label>
                <Input
                  value={deckName}
                  onChange={e => setDeckName(e.target.value)}
                  placeholder="Ex: Ginecologia"
                  maxLength={100}
                />
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
                  onChange={e => { setRawText(e.target.value); setEnhanced(false); setEnhancedCards([]); }}
                  placeholder={"Pergunta,Resposta\nPergunta 2,Resposta 2"}
                  rows={5}
                  className="font-mono text-xs"
                />
              </div>

              {/* Separators */}
              <div className="space-y-3">
                <div>
                  <Label className="mb-2 block text-sm font-semibold">Separador de campos</Label>
                  <div className="flex items-center gap-3 flex-wrap">
                    <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input type="radio" name="fieldSep" checked={fieldSep === 'comma'} onChange={() => { setFieldSep('comma'); setUseRFC(true); }} className="accent-primary" />
                      Vírgula
                    </label>
                    <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input type="radio" name="fieldSep" checked={fieldSep === 'tab'} onChange={() => { setFieldSep('tab'); setUseRFC(true); }} className="accent-primary" />
                      Tab
                    </label>
                    <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input type="radio" name="fieldSep" checked={fieldSep === 'custom'} onChange={() => { setFieldSep('custom'); setUseRFC(false); }} className="accent-primary" />
                      <Input
                        value={fieldSepCustom}
                        onChange={e => { setFieldSepCustom(e.target.value); setFieldSep('custom'); setUseRFC(false); }}
                        className="h-7 w-20 text-xs"
                        placeholder="Outro"
                      />
                    </label>
                  </div>
                </div>
              </div>

              {/* Issue warning + AI enhance */}
              {parsedCards.length > 0 && hasIssues && !enhanced && (
                <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/5 p-3">
                  <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-xs font-medium text-foreground">Possíveis erros de parsing detectados</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Alguns cards podem estar quebrados. Use a IA para corrigir automaticamente.
                    </p>
                  </div>
                </div>
              )}

              {parsedCards.length > 0 && !enhanced && (
                <Button
                  variant="outline"
                  className="w-full gap-2 border-primary/30 hover:bg-primary/5"
                  onClick={handleEnhance}
                  disabled={enhancing || energy < AI_COST}
                >
                  {enhancing ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                      Aprimorando com IA...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 text-primary" />
                      Aprimorar com IA
                      <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                        <Brain className="h-3 w-3" style={{ color: 'hsl(var(--energy-purple))' }} /> {AI_COST}
                      </span>
                    </>
                  )}
                </Button>
              )}

              {enhanced && (
                <div className="flex items-center gap-2 rounded-xl bg-success/10 px-3 py-2">
                  <Sparkles className="h-4 w-4 text-success" />
                  <span className="text-xs font-medium text-success">Cards aprimorados pela IA ✓</span>
                </div>
              )}

              {/* Preview */}
              <div>
                <Label className="mb-2 block text-sm font-semibold">
                  Prévia dos cartões ({parsedCards.length})
                </Label>
                {parsedCards.length > 0 ? (
                  <div className="max-h-48 overflow-y-auto space-y-2">
                    {parsedCards.slice(0, 20).map((card, i) => (
                      <div key={i} className={`rounded-lg border p-3 text-sm ${
                        !card.back.trim() ? 'border-warning/50 bg-warning/5' : 'border-border bg-muted/30'
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
                      <p className="text-center text-xs text-muted-foreground">
                        ...e mais {parsedCards.length - 20} cartões
                      </p>
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
                  {loading ? 'Importando...' : `Importar ${parsedCards.length > 0 ? `(${parsedCards.length})` : ''}`}
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
