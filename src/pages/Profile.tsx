import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useToast } from '@/hooks/use-toast';
import { useSubscription } from '@/hooks/useSubscription';
import BottomNav from '@/components/BottomNav';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ArrowLeft, Loader2, ExternalLink, BarChart3, BrainCircuit, Gauge, Wallet, Bot, LogOut, Lock, User, Save, Camera } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';

const Profile = () => {
  const { user, signOut } = useAuth();
  const { isAdmin } = useIsAdmin();
  const { isPremium, plan } = useSubscription();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingName, setSavingName] = useState(false);

  const [editNameOpen, setEditNameOpen] = useState(false);
  const [editPasswordOpen, setEditPasswordOpen] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    if (!user) return;
    setEmail(user.email ?? '');
    supabase.from('profiles').select('name').eq('id', user.id).single().then(({ data }) => {
      setName(data?.name ?? user.user_metadata?.name ?? '');
      setLoading(false);
    });
  }, [user]);

  const handleSaveName = async () => {
    if (!user || !name.trim()) return;
    setSavingName(true);
    const { error } = await supabase.from('profiles').update({ name: name.trim() }).eq('id', user.id);
    setSavingName(false);
    if (error) {
      toast({ title: 'Erro', description: 'Não foi possível atualizar o nome.', variant: 'destructive' });
    } else {
      toast({ title: 'Nome atualizado!' });
      setEditNameOpen(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 6) {
      toast({ title: 'Erro', description: 'A nova senha deve ter pelo menos 6 caracteres.', variant: 'destructive' });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: 'Erro', description: 'As senhas não coincidem.', variant: 'destructive' });
      return;
    }
    setSavingPassword(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
    if (signInError) {
      setSavingPassword(false);
      toast({ title: 'Erro', description: 'Senha atual incorreta.', variant: 'destructive' });
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPassword(false);
    if (error) {
      toast({ title: 'Erro', description: 'Não foi possível alterar a senha.', variant: 'destructive' });
    } else {
      toast({ title: 'Senha alterada com sucesso!' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setEditPasswordOpen(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const initials = name ? name.charAt(0).toUpperCase() : (email?.charAt(0).toUpperCase() ?? 'U');

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border/50 bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto flex items-center px-4 py-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')} className="shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="flex-1 text-center font-display text-xl font-bold text-foreground">Meu Perfil</h1>
          <div className="w-10 shrink-0" />
        </div>
      </header>

      <main className="container mx-auto max-w-lg px-4 py-6 pb-24">
        {/* Avatar */}
        <div className="flex flex-col items-center mb-8">
          <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center text-3xl font-bold text-primary">
            {initials}
          </div>
        </div>

        {/* Info Section */}
        <SectionHeader>Info</SectionHeader>

        <ProfileRow
          label={name || '—'}
          sub="Nome"
          onClick={() => setEditNameOpen(true)}
        />
        <ProfileRow
          label={email || '—'}
          sub="Email"
        />
        <ProfileRow
          label="Alterar Senha"
          sub="Não usado se entrou com Google ou Apple."
          onClick={() => setEditPasswordOpen(true)}
        />

        {/* Subscription Section */}
        <SectionHeader className="mt-6">Assinatura</SectionHeader>

        <ProfileRow
          label={isPremium ? `Plano ${plan ?? 'Premium'}` : 'Plano gratuito'}
          sub={isPremium ? 'Toque para gerenciar.' : 'Toque para mais informações.'}
          icon={<ExternalLink className="h-4.5 w-4.5 text-muted-foreground" />}
          onClick={() => navigate('/dashboard')}
        />

        {/* Shortcuts Section */}
        <SectionHeader className="mt-6">Atalhos</SectionHeader>

        <ProfileRow
          label="Estatísticas"
          sub="Heatmap, gráficos e desempenho"
          icon={<BarChart3 className="h-4.5 w-4.5 text-muted-foreground" />}
          onClick={() => navigate('/desempenho')}
        />
        <ProfileRow
          label="Biblioteca de Temas"
          sub="Gerenciar temas, importar e estudar"
          icon={<BrainCircuit className="h-4.5 w-4.5 text-muted-foreground" />}
          onClick={() => navigate('/conceitos')}
        />
        <ProfileRow
          label="Planejamento"
          sub="Retenção e o que fazer hoje"
          icon={<Gauge className="h-4.5 w-4.5 text-muted-foreground" />}
          onClick={() => navigate('/planejamento')}
        />
        <ProfileRow
          label="Carteira"
          sub="Carteira, tier de criador e transações"
          icon={<Wallet className="h-4.5 w-4.5 text-muted-foreground" />}
          onClick={() => isAdmin ? navigate('/memograna') : toast({ title: 'Em desenvolvimento', description: 'Carteira estará disponível em breve!' })}
          badge={!isAdmin ? 'BREVE' : undefined}
        />
        {isAdmin && (
          <ProfileRow
            label="Admin IA"
            sub="Editar prompts, modelos e temperatura"
            icon={<Bot className="h-4.5 w-4.5 text-muted-foreground" />}
            onClick={() => navigate('/admin/ia')}
          />
        )}

        {/* Sign out */}
        <div className="mt-8">
          <button
            onClick={() => signOut()}
            className="w-full flex items-center gap-3 py-3.5 px-1 text-left"
          >
            <LogOut className="h-5 w-5 text-destructive" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-destructive">Sair da conta</p>
              <p className="text-xs text-muted-foreground">{email}</p>
            </div>
          </button>
        </div>
      </main>

      {/* Edit Name Dialog */}
      <Dialog open={editNameOpen} onOpenChange={setEditNameOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Editar Nome</DialogTitle>
            <DialogDescription>Atualize seu nome de exibição.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Nome</Label>
              <Input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} placeholder="Seu nome" />
            </div>
            <Button onClick={handleSaveName} disabled={savingName || !name.trim()} className="w-full gap-2">
              {savingName ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Password Dialog */}
      <Dialog open={editPasswordOpen} onOpenChange={setEditPasswordOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Alterar Senha</DialogTitle>
            <DialogDescription>Use uma senha forte com pelo menos 6 caracteres.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="cur-pw">Senha Atual</Label>
              <Input id="cur-pw" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-pw">Nova Senha</Label>
              <Input id="new-pw" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="conf-pw">Confirmar Nova Senha</Label>
              <Input id="conf-pw" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
            </div>
            <Button onClick={handleChangePassword} disabled={savingPassword || !currentPassword || !newPassword || !confirmPassword} className="w-full gap-2">
              {savingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
              Alterar Senha
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <BottomNav />
    </div>
  );
};

/* ── Tiny sub-components ── */

const SectionHeader = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <h2 className={`text-sm font-semibold text-muted-foreground mb-1 ${className}`}>{children}</h2>
);

interface ProfileRowProps {
  label: string;
  sub?: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  badge?: string;
}

const ProfileRow = ({ label, sub, icon, onClick, badge }: ProfileRowProps) => (
  <button
    type="button"
    onClick={onClick}
    disabled={!onClick}
    className="relative w-full flex items-center gap-3 py-3.5 px-1 border-b border-border/40 text-left transition-colors hover:bg-muted/30 disabled:opacity-100 disabled:cursor-default"
  >
    {badge && (
      <span className="absolute -top-1 right-0 text-[8px] font-bold bg-warning text-warning-foreground px-1.5 py-0.5 rounded-full">
        {badge}
      </span>
    )}
    <div className="flex-1 min-w-0">
      <p className="text-sm font-medium text-foreground truncate">{label}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
    {icon ?? (onClick ? <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" /> : null)}
  </button>
);

export default Profile;
