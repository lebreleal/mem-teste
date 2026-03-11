import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Copy, Settings, Lock, Globe, ImageIcon, Loader2, Trash2, Crown, CreditCard, Users, Brain, Info, Share2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const DESC_MAX = 2000;

interface CommunitySettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  turma: { id: string; name: string; description: string; invite_code: string; is_private?: boolean; cover_image_url?: string; subscription_price?: number; share_slug?: string };
  onSave: (data: { name: string; description: string; isPrivate: boolean; coverImageUrl?: string; subscriptionPrice?: number }) => void;
  isSaving: boolean;
  members?: { user_id: string; user_name: string; role: string; is_subscriber: boolean }[];
}

const CommunitySettingsDialog = ({ open, onOpenChange, turma, onSave, isSaving, members = [] }: CommunitySettingsDialogProps) => {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [coverUrl, setCoverUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [subscriptionPrice, setSubscriptionPrice] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName(turma.name);
      setDescription(turma.description || '');
      setIsPrivate(turma.is_private ?? false);
      setCoverUrl(turma.cover_image_url || '');
      setSubscriptionPrice(turma.subscription_price ? String(turma.subscription_price) : '');
    }
  }, [open, turma]);

  // Fetch subscription history
  const { data: subscriptions = [] } = useQuery({
    queryKey: ['turma-subscriptions', turma.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('turma_subscriptions' as any)
        .select('*')
        .eq('turma_id', turma.id)
        .order('created_at', { ascending: false });
      return (data ?? []) as any[];
    },
    enabled: open && !!turma.id,
  });

  // Get subscriber names
  const subUserIds = [...new Set(subscriptions.map((s: any) => s.user_id))];
  const { data: subProfiles = [] } = useQuery({
    queryKey: ['sub-profiles', ...subUserIds],
    queryFn: async () => {
      if (subUserIds.length === 0) return [];
      const { data } = await supabase.rpc('get_public_profiles', { p_user_ids: subUserIds });
      return (data ?? []) as { id: string; name: string }[];
    },
    enabled: subUserIds.length > 0 && open,
  });
  const profileMap = new Map(subProfiles.map(p => [p.id, p.name || 'Anônimo']));

  const totalCreditsEarned = subscriptions.reduce((sum: number, s: any) => sum + (s.amount || 0), 0);

  const handleUploadCover = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: 'Arquivo muito grande', description: 'Máximo 2MB', variant: 'destructive' });
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `${turma.id}/cover.${ext}`;
      const { error: uploadError } = await supabase.storage.from('community-covers').upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('community-covers').getPublicUrl(path);
      setCoverUrl(urlData.publicUrl + '?t=' + Date.now());
      toast({ title: 'Imagem enviada!' });
    } catch {
      toast({ title: 'Erro ao enviar imagem', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const removeCover = () => setCoverUrl('');
  const subscribers = members.filter(m => m.is_subscriber);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-4 w-4" /> Configurações
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="general" className="w-full">
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger value="general" className="text-xs">Geral</TabsTrigger>
            <TabsTrigger value="subscription" className="text-xs gap-1">
              <CreditCard className="h-3 w-3" /> Assinatura
            </TabsTrigger>
            <TabsTrigger value="subscribers" className="text-xs gap-1">
              <Crown className="h-3 w-3" /> Assinantes
            </TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-4 max-h-[60vh] overflow-y-auto pr-1 mt-4">
            {/* Cover Image */}
            <div className="space-y-1.5">
              <Label>Foto da comunidade</Label>
              <p className="text-[10px] text-muted-foreground">Recomendado: 800×400px (2:1), máx. 2MB</p>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUploadCover} />
              {coverUrl ? (
                <div className="relative rounded-xl overflow-hidden h-32 bg-muted">
                  <img src={coverUrl} alt="Cover" className="w-full h-full object-cover" />
                  <div className="absolute top-2 right-2 flex gap-1">
                    <Button variant="secondary" size="icon" className="h-7 w-7" onClick={() => fileRef.current?.click()} disabled={uploading}>
                      <ImageIcon className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="destructive" size="icon" className="h-7 w-7" onClick={removeCover}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  className="w-full h-24 rounded-xl border-2 border-dashed border-border/50 flex flex-col items-center justify-center gap-1.5 hover:bg-muted/30 transition-colors"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? (
                    <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
                  ) : (
                    <>
                      <ImageIcon className="h-5 w-5 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Adicionar foto</span>
                    </>
                  )}
                </button>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Nome da comunidade</Label>
              <Input value={name} onChange={e => setName(e.target.value)} maxLength={60} />
            </div>

            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Textarea
                value={description}
                onChange={e => { if (e.target.value.length <= DESC_MAX) setDescription(e.target.value); }}
                rows={3}
                maxLength={DESC_MAX}
                placeholder="Descreva sua comunidade..."
              />
              <p className="text-[11px] text-muted-foreground text-right">{description.length}/{DESC_MAX}</p>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-border/50 p-3">
              <div className="flex items-center gap-2">
                {isPrivate ? <Lock className="h-4 w-4 text-warning" /> : <Globe className="h-4 w-4 text-primary" />}
                <div>
                  <p className="text-sm font-medium text-foreground">Comunidade Privada</p>
                  <p className="text-[11px] text-muted-foreground">
                    {isPrivate ? 'Só entra por código de convite' : 'Visível na busca pública'}
                  </p>
                </div>
              </div>
              <Switch checked={isPrivate} onCheckedChange={setIsPrivate} />
            </div>

            <div className="rounded-xl border border-border/50 p-3">
              <Label className="mb-1.5 block">Código de convite</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-lg bg-muted px-3 py-2 text-sm font-mono text-foreground">
                  {turma.invite_code}
                </code>
                <Button
                  variant="outline" size="icon"
                  onClick={() => {
                    navigator.clipboard.writeText(turma.invite_code);
                    toast({ title: 'Código copiado!' });
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <Button
              className="w-full"
              disabled={!name.trim() || isSaving}
              onClick={() => onSave({ name: name.trim(), description: description.trim(), isPrivate, coverImageUrl: coverUrl, subscriptionPrice: Number(subscriptionPrice) || 0 })}
            >
              {isSaving ? 'Salvando...' : 'Salvar Configurações'}
            </Button>
          </TabsContent>

          <TabsContent value="subscription" className="space-y-4 mt-4">
            <div className="rounded-xl border border-border/50 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Preço da Assinatura Semanal</h3>
              </div>
              <p className="text-xs text-muted-foreground">
                Defina o preço em Créditos IA que membros pagam semanalmente (7 dias) para acessar conteúdos exclusivos.
              </p>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="0"
                  value={subscriptionPrice}
                  onChange={e => setSubscriptionPrice(e.target.value)}
                  placeholder="0"
                  className="flex-1"
                />
                <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">Créditos IA / semana</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {Number(subscriptionPrice) > 0
                  ? `Membros pagarão ${subscriptionPrice} créditos por 7 dias de acesso.`
                  : 'Assinatura gratuita (qualquer membro pode ser marcado como assinante).'}
              </p>
            </div>

            {/* Credits go to owner notice */}
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 flex items-start gap-2.5">
              <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-foreground">Os créditos vão para você</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Quando um membro assina, os Créditos IA são transferidos diretamente para o seu saldo como dono da comunidade.
                </p>
              </div>
            </div>

            <Button
              className="w-full"
              disabled={isSaving}
              onClick={() => onSave({ name: name.trim(), description: description.trim(), isPrivate, coverImageUrl: coverUrl, subscriptionPrice: Number(subscriptionPrice) || 0 })}
            >
              {isSaving ? 'Salvando...' : 'Salvar'}
            </Button>
          </TabsContent>

          <TabsContent value="subscribers" className="space-y-3 mt-4 max-h-[60vh] overflow-y-auto pr-1">
            {/* Stats summary */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-border/50 p-3 text-center">
                <p className="text-2xl font-bold text-foreground">{subscribers.length}</p>
                <p className="text-[11px] text-muted-foreground">Assinantes ativos</p>
              </div>
              <div className="rounded-xl border border-border/50 p-3 text-center">
                <div className="flex items-center justify-center gap-1">
                  <Brain className="h-4 w-4" style={{ color: 'hsl(270, 70%, 60%)' }} />
                  <p className="text-2xl font-bold text-foreground">{totalCreditsEarned}</p>
                </div>
                <p className="text-[11px] text-muted-foreground">Créditos recebidos</p>
              </div>
            </div>

            {/* Active subscribers */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Assinantes Ativos</p>
              {subscribers.length === 0 ? (
                <div className="text-center py-6">
                  <Users className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Nenhum assinante ainda.</p>
                </div>
              ) : (
                subscribers.map(member => (
                  <div key={member.user_id} className="flex items-center gap-3 rounded-xl border border-border/40 bg-card px-4 py-3 mb-1.5">
                    <Crown className="h-4 w-4 shrink-0 fill-[hsl(270,70%,55%)]" style={{ color: 'hsl(270, 70%, 55%)' }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{member.user_name}</p>
                      <p className="text-[11px] text-muted-foreground capitalize">{member.role}</p>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Subscription history */}
            {subscriptions.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Histórico de Assinaturas</p>
                <div className="rounded-xl border border-border/50 bg-card divide-y divide-border/50">
                  {subscriptions.map((sub: any) => (
                    <div key={sub.id} className="flex items-center justify-between px-4 py-2.5">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{profileMap.get(sub.user_id) || 'Usuário'}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {format(new Date(sub.created_at), "dd MMM yyyy, HH:mm", { locale: ptBR })}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Brain className="h-3 w-3" style={{ color: 'hsl(270, 70%, 60%)' }} />
                        <span className="text-sm font-bold text-foreground">+{sub.amount}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default CommunitySettingsDialog;
