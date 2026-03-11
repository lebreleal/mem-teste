import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useAIPrompts, type AIPrompt } from '@/hooks/useAIPrompts';
import { useAISettings } from '@/hooks/useAISettings';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Save, Loader2, Bot, ChevronRight, RotateCcw, Users, Settings, Volume2, Play, BarChart3, Tag } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const PLACEHOLDER_MAP: Record<string, string[]> = {
  generate_deck: ['{{cardCount}}', '{{detailInstruction}}', '{{customInstructions}}', '{{formatInstructions}}', '{{material}}'],
  enhance_card: ['{{cardType}}', '{{front}}', '{{back}}'],
  enhance_import: ['{{cardCount}}', '{{cardsText}}'],
  grade_exam: ['{{questionText}}', '{{correctAnswer}}', '{{userAnswer}}'],
  ai_tutor: ['{{front}}', '{{backHint}}'],
  generate_onboarding: ['{{course}}', '{{semester}}'],
};

const PT_VOICES = [
  { value: 'pt-BR-Neural2-A', label: 'Neural2-A (Feminina)' },
  { value: 'pt-BR-Neural2-B', label: 'Neural2-B (Masculina)' },
  { value: 'pt-BR-Neural2-C', label: 'Neural2-C (Feminina)' },
];

const EN_VOICES = [
  { value: 'en-US-Neural2-A', label: 'Neural2-A (Masculina)' },
  { value: 'en-US-Neural2-C', label: 'Neural2-C (Feminina)' },
  { value: 'en-US-Neural2-D', label: 'Neural2-D (Masculina)' },
  { value: 'en-US-Neural2-E', label: 'Neural2-E (Feminina)' },
  { value: 'en-US-Neural2-F', label: 'Neural2-F (Feminina)' },
  { value: 'en-US-Neural2-G', label: 'Neural2-G (Feminina)' },
  { value: 'en-US-Neural2-H', label: 'Neural2-H (Feminina)' },
  { value: 'en-US-Neural2-I', label: 'Neural2-I (Masculina)' },
  { value: 'en-US-Neural2-J', label: 'Neural2-J (Masculina)' },
];

const AdminIA = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const { prompts, loading, updatePrompt } = useAIPrompts();
  const { getSetting, updateSetting, loading: settingsLoading } = useAISettings();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [editState, setEditState] = useState<Partial<AIPrompt>>({});
  const [saving, setSaving] = useState(false);
  const [flashModel, setFlashModel] = useState('');
  const [proModel, setProModel] = useState('');
  const [showModelConfig, setShowModelConfig] = useState(false);
  const [showVoiceConfig, setShowVoiceConfig] = useState(false);
  const [savingModels, setSavingModels] = useState(false);
  const [ptVoice, setPtVoice] = useState('');
  const [enVoice, setEnVoice] = useState('');
  const [savingVoices, setSavingVoices] = useState(false);
  const [testingVoice, setTestingVoice] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  if (adminLoading || loading || settingsLoading) {
    return <div className="flex items-center justify-center min-h-screen"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  if (!isAdmin) {
    return <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-4"><p className="text-lg text-muted-foreground">Acesso restrito a administradores.</p><Button variant="outline" onClick={() => navigate('/dashboard')}>Voltar</Button></div>;
  }

  const selected = prompts.find(p => p.feature_key === selectedKey);

  const openEditor = (prompt: AIPrompt) => {
    setSelectedKey(prompt.feature_key);
    setEditState({ system_prompt: prompt.system_prompt, user_prompt_template: prompt.user_prompt_template, default_model: prompt.default_model, temperature: prompt.temperature });
  };

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    await updatePrompt(selected.id, editState);
    setSaving(false);
  };

  const handleRestore = () => {
    if (!selected) return;
    setEditState({ system_prompt: selected.system_prompt, user_prompt_template: selected.user_prompt_template, default_model: selected.default_model, temperature: selected.temperature });
  };

  const openModelConfig = () => {
    setFlashModel(getSetting('flash_model') || 'gemini-2.5-flash');
    setProModel(getSetting('pro_model') || 'gemini-2.5-pro');
    setShowModelConfig(true);
    setSelectedKey(null);
    setShowVoiceConfig(false);
  };

  const openVoiceConfig = () => {
    setPtVoice(getSetting('tts_voice_pt') || 'pt-BR-Neural2-A');
    setEnVoice(getSetting('tts_voice_en') || 'en-US-Neural2-J');
    setShowVoiceConfig(true);
    setSelectedKey(null);
    setShowModelConfig(false);
  };

  const handleSaveModels = async () => {
    setSavingModels(true);
    await Promise.all([updateSetting('flash_model', flashModel), updateSetting('pro_model', proModel)]);
    setSavingModels(false);
    setShowModelConfig(false);
  };

  const handleSaveVoices = async () => {
    setSavingVoices(true);
    await Promise.all([updateSetting('tts_voice_pt', ptVoice), updateSetting('tts_voice_en', enVoice)]);
    setSavingVoices(false);
    setShowVoiceConfig(false);
  };

  const testVoice = async (voiceName: string, lang: 'pt' | 'en') => {
    setTestingVoice(voiceName);
    try {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }

      // Create Audio element immediately in user gesture context
      const audio = new Audio();
      audioRef.current = audio;

      const sampleText = lang === 'pt'
        ? 'Olá! Esta é uma prévia da voz selecionada para o português brasileiro.'
        : 'Hello! This is a preview of the selected voice for American English.';

      // Use fetch directly for binary audio response (supabase.functions.invoke doesn't handle binary well)
      const { data: { session } } = await supabase.auth.getSession();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${supabaseUrl}/functions/v1/tts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}`,
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ text: sampleText, voice: voiceName }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || `HTTP ${res.status}`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      audio.src = url;
      audio.onended = () => { URL.revokeObjectURL(url); setTestingVoice(null); };
      audio.onerror = () => { URL.revokeObjectURL(url); setTestingVoice(null); };
      await audio.play();
    } catch (e) {
      console.error('TTS test error:', e);
      toast({ title: 'Erro ao testar voz', description: String(e), variant: 'destructive' });
      setTestingVoice(null);
    }
  };

  const goBack = () => {
    if (selectedKey) setSelectedKey(null);
    else if (showModelConfig) setShowModelConfig(false);
    else if (showVoiceConfig) setShowVoiceConfig(false);
    else navigate('/profile');
  };

  const currentTitle = selectedKey
    ? (selected?.label || 'Editor')
    : showModelConfig
      ? 'Configurar Modelos'
      : showVoiceConfig
        ? 'Configurar Voz'
        : 'Admin IA';

  const showMainMenu = !selectedKey && !showModelConfig && !showVoiceConfig;

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={goBack}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <Bot className="w-5 h-5 text-primary" />
        <h1 className="font-semibold text-lg">{currentTitle}</h1>
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-4">
        {showMainMenu ? (
          <>
            <p className="text-sm text-muted-foreground">Gerencie IA, prompts, modelos e usuários.</p>

            <Card className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => navigate('/admin/users')}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex items-center gap-3">
                  <Users className="w-5 h-5 text-primary" />
                  <div>
                    <p className="font-medium">Gerenciar Usuários</p>
                    <p className="text-xs text-muted-foreground">Perfis, decks, consumo IA, histórico de estudo</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </CardContent>
            </Card>

            <Card className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => navigate('/admin/usage')}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex items-center gap-3">
                  <BarChart3 className="w-5 h-5 text-primary" />
                  <div>
                    <p className="font-medium">Relatório de Uso IA</p>
                    <p className="text-xs text-muted-foreground">Consumo global, filtros por data e usuário</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </CardContent>
            </Card>

            <Card className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={openModelConfig}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex items-center gap-3">
                  <Settings className="w-5 h-5 text-primary" />
                  <div>
                    <p className="font-medium">Configurar Modelos</p>
                    <p className="text-xs text-muted-foreground">Qual modelo do Gemini é Flash e qual é Pro</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </CardContent>
            </Card>

            <Card className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={openVoiceConfig}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex items-center gap-3">
                  <Volume2 className="w-5 h-5 text-primary" />
                  <div>
                    <p className="font-medium">Configurar Voz</p>
                    <p className="text-xs text-muted-foreground">Escolha e teste as vozes do Text-to-Speech</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </CardContent>
            </Card>

            <h2 className="font-semibold text-sm text-muted-foreground pt-2">Prompts por Funcionalidade</h2>
            {prompts.map(p => (
              <Card key={p.id} className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => openEditor(p)}>
                <CardContent className="flex items-center justify-between py-4">
                  <div>
                    <p className="font-medium">{p.label}</p>
                    <p className="text-xs text-muted-foreground">{p.feature_key} · Modelo: {p.default_model} · Temp: {p.temperature}</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground" />
                </CardContent>
              </Card>
            ))}
          </>
        ) : showVoiceConfig ? (
          <div className="space-y-6">
            <p className="text-sm text-muted-foreground">Escolha as vozes Neural2 do Google Cloud TTS. Todas têm o mesmo custo.</p>

            <div className="space-y-3">
              <Label>Voz Português (PT-BR)</Label>
              <div className="flex gap-2">
                <Select value={ptVoice} onValueChange={setPtVoice}>
                  <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PT_VOICES.map(v => (
                      <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => testVoice(ptVoice, 'pt')}
                  disabled={testingVoice === ptVoice}
                >
                  {testingVoice === ptVoice ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              <Label>Voz Inglês (EN-US)</Label>
              <div className="flex gap-2">
                <Select value={enVoice} onValueChange={setEnVoice}>
                  <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EN_VOICES.map(v => (
                      <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => testVoice(enVoice, 'en')}
                  disabled={testingVoice === enVoice}
                >
                  {testingVoice === enVoice ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                </Button>
              </div>
            </div>

            <Button onClick={handleSaveVoices} disabled={savingVoices} className="w-full">
              {savingVoices ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              Salvar Vozes
            </Button>
          </div>
        ) : showModelConfig ? (
          <div className="space-y-6">
            <p className="text-sm text-muted-foreground">Configure qual modelo do Gemini é usado para cada tier. Você pode colocar qualquer model ID válido do Google AI.</p>

            <div className="space-y-2">
              <Label>Modelo Flash (rápido e barato)</Label>
              <Input value={flashModel} onChange={e => setFlashModel(e.target.value)} placeholder="gemini-2.5-flash" className="font-mono" />
              <p className="text-xs text-muted-foreground">Ex: gemini-2.5-flash, gemini-2.5-flash-lite</p>
            </div>

            <div className="space-y-2">
              <Label>Modelo Pro (avançado)</Label>
              <Input value={proModel} onChange={e => setProModel(e.target.value)} placeholder="gemini-2.5-pro" className="font-mono" />
              <p className="text-xs text-muted-foreground">Ex: gemini-2.5-pro, gemini-2.5-flash</p>
            </div>

            <Button onClick={handleSaveModels} disabled={savingModels} className="w-full">
              {savingModels ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              Salvar Modelos
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-wrap gap-1.5">
              {(PLACEHOLDER_MAP[selectedKey!] || []).map(ph => (
                <Badge key={ph} variant="secondary" className="text-xs font-mono">{ph}</Badge>
              ))}
            </div>

            <div className="space-y-2">
              <Label>System Prompt</Label>
              <Textarea value={editState.system_prompt || ''} onChange={e => setEditState(s => ({ ...s, system_prompt: e.target.value }))} rows={6} className="font-mono text-sm" placeholder="Prompt de sistema..." />
            </div>

            <div className="space-y-2">
              <Label>Template do Prompt do Usuário</Label>
              <Textarea value={editState.user_prompt_template || ''} onChange={e => setEditState(s => ({ ...s, user_prompt_template: e.target.value }))} rows={12} className="font-mono text-sm" placeholder="Template com placeholders..." />
            </div>

            <div className="space-y-2">
              <Label>Modelo Padrão (fallback)</Label>
              <Select value={editState.default_model || 'flash'} onValueChange={v => setEditState(s => ({ ...s, default_model: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="flash">Flash ({getSetting('flash_model') || 'gemini-2.5-flash'})</SelectItem>
                  <SelectItem value="pro">Pro ({getSetting('pro_model') || 'gemini-2.5-pro'})</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">O usuário escolhe Flash ou Pro ao solicitar. Este é apenas o fallback caso não especifique.</p>
            </div>

            <div className="space-y-2">
              <Label>Temperatura: {editState.temperature?.toFixed(1)}</Label>
              <Slider value={[editState.temperature ?? 0.7]} onValueChange={([v]) => setEditState(s => ({ ...s, temperature: v }))} min={0} max={1} step={0.1} />
              <p className="text-xs text-muted-foreground">0 = preciso e determinístico · 1 = criativo e variável</p>
            </div>

            <div className="flex gap-3">
              <Button onClick={handleSave} disabled={saving} className="flex-1">
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                Salvar
              </Button>
              <Button variant="outline" onClick={handleRestore}>
                <RotateCcw className="w-4 h-4 mr-2" />
                Restaurar
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminIA;
