import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import MemoCardsLogo from '@/components/MemoCardsLogo';
import ThemeToggle from '@/components/ThemeToggle';
import { ArrowLeft, Eye, EyeOff, Mail, Lock, User } from 'lucide-react';



type Step = 'choose' | 'login' | 'signup-name' | 'signup-email' | 'signup-password' | 'signup-done';

const Auth = () => {
  const [searchParams] = useSearchParams();
  const initialMode = searchParams.get('mode');
  
  const [step, setStep] = useState<Step>(
    initialMode === 'login' ? 'login' : initialMode === 'signup' ? 'signup-name' : 'choose'
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await signIn(email, password);
    if (error) {
      toast({ title: 'Erro ao entrar', description: error, variant: 'destructive' });
    } else {
      navigate('/dashboard');
    }
    setLoading(false);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await signUp(email, password, name);
    if (error) {
      toast({ title: 'Erro ao cadastrar', description: error, variant: 'destructive' });
    } else {
      setStep('signup-done');
    }
    setLoading(false);
  };

  const goBack = () => {
    const backMap: Record<string, Step> = {
      'login': 'choose',
      'signup-name': 'choose',
      'signup-email': 'signup-name',
      'signup-password': 'signup-email',
    };
    setStep(backMap[step] || 'choose');
  };

  const canGoBack = step !== 'choose' && step !== 'signup-done';

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 relative">
      <ThemeToggle className="absolute top-4 right-4" />
      <div className="w-full max-w-md">
        {/* Back button */}
        {canGoBack && (
          <button
            onClick={goBack}
            className="mb-6 flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
            <span className="text-sm font-semibold">Voltar</span>
          </button>
        )}

        {/* Choose screen */}
        {step === 'choose' && (
          <div className="animate-fade-in flex flex-col items-center text-center">
            <MemoCardsLogo size={100} />
            <h1 className="mt-4 font-display text-4xl font-black tracking-tight text-foreground">
              Memo Cards
            </h1>
            <p className="mt-2 text-muted-foreground text-base">
              Aprenda com repetição espaçada
            </p>
            <div className="mt-8 flex flex-col gap-3 w-full">
              <Button
                size="lg"
                className="w-full text-base font-bold py-6 rounded-2xl"
                onClick={() => setStep('signup-name')}
              >
                Criar conta
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="w-full text-base font-bold py-6 rounded-2xl border-2"
                onClick={() => setStep('login')}
              >
                Já tenho conta
              </Button>
            </div>
          </div>
        )}

        {/* Login */}
        {step === 'login' && (
          <div className="animate-fade-in">
            <div className="mb-8 text-center">
              <MemoCardsLogo size={64} />
              <h2 className="mt-4 font-display text-2xl font-black text-foreground">
                Bom te ver de volta! 🐘
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">Entre com seu email e senha</p>
            </div>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  required
                  className="pl-11 h-14 rounded-2xl text-base border-2 focus:border-primary"
                />
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Sua senha"
                  required
                  minLength={6}
                  className="pl-11 pr-11 h-14 rounded-2xl text-base border-2 focus:border-primary"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
              <Button
                type="submit"
                size="lg"
                className="w-full text-base font-bold py-6 rounded-2xl mt-2"
                disabled={loading}
              >
                {loading ? 'Entrando...' : 'Entrar'}
              </Button>
            </form>
          </div>
        )}

        {/* Signup Step 1: Name */}
        {step === 'signup-name' && (
          <div className="animate-fade-in">
            <div className="mb-8">
              <p className="text-xs font-bold text-primary uppercase tracking-wider">Passo 1 de 3</p>
              <h2 className="mt-2 font-display text-3xl font-black text-foreground">
                Como podemos te chamar?
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">Escolha um nome para seu perfil</p>
            </div>
            <div className="space-y-4">
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Seu nome"
                  className="pl-11 h-14 rounded-2xl text-base border-2 focus:border-primary"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && name.trim()) setStep('signup-email');
                  }}
                />
              </div>
              <Button
                size="lg"
                className="w-full text-base font-bold py-6 rounded-2xl"
                disabled={!name.trim()}
                onClick={() => setStep('signup-email')}
              >
                Continuar
              </Button>
            </div>
          </div>
        )}

        {/* Signup Step 2: Email */}
        {step === 'signup-email' && (
          <div className="animate-fade-in">
            <div className="mb-8">
              <p className="text-xs font-bold text-primary uppercase tracking-wider">Passo 2 de 3</p>
              <h2 className="mt-2 font-display text-3xl font-black text-foreground">
                Qual seu email, {name.split(' ')[0]}?
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">Vamos usar para salvar seu progresso</p>
            </div>
            <div className="space-y-4">
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  required
                  className="pl-11 h-14 rounded-2xl text-base border-2 focus:border-primary"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && email.includes('@')) setStep('signup-password');
                  }}
                />
              </div>
              <Button
                size="lg"
                className="w-full text-base font-bold py-6 rounded-2xl"
                disabled={!email.includes('@')}
                onClick={() => setStep('signup-password')}
              >
                Continuar
              </Button>
            </div>
          </div>
        )}

        {/* Signup Step 3: Password */}
        {step === 'signup-password' && (
          <div className="animate-fade-in">
            <div className="mb-8">
              <p className="text-xs font-bold text-primary uppercase tracking-wider">Passo 3 de 3</p>
              <h2 className="mt-2 font-display text-3xl font-black text-foreground">
                Crie uma senha segura 🔒
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">Mínimo 6 caracteres</p>
            </div>
            <form onSubmit={handleSignup} className="space-y-4">
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  required
                  minLength={6}
                  className="pl-11 pr-11 h-14 rounded-2xl text-base border-2 focus:border-primary"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
              {password.length > 0 && (
                <div className="flex gap-1">
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className={`h-1.5 flex-1 rounded-full transition-colors ${
                        password.length >= i * 3
                          ? password.length >= 10
                            ? 'bg-primary'
                            : password.length >= 6
                            ? 'bg-warning'
                            : 'bg-destructive'
                          : 'bg-muted'
                      }`}
                    />
                  ))}
                </div>
              )}
              <Button
                type="submit"
                size="lg"
                className="w-full text-base font-bold py-6 rounded-2xl"
                disabled={loading || password.length < 6}
              >
                {loading ? 'Criando conta...' : 'Criar minha conta'}
              </Button>
            </form>
          </div>
        )}

        {/* Signup Done */}
        {step === 'signup-done' && (
          <div className="animate-fade-in flex flex-col items-center text-center">
            <div className="text-6xl mb-4">🎉</div>
            <h2 className="font-display text-3xl font-black text-foreground">
              Conta criada!
            </h2>
            <p className="mt-2 text-muted-foreground max-w-xs">
              Enviamos um email de confirmação para <strong className="text-foreground">{email}</strong>. Verifique sua caixa de entrada.
            </p>
            <Button
              size="lg"
              variant="outline"
              className="mt-8 w-full text-base font-bold py-6 rounded-2xl border-2"
              onClick={() => { setStep('login'); setPassword(''); }}
            >
              Ir para login
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Auth;
