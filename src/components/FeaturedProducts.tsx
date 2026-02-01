import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, X, ExternalLink, Monitor, ImageIcon, LogIn, MessageCircle, Star, Loader2 } from 'lucide-react';
import { supabase } from '../integrations/supabase/client';
import { resolveImageUrl } from '../utils/assetResolver';
import { useAuth } from '../contexts/AuthContext';
import { WhatsAppInfoModal } from './WhatsAppInfoModal';

const WHATSAPP_URL = 'https://wa.me/551433331005?text=Olá! Gostaria de solicitar referências de clientes que já importaram.';

interface Product {
  id: string;
  name: string;
  category: string;
  description: string;
  image: string;
  specSheetUrl: string;
  specs: {
    pitch: string;
    pcb: string;
    resolution: string;
    usage: string;
  };
  features: string[];
}

interface GalleryImage {
  id: string;
  name: string;
  url: string;
  category: string;
}

const products: Product[] = [
  {
    id: 'outdoor',
    name: 'Painel LED Outdoor',
    category: 'EXTERNO',
    description: 'Ideal para publicidade externa, fachadas e grandes eventos. Alta resistência às intempéries.',
    image: '', // Will be loaded from gallery
    specSheetUrl: 'https://drive.google.com/file/d/1wLQajM6IpZESV6ft1dmTeIkm8pUZriD1/view',
    specs: {
      pitch: 'P4 - P10',
      pcb: '1.6mm 4 camadas',
      resolution: 'Full HD / 4K',
      usage: 'Externo'
    },
    features: ['Proteção IP65', 'Alta luminosidade', 'Resistente a chuva', 'Vida útil 100.000h']
  },
  {
    id: 'rental',
    name: 'Painel LED Rental',
    category: 'EVENTOS',
    description: 'Montagem rápida para shows, eventos corporativos e feiras. Sistema modular prático.',
    image: '', // Will be loaded from gallery
    specSheetUrl: 'https://drive.google.com/file/d/1wLQajM6IpZESV6ft1dmTeIkm8pUZriD1/view',
    specs: {
      pitch: 'P2.6 - P4.8',
      pcb: '1.6mm 4 camadas',
      resolution: 'Full HD / 4K',
      usage: 'Eventos'
    },
    features: ['Montagem rápida', 'Case de transporte', 'Ultra leve', 'Curvas possíveis']
  }
];

export function FeaturedProducts() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showGallery, setShowGallery] = useState(false);
  const [selectedGalleryImage, setSelectedGalleryImage] = useState(0);
  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([]);
  const [productImages, setProductImages] = useState<{ [key: string]: string }>({});
  const [loading, setLoading] = useState(true);
  const [showInfoModal, setShowInfoModal] = useState(false);

  const handleQuoteClick = () => {
    if (user) {
      navigate('/dashboard/quote');
    } else {
      setShowInfoModal(true);
    }
  };

  useEffect(() => {
    fetchImages();
  }, []);

  const fetchImages = async () => {
    try {
      const { data, error } = await supabase
        .from('gallery_images')
        .select('*')
        .eq('is_active', true)
        .order('order_position', { ascending: true });

      if (error) throw error;

      const images = data as GalleryImage[] || [];
      
      // Find product images (first images for each product category)
      const productImgs: { [key: string]: string } = {};
      const outdoorImg = images.find(img => img.category === 'products' && img.name.toLowerCase().includes('outdoor'));
      const rentalImg = images.find(img => img.category === 'products' && img.name.toLowerCase().includes('rental'));
      
      if (outdoorImg) productImgs['outdoor'] = resolveImageUrl(outdoorImg.url) || outdoorImg.url;
      if (rentalImg) productImgs['rental'] = resolveImageUrl(rentalImg.url) || rentalImg.url;
      
      // If no specific product images, use first available
      if (!productImgs['outdoor'] && images.length > 0) {
        productImgs['outdoor'] = resolveImageUrl(images[0].url) || images[0].url;
      }
      if (!productImgs['rental'] && images.length > 1) {
        productImgs['rental'] = resolveImageUrl(images[1]?.url) || resolveImageUrl(images[0].url) || images[0].url;
      }
      
      setProductImages(productImgs);
      
      // Filter project images for gallery and resolve URLs
      const projectImages = images.filter(img => img.category === 'projects').map(img => ({
        ...img,
        url: resolveImageUrl(img.url) || img.url
      }));
      const allImagesResolved = images.slice(0, 5).map(img => ({
        ...img,
        url: resolveImageUrl(img.url) || img.url
      }));
      setGalleryImages(projectImages.length > 0 ? projectImages : allImagesResolved);
    } catch (error) {
      console.error('Error fetching gallery images:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCloseModal = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      setSelectedProduct(null);
    }
  };

  const handleCloseGallery = (e?: React.MouseEvent) => {
    if (!e || e.target === e.currentTarget) {
      setShowGallery(false);
    }
  };

  const getProductImage = (productId: string) => {
    return productImages[productId] || '';
  };

  if (loading) {
    return (
      <section id="produtos" className="py-16 sm:py-24 bg-tech-dark relative overflow-hidden">
        <div className="container mx-auto px-4 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-tech-cyan" />
        </div>
      </section>
    );
  }

  return (
    <section id="produtos" className="py-16 sm:py-24 bg-tech-dark relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 right-0 w-[400px] h-[400px] bg-tech-cyan/5 rounded-full blur-[100px]" />
        <div className="absolute bottom-1/3 left-0 w-[300px] h-[300px] bg-tech-electric/5 rounded-full blur-[80px]" />
      </div>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-tech-cyan/20 flex items-center justify-center">
              <Star className="w-6 h-6 text-tech-cyan" />
            </div>
            <p className="text-tech-cyan text-xs sm:text-sm font-semibold uppercase tracking-wider">
              PRODUTOS
            </p>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4 leading-tight">
            <span className="text-white">Painéis LED </span>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-tech-cyan to-tech-electric">Profissionais</span>
          </h2>
          <p className="text-base sm:text-lg text-slate-400">
            Tecnologia de ponta direto da fábrica com garantia e suporte completo
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          {products.map((product) => (
            <div
              key={product.id}
              className="group bg-gradient-to-br from-tech-blue/60 to-tech-navy/80 border-2 border-tech-cyan/20 hover:border-tech-cyan/50 rounded-2xl overflow-hidden transition-all duration-500 hover:shadow-glow-lg backdrop-blur-sm"
            >
              <div className="relative h-56 sm:h-64 overflow-hidden flex items-center justify-center bg-tech-dark/50">
                {getProductImage(product.id) ? (
                  <img
                    src={getProductImage(product.id)}
                    alt={product.name}
                    className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-700 p-4"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex items-center justify-center w-full h-full">
                    <ImageIcon className="w-16 h-16 text-tech-cyan/30" />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-tech-dark via-transparent to-transparent pointer-events-none" />
                <div className="absolute top-4 left-4">
                  <span className="bg-tech-cyan/90 text-tech-dark text-xs font-bold px-3 py-1 rounded-full">
                    {product.category}
                  </span>
                </div>
              </div>

              <div className="p-6">
                <h3 className="text-2xl font-bold text-white mb-2 group-hover:text-tech-cyan transition-colors">
                  {product.name}
                </h3>
                <p className="text-slate-400 text-sm mb-4 line-clamp-2">
                  {product.description}
                </p>

                <div className="grid grid-cols-2 gap-3 mb-6">
                  <div className="bg-tech-dark/50 rounded-lg p-3 text-center">
                    <p className="text-tech-cyan font-bold text-lg">{product.specs.pitch}</p>
                    <p className="text-slate-500 text-xs">Pixel Pitch</p>
                  </div>
                  <div className="bg-tech-dark/50 rounded-lg p-3 text-center">
                    <p className="text-tech-cyan font-bold text-sm">{product.specs.pcb}</p>
                    <p className="text-slate-500 text-xs">PCB</p>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedProduct({...product, image: getProductImage(product.id)})}
                  className="w-full bg-gradient-to-r from-tech-cyan to-tech-electric hover:from-tech-electric hover:to-tech-cyan text-white font-bold py-3 rounded-xl transition-all hover:scale-105 shadow-glow"
                >
                  Ver Detalhes
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Product Modal */}
      {selectedProduct && (
        <div
          className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 overflow-y-auto"
          onClick={handleCloseModal}
        >
          <div
            className="bg-tech-navy border-2 border-tech-cyan/30 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-glow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-tech-dark/95 backdrop-blur-sm p-4 flex items-center justify-between border-b border-tech-cyan/20 z-10">
              <div className="flex items-center gap-3">
                <span className="bg-tech-cyan text-tech-dark text-xs font-bold px-3 py-1 rounded-full">
                  {selectedProduct.category}
                </span>
                <h3 className="text-xl font-bold text-white">{selectedProduct.name}</h3>
              </div>
              <button
                onClick={() => setSelectedProduct(null)}
                className="w-10 h-10 rounded-full bg-tech-blue/60 hover:bg-tech-cyan/20 flex items-center justify-center transition-colors"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            <div className="grid lg:grid-cols-2 gap-6 p-6">
              <div>
                <div className="relative rounded-xl overflow-hidden mb-4 bg-tech-dark/50 flex items-center justify-center">
                  {selectedProduct.image ? (
                    <img
                      src={selectedProduct.image}
                      alt={selectedProduct.name}
                      className="w-full h-64 object-contain p-4"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex items-center justify-center w-full h-64">
                      <ImageIcon className="w-16 h-16 text-tech-cyan/30" />
                    </div>
                  )}
                </div>

                <p className="text-slate-300 mb-6">{selectedProduct.description}</p>

                <div className="grid grid-cols-2 gap-3 mb-6">
                  <div className="bg-tech-blue/40 border border-tech-cyan/20 rounded-lg p-3 text-center">
                    <p className="text-tech-cyan font-bold">{selectedProduct.specs.pitch}</p>
                    <p className="text-slate-500 text-xs">Pixel Pitch</p>
                  </div>
                  <div className="bg-tech-blue/40 border border-tech-cyan/20 rounded-lg p-3 text-center">
                    <p className="text-tech-cyan font-bold text-sm">{selectedProduct.specs.pcb}</p>
                    <p className="text-slate-500 text-xs">PCB</p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="bg-tech-blue/40 border border-tech-cyan/20 rounded-xl p-4">
                  <h4 className="text-white font-bold text-base mb-3 flex items-center gap-2">
                    <Monitor className="w-4 h-4 text-tech-cyan" />
                    Especificações Técnicas
                  </h4>
                  <a
                    href={selectedProduct.specSheetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full bg-gradient-to-r from-tech-cyan to-tech-electric hover:from-tech-electric hover:to-tech-cyan text-white font-bold py-2.5 px-4 rounded-lg transition-all shadow-glow hover:shadow-glow-lg flex items-center justify-center gap-2 text-sm"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>Abrir Ficha Técnica</span>
                  </a>
                </div>

                {galleryImages.length > 0 && (
                  <div className="bg-tech-blue/40 border border-tech-cyan/20 rounded-xl p-4">
                    <h4 className="text-white font-bold text-base mb-3 flex items-center gap-2">
                      <ImageIcon className="w-4 h-4 text-tech-cyan" />
                      Projetos Realizados
                    </h4>
                    <button
                      onClick={() => setShowGallery(true)}
                      className="w-full bg-gradient-to-r from-tech-accent to-tech-cyan hover:from-tech-cyan hover:to-tech-accent text-white font-bold py-2.5 px-4 rounded-lg transition-all shadow-glow hover:shadow-glow-lg flex items-center justify-center gap-2 text-sm"
                    >
                      <ImageIcon className="w-4 h-4" />
                      <span>Ver Galeria</span>
                    </button>
                  </div>
                )}

                <div className="bg-gradient-to-r from-green-500/10 to-green-600/10 border-2 border-green-500/30 rounded-xl p-4">
                  <div className="mb-3">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                        <MessageCircle className="w-5 h-5 text-green-400" />
                      </div>
                      <h4 className="text-white font-bold text-base">
                        Quer falar com quem já importou?
                      </h4>
                    </div>
                    <p className="text-slate-300 text-sm leading-relaxed">
                      Entre em contato conosco e forneceremos referências de clientes satisfeitos.
                    </p>
                  </div>
                  <a
                    href={WHATSAPP_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full inline-flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-bold py-2.5 px-4 rounded-lg transition-colors text-sm"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>Solicitar Referências</span>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Gallery Modal */}
      {showGallery && galleryImages.length > 0 && (
        <div
          className="fixed inset-0 bg-black/95 backdrop-blur-sm z-[10000] p-4 overflow-y-auto"
          onClick={handleCloseGallery}
        >
          <div className="min-h-screen flex flex-col items-center justify-start py-4">
            <div className="w-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex gap-3 mb-4 justify-end">
                <button
                  onClick={() => handleCloseGallery()}
                  className="flex items-center gap-2 bg-tech-cyan/20 hover:bg-tech-cyan/40 backdrop-blur-sm px-4 py-2 rounded-lg text-white font-semibold transition-all"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Voltar</span>
                </button>
                <button
                  onClick={() => handleCloseGallery()}
                  className="w-10 h-10 rounded-full bg-gradient-to-br from-tech-cyan to-tech-electric flex items-center justify-center text-white hover:scale-110 transition-transform shadow-glow"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="bg-tech-navy border-2 border-tech-cyan/30 rounded-2xl overflow-hidden shadow-2xl shadow-tech-cyan/20">
                <div className="w-full bg-tech-dark flex items-center justify-center p-4">
                  <div className="w-full max-h-[60vh] flex items-center justify-center">
                    <img
                      src={galleryImages[selectedGalleryImage]?.url}
                      alt={galleryImages[selectedGalleryImage]?.name}
                      className="max-w-full max-h-[60vh] object-contain"
                      loading="lazy"
                    />
                  </div>
                </div>

                <div className="p-4 sm:p-6 bg-tech-blue/40">
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {galleryImages.map((img, index) => (
                      <button
                        key={img.id}
                        onClick={() => setSelectedGalleryImage(index)}
                        className={`relative rounded-lg overflow-hidden aspect-video border-2 transition-all ${
                          selectedGalleryImage === index
                            ? 'border-tech-cyan shadow-glow'
                            : 'border-transparent hover:border-tech-cyan/50'
                        }`}
                      >
                        <img
                          src={img.url}
                          alt={img.name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="max-w-7xl mx-auto mt-16 text-center">
          <button
            onClick={handleQuoteClick}
            className="group relative bg-gradient-to-r from-tech-cyan via-tech-electric to-tech-cyan hover:from-tech-electric hover:via-tech-cyan hover:to-tech-electric text-white font-bold text-lg px-10 py-5 rounded-xl transition-all hover:scale-105 shadow-glow-lg hover:shadow-glow-blue-lg inline-flex items-center gap-3"
          >
            <LogIn className="w-5 h-5" />
            <span>Solicitar Orçamento</span>
            <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-tech-cyan to-tech-electric opacity-0 group-hover:opacity-30 blur-xl transition-opacity"></div>
          </button>
        </div>
      </div>

      <WhatsAppInfoModal isOpen={showInfoModal} onClose={() => setShowInfoModal(false)} />
    </section>
  );
}
