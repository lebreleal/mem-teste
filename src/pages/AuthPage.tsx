import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Eye, EyeOff, Building2, User, AlertCircle, CheckCircle, ArrowLeft } from 'lucide-react';
import logo from '../assets/Logo Ledbras Branco.png';

type AuthMode = 'login' | 'register';
type DocumentType = 'cnpj' | 'cpf';

// WhatsApp URL for support contact
// const WHATSAPP_URL = 'https://wa.me/5511999999999';

export function AuthPage() {
  const navigate = useNavigate();
  const { user, signIn, signUp, loading: authLoading } = useAuth();
  
  const [mode, setMode] = useState<AuthMode>('login');
  const [documentType, setDocumentType] = useState<DocumentType | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [phone, setPhone] = useState('');

  useEffect(() => {
    if (user && !authLoading) {
      navigate('/dashboard');
    }
  }, [user, authLoading, navigate]);

  const formatDocument = (value: string, type: DocumentType | null) => {
    const numbers = value.replace(/\D/g, '');
    if (type === 'cpf') {
      return numbers
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
        .slice(0, 14);
    }
    if (type === 'cnpj') {
      return numbers
        .replace(/(\d{2})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1/$2')
        .replace(/(\d{4})(\d{1,2})$/, '$1-$2')
        .slice(0, 18);
    }
    return numbers;
  };

  const formatPhone = (value: string) => {
    const numbers = value.replace(/\D/g, '');
    return numbers
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{5})(\d)/, '$1-$2')
      .slice(0, 15);
  };

  const handleDocumentChange = (value: string) => {
    setDocumentNumber(formatDocument(value, documentType));
  };

  const handlePhoneChange = (value: string) => {
    setPhone(formatPhone(value));
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await signIn(email, password);
    
    if (error) {
      setError(translateError(error.message));
    }
    
    setLoading(false);
  };

  const translateError = (message: string): string => {
    const translations: Record<string, string> = {
      'User already registered': 'Este email já está cadastrado.',
      'Invalid login credentials': 'Email ou senha incorretos.',
      'Email not confirmed': 'Email não confirmado. Verifique sua caixa de entrada.',
      'Password should be at least 6 characters': 'A senha deve ter pelo menos 6 caracteres.',
      'Unable to validate email address: invalid format': 'Formato de email inválido.',
      'Signup requires a valid password': 'Informe uma senha válida.',
      'new row violates row-level security policy': 'Erro ao criar conta. Tente novamente.',
      'Database error saving new user': 'Erro ao criar conta. Tente novamente.',
    };

    for (const [key, value] of Object.entries(translations)) {
      if (message.toLowerCase().includes(key.toLowerCase())) {
        return value;
      }
    }
    
    return 'Ocorreu um erro. Tente novamente.';
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (password !== confirmPassword) {
      setError('As senhas não coincidem.');
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.');
      setLoading(false);
      return;
    }

    if (!documentType) {
      setError('Selecione o tipo de cadastro.');
      setLoading(false);
      return;
    }

    const { error } = await signUp(email, password, {
      document_type: documentType,
      document_number: documentNumber.replace(/\D/g, ''),
      company_name: documentType === 'cnpj' ? companyName : null,
      full_name: fullName,
      phone: phone.replace(/\D/g, ''),
    });

    if (error) {
      setError(translateError(error.message));
    } else {
      setSuccess('Cadastro realizado! Verifique seu email para confirmar a conta.');
      setMode('login');
    }

    setLoading(false);
  };

  const renderDocumentTypeSelector = () => (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-foreground text-center mb-6">
        Como você deseja se cadastrar?
      </h3>
      <div className="grid grid-cols-2 gap-4">
        <button
          type="button"
          onClick={() => setDocumentType('cnpj')}
          className={`p-6 rounded-xl border-2 transition-all ${
            documentType === 'cnpj'
              ? 'border-primary bg-primary/10'
              : 'border-border hover:border-primary/50'
          }`}
        >
          <Building2 className={`w-8 h-8 mx-auto mb-2 ${documentType === 'cnpj' ? 'text-primary' : 'text-muted-foreground'}`} />
          <span className={`block font-medium ${documentType === 'cnpj' ? 'text-primary' : 'text-foreground'}`}>
            CNPJ
          </span>
          <span className="text-xs text-muted-foreground">Pessoa Jurídica</span>
        </button>
        <button
          type="button"
          onClick={() => setDocumentType('cpf')}
          className={`p-6 rounded-xl border-2 transition-all ${
            documentType === 'cpf'
              ? 'border-primary bg-primary/10'
              : 'border-border hover:border-primary/50'
          }`}
        >
          <User className={`w-8 h-8 mx-auto mb-2 ${documentType === 'cpf' ? 'text-primary' : 'text-muted-foreground'}`} />
          <span className={`block font-medium ${documentType === 'cpf' ? 'text-primary' : 'text-foreground'}`}>
            CPF
          </span>
          <span className="text-xs text-muted-foreground">Pessoa Física</span>
        </button>
      </div>
    </div>
  );

  const renderLoginForm = () => (
    <form onSubmit={handleLogin} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          Email
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-4 py-3 bg-background border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
          placeholder="seu@email.com"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          Senha
        </label>
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-3 pr-12 bg-background border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
            placeholder="••••••••"
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>
        </div>
      </div>
      
      {error && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 flex items-center gap-2 text-destructive">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}
      
      {success && (
        <div className="bg-success/10 border border-success/30 rounded-lg p-3 flex items-center gap-2 text-success">
          <CheckCircle className="w-5 h-5 flex-shrink-0" />
          <span className="text-sm">{success}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full px-6 py-3 bg-primary text-primary-foreground font-semibold rounded-xl hover:bg-primary/90 transition-all disabled:opacity-50"
      >
        {loading ? 'Entrando...' : 'Entrar'}
      </button>

      <p className="text-center text-sm text-muted-foreground">
        Não tem uma conta?{' '}
        <button
          type="button"
          onClick={() => {
            setMode('register');
            setError(null);
            setSuccess(null);
          }}
          className="text-primary hover:underline"
        >
          Cadastre-se
        </button>
      </p>
    </form>
  );

  const renderRegisterForm = () => (
    <form onSubmit={handleRegister} className="space-y-4">
      {!documentType && renderDocumentTypeSelector()}
      
      {documentType && (
        <>
          <button
            type="button"
            onClick={() => setDocumentType(null)}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </button>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="col-span-1 sm:col-span-2">
              <label className="block text-sm font-medium text-foreground mb-2">
                Nome Completo
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-4 py-3 bg-background border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                placeholder="Seu nome completo"
                required
              />
            </div>
            
            {documentType === 'cnpj' && (
              <div className="col-span-1 sm:col-span-2">
                <label className="block text-sm font-medium text-foreground mb-2">
                  Razão Social
                </label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full px-4 py-3 bg-background border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                  placeholder="Nome da empresa"
                  required
                />
              </div>
            )}
            
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                {documentType === 'cnpj' ? 'CNPJ' : 'CPF'}
              </label>
              <input
                type="text"
                value={documentNumber}
                onChange={(e) => handleDocumentChange(e.target.value)}
                className="w-full px-4 py-3 bg-background border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                placeholder={documentType === 'cnpj' ? '00.000.000/0000-00' : '000.000.000-00'}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                WhatsApp
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => handlePhoneChange(e.target.value)}
                className="w-full px-4 py-3 bg-background border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                placeholder="(00) 00000-0000"
                required
              />
            </div>
            <div className="col-span-1 sm:col-span-2">
              <label className="block text-sm font-medium text-foreground mb-2">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-background border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                placeholder="seu@email.com"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Senha
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 pr-12 bg-background border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                  placeholder="••••••••"
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Confirmar Senha
              </label>
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-3 bg-background border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                placeholder="••••••••"
                required
                minLength={6}
              />
            </div>
          </div>

          {error && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 flex items-center gap-2 text-destructive">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full px-6 py-3 bg-primary text-primary-foreground font-semibold rounded-xl hover:bg-primary/90 transition-all disabled:opacity-50"
          >
            {loading ? 'Cadastrando...' : 'Criar Conta'}
          </button>
        </>
      )}

      <p className="text-center text-sm text-muted-foreground">
        Já tem uma conta?{' '}
        <button
          type="button"
          onClick={() => {
            setMode('login');
            setDocumentType(null);
            setError(null);
            setSuccess(null);
          }}
          className="text-primary hover:underline"
        >
          Entrar
        </button>
      </p>
    </form>
  );

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-tech-navy to-tech-dark items-center justify-center p-12 relative overflow-hidden">
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 left-0 w-full h-full" style={{
            backgroundImage: 'radial-gradient(circle at 25% 25%, hsl(var(--primary)) 0%, transparent 50%), radial-gradient(circle at 75% 75%, hsl(var(--secondary)) 0%, transparent 50%)'
          }} />
        </div>
        
        <div className="text-center relative z-10">
          <img src={logo} alt="Ledbras" className="h-16 mx-auto mb-8" />
          <h1 className="text-4xl font-bold text-white mb-4">
            Bem-vindo à <span className="text-gradient">Ledbras</span>
          </h1>
          <p className="text-gray-300 text-lg max-w-md">
            Líder em importação de painéis LED. Acesse seu painel para solicitar orçamentos e acompanhar seus pedidos.
          </p>
        </div>
      </div>

      {/* Right side - Auth Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-8 text-center">
            <div className="inline-block p-4 bg-tech-dark rounded-2xl mb-4">
              <img src={logo} alt="Ledbras" className="h-10" />
            </div>
          </div>
          
          <div className="bg-card border border-border rounded-2xl p-6 sm:p-8 shadow-lg">
            <h2 className="text-2xl font-bold text-foreground text-center mb-6">
              {mode === 'login' ? 'Entrar' : 'Criar Conta'}
            </h2>
            
            {mode === 'login' ? renderLoginForm() : renderRegisterForm()}
          </div>
        </div>
      </div>
    </div>
  );
}