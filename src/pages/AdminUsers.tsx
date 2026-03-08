import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useAuth } from '@/hooks/useAuth';
import { useAdminUsers, type AdminProfile, type UserDeck, type TokenUsageSummary, type TokenUsageEntry, type StudyDay, type PremiumGiftPlan } from '@/hooks/useAdminUsers';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Loader2, Search, User, BookOpen, Zap, Calendar, Ban, Save, ChevronRight, DollarSign, LogIn, Trash2, RefreshCw, Crown, Gift } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

// Feature key → friendly name
const FEATURE_NAMES: Record<string, string> = {
  generate_deck: 'Gerar Deck', ai_tutor: 'Tutor IA', grade_exam: 'Corrigir Prova',
  enhance_card: 'Aprimorar Card', enhance_import: 'Aprimorar Importação', ai_chat: 'Chat IA',
  generate_onboarding: 'Onboarding IA', auto_tag: 'Auto-Tag', suggest_tags: 'Sugerir Tags',
  detect_import_format: 'Detectar Formato', organize_import: 'Organizar Importação', tts: 'Text-to-Speech',
};

const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gemini-2.5-pro': { input: 1.25, output: 10.00 },
  'gemini-2.5-flash': { input: 0.30, output: 2.50 },
  'gemini-2.5-flash-lite': { input: 0.10, output: 0.40 },
  'gemini-2.0-flash': { input: 0.10, output: 0.40 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-4o': { input: 2.50, output: 10.00 },
  'gpt-3.5-turbo': { input: 0.50, output: 1.50 },
  'tts-1': { input: 15.00, output: 0 },
  'google-neural2': { input: 4.00, output: 0 },
};

const calcCostUSD = (model: string, promptTokens: number, completionTokens: number, totalTokens: number): number => {
  const pricing = MODEL_PRICING[model] ?? MODEL_PRICING['gpt-4o-mini'];
  const realOutputTokens = Math.max(totalTokens - promptTokens, completionTokens);
  return (promptTokens / 1_000_000) * pricing.input + (realOutputTokens / 1_000_000) * pricing.output;
};

const PLAN_LABELS: Record<PremiumGiftPlan, string> = {
  monthly: '1 Mês',
  annual: '1 Ano',
  lifetime: 'Vitalício',
};

const AdminUsers = () => {
  const navigate = useNavigate();
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const { session } = useAuth();
  const { users, loading, search, setSearch, updateProfile, grantPremium, getUserDecks, getUserTokenUsage, getUserTokenUsageDetailed, getUserStudyHistory, deleteTokenUsageEntry } = useAdminUsers();
  const { toast } = useToast();
  
  const [selectedUser, setSelectedUser] = useState<AdminProfile | null>(null);
  const [editState, setEditState] = useState<Partial<AdminProfile>>({});
  const [decks, setDecks] = useState<UserDeck[]>([]);
  const [tokenUsage, setTokenUsage] = useState<TokenUsageSummary[]>([]);
  const [tokenUsageDetailed, setTokenUsageDetailed] = useState<TokenUsageEntry[]>([]);
  const [studyHistory, setStudyHistory] = useState<StudyDay[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [usdToBrl, setUsdToBrl] = useState<number | null>(null);
  const [impersonating, setImpersonating] = useState(false);
  const [refreshingAI, setRefreshingAI] = useState(false);
  const [giftPlan, setGiftPlan] = useState<PremiumGiftPlan>('monthly');
  const [grantingPremium, setGrantingPremium] = useState(false);

  const handleImpersonate = async (user: AdminProfile) => {
    if (!session) return;
    setImpersonating(true);
    try {
      sessionStorage.setItem('admin_session', JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      }));
      sessionStorage.setItem('impersonated_name', user.name || user.email);
      const { data, error } = await supabase.functions.invoke('admin-impersonate', {
        body: { target_user_id: user.id },
      });
      if (error || !data?.token) {
        sessionStorage.removeItem('admin_session');
        sessionStorage.removeItem('impersonated_name');
        toast({ title: 'Erro', description: 'Falha ao impersonar usuário.', variant: 'destructive' });
        setImpersonating(false);
        return;
      }
      const { error: otpError } = await supabase.auth.verifyOtp({ token_hash: data.token, type: 'magiclink' });
      if (otpError) {
        sessionStorage.removeItem('admin_session');
        sessionStorage.removeItem('impersonated_name');
        toast({ title: 'Erro', description: 'Falha na autenticação.', variant: 'destructive' });
        setImpersonating(false);
        return;
      }
      navigate('/dashboard');
    } catch {
      sessionStorage.removeItem('admin_session');
      sessionStorage.removeItem('impersonated_name');
      toast({ title: 'Erro', description: 'Erro inesperado.', variant: 'destructive' });
      setImpersonating(false);
    }
  };

  useEffect(() => {
    fetch('https://open.er-api.com/v6/latest/USD')
      .then(r => r.json())
      .then(data => { if (data?.rates?.BRL) setUsdToBrl(data.rates.BRL); })
      .catch(() => setUsdToBrl(5.50));
  }, []);

  const openUser = async (user: AdminProfile) => {
    setSelectedUser(user);
    setEditState({ name: user.name, energy: user.energy, memocoins: user.memocoins, is_banned: user.is_banned });
    setLoadingDetail(true);
    const [d, t, td, s] = await Promise.all([getUserDecks(user.id), getUserTokenUsage(user.id), getUserTokenUsageDetailed(user.id), getUserStudyHistory(user.id)]);
    setDecks(d); setTokenUsage(t); setTokenUsageDetailed(td); setStudyHistory(s);
    setLoadingDetail(false);
  };

  const handleSave = async () => {
    if (!selectedUser) return;
    setSaving(true);
    const ok = await updateProfile(selectedUser.id, {
      name: editState.name, energy: editState.energy,
      memocoins: editState.memocoins, is_banned: editState.is_banned,
    });
    if (ok) setSelectedUser(prev => prev ? { ...prev, ...editState } : null);
    setSaving(false);
  };

  const handleGrantPremium = async () => {
    if (!selectedUser) return;
    setGrantingPremium(true);
    const ok = await grantPremium(selectedUser.id, giftPlan);
    if (ok) {
      // Refresh user data
      const { data } = await supabase.from('profiles').select('premium_expires_at').eq('id', selectedUser.id).single();
      setSelectedUser(prev => prev ? { ...prev, premium_expires_at: (data as any)?.premium_expires_at ?? null } : null);
    }
    setGrantingPremium(false);
  };

  const totalCostUSD = tokenUsage.reduce((sum, t) => sum + calcCostUSD(t.model, Number(t.total_prompt_tokens), Number(t.total_completion_tokens), Number(t.total_tokens_sum)), 0);
  const totalCostBRL = usdToBrl ? totalCostUSD * usdToBrl : null;

  // Premium status helpers
  const userPremiumExpires = selectedUser?.premium_expires_at;
  const isUserPremium = !!userPremiumExpires && new Date(userPremiumExpires) > new Date();
  const isLifetime = !!userPremiumExpires && new Date(userPremiumExpires).getFullYear() > 2090;

  if (adminLoading) return <div className="flex items-center justify-center min-h-screen"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  if (!isAdmin) return <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-4"><p className="text-lg text-muted-foreground">Acesso restrito.</p><Button variant="outline" onClick={() => navigate('/dashboard')}>Voltar</Button></div>;

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => selectedUser ? setSelectedUser(null) : navigate('/admin/ia')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <User className="w-5 h-5 text-primary" />
        <h1 className="font-semibold text-lg">{selectedUser ? selectedUser.name || selectedUser.email : 'Gerenciar Usuários'}</h1>
      </div>

      <div className="max-w-3xl mx-auto p-4 space-y-4">
        {!selectedUser ? (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Buscar por nome ou email..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
            </div>
            {loading ? <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div> : (
              <div className="space-y-2">
                {users.map(u => (
                  <Card key={u.id} className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => openUser(u)}>
                    <CardContent className="flex items-center justify-between py-3 px-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium truncate">{u.name || 'Sem nome'}</p>
                          {u.is_banned && <Badge variant="destructive" className="text-xs">Banido</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                        <span>⚡ {u.energy}</span>
                        <span>🪙 {Number(u.memocoins).toFixed(0)}</span>
                        <ChevronRight className="w-4 h-4" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {users.length === 0 && <p className="text-center text-muted-foreground py-8">Nenhum usuário encontrado.</p>}
              </div>
            )}
          </>
        ) : (
          <Tabs defaultValue="profile" className="space-y-4">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="profile" className="text-xs"><User className="w-3 h-3 mr-1" />Perfil</TabsTrigger>
              <TabsTrigger value="decks" className="text-xs"><BookOpen className="w-3 h-3 mr-1" />Decks</TabsTrigger>
              <TabsTrigger value="ai" className="text-xs"><Zap className="w-3 h-3 mr-1" />IA</TabsTrigger>
              <TabsTrigger value="history" className="text-xs"><Calendar className="w-3 h-3 mr-1" />Estudo</TabsTrigger>
            </TabsList>

            <TabsContent value="profile" className="space-y-4">
              <Card>
                <CardHeader><CardTitle className="text-base">Editar Perfil</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input value={selectedUser.email} disabled className="bg-muted" />
                  </div>
                  <div className="space-y-2">
                    <Label>Nome</Label>
                    <Input value={editState.name || ''} onChange={e => setEditState(s => ({ ...s, name: e.target.value }))} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Energia (Créditos IA)</Label>
                      <Input type="number" value={editState.energy ?? 0} onChange={e => setEditState(s => ({ ...s, energy: parseInt(e.target.value) || 0 }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>MemoCoins</Label>
                      <Input type="number" value={editState.memocoins ?? 0} onChange={e => setEditState(s => ({ ...s, memocoins: parseFloat(e.target.value) || 0 }))} />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Ban className="w-4 h-4 text-destructive" />
                      <Label>Banir usuário</Label>
                    </div>
                    <Switch checked={editState.is_banned ?? false} onCheckedChange={v => setEditState(s => ({ ...s, is_banned: v }))} />
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>Tier criador: {selectedUser.creator_tier} · Cards totais estudados: {selectedUser.successful_cards_counter}</p>
                    <p>Criado em: {format(new Date(selectedUser.created_at), 'dd/MM/yyyy HH:mm')}</p>
                  </div>
                  <Button onClick={handleSave} disabled={saving} className="w-full">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                    Salvar Alterações
                  </Button>
                  <Button variant="outline" onClick={() => handleImpersonate(selectedUser)} disabled={impersonating} className="w-full gap-2">
                    {impersonating ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
                    {impersonating ? 'Entrando...' : 'Entrar como este usuário'}
                  </Button>
                </CardContent>
              </Card>

              {/* Grant Premium Card */}
              <Card className="border-warning/30">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Crown className="w-4 h-4 text-warning" />
                    Presentear Premium
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {isUserPremium ? (
                    <div className="flex items-center gap-2 rounded-lg bg-warning/10 px-3 py-2">
                      <Crown className="w-4 h-4 text-warning" fill="hsl(var(--warning))" />
                      <div className="text-sm">
                        <p className="font-medium text-foreground">
                          {isLifetime ? 'Premium Vitalício ativo' : 'Premium ativo'}
                        </p>
                        {!isLifetime && (
                          <p className="text-xs text-muted-foreground">
                            Expira em {format(new Date(userPremiumExpires!), 'dd/MM/yyyy HH:mm')}
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Este usuário não tem premium ativo.</p>
                  )}

                  <div className="flex items-end gap-3">
                    <div className="flex-1 space-y-1.5">
                      <Label className="text-xs">Plano</Label>
                      <Select value={giftPlan} onValueChange={v => setGiftPlan(v as PremiumGiftPlan)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="monthly">🎁 1 Mês</SelectItem>
                          <SelectItem value="annual">🎁 1 Ano</SelectItem>
                          <SelectItem value="lifetime">🎁 Vitalício</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      onClick={handleGrantPremium}
                      disabled={grantingPremium}
                      className="gap-2"
                      variant="default"
                    >
                      {grantingPremium ? <Loader2 className="w-4 h-4 animate-spin" /> : <Gift className="w-4 h-4" />}
                      Presentear
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    O usuário verá a mensagem "Presenteado pelo administrador" e terá acesso premium imediato.
                  </p>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="decks" className="space-y-2">
              {loadingDetail ? <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div> : (
                <>
                  <p className="text-sm text-muted-foreground">{decks.length} deck(s) encontrado(s)</p>
                  {decks.map(d => (
                    <Card key={d.id}>
                      <CardContent className="flex items-center justify-between py-3 px-4">
                        <div>
                          <p className="font-medium">{d.name}</p>
                          <p className="text-xs text-muted-foreground">{d.card_count} cards · {format(new Date(d.created_at), 'dd/MM/yyyy')}</p>
                        </div>
                        {d.is_archived && <Badge variant="secondary">Arquivado</Badge>}
                      </CardContent>
                    </Card>
                  ))}
                  {decks.length === 0 && <p className="text-center text-muted-foreground py-8">Nenhum deck.</p>}
                </>
              )}
            </TabsContent>

            <TabsContent value="ai" className="space-y-3">
              {loadingDetail ? <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div> : (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">Consumo de tokens (últimos 30 dias)</p>
                    <Button variant="outline" size="sm" disabled={refreshingAI} onClick={async () => {
                      if (!selectedUser) return;
                      setRefreshingAI(true);
                      const [t, td] = await Promise.all([getUserTokenUsage(selectedUser.id), getUserTokenUsageDetailed(selectedUser.id)]);
                      setTokenUsage(t); setTokenUsageDetailed(td);
                      setRefreshingAI(false);
                    }}>
                      <RefreshCw className={`w-4 h-4 mr-1 ${refreshingAI ? 'animate-spin' : ''}`} />
                      Atualizar
                    </Button>
                  </div>
                  {tokenUsage.length > 0 && (
                    <Card className="border-primary/30 bg-primary/5">
                      <CardContent className="py-4 px-4">
                        <div className="flex items-center gap-2 mb-3">
                          <DollarSign className="w-4 h-4 text-primary" />
                          <p className="font-semibold text-sm">Custo Real Total</p>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-xs text-muted-foreground">Dólar (USD)</p>
                            <p className="font-mono text-lg font-bold text-foreground">${totalCostUSD.toFixed(4)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Real (BRL)</p>
                            <p className="font-mono text-lg font-bold text-foreground">{totalCostBRL !== null ? `R$ ${totalCostBRL.toFixed(4)}` : '...'}</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2 mt-3 text-xs text-muted-foreground">
                          <div><p>Total chamadas</p><p className="font-mono font-medium text-foreground">{tokenUsage.reduce((s, t) => s + Number(t.total_calls), 0)}</p></div>
                          <div><p>Total tokens</p><p className="font-mono font-medium text-foreground">{tokenUsage.reduce((s, t) => s + Number(t.total_tokens_sum), 0).toLocaleString()}</p></div>
                          <div><p>Créditos IA</p><p className="font-mono font-medium text-foreground">⚡ {tokenUsage.reduce((s, t) => s + Number(t.total_energy_cost), 0)}</p></div>
                        </div>
                        {usdToBrl && <p className="text-[10px] text-muted-foreground mt-2">Câmbio: 1 USD = {usdToBrl.toFixed(2)} BRL (tempo real)</p>}
                      </CardContent>
                    </Card>
                  )}
                  <h3 className="font-semibold text-sm text-muted-foreground pt-2">Histórico Detalhado</h3>
                  {tokenUsageDetailed.map((entry) => {
                    const costUSD = calcCostUSD(entry.model, Number(entry.prompt_tokens), Number(entry.completion_tokens), Number(entry.total_tokens));
                    const costBRL = usdToBrl ? costUSD * usdToBrl : null;
                    return (
                      <Card key={entry.id}>
                        <CardContent className="py-3 px-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium text-sm">{FEATURE_NAMES[entry.feature_key] || entry.feature_key}</p>
                              <p className="text-xs text-muted-foreground">{format(new Date(entry.created_at), 'dd/MM/yyyy HH:mm:ss')}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-xs font-mono">{entry.model}</Badge>
                              <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={async () => {
                                const ok = await deleteTokenUsageEntry(entry.id);
                                if (ok) setTokenUsageDetailed(prev => prev.filter(e => e.id !== entry.id));
                              }}>
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
                  {tokenUsageDetailed.length === 0 && tokenUsage.length === 0 && (
                    <p className="text-center text-muted-foreground py-8">Nenhum consumo registrado.</p>
                  )}
                </>
              )}
            </TabsContent>

            <TabsContent value="history" className="space-y-2">
              {loadingDetail ? <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div> : (
                <>
                  <p className="text-sm text-muted-foreground">Histórico de estudo (90 dias)</p>
                  <div className="grid grid-cols-7 gap-1">
                    {studyHistory.map(d => {
                      const intensity = Math.min(d.cards_reviewed / 30, 1);
                      return (
                        <div key={d.study_date} className="aspect-square rounded-sm border"
                          style={{ backgroundColor: `hsl(var(--primary) / ${0.1 + intensity * 0.8})` }}
                          title={`${d.study_date}: ${d.cards_reviewed} cards, rating ${d.avg_rating}`}
                        />
                      );
                    })}
                  </div>
                  <div className="space-y-1 mt-4">
                    {studyHistory.slice(0, 14).map(d => (
                      <div key={d.study_date} className="flex items-center justify-between text-sm">
                        <span>{format(new Date(d.study_date + 'T12:00:00'), 'dd/MM/yyyy')}</span>
                        <span className="font-mono">{d.cards_reviewed} cards · avg {Number(d.avg_rating).toFixed(1)}</span>
                      </div>
                    ))}
                  </div>
                  {studyHistory.length === 0 && <p className="text-center text-muted-foreground py-8">Nenhum estudo registrado.</p>}
                </>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
};

export default AdminUsers;
