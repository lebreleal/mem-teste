import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../integrations/supabase/client';
import { 
  ArrowLeft, 
  ArrowRight, 
  Check, 
  AlertCircle, 
  Info,
  MapPin,
  Loader2,
  CheckCircle,
  ExternalLink,
  Star,
  ChevronDown
} from 'lucide-react';
import logo from '../assets/Logo Ledbras Branco.png';
import { resolveImageUrl } from '../utils/assetResolver';

type ProductType = 'outdoor' | 'indoor' | 'rental';
type Pitch = string; // Dynamic based on product type
type Purpose = 'proprio' | 'comercial';
type PCBType = '2_camadas' | '4_camadas';

// Pitch options per product type
const PITCH_OPTIONS: Record<ProductType, { value: string; recommended?: boolean }[]> = {
  outdoor: [
    { value: 'P4' },
    { value: 'P5', recommended: true },
    { value: 'P8' },
    { value: 'P10' },
  ],
  indoor: [
    { value: 'P2.5' },
    { value: 'P3' },
    { value: 'P4' },
    { value: 'P5', recommended: true },
  ],
  rental: [
    { value: 'P2.9' },
    { value: 'P3.91', recommended: true },
    { value: 'P4.81' },
  ],
};

// Cabinet dimensions per product type (in cm and m²)
const CABINET_SPECS: Record<ProductType, { width: number; height: number; label: string; area: number }> = {
  outdoor: { width: 96, height: 96, label: '96x96cm', area: 0.9216 },
  indoor: { width: 96, height: 96, label: '96x96cm', area: 0.9216 },
  rental: { width: 100, height: 50, label: '100x50cm', area: 0.5 },
};

interface QuoteQuestion {
  id: string;
  question: string;
  option_a: string;
  option_b: string;
  order_position: number;
}

interface QuoteData {
  productType: ProductType | null;
  pitch: Pitch | null;
  purpose: Purpose | null;
  pcbType: PCBType | null;
  cabinetQuantity: number | null;
  cabinetLayout: string;
  cep: string;
  city: string;
  state: string;
  questionnaireAnswers: { [questionId: string]: 'A' | 'B' };
}

interface CategorySettings {
  [key: string]: {
    image_url: string;
    visible: boolean;
    is_main: boolean;
    order: number;
  };
}

const WHATSAPP_URL = 'https://wa.me/5511999999999';
const SPECS_SHEET_URL = 'https://drive.google.com/file/d/1wLQajM6IpZESV6ft1dmTeIkm8pUZriD1/view?usp=sharing';

const STEPS = [
  { id: 1, title: 'Tipo de Painel' },
  { id: 2, title: 'Configuração' },
  { id: 3, title: 'Tamanho' },
  { id: 4, title: 'Entrega' },
  { id: 5, title: 'Questionário' },
  { id: 6, title: 'Confirmação' },
];

// Removed defaultCategorySettings - using null to show loading state

export function QuotePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [showPitchWarning, setShowPitchWarning] = useState(false);
  const [showPCBInfo, setShowPCBInfo] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [categorySettings, setCategorySettings] = useState<CategorySettings | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [quoteQuestions, setQuoteQuestions] = useState<QuoteQuestion[]>([]);
  
  const [quoteData, setQuoteData] = useState<QuoteData>({
    productType: null,
    pitch: null,
    purpose: null,
    pcbType: null,
    cabinetQuantity: null,
    cabinetLayout: '',
    cep: '',
    city: '',
    state: '',
    questionnaireAnswers: {},
  });

  useEffect(() => {
    fetchCategorySettings();
    fetchQuoteQuestions();
  }, []);

  const fetchCategorySettings = async () => {
    setLoadingSettings(true);
    try {
      const { data } = await supabase
        .from('site_settings')
        .select('*')
        .eq('key', 'category_settings')
        .single();
      
      if (data?.value) {
        setCategorySettings(data.value as unknown as CategorySettings);
      } else {
        // Default settings if none found
        setCategorySettings({
          outdoor: { image_url: '', visible: true, is_main: true, order: 1 },
          rental: { image_url: '', visible: true, is_main: true, order: 2 },
          indoor: { image_url: '', visible: true, is_main: false, order: 3 },
        });
      }
    } catch (error) {
      console.error('Erro ao carregar configurações de categorias:', error);
      // Set default on error
      setCategorySettings({
        outdoor: { image_url: '', visible: true, is_main: true, order: 1 },
        rental: { image_url: '', visible: true, is_main: true, order: 2 },
        indoor: { image_url: '', visible: true, is_main: false, order: 3 },
      });
    } finally {
      setLoadingSettings(false);
    }
  };

  const fetchQuoteQuestions = async () => {
    try {
      const { data, error } = await supabase
        .from('quote_questions')
        .select('*')
        .eq('is_active', true)
        .order('order_position', { ascending: true });
      
      if (error) throw error;
      setQuoteQuestions(data || []);
    } catch (error) {
      console.error('Erro ao carregar perguntas:', error);
    }
  };

  const updateQuoteData = (field: keyof QuoteData, value: string | number | null) => {
    setQuoteData(prev => ({ ...prev, [field]: value }));
  };

  const handleProductTypeSelect = (type: ProductType) => {
    updateQuoteData('productType', type);
    // Reset pitch when changing product type
    updateQuoteData('pitch', null);
    setCurrentStep(2);
  };

  const handlePitchSelect = (pitch: string) => {
    updateQuoteData('pitch', pitch);
  };

  const getCabinetSpecs = () => {
    if (!quoteData.productType) return CABINET_SPECS.outdoor;
    return CABINET_SPECS[quoteData.productType];
  };


  const handlePCBSelect = (pcb: PCBType) => {
    if (pcb === '2_camadas') {
      setShowPCBInfo(true);
      return;
    }
    updateQuoteData('pcbType', pcb);
  };

  const generateLayouts = (quantity: number): string[] => {
    const layouts: string[] = [];
    for (let i = 1; i <= Math.sqrt(quantity); i++) {
      if (quantity % i === 0) {
        const j = quantity / i;
        layouts.push(`${i}x${j}`);
        if (i !== j) {
          layouts.push(`${j}x${i}`);
        }
      }
    }
    return [...new Set(layouts)].sort((a, b) => {
      const [a1] = a.split('x').map(Number);
      const [b1] = b.split('x').map(Number);
      return a1 - b1;
    });
  };

  const handleSubmit = async () => {
    if (!user || !quoteData.cabinetQuantity) return;
    
    setLoading(true);
    try {
      const { error } = await supabase.from('quotes').insert({
        user_id: user.id,
        product_type: quoteData.productType!,
        pitch: quoteData.pitch!,
        purpose: quoteData.purpose!,
        pcb_type: quoteData.pcbType === '4_camadas' ? '4 Camadas 1.6mm' : '2 Camadas 1.2mm',
        cabinet_quantity: quoteData.cabinetQuantity,
        cabinet_layout: quoteData.cabinetLayout,
        delivery_cep: quoteData.cep.replace(/\D/g, ''),
        delivery_city: quoteData.city,
        delivery_state: quoteData.state,
        questionnaire_answers: Object.keys(quoteData.questionnaireAnswers).length > 0 
          ? quoteData.questionnaireAnswers 
          : null,
      });

      if (error) throw error;
      setSuccess(true);
    } catch (error) {
      console.error('Erro ao criar orçamento:', error);
    }
    setLoading(false);
  };

  const [showOtherModels, setShowOtherModels] = useState(false);
  const [missingFieldWarning, setMissingFieldWarning] = useState<string | null>(null);

  const getMissingFieldMessage = () => {
    switch (currentStep) {
      case 1:
        if (!quoteData.productType) return 'Selecione o tipo de painel';
        break;
      case 2:
        if (!quoteData.pitch) return 'Selecione o pitch';
        if (!quoteData.purpose) return 'Selecione a finalidade de uso';
        if (!quoteData.pcbType) return 'Selecione o tipo de PCB';
        break;
      case 3:
        if (!quoteData.cabinetQuantity || quoteData.cabinetQuantity <= 0) return 'Informe a quantidade de gabinetes';
        if (!quoteData.cabinetLayout) return 'Selecione a disposição dos gabinetes';
        break;
      case 4:
        if (quoteData.cep.length !== 9) return 'Informe o CEP completo';
        if (!quoteData.city) return 'Informe a cidade';
        if (!quoteData.state) return 'Informe o estado';
        break;
      case 5:
        // Check if all questions are answered (only if there are questions)
        if (quoteQuestions.length > 0) {
          const unansweredQuestion = quoteQuestions.find(
            q => !quoteData.questionnaireAnswers[q.id]
          );
          if (unansweredQuestion) return 'Responda todas as perguntas';
        }
        break;
    }
    return null;
  };

  const handleNextStep = () => {
    const missing = getMissingFieldMessage();
    if (missing) {
      setMissingFieldWarning(missing);
      return;
    }
    setMissingFieldWarning(null);
    setCurrentStep(currentStep + 1);
  };

  const getCategoryImage = (type: string) => {
    if (!categorySettings) return null;
    const setting = categorySettings[type];
    if (setting?.image_url) {
      return resolveImageUrl(setting.image_url);
    }
    return null;
  };

  const getMainCategories = () => {
    if (!categorySettings) return [];
    return Object.entries(categorySettings)
      .filter(([_, config]) => config.visible && config.is_main)
      .sort((a, b) => a[1].order - b[1].order)
      .map(([key]) => key);
  };

  const getOtherCategories = () => {
    if (!categorySettings) return [];
    return Object.entries(categorySettings)
      .filter(([_, config]) => config.visible && !config.is_main)
      .sort((a, b) => a[1].order - b[1].order)
      .map(([key]) => key);
  };

  const getCategoryLabel = (type: string) => {
    const labels: Record<string, { name: string; desc: string }> = {
      outdoor: { name: 'Outdoor', desc: 'Painéis para uso externo' },
      indoor: { name: 'Indoor', desc: 'Painéis para uso interno' },
      rental: { name: 'Rental', desc: 'Painéis para locação' },
    };
    return labels[type] || { name: type, desc: '' };
  };

  const renderStep1 = () => {
    if (loadingSettings) {
      return (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      );
    }

    const mainCategories = getMainCategories();
    const otherCategories = getOtherCategories();

    return (
      <div className="space-y-6">
        <div className="text-center mb-8">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
            Selecione o Tipo de Painel LED
          </h2>
          <p className="text-gray-600 text-sm sm:text-base">
            Escolha a linha de produto que melhor atende seu projeto
          </p>
        </div>

        {/* Main Products */}
        <div className={`grid gap-4 ${mainCategories.length === 1 ? 'grid-cols-1 max-w-sm mx-auto' : 'grid-cols-1 sm:grid-cols-2'}`}>
          {mainCategories.map((type) => {
            const label = getCategoryLabel(type);
            const image = getCategoryImage(type);
            
            return (
              <button
                key={type}
                onClick={() => handleProductTypeSelect(type as ProductType)}
                className={`relative overflow-hidden rounded-2xl border-2 transition-all ${
                  quoteData.productType === type
                    ? 'border-primary ring-2 ring-primary/20'
                    : 'border-gray-200 hover:border-primary/50'
                }`}
              >
                {image ? (
                  <img 
                    src={image} 
                    alt={label.name} 
                    className="w-full h-40 sm:h-48 object-cover"
                  />
                ) : (
                  <div className="w-full h-40 sm:h-48 bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center">
                    <span className="text-4xl">📺</span>
                  </div>
                )}
                <div className="p-4 bg-white">
                  <h3 className="font-semibold text-gray-900">{label.name}</h3>
                  <p className="text-sm text-gray-600">{label.desc}</p>
                </div>
                <div className="absolute top-2 right-2 px-2 py-1 bg-success text-white text-xs rounded-full">
                  Disponível
                </div>
              </button>
            );
          })}
        </div>

        {/* Ver outros modelos */}
        {otherCategories.length > 0 && (
          <>
            <div className="text-center">
              <button
                onClick={() => setShowOtherModels(!showOtherModels)}
                className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                {showOtherModels ? 'Ocultar outros modelos' : 'Ver outros modelos'}
                <ChevronDown className={`w-4 h-4 transition-transform ${showOtherModels ? 'rotate-180' : ''}`} />
              </button>
            </div>

            {/* Other Models */}
            {showOtherModels && (
              <div className="border-t pt-6">
                <p className="text-sm text-gray-500 mb-4 text-center">Outros modelos disponíveis:</p>
                <div className="grid gap-4 max-w-lg mx-auto">
                  {otherCategories.map((type) => {
                    const label = getCategoryLabel(type);
                    const image = getCategoryImage(type);
                    
                    return (
                      <button
                        key={type}
                        onClick={() => handleProductTypeSelect(type as ProductType)}
                        className="w-full p-4 rounded-xl border-2 border-gray-200 hover:border-primary/50 text-left transition-all flex items-center gap-4"
                      >
                        {image ? (
                          <img 
                            src={image} 
                            alt={label.name} 
                            className="w-16 h-16 object-cover rounded-lg flex-shrink-0"
                          />
                        ) : (
                          <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                            <span className="text-gray-400 text-2xl">📺</span>
                          </div>
                        )}
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-gray-900">{label.name}</h3>
                            <span className="px-2 py-0.5 bg-success text-white text-xs rounded-full">Disponível</span>
                          </div>
                          <p className="text-sm text-gray-600">{label.desc}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  const renderStep2 = () => {
    const productType = quoteData.productType;
    if (!productType) return null;
    
    const pitchOptions = PITCH_OPTIONS[productType];
    const cabinetSpecs = getCabinetSpecs();

    return (
      <div className="space-y-6 sm:space-y-8">
        <div className="text-center mb-6 sm:mb-8">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
            Configure seu Painel {productType.charAt(0).toUpperCase()}{productType.slice(1)}
          </h2>
          <p className="text-gray-600 text-sm sm:text-base">
            Personalize as especificações técnicas do seu projeto
          </p>
        </div>

        {/* Pitch Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Pitch (Distância entre pixels)
          </label>
          <div className={`grid gap-3 ${pitchOptions.length <= 3 ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-4'}`}>
            {pitchOptions.map((pitch) => (
              <button
                key={pitch.value}
                onClick={() => handlePitchSelect(pitch.value)}
                className={`p-3 sm:p-4 rounded-xl border-2 transition-all ${
                  quoteData.pitch === pitch.value
                    ? 'border-primary bg-primary/10'
                    : 'border-gray-200 hover:border-primary/50'
                }`}
              >
                <span className="font-semibold text-gray-900">{pitch.value}</span>
                {pitch.recommended && (
                  <span className="block text-xs text-success mt-1">Recomendado</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Purpose Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Finalidade de Uso
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <button
              onClick={() => updateQuoteData('purpose', 'proprio')}
              className={`p-3 sm:p-4 rounded-xl border-2 text-left transition-all ${
                quoteData.purpose === 'proprio'
                  ? 'border-primary bg-primary/10'
                  : 'border-gray-200 hover:border-primary/50'
              }`}
            >
              <h4 className="font-semibold text-gray-900 text-sm sm:text-base">Uso Próprio</h4>
              <p className="text-xs sm:text-sm text-gray-600 mt-1">
                Ambiente gourmet, piscina, fachada própria
              </p>
            </button>
            <button
              onClick={() => updateQuoteData('purpose', 'comercial')}
              className={`p-3 sm:p-4 rounded-xl border-2 text-left transition-all relative overflow-hidden ${
                quoteData.purpose === 'comercial'
                  ? 'border-primary bg-primary/10 ring-2 ring-primary/20'
                  : 'border-gray-200 hover:border-primary/50'
              }`}
            >
              <div className="absolute top-0 right-0 bg-gradient-to-r from-primary to-secondary text-white text-[10px] px-2 py-0.5 rounded-bl flex items-center gap-1">
                <Star className="w-3 h-3" />
                Principal
              </div>
              <h4 className="font-semibold text-gray-900 text-sm sm:text-base">Uso Comercial</h4>
              <p className="text-xs sm:text-sm text-gray-600 mt-1">
                Empreender vendendo publicidade para outras empresas
              </p>
            </button>
          </div>
        </div>

        {/* PCB Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Tipo de PCB (Placa de Circuito)
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <button
              onClick={() => handlePCBSelect('2_camadas')}
              className="p-3 sm:p-4 rounded-xl border-2 border-gray-200 text-left relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 bg-amber-500 text-white text-[10px] px-2 py-0.5 rounded-bl">
                Mais barato
              </div>
              <h4 className="font-semibold text-gray-500 text-sm sm:text-base">2 Camadas 1.2mm</h4>
              <p className="text-xs sm:text-sm text-gray-400 mt-1">Opção econômica básica</p>
              <p className="text-xs text-amber-600 mt-2">⚠️ Menor durabilidade</p>
            </button>
            <button
              onClick={() => handlePCBSelect('4_camadas')}
              className={`p-3 sm:p-4 rounded-xl border-2 text-left transition-all relative overflow-hidden ${
                quoteData.pcbType === '4_camadas'
                  ? 'border-primary bg-primary/10 ring-2 ring-primary/20'
                  : 'border-gray-200 hover:border-primary/50'
              }`}
            >
              <div className="absolute top-0 right-0 bg-gradient-to-r from-primary to-secondary text-white text-[10px] px-2 py-0.5 rounded-bl flex items-center gap-1">
                <Star className="w-3 h-3" />
                Premium
              </div>
              <div className="flex items-center gap-2">
                <h4 className="font-semibold text-gray-900 text-sm sm:text-base">4 Camadas 1.6mm</h4>
              </div>
              <p className="text-xs sm:text-sm text-gray-600 mt-1">Alta durabilidade e qualidade</p>
              <p className="text-xs text-green-600 mt-2">✓ Recomendado pela Ledbras</p>
            </button>
          </div>
        </div>

        {/* Auto-filled specs */}
        {quoteData.pcbType === '4_camadas' && (
          <div className="bg-gray-50 rounded-xl p-3 sm:p-4">
            <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2 text-sm sm:text-base">
              <Info className="w-4 h-4 text-primary" />
              Especificações Incluídas
            </h4>
            <div className="grid grid-cols-2 gap-3 sm:gap-4 text-xs sm:text-sm">
              <div>
                <span className="text-gray-600">Chip LED:</span>
                <span className="ml-1 sm:ml-2 font-medium">Kinglight / Nationstar</span>
              </div>
              <div>
                <span className="text-gray-600">Driver IC:</span>
                <span className="ml-1 sm:ml-2 font-medium">ICN2153</span>
              </div>
              <div>
                <span className="text-gray-600">Fonte:</span>
                <span className="ml-1 sm:ml-2 font-medium">G-Energy</span>
              </div>
              <div>
                <span className="text-gray-600">Gabinete:</span>
                <span className="ml-1 sm:ml-2 font-medium">{cabinetSpecs.label}</span>
              </div>
            </div>
            <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-gray-200">
              <a
                href={SPECS_SHEET_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 text-xs sm:text-sm font-medium transition-colors"
              >
                <ExternalLink className="w-3 h-3 sm:w-4 sm:h-4" />
                Ver Especificações Técnicas Completas
              </a>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderStep3 = () => {
    const layouts = quoteData.cabinetQuantity ? generateLayouts(quoteData.cabinetQuantity) : [];
    const cabinetSpecs = getCabinetSpecs();
    const widthM = cabinetSpecs.width / 100;
    const heightM = cabinetSpecs.height / 100;

    return (
      <div className="space-y-6">
        <div className="text-center mb-6 sm:mb-8">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
            Defina o Tamanho do Painel
          </h2>
          <p className="text-gray-600 text-sm sm:text-base">
            Informe a quantidade de gabinetes e escolha a disposição
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Quantidade de Gabinetes ({cabinetSpecs.label} cada)
          </label>
          <input
            type="number"
            min="1"
            max="100"
            value={quoteData.cabinetQuantity ?? ''}
            onChange={(e) => {
              const value = e.target.value === '' ? null : parseInt(e.target.value);
              if (value === null || (value >= 1 && value <= 100)) {
                updateQuoteData('cabinetQuantity', value);
                updateQuoteData('cabinetLayout', '');
              }
            }}
            placeholder="Digite a quantidade"
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary/50 focus:border-primary text-sm sm:text-base"
          />
          {quoteData.cabinetQuantity && (
            <p className="text-xs sm:text-sm text-gray-500 mt-2">
              Área total: {(quoteData.cabinetQuantity * cabinetSpecs.area).toFixed(2)}m²
            </p>
          )}
        </div>

        {quoteData.cabinetQuantity && quoteData.cabinetQuantity > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Disposição dos Gabinetes
            </label>
            <div className="flex flex-wrap gap-2 sm:gap-3">
              {layouts.map((layout) => (
                <button
                  key={layout}
                  onClick={() => updateQuoteData('cabinetLayout', layout)}
                  className={`px-3 sm:px-4 py-2 rounded-lg border-2 transition-all text-sm sm:text-base ${
                    quoteData.cabinetLayout === layout
                      ? 'border-primary bg-primary/10'
                      : 'border-gray-200 hover:border-primary/50'
                  }`}
                >
                  {layout}
                </button>
              ))}
            </div>
            {quoteData.cabinetLayout && (
              <p className="text-xs sm:text-sm text-gray-600 mt-3">
                Dimensões: {quoteData.cabinetLayout.split('x')[0]} × {widthM}m × {quoteData.cabinetLayout.split('x')[1]} × {heightM}m = {' '}
                {(parseInt(quoteData.cabinetLayout.split('x')[0]) * widthM).toFixed(2)}m × {' '}
                {(parseInt(quoteData.cabinetLayout.split('x')[1]) * heightM).toFixed(2)}m
              </p>
            )}
          </div>
        )}
      </div>
    );
  };

  const [cepNotFound, setCepNotFound] = useState(false);

  const fetchCepDataUpdated = async (cep: string) => {
    const cleanCep = cep.replace(/\D/g, '');
    if (cleanCep.length !== 8) return;
    
    setCepLoading(true);
    setCepNotFound(false);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
      const data = await response.json();
      if (data.erro) {
        setCepNotFound(true);
        updateQuoteData('city', '');
        updateQuoteData('state', '');
      } else {
        updateQuoteData('city', data.localidade);
        updateQuoteData('state', data.uf);
        setCepNotFound(false);
      }
    } catch (error) {
      console.error('Erro ao buscar CEP:', error);
      setCepNotFound(true);
      updateQuoteData('city', '');
      updateQuoteData('state', '');
    }
    setCepLoading(false);
  };

  const handleCepChangeUpdated = (value: string) => {
    const formatted = value
      .replace(/\D/g, '')
      .replace(/(\d{5})(\d)/, '$1-$2')
      .slice(0, 9);
    updateQuoteData('cep', formatted);
    
    if (formatted.replace(/\D/g, '').length === 8) {
      fetchCepDataUpdated(formatted);
    } else {
      setCepNotFound(false);
    }
  };

  const renderStep4 = () => (
    <div className="space-y-6">
      <div className="text-center mb-6 sm:mb-8">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
          Local de Entrega
        </h2>
        <p className="text-gray-600 text-sm sm:text-base">
          Informe o CEP para calcularmos o frete
        </p>
      </div>

      <div className="max-w-md mx-auto space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            CEP
          </label>
          <div className="relative">
            <input
              type="text"
              value={quoteData.cep}
              onChange={(e) => handleCepChangeUpdated(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary/50 focus:border-primary"
              placeholder="00000-000"
            />
            {cepLoading && (
              <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 animate-spin" />
            )}
          </div>
        </div>

        {/* CEP encontrado - mostra info preenchida */}
        {quoteData.city && quoteData.state && !cepNotFound && (
          <div className="bg-gray-50 rounded-xl p-4 flex items-center gap-3">
            <MapPin className="w-5 h-5 text-primary flex-shrink-0" />
            <div>
              <p className="font-medium text-gray-900">{quoteData.city}</p>
              <p className="text-sm text-gray-600">{quoteData.state}</p>
            </div>
          </div>
        )}

        {/* CEP não encontrado ou erro - campos manuais */}
        {(cepNotFound || (quoteData.cep.length === 9 && !quoteData.city && !cepLoading)) && (
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-700">
                <p className="font-medium">CEP não encontrado</p>
                <p>Por favor, informe a cidade e o estado manualmente.</p>
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Cidade
              </label>
              <input
                type="text"
                value={quoteData.city}
                onChange={(e) => updateQuoteData('city', e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary/50 focus:border-primary"
                placeholder="Digite a cidade"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Estado (UF)
              </label>
              <select
                value={quoteData.state}
                onChange={(e) => updateQuoteData('state', e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary/50 focus:border-primary"
              >
                <option value="">Selecione o estado</option>
                <option value="AC">Acre</option>
                <option value="AL">Alagoas</option>
                <option value="AP">Amapá</option>
                <option value="AM">Amazonas</option>
                <option value="BA">Bahia</option>
                <option value="CE">Ceará</option>
                <option value="DF">Distrito Federal</option>
                <option value="ES">Espírito Santo</option>
                <option value="GO">Goiás</option>
                <option value="MA">Maranhão</option>
                <option value="MT">Mato Grosso</option>
                <option value="MS">Mato Grosso do Sul</option>
                <option value="MG">Minas Gerais</option>
                <option value="PA">Pará</option>
                <option value="PB">Paraíba</option>
                <option value="PR">Paraná</option>
                <option value="PE">Pernambuco</option>
                <option value="PI">Piauí</option>
                <option value="RJ">Rio de Janeiro</option>
                <option value="RN">Rio Grande do Norte</option>
                <option value="RS">Rio Grande do Sul</option>
                <option value="RO">Rondônia</option>
                <option value="RR">Roraima</option>
                <option value="SC">Santa Catarina</option>
                <option value="SP">São Paulo</option>
                <option value="SE">Sergipe</option>
                <option value="TO">Tocantins</option>
              </select>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderStep5 = () => {
    // If no questions, show a message and auto-advance option
    if (quoteQuestions.length === 0) {
      return (
        <div className="space-y-6">
          <div className="text-center mb-6 sm:mb-8">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
              Questionário
            </h2>
            <p className="text-gray-600 text-sm sm:text-base">
              Nenhuma pergunta adicional no momento
            </p>
          </div>
          <div className="bg-gray-50 rounded-xl p-6 text-center">
            <p className="text-gray-600">Clique em "Próximo" para continuar para a confirmação.</p>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div className="text-center mb-6 sm:mb-8">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
            Questionário
          </h2>
          <p className="text-gray-600 text-sm sm:text-base">
            Responda às perguntas abaixo para personalizarmos seu orçamento
          </p>
        </div>

        <div className="space-y-6">
          {quoteQuestions.map((question, index) => (
            <div key={question.id} className="bg-gray-50 rounded-xl p-4 sm:p-6">
              <p className="font-medium text-gray-900 mb-4">
                {index + 1}. {question.question}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={() => setQuoteData(prev => ({
                    ...prev,
                    questionnaireAnswers: {
                      ...prev.questionnaireAnswers,
                      [question.id]: 'A'
                    }
                  }))}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    quoteData.questionnaireAnswers[question.id] === 'A'
                      ? 'border-primary bg-primary/10 ring-2 ring-primary/20'
                      : 'border-gray-200 hover:border-primary/50'
                  }`}
                >
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/20 text-primary text-sm font-semibold mr-2">A</span>
                  <span className="text-gray-900">{question.option_a}</span>
                </button>
                <button
                  onClick={() => setQuoteData(prev => ({
                    ...prev,
                    questionnaireAnswers: {
                      ...prev.questionnaireAnswers,
                      [question.id]: 'B'
                    }
                  }))}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    quoteData.questionnaireAnswers[question.id] === 'B'
                      ? 'border-primary bg-primary/10 ring-2 ring-primary/20'
                      : 'border-gray-200 hover:border-primary/50'
                  }`}
                >
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/20 text-primary text-sm font-semibold mr-2">B</span>
                  <span className="text-gray-900">{question.option_b}</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderStep6 = () => {
    const cabinetSpecs = getCabinetSpecs();
    
    return (
      <div className="space-y-6">
        <div className="text-center mb-6 sm:mb-8">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
            Confirme seu Orçamento
          </h2>
          <p className="text-gray-600 text-sm sm:text-base">
            Revise as informações antes de enviar
          </p>
        </div>

        <div className="bg-gray-50 rounded-xl p-4 sm:p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <div>
              <span className="text-xs sm:text-sm text-gray-600">Tipo:</span>
              <p className="font-medium text-gray-900 capitalize text-sm sm:text-base">{quoteData.productType}</p>
            </div>
            <div>
              <span className="text-xs sm:text-sm text-gray-600">Pitch:</span>
              <p className="font-medium text-gray-900 text-sm sm:text-base">{quoteData.pitch}</p>
            </div>
            <div>
              <span className="text-xs sm:text-sm text-gray-600">Finalidade:</span>
              <p className="font-medium text-gray-900 capitalize text-sm sm:text-base">{quoteData.purpose}</p>
            </div>
            <div>
              <span className="text-xs sm:text-sm text-gray-600">PCB:</span>
              <p className="font-medium text-gray-900 text-sm sm:text-base">
                {quoteData.pcbType === '4_camadas' ? '4 Camadas 1.6mm' : '2 Camadas 1.2mm'}
              </p>
            </div>
            <div>
              <span className="text-xs sm:text-sm text-gray-600">Gabinetes ({cabinetSpecs.label}):</span>
              <p className="font-medium text-gray-900 text-sm sm:text-base">{quoteData.cabinetQuantity} ({quoteData.cabinetLayout})</p>
            </div>
            <div>
              <span className="text-xs sm:text-sm text-gray-600">Área Total:</span>
              <p className="font-medium text-gray-900 text-sm sm:text-base">
                {quoteData.cabinetQuantity ? (quoteData.cabinetQuantity * cabinetSpecs.area).toFixed(2) : 0}m²
              </p>
            </div>
          </div>
        <div className="pt-4 border-t border-gray-200">
          <span className="text-sm text-gray-600">Local de Entrega:</span>
          <p className="font-medium text-gray-900">
            {quoteData.city}, {quoteData.state} - CEP: {quoteData.cep}
          </p>
        </div>
        
        {/* Show questionnaire answers if any */}
        {quoteQuestions.length > 0 && Object.keys(quoteData.questionnaireAnswers).length > 0 && (
          <div className="pt-4 border-t border-gray-200">
            <span className="text-sm text-gray-600 block mb-2">Respostas do Questionário:</span>
            <div className="space-y-2">
              {quoteQuestions.map((q) => {
                const answer = quoteData.questionnaireAnswers[q.id];
                if (!answer) return null;
                return (
                  <div key={q.id} className="text-sm">
                    <span className="text-gray-500">{q.question}</span>
                    <p className="font-medium text-gray-900">
                      {answer === 'A' ? q.option_a : q.option_b}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="bg-primary/10 rounded-xl p-4 flex items-start gap-3">
        <Info className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-medium text-gray-900">Próximos Passos</p>
          <p className="text-gray-600 mt-1">
            Após enviar a solicitação, nossa equipe preparará seu orçamento personalizado em até 24 horas. Você receberá uma notificação por email.
          </p>
        </div>
      </div>

      <button
        onClick={handleSubmit}
        disabled={loading}
        className="w-full px-6 py-4 bg-primary text-white font-semibold rounded-xl hover:bg-primary/90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Enviando...
          </>
        ) : (
          <>
            <Check className="w-5 h-5" />
            Enviar Solicitação de Orçamento
          </>
        )}
      </button>
    </div>
    );
  };

  const renderSuccess = () => (
    <div className="text-center py-8 sm:py-12">
      <div className="w-16 h-16 sm:w-20 sm:h-20 bg-success/20 rounded-full flex items-center justify-center mx-auto mb-6">
        <CheckCircle className="w-8 h-8 sm:w-10 sm:h-10 text-success" />
      </div>
      <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4">
        Solicitação Enviada!
      </h2>
      <p className="text-gray-600 max-w-md mx-auto mb-8 text-sm sm:text-base">
        Seu pedido de orçamento foi recebido com sucesso. Nossa equipe entrará em contato em até 24 horas úteis.
      </p>
      <div className="flex flex-col sm:flex-row gap-4 justify-center">
        <button
          onClick={() => navigate('/dashboard/orders')}
          className="px-6 py-3 bg-primary text-white font-semibold rounded-xl hover:bg-primary/90 transition-colors"
        >
          Ver Meus Pedidos
        </button>
        <a
          href={WHATSAPP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="px-6 py-3 border border-gray-300 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-colors"
        >
          Falar no WhatsApp
        </a>
      </div>
    </div>
  );

  if (success) {
    return (
      <div className="min-h-screen bg-background">
        <header className="bg-tech-dark border-b border-tech-navy">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-14 sm:h-16">
              <a href="/" className="flex items-center">
                <img src={logo} alt="Ledbras" className="h-6 sm:h-8" />
              </a>
            </div>
          </div>
        </header>
        <main className="max-w-2xl mx-auto px-4 py-8 sm:py-12">
          <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-lg">
            {renderSuccess()}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-tech-dark border-b border-tech-navy sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16">
            <a href="/" className="flex items-center">
              <img src={logo} alt="Ledbras" className="h-6 sm:h-8" />
            </a>
            <button
              onClick={() => navigate('/dashboard')}
              className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm hidden sm:inline">Voltar</span>
            </button>
          </div>
        </div>
      </header>

      {/* Progress Steps */}
      <div className="bg-white border-b border-gray-200 sticky top-14 sm:top-16 z-40">
        <div className="max-w-3xl mx-auto px-4 py-3 sm:py-4">
          <div className="flex items-center justify-between">
            {STEPS.map((step, index) => (
              <div key={step.id} className="flex items-center">
                <div
                  className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs sm:text-sm font-medium ${
                    currentStep >= step.id
                      ? 'bg-primary text-white'
                      : 'bg-gray-200 text-gray-500'
                  }`}
                >
                  {currentStep > step.id ? <Check className="w-3 h-3 sm:w-4 sm:h-4" /> : step.id}
                </div>
                <span className={`ml-1 sm:ml-2 text-xs sm:text-sm hidden sm:inline ${
                  currentStep >= step.id ? 'text-gray-900 font-medium' : 'text-gray-500'
                }`}>
                  {step.title}
                </span>
                {index < STEPS.length - 1 && (
                  <div className={`w-6 sm:w-12 h-0.5 mx-1 sm:mx-2 ${
                    currentStep > step.id ? 'bg-primary' : 'bg-gray-200'
                  }`} />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-2xl mx-auto px-4 py-6 sm:py-8">
        <div className="bg-white rounded-2xl p-4 sm:p-8 shadow-lg">
          {currentStep === 1 && renderStep1()}
          {currentStep === 2 && renderStep2()}
          {currentStep === 3 && renderStep3()}
          {currentStep === 4 && renderStep4()}
          {currentStep === 5 && renderStep5()}
          {currentStep === 6 && renderStep6()}

          {/* Missing field warning */}
          {missingFieldWarning && (
            <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0" />
              <span className="text-sm text-amber-700">{missingFieldWarning}</span>
            </div>
          )}

          {/* Navigation Buttons */}
          {currentStep < 6 && (
            <div className="flex justify-between mt-6 sm:mt-8 pt-4 sm:pt-6 border-t border-gray-200">
              <button
                onClick={() => {
                  setCurrentStep(currentStep - 1);
                  setMissingFieldWarning(null);
                }}
                disabled={currentStep === 1}
                className="flex items-center gap-2 px-4 sm:px-6 py-2 sm:py-3 text-gray-600 hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm sm:text-base"
              >
                <ArrowLeft className="w-4 h-4" />
                Voltar
              </button>
              <button
                onClick={handleNextStep}
                className="flex items-center gap-2 px-4 sm:px-6 py-2 sm:py-3 bg-primary text-white rounded-xl hover:bg-primary/90 transition-colors text-sm sm:text-base"
              >
                Próximo
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </main>

      {/* Pitch Warning Modal */}
      {showPitchWarning && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 sm:p-8 max-w-md w-full">
            <div className="text-center">
              <div className="w-14 h-14 sm:w-16 sm:h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-7 h-7 sm:w-8 sm:h-8 text-amber-500" />
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-2">
                Pitch não disponível online
              </h3>
              <p className="text-gray-600 mb-6 text-sm sm:text-base">
                Este pitch não está disponível para cotação online. Para solicitar este pitch, entre em contato com nossa equipe pelo WhatsApp.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <button
                  onClick={() => setShowPitchWarning(false)}
                  className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  Entendi
                </button>
                <a
                  href={WHATSAPP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-6 py-2 bg-success text-white rounded-lg hover:bg-success/90 transition-colors"
                >
                  Falar no WhatsApp
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PCB Info Modal */}
      {showPCBInfo && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 sm:p-8 max-w-md w-full">
            <div className="text-center">
              <div className="w-14 h-14 sm:w-16 sm:h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-7 h-7 sm:w-8 sm:h-8 text-amber-500" />
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-2">
                PCB 2 Camadas
              </h3>
              <p className="text-gray-600 mb-6 text-sm sm:text-base">
                O PCB de 2 camadas possui menor durabilidade e não é recomendado pela Ledbras. Para uma cotação especial com este tipo de PCB, entre em contato com nossa equipe.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <button
                  onClick={() => setShowPCBInfo(false)}
                  className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  Usar 4 Camadas
                </button>
                <a
                  href={WHATSAPP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-6 py-2 bg-success text-white rounded-lg hover:bg-success/90 transition-colors"
                >
                  Falar no WhatsApp
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}