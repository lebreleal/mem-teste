import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../integrations/supabase/client';
import { 
  Factory, 
  Ship, 
  CheckCircle2, 
  Clock, 
  FileText, 
  FileSignature, 
  CreditCard, 
  Palette,
  Package,
  Truck,
  MapPin,
  ClipboardList,
  Anchor,
  FileCheck,
  Home,
  ArrowLeft,
  ExternalLink,
  AlertCircle,
  Loader2,
  Hash,
  Info
} from 'lucide-react';
import logo from '../assets/Logo Ledbras Branco.png';

interface Quote {
  id: string;
  product_type: string;
  pitch: string;
  cabinet_quantity: number;
  cabinet_layout: string;
  created_at: string;
  status: string;
  current_stage: number;
  current_step: number;
  quote_pdf_url: string | null;
  quote_approved_at: string | null;
  contract_link: string | null;
  contract_signed_at: string | null;
  production_payment_link: string | null;
  production_paid_at: string | null;
  wants_logo: boolean | null;
  logo_url: string | null;
  production_started_at: string | null;
  production_completed_at: string | null;
  shipping_payment_link: string | null;
  shipping_paid_at: string | null;
  shipping_form_link: string | null;
  shipping_form_completed_at: string | null;
  shipping_address_street: string | null;
  shipping_address_number: string | null;
  shipping_address_complement: string | null;
  shipping_address_neighborhood: string | null;
  shipping_address_city: string | null;
  shipping_address_state: string | null;
  shipping_address_cep: string | null;
  shipped_at: string | null;
  arrived_port_at: string | null;
  customs_started_at: string | null;
  customs_cleared_at: string | null;
  delivered_at: string | null;
}

const stages = [
  { 
    id: 1, 
    title: 'Produção', 
    duration: '~30 dias',
    icon: Factory,
    color: 'from-blue-500 to-cyan-500',
    bgColor: 'bg-blue-500'
  },
  { 
    id: 2, 
    title: 'Embarque', 
    duration: '~45 dias',
    icon: Ship,
    color: 'from-purple-500 to-pink-500',
    bgColor: 'bg-purple-500'
  },
  { 
    id: 3, 
    title: 'Entrega', 
    duration: 'Desembaraço',
    icon: Home,
    color: 'from-green-500 to-emerald-500',
    bgColor: 'bg-green-500'
  },
];

const stepsStage1 = [
  { id: 1, title: 'Aguardando Orçamento', description: 'Nossa equipe está preparando seu orçamento em até 24h.', icon: Clock },
  { id: 2, title: 'Aprovar Orçamento', description: 'Analise e aprove o orçamento para prosseguir.', icon: FileText },
  { id: 3, title: 'Assinar Contrato', description: 'Assine o contrato digital para formalizar.', icon: FileSignature },
  { id: 4, title: 'Pagamento da Produção', description: 'Realize o pagamento com custódia.', icon: CreditCard },
  { id: 5, title: 'Personalização (Logo)', description: 'Escolha se deseja incluir sua logo.', icon: Palette },
  { id: 6, title: 'Em Produção', description: 'Acompanhe fotos e vídeos da fabricação.', icon: Package },
  { id: 7, title: 'Produção Concluída', description: 'Produto pronto para embarque.', icon: CheckCircle2 },
];

const stepsStage2 = [
  { id: 1, title: 'Pagamento do Embarque', description: 'Pague o frete internacional.', icon: CreditCard },
  { id: 2, title: 'Formulário Obrigatório', description: 'Preencha a documentação de embarque.', icon: ClipboardList },
  { id: 3, title: 'Endereço de Entrega', description: 'Confirme o endereço completo.', icon: MapPin },
  { id: 4, title: 'Em Trânsito', description: 'Carga embarcada rumo ao Brasil.', icon: Ship },
  { id: 5, title: 'Chegou ao Porto', description: 'Carga chegou ao porto brasileiro.', icon: Anchor },
];

const stepsStage3 = [
  { id: 1, title: 'Desembaraço Aduaneiro', description: 'Pagamento de impostos e liberação.', icon: FileCheck },
  { id: 2, title: 'Liberação Concluída', description: 'Carga liberada para transporte.', icon: CheckCircle2 },
  { id: 3, title: 'Em Transporte', description: 'A caminho do seu endereço.', icon: Truck },
  { id: 4, title: 'Entregue!', description: 'Produto entregue com sucesso!', icon: Home },
];

export function OrdersPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
  const [activeStageTab, setActiveStageTab] = useState(1);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [addressData, setAddressData] = useState({
    cep: '',
    street: '',
    number: '',
    complement: '',
    neighborhood: '',
    city: '',
    state: ''
  });
  const [savingAddress, setSavingAddress] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (user?.id) {
      fetchQuotes();
    }
  }, [user?.id]);

  const fetchQuotes = async () => {
    if (!user?.id) return;
    try {
      const { data, error } = await supabase
        .from('quotes')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      const quotesData = (data as unknown as Quote[]) || [];
      setQuotes(quotesData);
      if (quotesData.length > 0) {
        const selected = selectedQuote 
          ? quotesData.find(q => q.id === selectedQuote.id) || quotesData[0]
          : quotesData[0];
        setSelectedQuote(selected);
        const progress = getCurrentStepForQuote(selected);
        setActiveStageTab(progress.stage);
      }
    } catch (error) {
      console.error('Erro ao carregar pedidos:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStepsForStage = (stageId: number) => {
    switch (stageId) {
      case 1: return stepsStage1;
      case 2: return stepsStage2;
      case 3: return stepsStage3;
      default: return stepsStage1;
    }
  };

  const getCurrentStepForQuote = (quote: Quote): { stage: number; step: number } => {
    // Etapa 3 - Liberação Aduaneira
    if (quote.arrived_port_at) {
      if (quote.delivered_at) return { stage: 3, step: 4 };
      if (quote.customs_cleared_at) return { stage: 3, step: 3 };
      if (quote.customs_started_at) return { stage: 3, step: 2 };
      return { stage: 3, step: 1 };
    }
    
    // Etapa 2 - Embarque
    if (quote.production_completed_at) {
      if (quote.shipped_at) return { stage: 2, step: 4 };
      if (quote.shipping_address_cep) return { stage: 2, step: 4 };
      if (quote.shipping_form_completed_at) return { stage: 2, step: 3 };
      if (quote.shipping_paid_at) return { stage: 2, step: 2 };
      if (quote.shipping_payment_link) return { stage: 2, step: 1 };
      return { stage: 2, step: 1 };
    }
    
    // Etapa 1 - Produção
    if (quote.production_started_at) return { stage: 1, step: 6 };
    if (quote.wants_logo !== null) return { stage: 1, step: 6 };
    if (quote.production_paid_at) return { stage: 1, step: 5 };
    if (quote.contract_signed_at) return { stage: 1, step: 4 };
    if (quote.quote_approved_at) return { stage: 1, step: 3 };
    if (quote.quote_pdf_url) return { stage: 1, step: 2 };
    return { stage: 1, step: 1 };
  };

  const handleApproveQuote = async (quoteId: string) => {
    setActionLoading('approve');
    try {
      const { error } = await supabase
        .from('quotes')
        .update({ quote_approved_at: new Date().toISOString() })
        .eq('id', quoteId);
      if (error) throw error;
      await fetchQuotes();
    } catch (error) {
      console.error('Erro ao aprovar orçamento:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleConfirmContract = async (quoteId: string) => {
    setActionLoading('contract');
    try {
      const { error } = await supabase
        .from('quotes')
        .update({ contract_signed_at: new Date().toISOString() })
        .eq('id', quoteId);
      if (error) throw error;
      await fetchQuotes();
    } catch (error) {
      console.error('Erro ao confirmar contrato:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleConfirmPayment = async (quoteId: string, field: 'production_paid_at' | 'shipping_paid_at') => {
    setActionLoading(field);
    try {
      const { error } = await supabase
        .from('quotes')
        .update({ [field]: new Date().toISOString() })
        .eq('id', quoteId);
      if (error) throw error;
      await fetchQuotes();
    } catch (error) {
      console.error('Erro ao confirmar pagamento:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleLogoChoice = async (quoteId: string, wantsLogo: boolean) => {
    setActionLoading(wantsLogo ? 'logo_yes' : 'logo_no');
    try {
      const { error } = await supabase
        .from('quotes')
        .update({ wants_logo: wantsLogo })
        .eq('id', quoteId);
      if (error) throw error;
      await fetchQuotes();
    } catch (error) {
      console.error('Erro ao salvar escolha de logo:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleConfirmForm = async (quoteId: string) => {
    setActionLoading('form');
    try {
      const { error } = await supabase
        .from('quotes')
        .update({ shipping_form_completed_at: new Date().toISOString() })
        .eq('id', quoteId);
      if (error) throw error;
      await fetchQuotes();
    } catch (error) {
      console.error('Erro ao confirmar formulário:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleSaveAddress = async (quoteId: string) => {
    if (!addressData.cep || !addressData.street || !addressData.number || !addressData.city || !addressData.state) {
      alert('Preencha todos os campos obrigatórios');
      return;
    }
    
    setSavingAddress(true);
    try {
      const { error } = await supabase
        .from('quotes')
        .update({
          shipping_address_cep: addressData.cep,
          shipping_address_street: addressData.street,
          shipping_address_number: addressData.number,
          shipping_address_complement: addressData.complement,
          shipping_address_neighborhood: addressData.neighborhood,
          shipping_address_city: addressData.city,
          shipping_address_state: addressData.state
        })
        .eq('id', quoteId);
      if (error) throw error;
      setShowAddressForm(false);
      setAddressData({ cep: '', street: '', number: '', complement: '', neighborhood: '', city: '', state: '' });
      await fetchQuotes();
    } catch (error) {
      console.error('Erro ao salvar endereço:', error);
    } finally {
      setSavingAddress(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const getOrderNumber = (id: string) => {
    return id.substring(0, 8).toUpperCase();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Helper to render links for completed steps (read-only, just for viewing)
  const renderCompletedStepLinks = (quote: Quote, stageId: number, stepId: number) => {
    // Stage 1 - Produção
    if (stageId === 1) {
      if (stepId === 2 && quote.quote_pdf_url && quote.quote_approved_at) {
        return (
          <div className="mt-3">
            <a
              href={quote.quote_pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-sm hover:bg-green-200"
            >
              <FileText className="w-4 h-4" />
              Ver Orçamento Aprovado
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        );
      }
      if (stepId === 3 && quote.contract_link && quote.contract_signed_at) {
        return (
          <div className="mt-3">
            <a
              href={quote.contract_link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-sm hover:bg-green-200"
            >
              <FileSignature className="w-4 h-4" />
              Ver Contrato Assinado
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        );
      }
      if (stepId === 4 && quote.production_payment_link && quote.production_paid_at) {
        return (
          <div className="mt-3">
            <a
              href={quote.production_payment_link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-sm hover:bg-green-200"
            >
              <CreditCard className="w-4 h-4" />
              Comprovante de Pagamento
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        );
      }
      if (stepId === 5 && quote.wants_logo !== null) {
        return (
          <div className="mt-3 flex items-center gap-2 text-sm text-green-600 bg-green-50 px-3 py-2 rounded-lg">
            <Palette className="w-4 h-4" />
            <span>{quote.wants_logo ? 'Logo personalizada confirmada' : 'Sem logo personalizada'}</span>
          </div>
        );
      }
    }

    // Stage 2 - Embarque  
    if (stageId === 2) {
      if (stepId === 1 && quote.shipping_payment_link && quote.shipping_paid_at) {
        return (
          <div className="mt-3">
            <a
              href={quote.shipping_payment_link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-sm hover:bg-green-200"
            >
              <CreditCard className="w-4 h-4" />
              Comprovante do Embarque
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        );
      }
      if (stepId === 2 && quote.shipping_form_link && quote.shipping_form_completed_at) {
        return (
          <div className="mt-3">
            <a
              href={quote.shipping_form_link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-sm hover:bg-green-200"
            >
              <ClipboardList className="w-4 h-4" />
              Formulário Preenchido
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        );
      }
      if (stepId === 3 && quote.shipping_address_cep) {
        return (
          <div className="mt-3 text-sm text-green-600 bg-green-50 px-3 py-2 rounded-lg">
            <div className="flex items-center gap-2 font-medium mb-1">
              <MapPin className="w-4 h-4" />
              Endereço Confirmado
            </div>
            <p className="text-xs text-green-700/80">
              {quote.shipping_address_street}, {quote.shipping_address_number}
              {quote.shipping_address_complement && ` - ${quote.shipping_address_complement}`}
              <br />
              {quote.shipping_address_neighborhood} - {quote.shipping_address_city}/{quote.shipping_address_state}
              <br />
              CEP: {quote.shipping_address_cep}
            </p>
          </div>
        );
      }
    }

    return null;
  };

  const renderStepActions = (quote: Quote, stageId: number, stepId: number) => {
    const progress = getCurrentStepForQuote(quote);
    const isCurrentStep = progress.stage === stageId && progress.step === stepId;
    const isCompletedStep = progress.stage > stageId || (progress.stage === stageId && progress.step > stepId);
    
    // For completed steps, show the links in read-only mode
    if (isCompletedStep) {
      return renderCompletedStepLinks(quote, stageId, stepId);
    }
    
    if (!isCurrentStep) return null;

    // Stage 1 - Produção
    if (stageId === 1) {
      if (stepId === 1) {
        return (
          <div className="mt-3 flex items-center gap-2 text-sm text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
            <Clock className="w-4 h-4 flex-shrink-0" />
            <span>Aguardando nossa equipe enviar o orçamento (até 24h)</span>
          </div>
        );
      }
      if (stepId === 2) {
        if (!quote.quote_pdf_url) {
          return (
            <div className="mt-3 flex items-center gap-2 text-sm text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
              <Clock className="w-4 h-4 flex-shrink-0" />
              <span>Aguardando o admin inserir o link do orçamento</span>
            </div>
          );
        }
        return (
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={quote.quote_pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/90 text-sm"
            >
              <FileText className="w-4 h-4" />
              Ver Orçamento
              <ExternalLink className="w-3 h-3" />
            </a>
            <button
              onClick={() => handleApproveQuote(quote.id)}
              disabled={actionLoading === 'approve'}
              className="inline-flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 text-sm disabled:opacity-50"
            >
              {actionLoading === 'approve' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              Aprovar
            </button>
          </div>
        );
      }
      if (stepId === 3) {
        if (!quote.contract_link) {
          return (
            <div className="mt-3 flex items-center gap-2 text-sm text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
              <Clock className="w-4 h-4 flex-shrink-0" />
              <span>Aguardando o admin inserir o link do contrato</span>
            </div>
          );
        }
        return (
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={quote.contract_link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/90 text-sm"
            >
              <FileSignature className="w-4 h-4" />
              Assinar Contrato
              <ExternalLink className="w-3 h-3" />
            </a>
            <button
              onClick={() => handleConfirmContract(quote.id)}
              disabled={actionLoading === 'contract'}
              className="inline-flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 text-sm disabled:opacity-50"
            >
              {actionLoading === 'contract' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              Já Assinei
            </button>
          </div>
        );
      }
      if (stepId === 4) {
        if (!quote.production_payment_link) {
          return (
            <div className="mt-3 flex items-center gap-2 text-sm text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
              <Clock className="w-4 h-4 flex-shrink-0" />
              <span>Aguardando o admin inserir o link de pagamento</span>
            </div>
          );
        }
        return (
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={quote.production_payment_link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/90 text-sm"
            >
              <CreditCard className="w-4 h-4" />
              Pagar Produção
              <ExternalLink className="w-3 h-3" />
            </a>
            <button
              onClick={() => handleConfirmPayment(quote.id, 'production_paid_at')}
              disabled={actionLoading === 'production_paid_at'}
              className="inline-flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 text-sm disabled:opacity-50"
            >
              {actionLoading === 'production_paid_at' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              Já Paguei
            </button>
          </div>
        );
      }
      if (stepId === 5) {
        return (
          <div className="mt-3">
            <p className="text-sm text-foreground mb-2">Deseja personalizar com sua logo?</p>
            <div className="flex gap-2">
              <button
                onClick={() => handleLogoChoice(quote.id, true)}
                disabled={actionLoading === 'logo_yes' || actionLoading === 'logo_no'}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm disabled:opacity-50"
              >
                {actionLoading === 'logo_yes' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Palette className="w-4 h-4" />
                )}
                Sim
              </button>
              <button
                onClick={() => handleLogoChoice(quote.id, false)}
                disabled={actionLoading === 'logo_yes' || actionLoading === 'logo_no'}
                className="inline-flex items-center gap-2 px-4 py-2 bg-muted text-foreground rounded-lg hover:bg-muted/80 text-sm disabled:opacity-50"
              >
                {actionLoading === 'logo_no' && <Loader2 className="w-4 h-4 animate-spin" />}
                Não
              </button>
            </div>
          </div>
        );
      }
      if (stepId === 6) {
        return (
          <div className="mt-3 flex items-center gap-2 text-sm text-primary bg-primary/10 px-3 py-2 rounded-lg">
            <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
            <span>Produção em andamento...</span>
          </div>
        );
      }
    }

    // Stage 2 - Embarque
    if (stageId === 2) {
      if (stepId === 1) {
        if (!quote.shipping_payment_link) {
          return (
            <div className="mt-3 flex items-center gap-2 text-sm text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
              <Clock className="w-4 h-4 flex-shrink-0" />
              <span>Aguardando o admin inserir o link de pagamento do embarque</span>
            </div>
          );
        }
        return (
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={quote.shipping_payment_link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/90 text-sm"
            >
              <CreditCard className="w-4 h-4" />
              Pagar Embarque
              <ExternalLink className="w-3 h-3" />
            </a>
            <button
              onClick={() => handleConfirmPayment(quote.id, 'shipping_paid_at')}
              disabled={actionLoading === 'shipping_paid_at'}
              className="inline-flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 text-sm disabled:opacity-50"
            >
              {actionLoading === 'shipping_paid_at' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              Já Paguei
            </button>
          </div>
        );
      }
      if (stepId === 2) {
        if (!quote.shipping_form_link) {
          return (
            <div className="mt-3 flex items-center gap-2 text-sm text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
              <Clock className="w-4 h-4 flex-shrink-0" />
              <span>Aguardando o admin inserir o link do formulário</span>
            </div>
          );
        }
        return (
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={quote.shipping_form_link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/90 text-sm"
            >
              <ClipboardList className="w-4 h-4" />
              Preencher Formulário
              <ExternalLink className="w-3 h-3" />
            </a>
            <button
              onClick={() => handleConfirmForm(quote.id)}
              disabled={actionLoading === 'form'}
              className="inline-flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 text-sm disabled:opacity-50"
            >
              {actionLoading === 'form' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              Já Preenchi
            </button>
          </div>
        );
      }
      if (stepId === 3) {
        return (
          <div className="mt-3">
            <button
              onClick={() => setShowAddressForm(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm"
            >
              <MapPin className="w-4 h-4" />
              Informar Endereço
            </button>
          </div>
        );
      }
      if (stepId === 4) {
        return (
          <div className="mt-3 flex items-center gap-2 text-sm text-primary bg-primary/10 px-3 py-2 rounded-lg">
            <Ship className="w-4 h-4 flex-shrink-0" />
            <span>Carga em trânsito...</span>
          </div>
        );
      }
    }

    // Stage 3 - Entrega
    if (stageId === 3) {
      if (stepId === 1) {
        return (
          <div className="mt-3 flex items-center gap-2 text-sm text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
            <FileCheck className="w-4 h-4 flex-shrink-0" />
            <span>Processo de desembaraço em andamento...</span>
          </div>
        );
      }
      if (stepId === 3) {
        return (
          <div className="mt-3 flex items-center gap-2 text-sm text-primary bg-primary/10 px-3 py-2 rounded-lg">
            <Truck className="w-4 h-4 flex-shrink-0" />
            <span>Em transporte para seu endereço...</span>
          </div>
        );
      }
    }

    return null;
  };

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="bg-tech-dark border-b border-tech-navy sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16">
            <a href="/" className="flex items-center">
              <img src={logo} alt="Ledbras" className="h-6 sm:h-8" />
            </a>
            <button
              onClick={() => navigate('/dashboard')}
              className="flex items-center gap-1 sm:gap-2 text-gray-400 hover:text-white transition-colors text-sm"
            >
              <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="hidden xs:inline sm:inline">Voltar</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
        {quotes.length === 0 ? (
          <div className="bg-background border border-border rounded-2xl p-8 sm:p-12 text-center">
            <AlertCircle className="w-12 h-12 sm:w-16 sm:h-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg sm:text-xl font-semibold text-foreground mb-2">Nenhum pedido encontrado</h3>
            <p className="text-muted-foreground mb-6 text-sm sm:text-base">
              Você ainda não solicitou nenhum orçamento.
            </p>
            <button
              onClick={() => navigate('/dashboard/quote')}
              className="px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            >
              Solicitar Orçamento
            </button>
          </div>
        ) : (
          <div className="space-y-4 sm:space-y-6">
            {/* Seletor de Pedido (quando há múltiplos) */}
            {quotes.length > 1 && (
              <div className="bg-background border border-border rounded-xl p-3 sm:p-4">
                <label className="block text-xs sm:text-sm font-medium text-foreground mb-2">
                  Selecione o Pedido:
                </label>
                <div className="flex flex-wrap gap-1.5 sm:gap-2">
                  {quotes.map((quote) => {
                    const progress = getCurrentStepForQuote(quote);
                    const isSelected = selectedQuote?.id === quote.id;
                    
                    return (
                      <button
                        key={quote.id}
                        onClick={() => {
                          setSelectedQuote(quote);
                          setActiveStageTab(progress.stage);
                        }}
                        className={`px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                          isSelected 
                            ? 'bg-primary text-primary-foreground' 
                            : 'bg-muted text-foreground hover:bg-muted/80'
                        }`}
                      >
                        <div className="flex flex-col items-start gap-0.5">
                          <span className="flex items-center gap-1 sm:gap-2">
                            <Hash className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                            {getOrderNumber(quote.id)}
                          </span>
                          <span className="text-[10px] sm:text-xs opacity-80 capitalize">
                            {quote.cabinet_quantity}x {quote.pitch} • {quote.product_type}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {selectedQuote && (
              <>
                {/* Header do Pedido */}
                <div className="bg-background border border-border rounded-xl p-3 sm:p-6">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                    <div>
                      <div className="flex items-center gap-1.5 sm:gap-2 mb-0.5 sm:mb-1">
                        <Package className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                        <span className="text-xs sm:text-sm text-muted-foreground">Pedido</span>
                        <span className="font-mono font-bold text-foreground text-sm sm:text-base">
                          #{getOrderNumber(selectedQuote.id)}
                        </span>
                      </div>
                      <p className="text-xs sm:text-sm text-muted-foreground">
                        <span className="font-medium text-foreground capitalize">{selectedQuote.product_type}</span>
                        {' • '}{selectedQuote.pitch}
                        {' • '}{selectedQuote.cabinet_quantity} gabinetes ({selectedQuote.cabinet_layout})
                      </p>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Solicitado em {formatDate(selectedQuote.created_at)}
                    </div>
                  </div>
                </div>

                {/* Tabs das 3 Etapas - Horizontais */}
                <div className="bg-background border border-border rounded-xl overflow-hidden">
                  {/* Tab Headers */}
                  <div className="flex border-b border-border">
                    {stages.map((stage) => {
                      const progress = getCurrentStepForQuote(selectedQuote);
                      const isCurrentStage = progress.stage === stage.id;
                      const isCompletedStage = progress.stage > stage.id;
                      const isActive = activeStageTab === stage.id;
                      const StageIcon = stage.icon;

                      return (
                        <button
                          key={stage.id}
                          onClick={() => setActiveStageTab(stage.id)}
                          className={`flex-1 py-3 sm:py-4 px-2 sm:px-4 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-3 transition-all border-b-2 ${
                            isActive 
                              ? 'border-primary bg-primary/5' 
                              : 'border-transparent hover:bg-muted/50'
                          }`}
                        >
                          <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center ${
                            isCompletedStage 
                              ? 'bg-green-500' 
                              : isCurrentStage 
                                ? stage.bgColor 
                                : 'bg-muted'
                          }`}>
                            {isCompletedStage ? (
                              <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                            ) : (
                              <StageIcon className={`w-4 h-4 sm:w-5 sm:h-5 ${isCurrentStage ? 'text-white' : 'text-muted-foreground'}`} />
                            )}
                          </div>
                          <div className="text-center sm:text-left">
                            <div className={`text-xs sm:text-sm font-medium ${
                              isActive ? 'text-primary' : 'text-foreground'
                            }`}>
                              {stage.title}
                            </div>
                            <div className="hidden sm:block text-xs text-muted-foreground">
                              {isCompletedStage ? 'Concluída' : isCurrentStage ? 'Em andamento' : stage.duration}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Tab Content - Steps */}
                  <div className="p-4 sm:p-6">
                    {(() => {
                      const currentStage = stages.find(s => s.id === activeStageTab)!;
                      const stageSteps = getStepsForStage(activeStageTab);
                      const progress = getCurrentStepForQuote(selectedQuote);
                      const isCurrentStage = progress.stage === activeStageTab;
                      const isCompletedStage = progress.stage > activeStageTab;
                      const isFutureStage = progress.stage < activeStageTab;

                      return (
                        <div>
                          {/* Stage Info */}
                          <div className="flex items-center gap-3 mb-6">
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br ${currentStage.color}`}>
                              <currentStage.icon className="w-6 h-6 text-white" />
                            </div>
                            <div>
                              <h3 className="font-bold text-foreground">{currentStage.title}</h3>
                              <p className="text-sm text-muted-foreground">
                                {isCompletedStage 
                                  ? '✓ Etapa concluída' 
                                  : isCurrentStage 
                                    ? 'Etapa atual em andamento' 
                                    : `Próxima etapa (${currentStage.duration})`
                                }
                              </p>
                            </div>
                          </div>

                          {isFutureStage && (
                            <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 px-4 py-3 rounded-lg">
                              <Info className="w-4 h-4 flex-shrink-0" />
                              <span>Esta etapa será liberada após a conclusão da etapa anterior.</span>
                            </div>
                          )}

                          {/* Steps */}
                          <div className={`space-y-3 ${isFutureStage ? 'opacity-60' : ''}`}>
                            {stageSteps.map((step) => {
                              const isCurrentStep = isCurrentStage && progress.step === step.id;
                              const isCompletedStep = isCompletedStage || (isCurrentStage && progress.step > step.id);
                              const StepIcon = step.icon;

                              return (
                                <div 
                                  key={step.id} 
                                  className={`p-4 rounded-xl transition-all ${
                                    isCurrentStep 
                                      ? 'bg-primary/10 border-2 border-primary' 
                                      : isCompletedStep 
                                        ? 'bg-green-50 border border-green-200' 
                                        : 'bg-muted/30 border border-transparent'
                                  }`}
                                >
                                  <div className="flex items-start gap-3">
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                      isCompletedStep 
                                        ? 'bg-green-500 text-white' 
                                        : isCurrentStep 
                                          ? 'bg-primary text-white' 
                                          : 'bg-muted text-muted-foreground'
                                    }`}>
                                      {isCompletedStep ? (
                                        <CheckCircle2 className="w-4 h-4" />
                                      ) : (
                                        <StepIcon className="w-4 h-4" />
                                      )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <h4 className={`font-medium text-sm ${
                                        isCurrentStep ? 'text-primary' : isCompletedStep ? 'text-green-700' : 'text-foreground'
                                      }`}>
                                        {step.title}
                                      </h4>
                                      <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
                                      
                                      {renderStepActions(selectedQuote, activeStageTab, step.id)}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Address Form Modal */}
        {showAddressForm && selectedQuote && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-background rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
              <h3 className="text-lg font-bold text-foreground mb-4">Endereço de Entrega</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">CEP *</label>
                  <input
                    type="text"
                    value={addressData.cep}
                    onChange={(e) => setAddressData({ ...addressData, cep: e.target.value })}
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground"
                    placeholder="00000-000"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Estado *</label>
                  <input
                    type="text"
                    value={addressData.state}
                    onChange={(e) => setAddressData({ ...addressData, state: e.target.value })}
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground"
                    placeholder="SP"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-foreground mb-1">Rua *</label>
                  <input
                    type="text"
                    value={addressData.street}
                    onChange={(e) => setAddressData({ ...addressData, street: e.target.value })}
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Número *</label>
                  <input
                    type="text"
                    value={addressData.number}
                    onChange={(e) => setAddressData({ ...addressData, number: e.target.value })}
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Complemento</label>
                  <input
                    type="text"
                    value={addressData.complement}
                    onChange={(e) => setAddressData({ ...addressData, complement: e.target.value })}
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Bairro</label>
                  <input
                    type="text"
                    value={addressData.neighborhood}
                    onChange={(e) => setAddressData({ ...addressData, neighborhood: e.target.value })}
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Cidade *</label>
                  <input
                    type="text"
                    value={addressData.city}
                    onChange={(e) => setAddressData({ ...addressData, city: e.target.value })}
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground"
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowAddressForm(false)}
                  className="flex-1 px-4 py-2 border border-border text-foreground rounded-lg hover:bg-muted"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => handleSaveAddress(selectedQuote.id)}
                  disabled={savingAddress}
                  className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {savingAddress && <Loader2 className="w-4 h-4 animate-spin" />}
                  Salvar Endereço
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
