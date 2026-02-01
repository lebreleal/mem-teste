import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../integrations/supabase/client';
import { 
  FileText, 
  Zap, 
  TrendingUp, 
  LogOut, 
  User,
  AlertCircle,
  ArrowRight,
  Construction,
  Settings,
  Loader2,
  Pencil,
  X,
  Save,
  CheckCircle2
} from 'lucide-react';
import logo from '../assets/Logo Ledbras Branco.png';

interface ToolCard {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  action: () => void;
  available: boolean;
  color: string;
}

interface QuoteStats {
  total: number;
  approved: number;
  inProgress: number;
}

interface BannerSettings {
  desktop: {
    image_url: string;
    link: string;
    enabled: boolean;
  };
  mobile: {
    image_url: string;
    link: string;
    enabled: boolean;
  };
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { user, profile, signOut, refreshProfile } = useAuth();
  const [showDevelopmentModal, setShowDevelopmentModal] = useState(false);
  const [developmentTitle, setDevelopmentTitle] = useState('');
  const [stats, setStats] = useState<QuoteStats>({ total: 0, approved: 0, inProgress: 0 });
  const [loadingStats, setLoadingStats] = useState(true);
  const [bannerSettings, setBannerSettings] = useState<BannerSettings | null>(null);
  
  // Profile editing state
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileForm, setProfileForm] = useState({
    full_name: '',
    company_name: '',
    phone: '',
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Initialize profile form when profile loads
  useEffect(() => {
    if (profile) {
      setProfileForm({
        full_name: profile.full_name || '',
        company_name: profile.company_name || '',
        phone: profile.phone || '',
      });
    }
  }, [profile]);

  useEffect(() => {
    if (user?.id) {
      fetchStats();
    }
    fetchBanners();
  }, [user?.id]);

  const fetchBanners = async () => {
    try {
      const { data } = await supabase
        .from('site_settings')
        .select('*')
        .eq('key', 'dashboard_banners')
        .single();
      
      if (data?.value) {
        setBannerSettings(data.value as unknown as BannerSettings);
      }
    } catch (error) {
      console.error('Erro ao carregar banners:', error);
    }
  };

  const fetchStats = async () => {
    if (!user?.id) return;
    
    try {
      const { data: quotes, error } = await supabase
        .from('quotes')
        .select('*')
        .eq('user_id', user.id);

      if (error) throw error;

      const quotesData = quotes || [];
      
      const total = quotesData.length;
      const approved = quotesData.filter(q => q.quote_approved_at !== null).length;
      const inProgress = quotesData.filter(q => 
        q.quote_approved_at !== null && 
        !q.delivered_at
      ).length;

      setStats({ total, approved, inProgress });
    } catch (error) {
      console.error('Erro ao carregar estatísticas:', error);
    } finally {
      setLoadingStats(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate('/');
  };

  const showDevelopmentMessage = (title: string) => {
    setDevelopmentTitle(title);
    setShowDevelopmentModal(true);
  };

  const handleSaveProfile = async () => {
    if (!profile?.id) return;
    
    setSavingProfile(true);
    setProfileError(null);
    setProfileSuccess(false);
    
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: profileForm.full_name,
          company_name: profileForm.company_name || null,
          phone: profileForm.phone || null,
        })
        .eq('id', profile.id);
      
      if (error) throw error;
      
      setProfileSuccess(true);
      await refreshProfile();
      
      setTimeout(() => {
        setShowProfileModal(false);
        setProfileSuccess(false);
      }, 1500);
    } catch (err) {
      console.error('Erro ao salvar perfil:', err);
      setProfileError('Erro ao salvar alterações. Tente novamente.');
    } finally {
      setSavingProfile(false);
    }
  };

  const tools: ToolCard[] = [
    {
      id: 'quote',
      title: 'Solicitar Orçamento',
      description: 'Solicite um orçamento personalizado para seu projeto',
      icon: <FileText className="w-6 h-6" />,
      action: () => navigate('/dashboard/quote'),
      available: true,
      color: 'from-primary to-secondary',
    },
    {
      id: 'orders',
      title: 'Consultar Pedidos',
      description: 'Acompanhe o andamento dos seus pedidos em tempo real',
      icon: <TrendingUp className="w-6 h-6" />,
      action: () => navigate('/dashboard/orders'),
      available: true,
      color: 'from-success to-emerald-500',
    },
    {
      id: 'energy',
      title: 'Consumo de Energia',
      description: 'Estime o gasto mensal de energia do seu Outdoor Painel LED',
      icon: <Zap className="w-6 h-6" />,
      action: () => showDevelopmentMessage('Consumo de Energia'),
      available: false,
      color: 'from-warning to-orange-500',
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-tech-dark border-b border-tech-navy">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <a href="/" className="flex items-center">
              <img src={logo} alt="Ledbras" className="h-8" />
            </a>
            
            <div className="flex items-center gap-4">
              {profile?.is_admin && (
                <button
                  onClick={() => navigate('/dashboard/admin')}
                  className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
                >
                  <Settings className="w-5 h-5" />
                  <span className="text-sm hidden sm:block">Admin</span>
                </button>
              )}
              <button
                onClick={() => setShowProfileModal(true)}
                className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
              >
                <User className="w-5 h-5" />
                <span className="text-sm hidden sm:block">
                  {profile?.company_name || profile?.full_name}
                </span>
                <Pencil className="w-3 h-3" />
              </button>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
              >
                <LogOut className="w-5 h-5" />
                <span className="text-sm hidden sm:block">Sair</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Banner Section */}
        {bannerSettings && (
          <>
            {/* Desktop Banner */}
            {bannerSettings.desktop.enabled && bannerSettings.desktop.image_url && (
              <div className="hidden md:block mb-8">
                {bannerSettings.desktop.link ? (
                  <a 
                    href={bannerSettings.desktop.link} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="block rounded-2xl overflow-hidden hover:opacity-95 transition-opacity"
                  >
                    <img 
                      src={bannerSettings.desktop.image_url} 
                      alt="Banner" 
                      className="w-full h-auto object-cover"
                    />
                  </a>
                ) : (
                  <div className="rounded-2xl overflow-hidden">
                    <img 
                      src={bannerSettings.desktop.image_url} 
                      alt="Banner" 
                      className="w-full h-auto object-cover"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Mobile Banner */}
            {bannerSettings.mobile.enabled && bannerSettings.mobile.image_url && (
              <div className="md:hidden mb-8">
                {bannerSettings.mobile.link ? (
                  <a 
                    href={bannerSettings.mobile.link} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="block rounded-2xl overflow-hidden hover:opacity-95 transition-opacity"
                  >
                    <img 
                      src={bannerSettings.mobile.image_url} 
                      alt="Banner" 
                      className="w-full h-auto object-cover"
                    />
                  </a>
                ) : (
                  <div className="rounded-2xl overflow-hidden">
                    <img 
                      src={bannerSettings.mobile.image_url} 
                      alt="Banner" 
                      className="w-full h-auto object-cover"
                    />
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Tools Grid */}
        <div className="grid gap-6 md:grid-cols-3 max-w-4xl mx-auto">
          {tools.map((tool) => (
            <button
              key={tool.id}
              onClick={tool.action}
              className="group relative bg-card border-2 border-border rounded-2xl p-6 text-left transition-all hover:border-primary/50 hover:shadow-lg"
            >
              <div className="flex flex-col items-start gap-4">
                <div className={`p-3 rounded-xl bg-gradient-to-br ${tool.color} text-white`}>
                  {tool.icon}
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-foreground mb-1">
                    {tool.title}
                  </h3>
                  <p className="text-muted-foreground text-sm">
                    {tool.description}
                  </p>
                </div>
                <div className={`self-end p-2 rounded-lg transition-colors ${
                  tool.available 
                    ? 'bg-primary text-primary-foreground' 
                    : 'bg-muted text-muted-foreground'
                }`}>
                  <ArrowRight className="w-5 h-5" />
                </div>
              </div>
              {!tool.available && (
                <div className="absolute top-2 right-2 px-2 py-1 bg-warning/20 text-warning text-xs font-medium rounded-full flex items-center gap-1">
                  <Construction className="w-3 h-3" />
                  Em desenvolvimento
                </div>
              )}
            </button>
          ))}
        </div>

        {/* Quick Stats */}
        <div className="mt-12 grid gap-6 md:grid-cols-3 max-w-4xl mx-auto">
          <div className="bg-card rounded-2xl p-6 text-center border border-border">
            {loadingStats ? (
              <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto mb-2" />
            ) : (
              <div className="text-3xl font-bold text-primary mb-2">{stats.total}</div>
            )}
            <div className="text-muted-foreground text-sm">Orçamentos Solicitados</div>
          </div>
          <div className="bg-card rounded-2xl p-6 text-center border border-border">
            {loadingStats ? (
              <Loader2 className="w-6 h-6 animate-spin text-success mx-auto mb-2" />
            ) : (
              <div className="text-3xl font-bold text-success mb-2">{stats.approved}</div>
            )}
            <div className="text-muted-foreground text-sm">Pedidos Aprovados</div>
          </div>
          <div className="bg-card rounded-2xl p-6 text-center border border-border">
            {loadingStats ? (
              <Loader2 className="w-6 h-6 animate-spin text-secondary mx-auto mb-2" />
            ) : (
              <div className="text-3xl font-bold text-secondary mb-2">{stats.inProgress}</div>
            )}
            <div className="text-muted-foreground text-sm">Em Andamento</div>
          </div>
        </div>
      </main>

      {/* Development Modal */}
      {showDevelopmentModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl p-8 max-w-md w-full border border-border">
            <div className="text-center">
              <div className="w-16 h-16 bg-warning/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-8 h-8 text-warning" />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-2">
                {developmentTitle}
              </h3>
              <p className="text-muted-foreground mb-6">
                Esta funcionalidade está em desenvolvimento. Para cálculos e orçamentos imediatos, entre em contato pelo WhatsApp.
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => setShowDevelopmentModal(false)}
                  className="px-6 py-2 bg-muted text-foreground rounded-lg hover:bg-muted/80 transition-colors"
                >
                  Fechar
                </button>
                <a
                  href="https://wa.me/5511999999999"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-6 py-2 bg-success text-success-foreground rounded-lg hover:bg-success/90 transition-colors"
                >
                  WhatsApp
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Profile Edit Modal */}
      {showProfileModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl p-8 max-w-md w-full border border-border">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-foreground">Editar Perfil</h3>
              <button
                onClick={() => {
                  setShowProfileModal(false);
                  setProfileError(null);
                  setProfileSuccess(false);
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {profileError && (
              <div className="mb-4 bg-destructive/10 border border-destructive/30 rounded-lg p-3 flex items-center gap-2 text-destructive text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{profileError}</span>
              </div>
            )}

            {profileSuccess && (
              <div className="mb-4 bg-success/10 border border-success/30 rounded-lg p-3 flex items-center gap-2 text-success text-sm">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <span>Perfil atualizado com sucesso!</span>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Nome Completo *
                </label>
                <input
                  type="text"
                  value={profileForm.full_name}
                  onChange={(e) => setProfileForm({ ...profileForm, full_name: e.target.value })}
                  className="w-full px-4 py-3 border border-border rounded-xl bg-background text-foreground focus:ring-2 focus:ring-primary/50 focus:border-primary"
                  placeholder="Seu nome completo"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Nome da Empresa
                </label>
                <input
                  type="text"
                  value={profileForm.company_name}
                  onChange={(e) => setProfileForm({ ...profileForm, company_name: e.target.value })}
                  className="w-full px-4 py-3 border border-border rounded-xl bg-background text-foreground focus:ring-2 focus:ring-primary/50 focus:border-primary"
                  placeholder="Nome da empresa (opcional)"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Telefone
                </label>
                <input
                  type="tel"
                  value={profileForm.phone}
                  onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                  className="w-full px-4 py-3 border border-border rounded-xl bg-background text-foreground focus:ring-2 focus:ring-primary/50 focus:border-primary"
                  placeholder="(00) 00000-0000"
                />
              </div>

              {/* Non-editable fields */}
              <div className="pt-4 border-t border-border">
                <p className="text-xs text-muted-foreground mb-3">
                  Os campos abaixo só podem ser alterados pelo administrador:
                </p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Email:</span>
                    <span className="text-foreground">{user?.email}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Documento:</span>
                    <span className="text-foreground">
                      {profile?.document_type?.toUpperCase()}: {profile?.document_number}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowProfileModal(false)}
                className="flex-1 px-4 py-3 bg-muted text-foreground rounded-xl hover:bg-muted/80 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveProfile}
                disabled={savingProfile || !profileForm.full_name.trim()}
                className="flex-1 px-4 py-3 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {savingProfile ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
