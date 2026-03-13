import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useToast } from '@/hooks/use-toast';
import BottomNav from '@/components/BottomNav';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Save, Loader2, User, Lock, Wallet, Bot, Crown, BarChart3, BrainCircuit, Gauge, LogOut } from 'lucide-react';

const Profile = () => {
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingName, setSavingName] = useState(false);

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

    // Verify current password by re-signing in
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email,
      password: currentPassword,
    });

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
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border/50 bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto flex items-center gap-3 px-4 py-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="font-display text-xl font-bold text-foreground">Meu Perfil</h1>
        </div>
      </header>

      <main className="container mx-auto max-w-2xl space-y-4 px-4 py-6 pb-24">
        {/* Stats shortcut */}
        <Card className="cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => navigate('/desempenho')}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10">
              <BarChart3 className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <p className="font-display font-semibold text-foreground">Estatísticas</p>
              <p className="text-xs text-muted-foreground">Heatmap, gráficos e desempenho</p>
            </div>
            <ArrowLeft className="h-4 w-4 text-muted-foreground rotate-180" />
          </CardContent>
        </Card>

        {/* Concepts shortcut */}
        <Card className="cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => navigate('/conceitos')}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10">
              <BrainCircuit className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <p className="font-display font-semibold text-foreground">Biblioteca de Temas</p>
              <p className="text-xs text-muted-foreground">Gerenciar temas, importar e estudar</p>
            </div>
            <ArrowLeft className="h-4 w-4 text-muted-foreground rotate-180" />
          </CardContent>
        </Card>

        {/* Performance shortcut */}
        <Card className="cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => navigate('/planejamento')}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10">
              <Gauge className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <p className="font-display font-semibold text-foreground">Planejamento</p>
              <p className="text-xs text-muted-foreground">Retenção e o que fazer hoje</p>
            </div>
            <ArrowLeft className="h-4 w-4 text-muted-foreground rotate-180" />
          </CardContent>
        </Card>

        {/* Carteira shortcut */}
        <Card className={`relative transition-colors ${isAdmin ? 'cursor-pointer hover:bg-muted/30' : 'opacity-60'}`} onClick={() => isAdmin ? navigate('/memograna') : toast({ title: 'Em desenvolvimento', description: 'Carteira estará disponível em breve!' })}>
          <CardContent className="flex items-center gap-4 p-4">
            {!isAdmin && (
              <span className="absolute -top-1.5 -right-1.5 text-[8px] font-bold bg-warning text-warning-foreground px-1.5 py-0.5 rounded-full z-10">BREVE</span>
            )}
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10">
              <Wallet className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <p className="font-display font-semibold text-foreground">Carteira</p>
              <p className="text-xs text-muted-foreground">Carteira, tier de criador e transações</p>
            </div>
            <ArrowLeft className="h-4 w-4 text-muted-foreground rotate-180" />
          </CardContent>
        </Card>


        {/* Admin IA shortcut - only for admins */}
        {isAdmin && (
          <Card className="cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => navigate('/admin/ia')}>
            <CardContent className="flex items-center gap-4 p-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10">
                <Bot className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="font-display font-semibold text-foreground">Admin IA</p>
                <p className="text-xs text-muted-foreground">Editar prompts, modelos e temperatura</p>
              </div>
              <ArrowLeft className="h-4 w-4 text-muted-foreground rotate-180" />
            </CardContent>
          </Card>
        )}

        {/* Profile info */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <User className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="font-display">Informações Pessoais</CardTitle>
            </div>
            <CardDescription>Atualize seu nome e veja seu email.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="profile-email">Email</Label>
              <Input id="profile-email" value={email} disabled className="bg-muted" />
              <p className="text-xs text-muted-foreground">O email não pode ser alterado.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-name">Nome</Label>
              <Input
                id="profile-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                placeholder="Seu nome"
              />
            </div>
            <Button onClick={handleSaveName} disabled={savingName || !name.trim()} className="gap-2">
              {savingName ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar Nome
            </Button>
          </CardContent>
        </Card>

        {/* Password */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="font-display">Alterar Senha</CardTitle>
            </div>
            <CardDescription>Use uma senha forte com pelo menos 6 caracteres.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="current-password">Senha Atual</Label>
              <Input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">Nova Senha</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirmar Nova Senha</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
            <Button
              onClick={handleChangePassword}
              disabled={savingPassword || !currentPassword || !newPassword || !confirmPassword}
              className="gap-2"
            >
              {savingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
              Alterar Senha
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default Profile;
