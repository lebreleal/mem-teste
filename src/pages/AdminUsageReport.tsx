import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { fetchGlobalTokenUsage, deleteTokenUsageEntry, type UsageEntry } from '@/services/adminService';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ArrowLeft, Loader2, Search, CalendarIcon, DollarSign, Zap, BarChart3, Trash2 } from 'lucide-react';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

// Feature key → friendly name
const FEATURE_NAMES: Record<string, string> = {
  generate_deck: 'Gerar Deck',
  ai_tutor: 'Tutor IA',
  grade_exam: 'Corrigir Prova',
  enhance_card: 'Aprimorar Card',
  enhance_import: 'Aprimorar Importação',
  ai_chat: 'Chat IA',
  generate_onboarding: 'Onboarding IA',
  auto_tag: 'Auto-Tag',
  suggest_tags: 'Sugerir Tags',
  detect_import_format: 'Detectar Formato',
  organize_import: 'Organizar Importação',
  tts: 'Text-to-Speech',
};

// Pricing per 1M tokens (USD) — calibrated against Google Cloud Billing (Feb 2026)
// Output price is a blended rate (thinking + regular output tokens).
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gemini-2.5-pro': { input: 1.25, output: 10.00 },
  'gemini-2.5-flash': { input: 0.30, output: 2.50 },        // blended thinking+regular from billing
  'gemini-2.5-flash-lite': { input: 0.10, output: 0.40 },
  'gemini-2.0-flash': { input: 0.10, output: 0.40 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-4o': { input: 2.50, output: 10.00 },
  'gpt-3.5-turbo': { input: 0.50, output: 1.50 },
  'tts-1': { input: 15.00, output: 0 },
  'google-neural2': { input: 4.00, output: 0 },
};

// total_tokens includes thinking tokens; real output = total - prompt
const calcCostUSD = (model: string, promptTokens: number, completionTokens: number, totalTokens: number): number => {
  const pricing = MODEL_PRICING[model] ?? { input: 0.15, output: 0.60 };
  const realOutputTokens = Math.max(totalTokens - promptTokens, completionTokens);
  return (promptTokens / 1_000_000) * pricing.input + (realOutputTokens / 1_000_000) * pricing.output;
};

interface UsageEntry {
  id: string;
  created_at: string;
  user_id: string;
  user_name: string | null;
  user_email: string | null;
  feature_key: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  energy_cost: number;
}

type DatePreset = 'today' | '7d' | '30d' | 'custom';

const AdminUsageReport = () => {
  const navigate = useNavigate();
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const { toast } = useToast();

  const [entries, setEntries] = useState<UsageEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [datePreset, setDatePreset] = useState<DatePreset>('7d');
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();
  const [usdToBrl, setUsdToBrl] = useState<number | null>(null);

  useEffect(() => {
    fetch('https://open.er-api.com/v6/latest/USD')
      .then(r => r.json())
      .then(data => { if (data?.rates?.BRL) setUsdToBrl(data.rates.BRL); })
      .catch(() => setUsdToBrl(5.50));
  }, []);

  const getDateRange = useCallback((): { from: string | null; to: string | null } => {
    const now = new Date();
    switch (datePreset) {
      case 'today':
        return { from: startOfDay(now).toISOString(), to: endOfDay(now).toISOString() };
      case '7d':
        return { from: subDays(now, 7).toISOString(), to: null };
      case '30d':
        return { from: subDays(now, 30).toISOString(), to: null };
      case 'custom':
        return {
          from: customFrom ? startOfDay(customFrom).toISOString() : null,
          to: customTo ? endOfDay(customTo).toISOString() : null,
        };
      default:
        return { from: null, to: null };
    }
  }, [datePreset, customFrom, customTo]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { from, to } = getDateRange();
    try {
      const data = await fetchGlobalTokenUsage({ dateFrom: from, dateTo: to, limit: 500 });
      setEntries(data);
    } catch {
      toast({ title: 'Erro', description: 'Falha ao carregar dados.', variant: 'destructive' });
    }
    setLoading(false);
  }, [getDateRange, toast]);

  useEffect(() => {
    if (isAdmin) fetchData();
  }, [isAdmin, datePreset, customFrom, customTo, fetchData]);

  const deleteEntry = async (entryId: string) => {
    try {
      await deleteTokenUsageEntry(entryId);
      setEntries(prev => prev.filter(e => e.id !== entryId));
      toast({ title: 'Registro deletado!' });
    } catch {
      toast({ title: 'Erro', description: 'Falha ao deletar.', variant: 'destructive' });
    }
  };

  // Filter by user search
  const filtered = userSearch
    ? entries.filter(e =>
        (e.user_name || '').toLowerCase().includes(userSearch.toLowerCase()) ||
        (e.user_email || '').toLowerCase().includes(userSearch.toLowerCase())
      )
    : entries;

  // Summary
  const totalCalls = filtered.length;
  const totalTokens = filtered.reduce((s, e) => s + Number(e.total_tokens), 0);
  const totalEnergy = filtered.reduce((s, e) => s + Number(e.energy_cost), 0);
  const totalCostUSD = filtered.reduce((s, e) => s + calcCostUSD(e.model, Number(e.prompt_tokens), Number(e.completion_tokens), Number(e.total_tokens)), 0);
  const totalCostBRL = usdToBrl ? totalCostUSD * usdToBrl : null;

  if (adminLoading) return <div className="flex items-center justify-center min-h-screen"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  if (!isAdmin) return <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-4"><p className="text-lg text-muted-foreground">Acesso restrito.</p><Button variant="outline" onClick={() => navigate('/dashboard')}>Voltar</Button></div>;

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/admin/ia')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <BarChart3 className="w-5 h-5 text-primary" />
        <h1 className="font-semibold text-lg">Relatório de Uso IA</h1>
      </div>

      <div className="max-w-4xl mx-auto p-4 space-y-4">
        {/* Date filter buttons */}
        <div className="flex flex-wrap gap-2">
          {(['today', '7d', '30d', 'custom'] as DatePreset[]).map(preset => (
            <Button
              key={preset}
              variant={datePreset === preset ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDatePreset(preset)}
            >
              {preset === 'today' ? 'Hoje' : preset === '7d' ? '7 dias' : preset === '30d' ? '30 dias' : 'Personalizado'}
            </Button>
          ))}
        </div>

        {/* Custom date pickers */}
        {datePreset === 'custom' && (
          <div className="flex gap-2 flex-wrap">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("justify-start text-left font-normal", !customFrom && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {customFrom ? format(customFrom, 'dd/MM/yyyy') : 'Data início'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={customFrom} onSelect={setCustomFrom} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("justify-start text-left font-normal", !customTo && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {customTo ? format(customTo, 'dd/MM/yyyy') : 'Data fim'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={customTo} onSelect={setCustomTo} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>
        )}

        {/* User search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Filtrar por nome ou email do usuário..." value={userSearch} onChange={e => setUserSearch(e.target.value)} className="pl-9" />
        </div>

        {/* Summary card */}
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="py-4 px-4">
            <div className="flex items-center gap-2 mb-3">
              <DollarSign className="w-4 h-4 text-primary" />
              <p className="font-semibold text-sm">Resumo</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Custo USD</p>
                <p className="font-mono text-lg font-bold text-foreground">${totalCostUSD.toFixed(4)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Custo BRL</p>
                <p className="font-mono text-lg font-bold text-foreground">{totalCostBRL !== null ? `R$ ${totalCostBRL.toFixed(4)}` : '...'}</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-3 text-xs text-muted-foreground">
              <div>
                <p>Chamadas</p>
                <p className="font-mono font-medium text-foreground">{totalCalls}</p>
              </div>
              <div>
                <p>Tokens</p>
                <p className="font-mono font-medium text-foreground">{totalTokens.toLocaleString()}</p>
              </div>
              <div>
                <p>Créditos IA</p>
                <p className="font-mono font-medium text-foreground">⚡ {totalEnergy}</p>
              </div>
            </div>
            {usdToBrl && (
              <p className="text-[10px] text-muted-foreground mt-2">Câmbio: 1 USD = {usdToBrl.toFixed(2)} BRL</p>
            )}
          </CardContent>
        </Card>

        {/* Entries */}
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{filtered.length} registro(s)</p>
            {filtered.map(entry => {
              const costUSD = calcCostUSD(entry.model, Number(entry.prompt_tokens), Number(entry.completion_tokens), Number(entry.total_tokens));
              const costBRL = usdToBrl ? costUSD * usdToBrl : null;
              return (
                <Card key={entry.id}>
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="font-medium text-sm">{FEATURE_NAMES[entry.feature_key] || entry.feature_key}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {entry.user_name || entry.user_email || entry.user_id.slice(0, 8)} · {format(new Date(entry.created_at), 'dd/MM/yyyy HH:mm:ss')}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="secondary" className="text-xs font-mono">{entry.model}</Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-destructive"
                          onClick={() => deleteEntry(entry.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
                      <span>Prompt: {Number(entry.prompt_tokens).toLocaleString()}</span>
                      <span>Completion: {Number(entry.completion_tokens).toLocaleString()}</span>
                      {(() => { const thinking = Number(entry.total_tokens) - Number(entry.prompt_tokens) - Number(entry.completion_tokens); return thinking > 0 ? <span className="text-orange-500">Thinking: {thinking.toLocaleString()}</span> : null; })()}
                      <span>Total: {Number(entry.total_tokens).toLocaleString()}</span>
                      <span className="text-primary font-medium">⚡ {Number(entry.energy_cost)}</span>
                    </div>
                    <div className="flex gap-4 mt-1 text-xs">
                      <span className="font-mono text-primary font-medium">${costUSD.toFixed(4)}</span>
                      {costBRL !== null && <span className="font-mono text-primary font-medium">R$ {costBRL.toFixed(4)}</span>}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {filtered.length === 0 && <p className="text-center text-muted-foreground py-8">Nenhum registro encontrado.</p>}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminUsageReport;
