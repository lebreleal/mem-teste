import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import {
  fetchGlobalTokenUsage,
  fetchAICostByUser,
  fetchAICostBreakdown,
  deleteTokenUsageEntry,
  type UsageEntry,
} from '@/services/adminService';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  ArrowLeft, Loader2, Search, CalendarIcon, DollarSign, Zap, BarChart3,
  Trash2, Users, Cpu, Activity, RefreshCw,
} from 'lucide-react';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

const FEATURE_NAMES: Record<string, string> = {
  generate_deck: 'Gerar Deck',
  ai_tutor: 'Tutor IA',
  enhance_card: 'Aprimorar Card',
  enhance_import: 'Aprimorar Importação',
  ai_chat: 'Chat IA',
  detect_import_format: 'Detectar Formato',
  organize_import: 'Organizar Importação',
  detect_occlusion: 'Detectar Oclusão',
};

type DatePreset = 'today' | '7d' | '30d' | 'custom';

const usd = (v: number) => `$${v.toFixed(v < 1 ? 4 : 2)}`;
const compact = (v: number) => v.toLocaleString('pt-BR');

const AdminUsageReport = () => {
  const navigate = useNavigate();
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [userSearch, setUserSearch] = useState('');
  const [datePreset, setDatePreset] = useState<DatePreset>('7d');
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();
  const [usdToBrl, setUsdToBrl] = useState<number>(5.5);

  useEffect(() => {
    fetch('https://open.er-api.com/v6/latest/USD')
      .then(r => r.json())
      .then(data => { if (data?.rates?.BRL) setUsdToBrl(data.rates.BRL); })
      .catch(() => undefined);
  }, []);

  const range = useMemo(() => {
    const now = new Date();
    switch (datePreset) {
      case 'today': return { from: startOfDay(now).toISOString(), to: endOfDay(now).toISOString() };
      case '7d': return { from: subDays(now, 7).toISOString(), to: null };
      case '30d': return { from: subDays(now, 30).toISOString(), to: null };
      case 'custom': return {
        from: customFrom ? startOfDay(customFrom).toISOString() : null,
        to: customTo ? endOfDay(customTo).toISOString() : null,
      };
    }
  }, [datePreset, customFrom, customTo]);

  const key = [range.from, range.to];

  const byUserQ = useQuery({
    queryKey: ['admin-ai-cost-user', ...key],
    queryFn: () => fetchAICostByUser({ dateFrom: range.from, dateTo: range.to, limit: 100 }),
    enabled: isAdmin,
    staleTime: 60_000,
  });

  const breakdownQ = useQuery({
    queryKey: ['admin-ai-cost-breakdown', ...key],
    queryFn: () => fetchAICostBreakdown({ dateFrom: range.from, dateTo: range.to }),
    enabled: isAdmin,
    staleTime: 60_000,
  });

  const entriesQ = useQuery({
    queryKey: ['admin-ai-usage-entries', ...key],
    queryFn: () => fetchGlobalTokenUsage({ dateFrom: range.from, dateTo: range.to, limit: 300 }),
    enabled: isAdmin,
    staleTime: 60_000,
  });

  const users = byUserQ.data ?? [];
  const breakdown = breakdownQ.data ?? [];
  const entries = entriesQ.data ?? [];

  const totals = useMemo(() => {
    const cost = users.reduce((s, u) => s + Number(u.cost_usd), 0);
    const calls = users.reduce((s, u) => s + Number(u.calls), 0);
    const tokens = users.reduce((s, u) => s + Number(u.total_tokens), 0);
    const energy = users.reduce((s, u) => s + Number(u.energy_cost), 0);
    return { cost, calls, tokens, energy, avg: calls ? cost / calls : 0 };
  }, [users]);

  const filteredUsers = userSearch
    ? users.filter(u =>
        (u.user_name || '').toLowerCase().includes(userSearch.toLowerCase()) ||
        (u.user_email || '').toLowerCase().includes(userSearch.toLowerCase()))
    : users;

  const models = breakdown.filter(b => b.dimension === 'model');
  const features = breakdown.filter(b => b.dimension === 'feature');
  const days = breakdown.filter(b => b.dimension === 'day').slice().sort((a, b) => a.label.localeCompare(b.label));
  const maxDay = Math.max(1, ...days.map(d => Number(d.cost_usd)));

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-ai-cost-user'] });
    queryClient.invalidateQueries({ queryKey: ['admin-ai-cost-breakdown'] });
    queryClient.invalidateQueries({ queryKey: ['admin-ai-usage-entries'] });
  };

  const removeEntry = async (entry: UsageEntry) => {
    try {
      await deleteTokenUsageEntry(entry.id);
      refreshAll();
      toast({ title: 'Registro removido' });
    } catch {
      toast({ title: 'Erro', description: 'Falha ao deletar.', variant: 'destructive' });
    }
  };

  if (adminLoading) {
    return <div className="flex items-center justify-center min-h-screen"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }
  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-4">
        <p className="text-lg text-muted-foreground">Acesso restrito.</p>
        <Button variant="outline" onClick={() => navigate('/dashboard')}>Voltar</Button>
      </div>
    );
  }

  const loading = byUserQ.isLoading || breakdownQ.isLoading;

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin/ia')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <BarChart3 className="w-5 h-5 text-primary shrink-0" />
          <div className="min-w-0 flex-1">
            <h1 className="font-semibold text-base sm:text-lg leading-tight truncate">Custos de IA</h1>
            <p className="text-[11px] text-muted-foreground truncate">OpenRouter · custo real por chamada</p>
          </div>
          <Button variant="ghost" size="icon" onClick={refreshAll} aria-label="Atualizar">
            <RefreshCw className={cn('w-4 h-4', (byUserQ.isFetching || breakdownQ.isFetching) && 'animate-spin')} />
          </Button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto p-4 space-y-5">
        {/* Period */}
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

        {datePreset === 'custom' && (
          <div className="flex gap-2 flex-wrap">
            {([['Data início', customFrom, setCustomFrom], ['Data fim', customTo, setCustomTo]] as const).map(([label, value, setter]) => (
              <Popover key={label}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn('justify-start font-normal', !value && 'text-muted-foreground')}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {value ? format(value, 'dd/MM/yyyy') : label}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={value} onSelect={setter} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            ))}
          </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Custo total', value: loading ? null : usd(totals.cost), sub: `R$ ${(totals.cost * usdToBrl).toFixed(2)}`, icon: DollarSign },
            { label: 'Chamadas', value: loading ? null : compact(totals.calls), sub: `${usd(totals.avg)} / chamada`, icon: Activity },
            { label: 'Tokens', value: loading ? null : compact(totals.tokens), sub: `${users.length} usuário(s)`, icon: Cpu },
            { label: 'Créditos consumidos', value: loading ? null : `⚡ ${compact(totals.energy)}`, sub: 'energia dos usuários', icon: Zap },
          ].map(kpi => (
            <Card key={kpi.label}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-2">
                  <kpi.icon className="w-3.5 h-3.5" />
                  <span className="text-[11px] uppercase tracking-wide">{kpi.label}</span>
                </div>
                {kpi.value === null
                  ? <Skeleton className="h-7 w-24" />
                  : <p className="text-xl font-semibold font-mono tabular-nums">{kpi.value}</p>}
                <p className="text-[11px] text-muted-foreground mt-1 truncate">{kpi.sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Daily trend */}
        {days.length > 0 && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Custo por dia</CardTitle></CardHeader>
            <CardContent className="pt-0">
              <div className="flex items-end gap-1 h-28">
                {days.map(d => (
                  <div key={d.label} className="flex-1 flex flex-col justify-end items-center gap-1 group">
                    <div
                      className="w-full rounded-t bg-primary/70 group-hover:bg-primary transition-colors min-h-[2px]"
                      style={{ height: `${(Number(d.cost_usd) / maxDay) * 100}%` }}
                      title={`${d.label}: ${usd(Number(d.cost_usd))}`}
                    />
                    <span className="text-[9px] text-muted-foreground">{d.label.slice(8)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="users">
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger value="users" className="text-xs sm:text-sm"><Users className="w-3.5 h-3.5 mr-1.5" />Usuários</TabsTrigger>
            <TabsTrigger value="breakdown" className="text-xs sm:text-sm"><Cpu className="w-3.5 h-3.5 mr-1.5" />Modelos</TabsTrigger>
            <TabsTrigger value="log" className="text-xs sm:text-sm"><Activity className="w-3.5 h-3.5 mr-1.5" />Registros</TabsTrigger>
          </TabsList>

          {/* Users */}
          <TabsContent value="users" className="space-y-3 mt-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Buscar usuário..." value={userSearch} onChange={e => setUserSearch(e.target.value)} className="pl-9" />
            </div>
            {loading && <Skeleton className="h-20 w-full" />}
            {!loading && filteredUsers.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-8">Nenhum consumo no período.</p>
            )}
            {filteredUsers.map(u => {
              const share = totals.cost > 0 ? (Number(u.cost_usd) / totals.cost) * 100 : 0;
              return (
                <Card key={u.user_id}>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{u.user_name || 'Sem nome'}</p>
                        <p className="text-xs text-muted-foreground truncate">{u.user_email || u.user_id.slice(0, 8)}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-mono font-semibold text-sm">{usd(Number(u.cost_usd))}</p>
                        <p className="text-[11px] text-muted-foreground font-mono">R$ {(Number(u.cost_usd) * usdToBrl).toFixed(2)}</p>
                      </div>
                    </div>
                    <Progress value={share} className="h-1.5" />
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                      <span>{compact(Number(u.calls))} chamadas</span>
                      <span>{compact(Number(u.total_tokens))} tokens</span>
                      <span>⚡ {compact(Number(u.energy_cost))}</span>
                      <span>{share.toFixed(1)}% do total</span>
                      <span>Último: {format(new Date(u.last_used_at), 'dd/MM HH:mm')}</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>

          {/* Breakdown */}
          <TabsContent value="breakdown" className="space-y-4 mt-4">
            {[{ title: 'Por modelo', rows: models }, { title: 'Por recurso', rows: features }].map(section => (
              <Card key={section.title}>
                <CardHeader className="pb-2"><CardTitle className="text-sm">{section.title}</CardTitle></CardHeader>
                <CardContent className="pt-0 space-y-3">
                  {section.rows.length === 0 && <p className="text-xs text-muted-foreground">Sem dados.</p>}
                  {section.rows.map(r => {
                    const share = totals.cost > 0 ? (Number(r.cost_usd) / totals.cost) * 100 : 0;
                    return (
                      <div key={r.label} className="space-y-1">
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="truncate font-medium">{FEATURE_NAMES[r.label] || r.label}</span>
                          <span className="font-mono shrink-0">{usd(Number(r.cost_usd))}</span>
                        </div>
                        <Progress value={share} className="h-1.5" />
                        <p className="text-[11px] text-muted-foreground">
                          {compact(Number(r.calls))} chamadas · {compact(Number(r.total_tokens))} tokens · {share.toFixed(1)}%
                        </p>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          {/* Raw log */}
          <TabsContent value="log" className="space-y-2 mt-4">
            {entriesQ.isLoading && <Skeleton className="h-16 w-full" />}
            {!entriesQ.isLoading && entries.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-8">Nenhum registro.</p>
            )}
            {entries.map(entry => (
              <Card key={entry.id}>
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{FEATURE_NAMES[entry.feature_key] || entry.feature_key}</p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {entry.user_name || entry.user_email || entry.user_id.slice(0, 8)} · {format(new Date(entry.created_at), 'dd/MM/yyyy HH:mm:ss')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono text-sm font-semibold">{usd(Number(entry.cost_usd))}</span>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeEntry(entry)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[11px] text-muted-foreground">
                    <Badge variant="secondary" className="text-[10px] font-mono">{entry.model}</Badge>
                    <span>in {compact(Number(entry.prompt_tokens))}</span>
                    <span>out {compact(Number(entry.completion_tokens))}</span>
                    <span>total {compact(Number(entry.total_tokens))}</span>
                    <span className="text-primary">⚡ {Number(entry.energy_cost)}</span>
                    <span className="font-mono">R$ {(Number(entry.cost_usd) * usdToBrl).toFixed(4)}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        </Tabs>

        <p className="text-[10px] text-center text-muted-foreground">Câmbio: 1 USD = R$ {usdToBrl.toFixed(2)}</p>
      </div>
    </div>
  );
};

export default AdminUsageReport;
