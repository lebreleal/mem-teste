import { useState } from 'react';
import { ChevronDown, HelpCircle, MessageCircle, LogIn } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { WhatsAppInfoModal } from './WhatsAppInfoModal';

const WHATSAPP_URL = 'https://wa.me/551433331005?text=Olá! Tenho uma dúvida sobre importação de painéis LED.';

const faqs = [
  {
    question: 'Qual o investimento mínimo para importar?',
    answer: 'O investimento mínimo recomendado é de R$ 30.000,00. Esse valor garante que os custos fixos de importação (logística, impostos e taxas) sejam diluídos de forma adequada, tornando o processo economicamente viável.'
  },
  {
    question: 'Preciso ter CNPJ para importar?',
    answer: 'Sim, é obrigatório ter CNPJ ativo para realizar importações. A importação é feita em nome da pessoa jurídica, o que traz benefícios fiscais e permite a emissão de notas fiscais dos produtos.'
  },
  {
    question: 'Quanto tempo demora todo o processo de importação?',
    answer: 'O processo completo leva em média 90 dias, dividido em: 30 dias para produção, 45 dias para embarque e transporte marítimo, e 15 dias para desembaraço aduaneiro e entrega final.'
  },
  {
    question: 'Como funciona o pagamento?',
    answer: 'O pagamento é feito diretamente para a fábrica com sistema de custódia (garantia). Você só libera o pagamento após receber fotos e vídeos da produção aprovados. Impostos e taxas são pagos no momento do desembaraço aduaneiro.'
  },
  {
    question: 'Os produtos têm garantia?',
    answer: 'Sim! Todos os produtos vêm com garantia de fábrica de 2 anos. Além disso, fornecemos suporte técnico completo em português e documentação técnica para instalação e manutenção.'
  },
  {
    question: 'Qual o prazo de entrega após o desembaraço?',
    answer: 'Após o desembaraço aduaneiro, a entrega é feita em até 15 dias úteis para todo o Brasil, dependendo da sua localização. Fornecemos código de rastreamento para acompanhamento.'
  },
  {
    question: 'Vocês ajudam com a instalação dos painéis?',
    answer: 'Fornecemos manuais técnicos completos, vídeos tutoriais em português e suporte técnico 24/7. Para instalação física, podemos indicar parceiros especializados na sua região.'
  },
  {
    question: 'É possível acompanhar a produção?',
    answer: 'Sim! Durante toda a produção você receberá fotos e vídeos em tempo real do seu produto sendo fabricado. Também enviamos atualizações sobre testes de qualidade e preparação para embarque.'
  }
];

export function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();

  const toggleFAQ = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  const handleQuoteClick = () => {
    if (user) {
      navigate('/dashboard/quote');
    } else {
      setShowWhatsAppModal(true);
    }
  };

  return (
    <section id="faq" className="py-16 sm:py-24 bg-tech-navy">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12 sm:mb-16">
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-tech-cyan/20 flex items-center justify-center">
                <HelpCircle className="w-6 h-6 text-tech-cyan" />
              </div>
              <p className="text-tech-cyan text-xs sm:text-sm font-semibold uppercase tracking-wider">
                FAQ
              </p>
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight">
              <span className="text-white">Perguntas </span>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-tech-cyan to-tech-electric">Frequentes</span>
            </h2>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, index) => {
              const isOpen = openIndex === index;
              const number = String(index + 1).padStart(2, '0');

              return (
                <div
                  key={index}
                  className="border border-tech-cyan/20 rounded-xl overflow-hidden bg-tech-blue/30 hover:border-tech-cyan/50 transition-all backdrop-blur-sm"
                >
                  <button
                    onClick={() => toggleFAQ(index)}
                    className="w-full text-left p-5 sm:p-6 flex items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-4 flex-1">
                      <span className="text-cyan-400 font-bold text-lg sm:text-xl flex-shrink-0">
                        {number}.
                      </span>
                      <h3 className="text-white font-semibold text-base sm:text-lg">
                        {faq.question}
                      </h3>
                    </div>
                    <ChevronDown
                      className={`w-5 h-5 sm:w-6 sm:h-6 text-cyan-400 flex-shrink-0 transition-transform duration-300 ${
                        isOpen ? 'rotate-180' : 'rotate-0'
                      }`}
                    />
                  </button>

                  <div
                    className={`overflow-hidden transition-all duration-500 ease-in-out ${
                      isOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
                    }`}
                  >
                    <div className="px-5 sm:px-6 pb-5 sm:pb-6 pl-12 sm:pl-16">
                      <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
                        {faq.answer}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-12 text-center">
            <p className="text-slate-400 mb-4">Ainda tem dúvidas?</p>
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-semibold px-6 py-3 rounded-lg transition-all shadow-glow hover:scale-105"
            >
              <MessageCircle className="w-5 h-5" />
              Fale com nossa equipe
            </a>
          </div>

          <div className="mt-16 text-center">
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
      </div>

      <WhatsAppInfoModal isOpen={showWhatsAppModal} onClose={() => setShowWhatsAppModal(false)} />
    </section>
  );
}
