import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../integrations/supabase/client';
import { 
  ArrowLeft,
  Plus,
  Pencil,
  Trash2,
  Save,
  X,
  Image as ImageIcon,
  Package,
  Users,
  FileText,
  AlertCircle,
  Loader2,
  Hash,
  Clock,
  CheckCircle2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  FolderOpen,
  Smartphone,
  Monitor,
  Layout,
  Send,
  Link2
} from 'lucide-react';
import logo from '../assets/Logo Ledbras Branco.png';
import { ImageGalleryModal } from '../components/ImageGalleryModal';
import { resolveImageUrl, isLocalAsset } from '../utils/assetResolver';

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

interface Product {
  id: string;
  name: string;
  product_type: string;
  pitch: string;
  description: string | null;
  image_url: string | null;
  is_active: boolean;
  created_at: string;
}

interface Profile {
  id: string;
  user_id: string;
  full_name: string;
  company_name: string | null;
  document_type: string;
  document_number: string;
  phone: string | null;
  email: string | null;
  is_admin: boolean;
  created_at: string;
}

interface Quote {
  id: string;
  user_id: string;
  product_type: string;
  pitch: string;
  cabinet_quantity: number;
  purpose: string;
  pcb_type: string;
  cabinet_layout: string;
  delivery_cep: string;
  delivery_city: string | null;
  delivery_state: string | null;
  status: string;
  created_at: string;
  quote_pdf_url: string | null;
  quote_approved_at: string | null;
  contract_link: string | null;
  contract_signed_at: string | null;
  production_payment_link: string | null;
  production_paid_at: string | null;
  wants_logo: boolean | null;
  production_started_at: string | null;
  production_completed_at: string | null;
  shipping_payment_link: string | null;
  shipping_paid_at: string | null;
  shipping_form_link: string | null;
  shipping_form_completed_at: string | null;
  shipped_at: string | null;
  arrived_port_at: string | null;
  customs_started_at: string | null;
  customs_cleared_at: string | null;
  delivered_at: string | null;
  admin_notes: string | null;
  profiles?: Profile;
  email?: string;
}

interface WebhookSettings {
  url: string;
  enabled: boolean;
}

type Tab = 'products' | 'users' | 'quotes' | 'banners' | 'categories' | 'gallery' | 'questionnaire' | 'integrations';

interface CategorySettings {
  [key: string]: {
    image_url: string;
    visible: boolean;
    is_main: boolean;
    order: number;
  };
}

interface GalleryImage {
  id: string;
  name: string;
  url: string;
  category: string;
  is_active: boolean;
  order_position: number;
  created_at: string;
}

interface QuoteQuestion {
  id: string;
  question: string;
  option_a: string;
  option_b: string;
  is_active: boolean;
  order_position: number;
  created_at: string;
}

export function AdminPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('products');
  const [products, setProducts] = useState<Product[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Product editing state
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [showProductForm, setShowProductForm] = useState(false);
  const [productForm, setProductForm] = useState({
    name: '',
    product_type: 'outdoor',
    pitch: 'P5',
    description: '',
    image_url: '',
    is_active: true,
  });
  const [saving, setSaving] = useState(false);
  const [showImageGallery, setShowImageGallery] = useState(false);

  // Quote editing state
  const [expandedQuote, setExpandedQuote] = useState<string | null>(null);
  const [quoteForm, setQuoteForm] = useState<{[key: string]: string}>({});
  const [savingField, setSavingField] = useState<string | null>(null);
  const [togglingAdmin, setTogglingAdmin] = useState<string | null>(null);
  const [markingStep, setMarkingStep] = useState<string | null>(null);

  // Banner state
  const [bannerSettings, setBannerSettings] = useState<BannerSettings>({
    desktop: { image_url: '', link: '', enabled: true },
    mobile: { image_url: '', link: '', enabled: true },
  });
  const [savingBanners, setSavingBanners] = useState(false);
  const [showBannerDesktopGallery, setShowBannerDesktopGallery] = useState(false);
  const [showBannerMobileGallery, setShowBannerMobileGallery] = useState(false);

  // Category settings state
  const [categorySettings, setCategorySettings] = useState<CategorySettings>({
    outdoor: { image_url: '', visible: true, is_main: true, order: 1 },
    rental: { image_url: '', visible: true, is_main: true, order: 2 },
    indoor: { image_url: '', visible: true, is_main: false, order: 3 },
  });
  const [savingCategories, setSavingCategories] = useState(false);
  const [showCategoryImageGallery, setShowCategoryImageGallery] = useState<string | null>(null);

  // Gallery state
  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([]);
  const [loadingGallery, setLoadingGallery] = useState(false);
  const [uploadingGallery, setUploadingGallery] = useState(false);
  const [deletingGalleryImage, setDeletingGalleryImage] = useState<string | null>(null);

  // Questionnaire state
  const [quoteQuestions, setQuoteQuestions] = useState<QuoteQuestion[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [showQuestionForm, setShowQuestionForm] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<QuoteQuestion | null>(null);
  const [questionForm, setQuestionForm] = useState({
    question: '',
    option_a: '',
    option_b: '',
    is_active: true,
    order_position: 1,
  });
  const [savingQuestion, setSavingQuestion] = useState(false);
  const [deletingQuestion, setDeletingQuestion] = useState<string | null>(null);

  // Webhook/Integration state
  const [webhookSettings, setWebhookSettings] = useState<WebhookSettings>({ url: '', enabled: true });
  const [savingWebhook, setSavingWebhook] = useState(false);
  const [sendingEmail, setSendingEmail] = useState<string | null>(null);

  // Initialize quote form values when quotes load or expand
  useEffect(() => {
    if (expandedQuote) {
      const quote = quotes.find(q => q.id === expandedQuote);
      if (quote) {
        setQuoteForm(prev => ({
          ...prev,
          [`${quote.id}_quote_pdf_url`]: quote.quote_pdf_url || '',
          [`${quote.id}_contract_link`]: quote.contract_link || '',
          [`${quote.id}_production_payment_link`]: quote.production_payment_link || '',
          [`${quote.id}_shipping_payment_link`]: quote.shipping_payment_link || '',
          [`${quote.id}_shipping_form_link`]: quote.shipping_form_link || '',
          [`${quote.id}_admin_notes`]: quote.admin_notes || '',
        }));
      }
    }
  }, [expandedQuote, quotes]);

  useEffect(() => {
    if (profile && !profile.is_admin) {
      navigate('/dashboard');
      return;
    }
    fetchData();
  }, [profile, navigate]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch products
      const { data: productsData, error: productsError } = await supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (productsError) throw productsError;
      setProducts(productsData || []);

      // Fetch profiles (only for admins)
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (profilesError) throw profilesError;
      setProfiles(profilesData || []);

      // Fetch quotes with profile info
      const { data: quotesData, error: quotesError } = await supabase
        .from('quotes')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (quotesError) throw quotesError;
      setQuotes((quotesData as unknown as Quote[]) || []);

      // Fetch banner settings
      const { data: settingsData } = await supabase
        .from('site_settings')
        .select('*')
        .eq('key', 'dashboard_banners')
        .single();
      
      if (settingsData?.value) {
        setBannerSettings(settingsData.value as unknown as BannerSettings);
      }

      // Fetch category settings
      const { data: categoryData } = await supabase
        .from('site_settings')
        .select('*')
        .eq('key', 'category_settings')
        .single();
      
      if (categoryData?.value) {
        setCategorySettings(categoryData.value as unknown as CategorySettings);
      }

      // Fetch webhook settings
      const { data: webhookData } = await supabase
        .from('site_settings')
        .select('*')
        .eq('key', 'webhook_settings')
        .single();
      
      if (webhookData?.value) {
        setWebhookSettings(webhookData.value as unknown as WebhookSettings);
      }
    } catch (err) {
      console.error('Erro ao carregar dados:', err);
      setError('Erro ao carregar dados. Tente novamente.');
    }
    setLoading(false);
  };

  const handleSaveProduct = async () => {
    setSaving(true);
    try {
      if (editingProduct) {
        const { error } = await supabase
          .from('products')
          .update({
            name: productForm.name,
            product_type: productForm.product_type,
            pitch: productForm.pitch,
            description: productForm.description || null,
            image_url: productForm.image_url || null,
            is_active: productForm.is_active,
          })
          .eq('id', editingProduct.id);
        
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('products')
          .insert({
            name: productForm.name,
            product_type: productForm.product_type,
            pitch: productForm.pitch,
            description: productForm.description || null,
            image_url: productForm.image_url || null,
            is_active: productForm.is_active,
          });
        
        if (error) throw error;
      }
      
      setShowProductForm(false);
      setEditingProduct(null);
      resetProductForm();
      fetchData();
    } catch (err) {
      console.error('Erro ao salvar produto:', err);
      setError('Erro ao salvar produto. Tente novamente.');
    }
    setSaving(false);
  };

  const handleDeleteProduct = async (productId: string) => {
    if (!confirm('Tem certeza que deseja excluir este produto?')) return;
    
    try {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', productId);
      
      if (error) throw error;
      fetchData();
    } catch (err) {
      console.error('Erro ao excluir produto:', err);
      setError('Erro ao excluir produto. Tente novamente.');
    }
  };

  const handleEditProduct = (product: Product) => {
    setEditingProduct(product);
    setProductForm({
      name: product.name,
      product_type: product.product_type,
      pitch: product.pitch,
      description: product.description || '',
      image_url: product.image_url || '',
      is_active: product.is_active,
    });
    setShowProductForm(true);
  };

  const handleToggleAdmin = async (profileId: string, currentStatus: boolean) => {
    setTogglingAdmin(profileId);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_admin: !currentStatus })
        .eq('id', profileId);
      
      if (error) throw error;
      
      // Immediate UI update
      setProfiles(prev => prev.map(p => 
        p.id === profileId ? { ...p, is_admin: !currentStatus } : p
      ));
    } catch (err) {
      console.error('Erro ao atualizar status de admin:', err);
      setError('Erro ao atualizar status de admin. Tente novamente.');
    }
    setTogglingAdmin(null);
  };

  const resetProductForm = () => {
    setProductForm({
      name: '',
      product_type: 'outdoor',
      pitch: 'P5',
      description: '',
      image_url: '',
      is_active: true,
    });
  };

  const handleUpdateQuoteField = async (quoteId: string, field: string) => {
    const fieldKey = `${quoteId}_${field}`;
    const value = quoteForm[fieldKey] || null;
    
    setSavingField(fieldKey);
    try {
      const { error } = await supabase
        .from('quotes')
        .update({ [field]: value || null })
        .eq('id', quoteId);
      
      if (error) throw error;
      
      // Immediate UI update
      setQuotes(prev => prev.map(q => 
        q.id === quoteId ? { ...q, [field]: value || null } : q
      ));
    } catch (err) {
      console.error('Erro ao atualizar orçamento:', err);
      setError('Erro ao atualizar orçamento.');
    }
    setSavingField(null);
  };

  const handleMarkStep = async (quoteId: string, field: string) => {
    const stepKey = `${quoteId}_${field}`;
    setMarkingStep(stepKey);
    try {
      const timestamp = new Date().toISOString();
      const { error } = await supabase
        .from('quotes')
        .update({ [field]: timestamp })
        .eq('id', quoteId);
      
      if (error) throw error;
      
      // Immediate UI update
      setQuotes(prev => prev.map(q => 
        q.id === quoteId ? { ...q, [field]: timestamp } : q
      ));
    } catch (err) {
      console.error('Erro ao atualizar etapa:', err);
      setError('Erro ao atualizar etapa.');
    }
    setMarkingStep(null);
  };

  const getOrderNumber = (id: string) => id.substring(0, 8).toUpperCase();

  const handleSaveBanners = async () => {
    setSavingBanners(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabase
        .from('site_settings')
        .update({ value: bannerSettings as any })
        .eq('key', 'dashboard_banners');
      
      if (error) throw error;
    } catch (err) {
      console.error('Erro ao salvar banners:', err);
      setError('Erro ao salvar banners. Tente novamente.');
    }
    setSavingBanners(false);
  };

  // Category functions
  const handleSaveCategories = async () => {
    setSavingCategories(true);
    try {
      // Check if setting exists
      const { data: existingData } = await supabase
        .from('site_settings')
        .select('id')
        .eq('key', 'category_settings')
        .single();

      if (existingData) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await supabase
          .from('site_settings')
          .update({ value: categorySettings as any })
          .eq('key', 'category_settings');
        if (error) throw error;
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await supabase
          .from('site_settings')
          .insert({ key: 'category_settings', value: categorySettings as any });
        if (error) throw error;
      }
    } catch (err) {
      console.error('Erro ao salvar categorias:', err);
      setError('Erro ao salvar categorias. Tente novamente.');
    }
    setSavingCategories(false);
  };

  // Gallery functions
  const fetchGalleryImages = async () => {
    setLoadingGallery(true);
    try {
      const { data, error } = await supabase
        .from('gallery_images')
        .select('*')
        .order('order_position', { ascending: true });

      if (error) throw error;
      setGalleryImages(data as GalleryImage[] || []);
    } catch (error) {
      console.error('Erro ao carregar galeria:', error);
    } finally {
      setLoadingGallery(false);
    }
  };

  const handleGalleryUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploadingGallery(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        if (!file.type.startsWith('image/')) continue;
        if (file.size > 5 * 1024 * 1024) continue;

        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

        // Upload to storage
        const { error: uploadError } = await supabase.storage
          .from('product-images')
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        // Get the public URL
        const url = supabase.storage.from('product-images').getPublicUrl(fileName).data.publicUrl;

        // Get max order position
        const maxOrder = galleryImages.length > 0 
          ? Math.max(...galleryImages.map(img => img.order_position)) + 1 
          : 0;

        // Insert into database
        const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
        await supabase
          .from('gallery_images')
          .insert({
            name: cleanName,
            url,
            category: 'general',
            order_position: maxOrder + i,
          });
      }
      await fetchGalleryImages();
    } catch (error) {
      console.error('Erro ao fazer upload:', error);
      setError('Erro ao fazer upload das imagens.');
    } finally {
      setUploadingGallery(false);
      event.target.value = '';
    }
  };

  const handleDeleteGalleryImage = async (image: GalleryImage) => {
    if (!confirm(`Tem certeza que deseja excluir "${image.name}"?`)) return;

    setDeletingGalleryImage(image.id);
    try {
      // Extract filename from URL and delete from storage if it's in our bucket
      if (image.url.includes('product-images')) {
        const urlParts = image.url.split('/');
        const fileName = urlParts[urlParts.length - 1];
        await supabase.storage
          .from('product-images')
          .remove([fileName]);
      }

      // Delete from database
      const { error } = await supabase
        .from('gallery_images')
        .delete()
        .eq('id', image.id);

      if (error) throw error;
      await fetchGalleryImages();
    } catch (error) {
      console.error('Erro ao excluir:', error);
      setError('Erro ao excluir a imagem.');
    } finally {
      setDeletingGalleryImage(null);
    }
  };

  // Fetch gallery when tab changes
  useEffect(() => {
    if (activeTab === 'gallery') {
      fetchGalleryImages();
    }
    if (activeTab === 'questionnaire') {
      fetchQuoteQuestions();
    }
  }, [activeTab]);

  // Questionnaire functions
  const fetchQuoteQuestions = async () => {
    setLoadingQuestions(true);
    try {
      const { data, error } = await supabase
        .from('quote_questions')
        .select('*')
        .order('order_position', { ascending: true });
      
      if (error) throw error;
      setQuoteQuestions(data || []);
    } catch (error) {
      console.error('Erro ao carregar perguntas:', error);
      setError('Erro ao carregar perguntas.');
    } finally {
      setLoadingQuestions(false);
    }
  };

  const handleSaveQuestion = async () => {
    if (!questionForm.question || !questionForm.option_a || !questionForm.option_b) {
      setError('Preencha todos os campos da pergunta.');
      return;
    }

    setSavingQuestion(true);
    try {
      if (editingQuestion) {
        const { error } = await supabase
          .from('quote_questions')
          .update({
            question: questionForm.question,
            option_a: questionForm.option_a,
            option_b: questionForm.option_b,
            is_active: questionForm.is_active,
            order_position: questionForm.order_position,
          })
          .eq('id', editingQuestion.id);
        
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('quote_questions')
          .insert({
            question: questionForm.question,
            option_a: questionForm.option_a,
            option_b: questionForm.option_b,
            is_active: questionForm.is_active,
            order_position: questionForm.order_position,
          });
        
        if (error) throw error;
      }
      
      setShowQuestionForm(false);
      setEditingQuestion(null);
      resetQuestionForm();
      await fetchQuoteQuestions();
    } catch (error) {
      console.error('Erro ao salvar pergunta:', error);
      setError('Erro ao salvar pergunta.');
    } finally {
      setSavingQuestion(false);
    }
  };

  const handleDeleteQuestion = async (questionId: string) => {
    if (!confirm('Tem certeza que deseja excluir esta pergunta?')) return;
    
    setDeletingQuestion(questionId);
    try {
      const { error } = await supabase
        .from('quote_questions')
        .delete()
        .eq('id', questionId);
      
      if (error) throw error;
      await fetchQuoteQuestions();
    } catch (error) {
      console.error('Erro ao excluir pergunta:', error);
      setError('Erro ao excluir pergunta.');
    } finally {
      setDeletingQuestion(null);
    }
  };

  const handleEditQuestion = (question: QuoteQuestion) => {
    setEditingQuestion(question);
    setQuestionForm({
      question: question.question,
      option_a: question.option_a,
      option_b: question.option_b,
      is_active: question.is_active,
      order_position: question.order_position,
    });
    setShowQuestionForm(true);
  };

  const resetQuestionForm = () => {
    setQuestionForm({
      question: '',
      option_a: '',
      option_b: '',
      is_active: true,
      order_position: quoteQuestions.length + 1,
    });
  };

  const getProfileForQuote = (userId: string) => {
    return profiles.find(p => p.user_id === userId);
  };

  // Webhook functions
  const handleSaveWebhook = async () => {
    setSavingWebhook(true);
    try {
      // Check if setting exists
      const { data: existingData } = await supabase
        .from('site_settings')
        .select('id')
        .eq('key', 'webhook_settings')
        .single();

      if (existingData) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await supabase
          .from('site_settings')
          .update({ value: webhookSettings as any })
          .eq('key', 'webhook_settings');
        if (error) throw error;
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await supabase
          .from('site_settings')
          .insert({ key: 'webhook_settings', value: webhookSettings as any });
        if (error) throw error;
      }
    } catch (err) {
      console.error('Erro ao salvar webhook:', err);
      setError('Erro ao salvar configurações de webhook.');
    }
    setSavingWebhook(false);
  };

  const handleSendEmailWebhook = async (quote: Quote) => {
    if (!webhookSettings.url || !webhookSettings.enabled) {
      setError('Configure o webhook de email na aba Integrações antes de enviar.');
      return;
    }

    const clientProfile = getProfileForQuote(quote.user_id);
    if (!clientProfile) {
      setError('Dados do cliente não encontrados.');
      return;
    }

    // Get email from profile (now stored in profiles table)
    const email = clientProfile.email || '';
    
    setSendingEmail(quote.id);
    try {
      const payload = {
        nome: clientProfile.full_name,
        whatsapp: clientProfile.phone || '',
        cidade: quote.delivery_city || '',
        estado: quote.delivery_state || '',
        email: email,
        quote_id: quote.id,
        product_type: quote.product_type,
        pitch: quote.pitch,
        cabinet_quantity: quote.cabinet_quantity,
      };

      const response = await fetch(webhookSettings.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Webhook retornou status ${response.status}`);
      }

      alert('Email enviado com sucesso!');
    } catch (err) {
      console.error('Erro ao enviar webhook:', err);
      setError('Erro ao enviar email. Verifique a URL do webhook.');
    }
    setSendingEmail(null);
  };

  const getQuoteStage = (quote: Quote): { stage: number; step: number; label: string } => {
    if (quote.delivered_at) return { stage: 3, step: 4, label: 'Entregue' };
    if (quote.customs_cleared_at) return { stage: 3, step: 3, label: 'Liberado' };
    if (quote.customs_started_at) return { stage: 3, step: 2, label: 'Desembaraço' };
    if (quote.arrived_port_at) return { stage: 3, step: 1, label: 'No Porto' };
    if (quote.shipped_at) return { stage: 2, step: 4, label: 'Embarcado' };
    if (quote.production_completed_at) return { stage: 2, step: 1, label: 'Pronto p/ Embarque' };
    if (quote.production_started_at) return { stage: 1, step: 6, label: 'Em Produção' };
    if (quote.wants_logo !== null) return { stage: 1, step: 5, label: 'Logo Definido' };
    if (quote.production_paid_at) return { stage: 1, step: 4, label: 'Produção Paga' };
    if (quote.contract_signed_at) return { stage: 1, step: 3, label: 'Contrato Assinado' };
    if (quote.quote_approved_at) return { stage: 1, step: 2, label: 'Orçamento Aprovado' };
    if (quote.quote_pdf_url) return { stage: 1, step: 1, label: 'Aguardando Aprovação' };
    return { stage: 1, step: 0, label: 'Aguardando Orçamento' };
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="bg-tech-dark border-b border-tech-navy sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <a href="/" className="flex items-center">
                <img src={logo} alt="Ledbras" className="h-8" />
              </a>
              <span className="px-2 py-1 bg-primary/20 text-primary text-xs font-medium rounded">
                Admin
              </span>
            </div>
            <button
              onClick={() => navigate('/dashboard')}
              className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm hidden sm:inline">Voltar ao Dashboard</span>
            </button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-background border-b border-border sticky top-16 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex gap-8">
            <button
              onClick={() => setActiveTab('products')}
              className={`py-4 border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === 'products'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Package className="w-4 h-4" />
              Produtos
            </button>
            <button
              onClick={() => setActiveTab('users')}
              className={`py-4 border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === 'users'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Users className="w-4 h-4" />
              Usuários
            </button>
            <button
              onClick={() => setActiveTab('quotes')}
              className={`py-4 border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === 'quotes'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <FileText className="w-4 h-4" />
              Orçamentos
              {quotes.length > 0 && (
                <span className="ml-1 px-2 py-0.5 text-xs bg-primary/10 text-primary rounded-full">
                  {quotes.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('banners')}
              className={`py-4 border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === 'banners'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Layout className="w-4 h-4" />
              Banners
            </button>
            <button
              onClick={() => setActiveTab('categories')}
              className={`py-4 border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === 'categories'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <FolderOpen className="w-4 h-4" />
              Categorias
            </button>
            <button
              onClick={() => setActiveTab('gallery')}
              className={`py-4 border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === 'gallery'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <ImageIcon className="w-4 h-4" />
              Galeria
            </button>
            <button
              onClick={() => setActiveTab('questionnaire')}
              className={`py-4 border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === 'questionnaire'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <FileText className="w-4 h-4" />
              Questionário
            </button>
            <button
              onClick={() => setActiveTab('integrations')}
              className={`py-4 border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === 'integrations'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Link2 className="w-4 h-4" />
              Integrações
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-6 bg-destructive/10 border border-destructive/30 rounded-lg p-4 flex items-center gap-3 text-destructive">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-auto">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Products Tab */}
        {activeTab === 'products' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-2xl font-bold text-foreground">Gerenciar Produtos</h1>
              <button
                onClick={() => {
                  setEditingProduct(null);
                  resetProductForm();
                  setShowProductForm(true);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Novo Produto
              </button>
            </div>

            {/* Product Form Modal */}
            {showProductForm && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <div className="bg-background rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold text-foreground">
                      {editingProduct ? 'Editar Produto' : 'Novo Produto'}
                    </h2>
                    <button
                      onClick={() => setShowProductForm(false)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">
                        Nome do Produto
                      </label>
                      <input
                        type="text"
                        value={productForm.name}
                        onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                        className="w-full px-4 py-3 border border-border rounded-xl bg-background text-foreground focus:ring-2 focus:ring-primary/50 focus:border-primary"
                        placeholder="Ex: Painel LED Outdoor P5"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-2">
                          Tipo
                        </label>
                        <select
                          value={productForm.product_type}
                          onChange={(e) => setProductForm({ ...productForm, product_type: e.target.value })}
                          className="w-full px-4 py-3 border border-border rounded-xl bg-background text-foreground focus:ring-2 focus:ring-primary/50 focus:border-primary"
                        >
                          <option value="outdoor">Outdoor</option>
                          <option value="indoor">Indoor</option>
                          <option value="rental">Rental</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-2">
                          Pitch
                        </label>
                        <select
                          value={productForm.pitch}
                          onChange={(e) => setProductForm({ ...productForm, pitch: e.target.value })}
                          className="w-full px-4 py-3 border border-border rounded-xl bg-background text-foreground focus:ring-2 focus:ring-primary/50 focus:border-primary"
                        >
                          <option value="P4">P4</option>
                          <option value="P5">P5</option>
                          <option value="P8">P8</option>
                          <option value="P10">P10</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">
                        Descrição
                      </label>
                      <textarea
                        value={productForm.description}
                        onChange={(e) => setProductForm({ ...productForm, description: e.target.value })}
                        className="w-full px-4 py-3 border border-border rounded-xl bg-background text-foreground focus:ring-2 focus:ring-primary/50 focus:border-primary min-h-[100px]"
                        placeholder="Descrição do produto..."
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">
                        Imagem do Produto
                      </label>
                      
                      {/* Preview da imagem atual */}
                      {productForm.image_url && (
                        <div className="mb-3 relative inline-block">
                          <img 
                            src={productForm.image_url} 
                            alt="Preview" 
                            className="w-32 h-32 object-cover rounded-xl border border-border"
                          />
                          <button
                            onClick={() => setProductForm({ ...productForm, image_url: '' })}
                            className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                      
                      <div className="flex flex-col gap-2">
                        <button
                          type="button"
                          onClick={() => setShowImageGallery(true)}
                          className="w-full px-4 py-3 border border-dashed border-border rounded-xl bg-muted/30 text-foreground hover:bg-muted/50 transition-colors flex items-center justify-center gap-2"
                        >
                          <FolderOpen className="w-5 h-5 text-muted-foreground" />
                          <span className="text-sm">Selecionar da Galeria</span>
                        </button>
                        
                        <div className="relative">
                          <div className="flex items-center">
                            <span className="text-xs text-muted-foreground flex-shrink-0 mr-2">ou cole URL:</span>
                            <input
                              type="url"
                              value={productForm.image_url}
                              onChange={(e) => setProductForm({ ...productForm, image_url: e.target.value })}
                              className="flex-1 px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm focus:ring-2 focus:ring-primary/50 focus:border-primary"
                              placeholder="https://..."
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        id="is_active"
                        checked={productForm.is_active}
                        onChange={(e) => setProductForm({ ...productForm, is_active: e.target.checked })}
                        className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                      />
                      <label htmlFor="is_active" className="text-sm text-foreground">
                        Produto ativo (visível para clientes)
                      </label>
                    </div>

                    <div className="flex gap-3 pt-4">
                      <button
                        onClick={() => setShowProductForm(false)}
                        className="flex-1 px-4 py-3 border border-border text-foreground rounded-xl hover:bg-muted transition-colors"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={handleSaveProduct}
                        disabled={saving || !productForm.name}
                        className="flex-1 px-4 py-3 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {saving ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Save className="w-4 h-4" />
                        )}
                        Salvar
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Image Gallery Modal */}
            <ImageGalleryModal
              isOpen={showImageGallery}
              onClose={() => setShowImageGallery(false)}
              onSelect={(url) => setProductForm({ ...productForm, image_url: url })}
              currentImage={productForm.image_url}
            />

            {/* Products List */}
            <div className="bg-background rounded-2xl border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Produto</th>
                      <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Tipo</th>
                      <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Pitch</th>
                      <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Status</th>
                      <th className="px-6 py-4 text-right text-sm font-medium text-muted-foreground">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {products.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                          <ImageIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />
                          <p>Nenhum produto cadastrado</p>
                        </td>
                      </tr>
                    ) : (
                      products.map((product) => (
                        <tr key={product.id} className="hover:bg-muted/30">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              {product.image_url ? (
                                <img
                                  src={product.image_url}
                                  alt={product.name}
                                  className="w-12 h-12 rounded-lg object-cover"
                                />
                              ) : (
                                <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center">
                                  <ImageIcon className="w-6 h-6 text-muted-foreground" />
                                </div>
                              )}
                              <div>
                                <p className="font-medium text-foreground">{product.name}</p>
                                {product.description && (
                                  <p className="text-sm text-muted-foreground line-clamp-1">
                                    {product.description}
                                  </p>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-foreground capitalize">{product.product_type}</td>
                          <td className="px-6 py-4 text-foreground">{product.pitch}</td>
                          <td className="px-6 py-4">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              product.is_active
                                ? 'bg-green-100 text-green-700'
                                : 'bg-muted text-muted-foreground'
                            }`}>
                              {product.is_active ? 'Ativo' : 'Inativo'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleEditProduct(product)}
                                className="p-2 text-muted-foreground hover:text-primary transition-colors"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteProduct(product.id)}
                                className="p-2 text-muted-foreground hover:text-destructive transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Users Tab */}
        {activeTab === 'users' && (
          <div>
            <h1 className="text-2xl font-bold text-foreground mb-6">Gerenciar Usuários</h1>
            
            <div className="bg-background rounded-2xl border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Nome</th>
                      <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Empresa</th>
                      <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Documento</th>
                      <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Telefone</th>
                      <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Admin</th>
                      <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Cadastro</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {profiles.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                          <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                          <p>Nenhum usuário cadastrado</p>
                        </td>
                      </tr>
                    ) : (
                      profiles.map((p) => (
                        <tr key={p.id} className="hover:bg-muted/30">
                          <td className="px-6 py-4 font-medium text-foreground">{p.full_name}</td>
                          <td className="px-6 py-4 text-foreground">{p.company_name || '-'}</td>
                          <td className="px-6 py-4 text-foreground">
                            <span className="uppercase text-xs font-medium text-muted-foreground mr-2">
                              {p.document_type}
                            </span>
                            {p.document_number}
                          </td>
                          <td className="px-6 py-4 text-foreground">{p.phone || '-'}</td>
                          <td className="px-6 py-4">
                            <button
                              onClick={() => handleToggleAdmin(p.id, p.is_admin)}
                              disabled={togglingAdmin === p.id}
                              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors flex items-center gap-1 ${
                                p.is_admin
                                  ? 'bg-primary/20 text-primary hover:bg-primary/30'
                                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
                              } disabled:opacity-50`}
                            >
                              {togglingAdmin === p.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                p.is_admin ? 'Sim' : 'Não'
                              )}
                            </button>
                          </td>
                          <td className="px-6 py-4 text-muted-foreground text-sm">
                            {new Date(p.created_at).toLocaleDateString('pt-BR')}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Quotes Tab */}
        {activeTab === 'quotes' && (
          <div>
            <h1 className="text-2xl font-bold text-foreground mb-6">Gerenciar Orçamentos</h1>
            
            {quotes.length === 0 ? (
              <div className="bg-background rounded-2xl border border-border p-12 text-center">
                <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground">Nenhum orçamento recebido ainda.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {quotes.map((quote) => {
                  const isExpanded = expandedQuote === quote.id;
                  const clientProfile = getProfileForQuote(quote.user_id);
                  const stage = getQuoteStage(quote);

                  return (
                    <div key={quote.id} className="bg-background border border-border rounded-2xl overflow-hidden">
                      {/* Quote Header */}
                      <button
                        onClick={() => setExpandedQuote(isExpanded ? null : quote.id)}
                        className="w-full p-5 flex items-center justify-between hover:bg-muted/30 transition-colors text-left"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                            <Hash className="w-5 h-5 text-white" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-mono font-bold text-foreground">
                                #{getOrderNumber(quote.id)}
                              </span>
                              <span className={`text-xs px-2 py-0.5 rounded-full ${
                                stage.stage === 3 && stage.step === 4
                                  ? 'bg-green-100 text-green-700'
                                  : stage.step === 0
                                    ? 'bg-amber-100 text-amber-700'
                                    : 'bg-primary/10 text-primary'
                              }`}>
                                {stage.label}
                              </span>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {clientProfile?.full_name || 'Cliente'} • {quote.product_type} • {quote.pitch} • {quote.cabinet_quantity} gabinetes
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-sm text-muted-foreground hidden sm:block">
                            {formatDate(quote.created_at)}
                          </span>
                          {isExpanded ? (
                            <ChevronUp className="w-5 h-5 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="w-5 h-5 text-muted-foreground" />
                          )}
                        </div>
                      </button>

                      {/* Expanded Content */}
                      {isExpanded && (
                        <div className="border-t border-border p-5 space-y-6">
                          {/* Client Info */}
                          <div className="bg-muted/30 rounded-xl p-4">
                            <h4 className="font-medium text-foreground mb-3">Dados do Cliente</h4>
                            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                              <div>
                                <span className="text-muted-foreground">Nome:</span>
                                <p className="font-medium text-foreground">{clientProfile?.full_name || '-'}</p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Empresa:</span>
                                <p className="font-medium text-foreground">{clientProfile?.company_name || '-'}</p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Documento:</span>
                                <p className="font-medium text-foreground">
                                  {clientProfile?.document_type.toUpperCase()}: {clientProfile?.document_number}
                                </p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">WhatsApp:</span>
                                <p className="font-medium text-foreground">{clientProfile?.phone || '-'}</p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Cidade/UF:</span>
                                <p className="font-medium text-foreground">
                                  {quote.delivery_city && quote.delivery_state 
                                    ? `${quote.delivery_city}/${quote.delivery_state}` 
                                    : '-'}
                                </p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">CEP:</span>
                                <p className="font-medium text-foreground">{quote.delivery_cep || '-'}</p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Email:</span>
                                <p className="font-medium text-foreground">{clientProfile?.email || '-'}</p>
                              </div>
                            </div>
                            
                            {/* Send Email Button */}
                            <div className="mt-4 pt-4 border-t border-border/50">
                              <button
                                onClick={() => handleSendEmailWebhook(quote)}
                                disabled={sendingEmail === quote.id || !webhookSettings.enabled || !webhookSettings.url}
                                className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50 text-sm"
                                title={!webhookSettings.url ? 'Configure o webhook na aba Integrações' : 'Enviar email via webhook'}
                              >
                                {sendingEmail === quote.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Send className="w-4 h-4" />
                                )}
                                Enviar Email
                              </button>
                              {(!webhookSettings.enabled || !webhookSettings.url) && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  Configure o webhook na aba Integrações para enviar emails.
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Product Info */}
                          <div className="bg-muted/30 rounded-xl p-4">
                            <h4 className="font-medium text-foreground mb-3">Detalhes do Pedido</h4>
                            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                              <div>
                                <span className="text-muted-foreground">Tipo:</span>
                                <p className="font-medium text-foreground capitalize">{quote.product_type}</p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Pitch:</span>
                                <p className="font-medium text-foreground">{quote.pitch}</p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Gabinetes:</span>
                                <p className="font-medium text-foreground">{quote.cabinet_quantity}</p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Finalidade:</span>
                                <p className="font-medium text-foreground">{quote.purpose}</p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">PCB:</span>
                                <p className="font-medium text-foreground">{quote.pcb_type}</p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Layout:</span>
                                <p className="font-medium text-foreground">{quote.cabinet_layout}</p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">CEP Entrega:</span>
                                <p className="font-medium text-foreground">{quote.delivery_cep}</p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Cidade/UF:</span>
                                <p className="font-medium text-foreground">{quote.delivery_city}/{quote.delivery_state}</p>
                              </div>
                            </div>
                          </div>

                          {/* Admin Actions - Etapa 1 */}
                          <div className="bg-blue-50 rounded-xl p-4">
                            <h4 className="font-medium text-foreground mb-4 flex items-center gap-2">
                              <span className="w-6 h-6 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center">1</span>
                              Etapa 1: Produção
                            </h4>
                            <div className="grid sm:grid-cols-2 gap-4">
                              <div>
                                <label className="block text-sm font-medium text-foreground mb-1">
                                  Link do Orçamento (PDF)
                                </label>
                                <div className="flex gap-2">
                                  <input
                                    type="url"
                                    value={quoteForm[`${quote.id}_quote_pdf_url`] || ''}
                                    onChange={(e) => setQuoteForm({...quoteForm, [`${quote.id}_quote_pdf_url`]: e.target.value})}
                                    className="flex-1 px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm"
                                    placeholder="https://..."
                                  />
                                  <button
                                    onClick={() => handleUpdateQuoteField(quote.id, 'quote_pdf_url')}
                                    disabled={savingField === `${quote.id}_quote_pdf_url`}
                                    className="px-3 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm disabled:opacity-50 min-w-[44px] flex items-center justify-center"
                                  >
                                    {savingField === `${quote.id}_quote_pdf_url` ? (
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                      <Save className="w-4 h-4" />
                                    )}
                                  </button>
                                </div>
                                {quote.quote_approved_at && (
                                  <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                                    <CheckCircle2 className="w-3 h-3" /> Aprovado em {formatDate(quote.quote_approved_at)}
                                  </p>
                                )}
                              </div>

                              <div>
                                <label className="block text-sm font-medium text-foreground mb-1">
                                  Link do Contrato
                                </label>
                                <div className="flex gap-2">
                                  <input
                                    type="url"
                                    value={quoteForm[`${quote.id}_contract_link`] || ''}
                                    onChange={(e) => setQuoteForm({...quoteForm, [`${quote.id}_contract_link`]: e.target.value})}
                                    className="flex-1 px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm"
                                    placeholder="https://..."
                                  />
                                  <button
                                    onClick={() => handleUpdateQuoteField(quote.id, 'contract_link')}
                                    disabled={savingField === `${quote.id}_contract_link`}
                                    className="px-3 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm disabled:opacity-50 min-w-[44px] flex items-center justify-center"
                                  >
                                    {savingField === `${quote.id}_contract_link` ? (
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                      <Save className="w-4 h-4" />
                                    )}
                                  </button>
                                </div>
                                {quote.contract_signed_at && (
                                  <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                                    <CheckCircle2 className="w-3 h-3" /> Assinado em {formatDate(quote.contract_signed_at)}
                                  </p>
                                )}
                              </div>

                              <div>
                                <label className="block text-sm font-medium text-foreground mb-1">
                                  Link de Pagamento (Produção)
                                </label>
                                <div className="flex gap-2">
                                  <input
                                    type="url"
                                    value={quoteForm[`${quote.id}_production_payment_link`] || ''}
                                    onChange={(e) => setQuoteForm({...quoteForm, [`${quote.id}_production_payment_link`]: e.target.value})}
                                    className="flex-1 px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm"
                                    placeholder="https://..."
                                  />
                                  <button
                                    onClick={() => handleUpdateQuoteField(quote.id, 'production_payment_link')}
                                    disabled={savingField === `${quote.id}_production_payment_link`}
                                    className="px-3 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm disabled:opacity-50 min-w-[44px] flex items-center justify-center"
                                  >
                                    {savingField === `${quote.id}_production_payment_link` ? (
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                      <Save className="w-4 h-4" />
                                    )}
                                  </button>
                                </div>
                                {quote.production_paid_at && (
                                  <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                                    <CheckCircle2 className="w-3 h-3" /> Pago em {formatDate(quote.production_paid_at)}
                                  </p>
                                )}
                              </div>

                              <div>
                                <label className="block text-sm font-medium text-foreground mb-1">
                                  Logo do Cliente
                                </label>
                                <p className="text-sm text-foreground">
                                  {quote.wants_logo === null ? (
                                    <span className="text-muted-foreground">Não informado</span>
                                  ) : quote.wants_logo ? (
                                    <span className="text-green-600">Sim, quer logo</span>
                                  ) : (
                                    <span className="text-muted-foreground">Não quer logo</span>
                                  )}
                                </p>
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-2 mt-4">
                              {!quote.production_started_at && quote.production_paid_at && (
                                <button
                                  onClick={() => handleMarkStep(quote.id, 'production_started_at')}
                                  disabled={markingStep === `${quote.id}_production_started_at`}
                                  className="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm flex items-center gap-2 disabled:opacity-50"
                                >
                                  {markingStep === `${quote.id}_production_started_at` ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <Clock className="w-4 h-4" />
                                  )}
                                  Iniciar Produção
                                </button>
                              )}
                              {quote.production_started_at && !quote.production_completed_at && (
                                <button
                                  onClick={() => handleMarkStep(quote.id, 'production_completed_at')}
                                  disabled={markingStep === `${quote.id}_production_completed_at`}
                                  className="px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 text-sm flex items-center gap-2 disabled:opacity-50"
                                >
                                  {markingStep === `${quote.id}_production_completed_at` ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <CheckCircle2 className="w-4 h-4" />
                                  )}
                                  Concluir Produção
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Admin Actions - Etapa 2 */}
                          <div className="bg-purple-50 rounded-xl p-4">
                            <h4 className="font-medium text-foreground mb-4 flex items-center gap-2">
                              <span className="w-6 h-6 rounded-full bg-purple-500 text-white text-xs flex items-center justify-center">2</span>
                              Etapa 2: Embarque
                            </h4>
                            <div className="grid sm:grid-cols-2 gap-4">
                              <div>
                                <label className="block text-sm font-medium text-foreground mb-1">
                                  Link de Pagamento (Embarque)
                                </label>
                                <div className="flex gap-2">
                                  <input
                                    type="url"
                                    value={quoteForm[`${quote.id}_shipping_payment_link`] || ''}
                                    onChange={(e) => setQuoteForm({...quoteForm, [`${quote.id}_shipping_payment_link`]: e.target.value})}
                                    className="flex-1 px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm"
                                    placeholder="https://..."
                                  />
                                  <button
                                    onClick={() => handleUpdateQuoteField(quote.id, 'shipping_payment_link')}
                                    disabled={savingField === `${quote.id}_shipping_payment_link`}
                                    className="px-3 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm disabled:opacity-50 min-w-[44px] flex items-center justify-center"
                                  >
                                    {savingField === `${quote.id}_shipping_payment_link` ? (
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                      <Save className="w-4 h-4" />
                                    )}
                                  </button>
                                </div>
                                {quote.shipping_paid_at && (
                                  <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                                    <CheckCircle2 className="w-3 h-3" /> Pago em {formatDate(quote.shipping_paid_at)}
                                  </p>
                                )}
                              </div>

                              <div>
                                <label className="block text-sm font-medium text-foreground mb-1">
                                  Link do Formulário
                                </label>
                                <div className="flex gap-2">
                                  <input
                                    type="url"
                                    value={quoteForm[`${quote.id}_shipping_form_link`] || ''}
                                    onChange={(e) => setQuoteForm({...quoteForm, [`${quote.id}_shipping_form_link`]: e.target.value})}
                                    className="flex-1 px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm"
                                    placeholder="https://..."
                                  />
                                  <button
                                    onClick={() => handleUpdateQuoteField(quote.id, 'shipping_form_link')}
                                    disabled={savingField === `${quote.id}_shipping_form_link`}
                                    className="px-3 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm disabled:opacity-50 min-w-[44px] flex items-center justify-center"
                                  >
                                    {savingField === `${quote.id}_shipping_form_link` ? (
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                      <Save className="w-4 h-4" />
                                    )}
                                  </button>
                                </div>
                                {quote.shipping_form_completed_at && (
                                  <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                                    <CheckCircle2 className="w-3 h-3" /> Preenchido em {formatDate(quote.shipping_form_completed_at)}
                                  </p>
                                )}
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-2 mt-4">
                              {quote.production_completed_at && !quote.shipped_at && (
                                <button
                                  onClick={() => handleMarkStep(quote.id, 'shipped_at')}
                                  disabled={markingStep === `${quote.id}_shipped_at`}
                                  className="px-3 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 text-sm flex items-center gap-2 disabled:opacity-50"
                                >
                                  {markingStep === `${quote.id}_shipped_at` ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <ExternalLink className="w-4 h-4" />
                                  )}
                                  Marcar como Embarcado
                                </button>
                              )}
                              {quote.shipped_at && !quote.arrived_port_at && (
                                <button
                                  onClick={() => handleMarkStep(quote.id, 'arrived_port_at')}
                                  disabled={markingStep === `${quote.id}_arrived_port_at`}
                                  className="px-3 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 text-sm flex items-center gap-2 disabled:opacity-50"
                                >
                                  {markingStep === `${quote.id}_arrived_port_at` ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <CheckCircle2 className="w-4 h-4" />
                                  )}
                                  Chegou ao Porto
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Admin Actions - Etapa 3 */}
                          <div className="bg-green-50 rounded-xl p-4">
                            <h4 className="font-medium text-foreground mb-4 flex items-center gap-2">
                              <span className="w-6 h-6 rounded-full bg-green-500 text-white text-xs flex items-center justify-center">3</span>
                              Etapa 3: Entrega
                            </h4>
                            <div className="flex flex-wrap gap-2">
                              {quote.arrived_port_at && !quote.customs_started_at && (
                                <button
                                  onClick={() => handleMarkStep(quote.id, 'customs_started_at')}
                                  disabled={markingStep === `${quote.id}_customs_started_at`}
                                  className="px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 text-sm flex items-center gap-2 disabled:opacity-50"
                                >
                                  {markingStep === `${quote.id}_customs_started_at` ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <Clock className="w-4 h-4" />
                                  )}
                                  Iniciar Desembaraço
                                </button>
                              )}
                              {quote.customs_started_at && !quote.customs_cleared_at && (
                                <button
                                  onClick={() => handleMarkStep(quote.id, 'customs_cleared_at')}
                                  disabled={markingStep === `${quote.id}_customs_cleared_at`}
                                  className="px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 text-sm flex items-center gap-2 disabled:opacity-50"
                                >
                                  {markingStep === `${quote.id}_customs_cleared_at` ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <CheckCircle2 className="w-4 h-4" />
                                  )}
                                  Carga Liberada
                                </button>
                              )}
                              {quote.customs_cleared_at && !quote.delivered_at && (
                                <button
                                  onClick={() => handleMarkStep(quote.id, 'delivered_at')}
                                  disabled={markingStep === `${quote.id}_delivered_at`}
                                  className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm flex items-center gap-2 disabled:opacity-50"
                                >
                                  {markingStep === `${quote.id}_delivered_at` ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <CheckCircle2 className="w-4 h-4" />
                                  )}
                                  Marcar como Entregue
                                </button>
                              )}
                              {quote.delivered_at && (
                                <p className="text-green-600 flex items-center gap-2">
                                  <CheckCircle2 className="w-5 h-5" />
                                  Entregue em {formatDate(quote.delivered_at)}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Admin Notes */}
                          <div>
                            <label className="block text-sm font-medium text-foreground mb-2">
                              Observações Internas
                            </label>
                            <textarea
                              value={quoteForm[`${quote.id}_admin_notes`] || ''}
                              onChange={(e) => setQuoteForm({...quoteForm, [`${quote.id}_admin_notes`]: e.target.value})}
                              className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm min-h-[80px]"
                              placeholder="Anotações internas sobre o pedido..."
                            />
                            <button
                              onClick={() => handleUpdateQuoteField(quote.id, 'admin_notes')}
                              disabled={savingField === `${quote.id}_admin_notes`}
                              className="mt-2 px-4 py-2 bg-muted text-foreground rounded-lg hover:bg-muted/80 text-sm flex items-center gap-2 disabled:opacity-50"
                            >
                              {savingField === `${quote.id}_admin_notes` ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Save className="w-4 h-4" />
                              )}
                              Salvar Observações
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Banners Tab */}
        {activeTab === 'banners' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-2xl font-bold text-foreground">Gerenciar Banners do Dashboard</h1>
              <button
                onClick={handleSaveBanners}
                disabled={savingBanners}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {savingBanners ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Salvar Banners
              </button>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              {/* Desktop Banner */}
              <div className="bg-background rounded-2xl border border-border p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <Monitor className="w-5 h-5 text-primary" />
                  </div>
                  <h2 className="text-lg font-semibold text-foreground">Banner Desktop</h2>
                </div>

                <div className="space-y-4">
                  {/* Preview */}
                  <div className="aspect-[3/1] bg-muted rounded-xl overflow-hidden border border-border">
                    {bannerSettings.desktop.image_url ? (
                      <img 
                        src={bannerSettings.desktop.image_url} 
                        alt="Banner Desktop" 
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                        <div className="text-center">
                          <ImageIcon className="w-10 h-10 mx-auto mb-2 opacity-50" />
                          <p className="text-sm">Nenhum banner configurado</p>
                          <p className="text-xs">Proporção recomendada: 3:1 (ex: 1200x400)</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Image Selection */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Imagem do Banner
                    </label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowBannerDesktopGallery(true)}
                        className="flex-1 px-4 py-3 border border-dashed border-border rounded-xl bg-muted/30 text-foreground hover:bg-muted/50 transition-colors flex items-center justify-center gap-2"
                      >
                        <FolderOpen className="w-5 h-5 text-muted-foreground" />
                        <span className="text-sm">Selecionar da Galeria</span>
                      </button>
                      {bannerSettings.desktop.image_url && (
                        <button
                          onClick={() => setBannerSettings({
                            ...bannerSettings,
                            desktop: { ...bannerSettings.desktop, image_url: '' }
                          })}
                          className="p-3 bg-destructive/10 text-destructive rounded-xl hover:bg-destructive/20"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      )}
                    </div>
                    <div className="mt-2">
                      <input
                        type="url"
                        value={bannerSettings.desktop.image_url}
                        onChange={(e) => setBannerSettings({
                          ...bannerSettings,
                          desktop: { ...bannerSettings.desktop, image_url: e.target.value }
                        })}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm"
                        placeholder="Ou cole a URL da imagem..."
                      />
                    </div>
                  </div>

                  {/* Link */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Link ao clicar (opcional)
                    </label>
                    <input
                      type="url"
                      value={bannerSettings.desktop.link}
                      onChange={(e) => setBannerSettings({
                        ...bannerSettings,
                        desktop: { ...bannerSettings.desktop, link: e.target.value }
                      })}
                      className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm"
                      placeholder="https://..."
                    />
                  </div>

                  {/* Enabled */}
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="desktop_enabled"
                      checked={bannerSettings.desktop.enabled}
                      onChange={(e) => setBannerSettings({
                        ...bannerSettings,
                        desktop: { ...bannerSettings.desktop, enabled: e.target.checked }
                      })}
                      className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                    />
                    <label htmlFor="desktop_enabled" className="text-sm text-foreground">
                      Banner ativo
                    </label>
                  </div>
                </div>
              </div>

              {/* Mobile Banner */}
              <div className="bg-background rounded-2xl border border-border p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-secondary/10 rounded-lg">
                    <Smartphone className="w-5 h-5 text-secondary" />
                  </div>
                  <h2 className="text-lg font-semibold text-foreground">Banner Mobile</h2>
                </div>

                <div className="space-y-4">
                  {/* Preview */}
                  <div className="aspect-[2/1] bg-muted rounded-xl overflow-hidden border border-border max-w-xs mx-auto">
                    {bannerSettings.mobile.image_url ? (
                      <img 
                        src={bannerSettings.mobile.image_url} 
                        alt="Banner Mobile" 
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                        <div className="text-center">
                          <ImageIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
                          <p className="text-sm">Nenhum banner configurado</p>
                          <p className="text-xs">Proporção recomendada: 2:1 (ex: 600x300)</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Image Selection */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Imagem do Banner
                    </label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowBannerMobileGallery(true)}
                        className="flex-1 px-4 py-3 border border-dashed border-border rounded-xl bg-muted/30 text-foreground hover:bg-muted/50 transition-colors flex items-center justify-center gap-2"
                      >
                        <FolderOpen className="w-5 h-5 text-muted-foreground" />
                        <span className="text-sm">Selecionar da Galeria</span>
                      </button>
                      {bannerSettings.mobile.image_url && (
                        <button
                          onClick={() => setBannerSettings({
                            ...bannerSettings,
                            mobile: { ...bannerSettings.mobile, image_url: '' }
                          })}
                          className="p-3 bg-destructive/10 text-destructive rounded-xl hover:bg-destructive/20"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      )}
                    </div>
                    <div className="mt-2">
                      <input
                        type="url"
                        value={bannerSettings.mobile.image_url}
                        onChange={(e) => setBannerSettings({
                          ...bannerSettings,
                          mobile: { ...bannerSettings.mobile, image_url: e.target.value }
                        })}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm"
                        placeholder="Ou cole a URL da imagem..."
                      />
                    </div>
                  </div>

                  {/* Link */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Link ao clicar (opcional)
                    </label>
                    <input
                      type="url"
                      value={bannerSettings.mobile.link}
                      onChange={(e) => setBannerSettings({
                        ...bannerSettings,
                        mobile: { ...bannerSettings.mobile, link: e.target.value }
                      })}
                      className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm"
                      placeholder="https://..."
                    />
                  </div>

                  {/* Enabled */}
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="mobile_enabled"
                      checked={bannerSettings.mobile.enabled}
                      onChange={(e) => setBannerSettings({
                        ...bannerSettings,
                        mobile: { ...bannerSettings.mobile, enabled: e.target.checked }
                      })}
                      className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                    />
                    <label htmlFor="mobile_enabled" className="text-sm text-foreground">
                      Banner ativo
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Image Gallery Modals for Banners */}
            <ImageGalleryModal
              isOpen={showBannerDesktopGallery}
              onClose={() => setShowBannerDesktopGallery(false)}
              onSelect={(url) => setBannerSettings({
                ...bannerSettings,
                desktop: { ...bannerSettings.desktop, image_url: url }
              })}
              currentImage={bannerSettings.desktop.image_url}
            />
            <ImageGalleryModal
              isOpen={showBannerMobileGallery}
              onClose={() => setShowBannerMobileGallery(false)}
              onSelect={(url) => setBannerSettings({
                ...bannerSettings,
                mobile: { ...bannerSettings.mobile, image_url: url }
              })}
              currentImage={bannerSettings.mobile.image_url}
            />
          </div>
        )}

        {/* Categories Tab */}
        {activeTab === 'categories' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-2xl font-bold text-foreground">Gerenciar Categorias</h1>
              <button
                onClick={handleSaveCategories}
                disabled={savingCategories}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {savingCategories ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Salvar Categorias
              </button>
            </div>

            <p className="text-muted-foreground mb-6">
              Configure as imagens e visibilidade das categorias de painéis na tela de solicitar orçamento.
            </p>

            <div className="grid gap-6 md:grid-cols-3">
              {(['outdoor', 'rental', 'indoor'] as const).map((category) => {
                const settings = categorySettings[category] || { image_url: '', visible: true, is_main: category !== 'indoor', order: 1 };
                return (
                  <div key={category} className="bg-background rounded-2xl border border-border p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-lg font-semibold text-foreground capitalize">{category}</h2>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-1 rounded-full ${settings.is_main ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                          {settings.is_main ? 'Principal' : 'Outros Modelos'}
                        </span>
                      </div>
                    </div>

                    {/* Image Preview */}
                    <div className="aspect-video bg-muted rounded-xl overflow-hidden border border-border mb-4">
                      {settings.image_url ? (
                        <img 
                          src={settings.image_url} 
                          alt={category} 
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                          <div className="text-center">
                            <ImageIcon className="w-10 h-10 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">Sem imagem</p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Image Selection */}
                    <div className="mb-4">
                      <div className="flex gap-2">
                        <button
                          onClick={() => setShowCategoryImageGallery(category)}
                          className="flex-1 px-3 py-2 border border-dashed border-border rounded-lg bg-muted/30 text-foreground hover:bg-muted/50 transition-colors flex items-center justify-center gap-2 text-sm"
                        >
                          <FolderOpen className="w-4 h-4 text-muted-foreground" />
                          Selecionar
                        </button>
                        {settings.image_url && (
                          <button
                            onClick={() => setCategorySettings({
                              ...categorySettings,
                              [category]: { ...settings, image_url: '' }
                            })}
                            className="p-2 bg-destructive/10 text-destructive rounded-lg hover:bg-destructive/20"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Settings */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          id={`${category}_visible`}
                          checked={settings.visible}
                          onChange={(e) => setCategorySettings({
                            ...categorySettings,
                            [category]: { ...settings, visible: e.target.checked }
                          })}
                          className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                        />
                        <label htmlFor={`${category}_visible`} className="text-sm text-foreground">
                          Visível
                        </label>
                      </div>

                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          id={`${category}_main`}
                          checked={settings.is_main}
                          onChange={(e) => setCategorySettings({
                            ...categorySettings,
                            [category]: { ...settings, is_main: e.target.checked }
                          })}
                          className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                        />
                        <label htmlFor={`${category}_main`} className="text-sm text-foreground">
                          Exibir como principal (não vai para "Outros Modelos")
                        </label>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Category Image Gallery Modals */}
            {(['outdoor', 'rental', 'indoor'] as const).map((category) => (
              <ImageGalleryModal
                key={category}
                isOpen={showCategoryImageGallery === category}
                onClose={() => setShowCategoryImageGallery(null)}
                onSelect={(url) => {
                  setCategorySettings({
                    ...categorySettings,
                    [category]: { ...categorySettings[category], image_url: url }
                  });
                  setShowCategoryImageGallery(null);
                }}
                currentImage={categorySettings[category]?.image_url}
              />
            ))}
          </div>
        )}

        {/* Gallery Tab */}
        {activeTab === 'gallery' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-2xl font-bold text-foreground">Galeria de Imagens</h1>
              <label className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors cursor-pointer">
                {uploadingGallery ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                {uploadingGallery ? 'Enviando...' : 'Enviar Imagens'}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleGalleryUpload}
                  disabled={uploadingGallery}
                  className="hidden"
                />
              </label>
            </div>

            <p className="text-muted-foreground mb-6">
              Gerencie todas as imagens do site. Todas as imagens usadas no site devem estar aqui.
              <br />
              <span className="text-sm">Formatos aceitos: JPG, PNG, WEBP. Tamanho máximo: 5MB por imagem.</span>
            </p>

            {loadingGallery ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : galleryImages.length === 0 ? (
              <div className="bg-background rounded-2xl border border-border p-8 text-center">
                <ImageIcon className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                <p className="text-foreground font-medium mb-1">Nenhuma imagem na galeria</p>
                <p className="text-sm text-muted-foreground">Use o botão "Enviar Imagens" para adicionar fotos.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {galleryImages.map((image) => (
                  <div
                    key={image.id}
                    className="relative group aspect-square rounded-xl overflow-hidden border border-border bg-muted"
                  >
                    <img
                      src={resolveImageUrl(image.url) || image.url}
                      alt={image.name}
                      className="w-full h-full object-cover"
                    />
                    
                    {/* Local asset badge */}
                    {isLocalAsset(image.url) && (
                      <div className="absolute top-2 right-2">
                        <span className="text-xs bg-amber-500 text-white px-1.5 py-0.5 rounded">Local</span>
                      </div>
                    )}
                    
                    {/* Overlay with actions */}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(image.url);
                          alert('URL copiada!');
                        }}
                        className="p-2 bg-white text-foreground rounded-lg hover:bg-white/90 transition-colors"
                        title="Copiar URL"
                      >
                        <Hash className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteGalleryImage(image)}
                        disabled={deletingGalleryImage === image.id}
                        className="p-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50"
                        title="Excluir"
                      >
                        {deletingGalleryImage === image.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                    
                    {/* File name */}
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                      <p className="text-xs text-white truncate">{image.name}</p>
                    </div>
                    
                    {/* Category badge */}
                    <div className="absolute top-2 left-2">
                      <span className={`text-xs text-white px-1.5 py-0.5 rounded ${
                        image.category === 'projects' ? 'bg-purple-500' :
                        image.category === 'products' ? 'bg-blue-500' :
                        'bg-green-500'
                      }`}>
                        {image.category === 'projects' ? 'Projetos' :
                         image.category === 'products' ? 'Produtos' : 'Geral'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Questionnaire Tab */}
        {activeTab === 'questionnaire' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-2xl font-bold text-foreground">Gerenciar Questionário</h1>
              <button
                onClick={() => {
                  setEditingQuestion(null);
                  resetQuestionForm();
                  setShowQuestionForm(true);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Nova Pergunta
              </button>
            </div>

            <p className="text-muted-foreground mb-6">
              Configure as perguntas que serão exibidas antes da confirmação do orçamento. Os clientes escolherão entre Opção A ou Opção B.
            </p>

            {/* Question Form Modal */}
            {showQuestionForm && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <div className="bg-background rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold text-foreground">
                      {editingQuestion ? 'Editar Pergunta' : 'Nova Pergunta'}
                    </h2>
                    <button
                      onClick={() => setShowQuestionForm(false)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">
                        Pergunta
                      </label>
                      <textarea
                        value={questionForm.question}
                        onChange={(e) => setQuestionForm({ ...questionForm, question: e.target.value })}
                        className="w-full px-4 py-3 border border-border rounded-xl bg-background text-foreground focus:ring-2 focus:ring-primary/50 focus:border-primary"
                        placeholder="Ex: Qual o local de instalação do painel?"
                        rows={3}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">
                        Opção A
                      </label>
                      <input
                        type="text"
                        value={questionForm.option_a}
                        onChange={(e) => setQuestionForm({ ...questionForm, option_a: e.target.value })}
                        className="w-full px-4 py-3 border border-border rounded-xl bg-background text-foreground focus:ring-2 focus:ring-primary/50 focus:border-primary"
                        placeholder="Ex: Área interna (protegida)"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">
                        Opção B
                      </label>
                      <input
                        type="text"
                        value={questionForm.option_b}
                        onChange={(e) => setQuestionForm({ ...questionForm, option_b: e.target.value })}
                        className="w-full px-4 py-3 border border-border rounded-xl bg-background text-foreground focus:ring-2 focus:ring-primary/50 focus:border-primary"
                        placeholder="Ex: Área externa (exposta ao tempo)"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-2">
                          Ordem de Exibição
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={questionForm.order_position}
                          onChange={(e) => setQuestionForm({ ...questionForm, order_position: parseInt(e.target.value) || 1 })}
                          className="w-full px-4 py-3 border border-border rounded-xl bg-background text-foreground focus:ring-2 focus:ring-primary/50 focus:border-primary"
                        />
                      </div>
                      <div className="flex items-center gap-3 pt-8">
                        <input
                          type="checkbox"
                          id="question_active"
                          checked={questionForm.is_active}
                          onChange={(e) => setQuestionForm({ ...questionForm, is_active: e.target.checked })}
                          className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                        />
                        <label htmlFor="question_active" className="text-sm text-foreground">
                          Pergunta ativa
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 mt-6">
                    <button
                      onClick={() => setShowQuestionForm(false)}
                      className="px-4 py-2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleSaveQuestion}
                      disabled={savingQuestion}
                      className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                      {savingQuestion ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                      {editingQuestion ? 'Atualizar' : 'Criar'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Questions List */}
            {loadingQuestions ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : quoteQuestions.length === 0 ? (
              <div className="bg-background rounded-2xl border border-border p-8 text-center">
                <FileText className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                <p className="text-foreground font-medium mb-1">Nenhuma pergunta cadastrada</p>
                <p className="text-sm text-muted-foreground">Clique em "Nova Pergunta" para adicionar perguntas ao questionário.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {quoteQuestions.map((question, index) => (
                  <div
                    key={question.id}
                    className={`bg-background rounded-2xl border border-border p-6 ${!question.is_active ? 'opacity-60' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-sm text-muted-foreground">#{index + 1}</span>
                          {!question.is_active && (
                            <span className="px-2 py-0.5 text-xs bg-muted text-muted-foreground rounded-full">Inativa</span>
                          )}
                        </div>
                        <p className="font-medium text-foreground mb-4">{question.question}</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="p-3 bg-muted/50 rounded-lg">
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/20 text-primary text-sm font-semibold mr-2">A</span>
                            <span className="text-sm text-foreground">{question.option_a}</span>
                          </div>
                          <div className="p-3 bg-muted/50 rounded-lg">
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/20 text-primary text-sm font-semibold mr-2">B</span>
                            <span className="text-sm text-foreground">{question.option_b}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEditQuestion(question)}
                          className="p-2 text-muted-foreground hover:text-foreground transition-colors"
                          title="Editar"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteQuestion(question.id)}
                          disabled={deletingQuestion === question.id}
                          className="p-2 text-destructive hover:text-destructive/80 transition-colors disabled:opacity-50"
                          title="Excluir"
                        >
                          {deletingQuestion === question.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Integrations Tab */}
        {activeTab === 'integrations' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-2xl font-bold text-foreground">Integrações</h1>
              <button
                onClick={handleSaveWebhook}
                disabled={savingWebhook}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {savingWebhook ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Salvar Configurações
              </button>
            </div>

            <div className="space-y-6">
              {/* Webhook POST Configuration */}
              <div className="bg-background rounded-2xl border border-border p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <Send className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">Webhook de Email (n8n)</h2>
                    <p className="text-sm text-muted-foreground">Configure a URL do webhook que será chamado ao clicar em "Enviar Email" nos orçamentos.</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      URL do Webhook (POST)
                    </label>
                    <input
                      type="url"
                      value={webhookSettings.url}
                      onChange={(e) => setWebhookSettings({ ...webhookSettings, url: e.target.value })}
                      className="w-full px-4 py-3 border border-border rounded-xl bg-background text-foreground focus:ring-2 focus:ring-primary/50 focus:border-primary"
                      placeholder="https://n8n.fvleal.com.br/webhook/orcamento"
                    />
                  </div>

                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="webhook_enabled"
                      checked={webhookSettings.enabled}
                      onChange={(e) => setWebhookSettings({ ...webhookSettings, enabled: e.target.checked })}
                      className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                    />
                    <label htmlFor="webhook_enabled" className="text-sm text-foreground">
                      Webhook ativo
                    </label>
                  </div>

                  <div className="bg-muted/30 rounded-xl p-4">
                    <h4 className="font-medium text-foreground mb-2">Dados enviados no POST:</h4>
                    <code className="text-xs text-muted-foreground block whitespace-pre bg-muted/50 p-3 rounded-lg">
{`{
  "nome": "Nome do cliente",
  "whatsapp": "11999999999",
  "cidade": "São Paulo",
  "estado": "SP",
  "email": "cliente@email.com",
  "quote_id": "uuid-do-orcamento",
  "product_type": "outdoor",
  "pitch": "P5",
  "cabinet_quantity": 10
}`}
                    </code>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
