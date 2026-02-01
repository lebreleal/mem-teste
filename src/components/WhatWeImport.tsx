import { useState } from 'react';
import { Users, CheckCircle2, XCircle, LogIn } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { WhatsAppInfoModal } from './WhatsAppInfoModal';

export function WhatWeImport() {
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleQuoteClick = () => {
    if (user) {
      navigate('/dashboard/quote');
    } else {
      setShowWhatsAppModal(true);
    }
  };

  return (
    <section className="py-16 sm:py-24 bg-tech-navy">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-tech-cyan/20 flex items-center justify-center">
                <Users className="w-6 h-6 text-tech-cyan" />
              </div>
              <p className="text-tech-cyan text-xs sm:text-sm font-semibold uppercase tracking-wider">
                PÚBLICO-ALVO
              </p>
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight mb-4">
              <span className="text-white">Para quem é e </span>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-tech-cyan to-tech-electric">Para quem não é</span>
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {/* É para quem - Green border */}
            <div className="group relative border-2 border-emerald-500/30 hover:border-emerald-500/60 rounded-2xl p-8 bg-tech-blue/40 backdrop-blur-sm transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl hover:shadow-emerald-500/20">
              <div className="flex items-center gap-4 mb-8">
                <div className="w-14 h-14 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                </div>
                <h3 className="text-2xl font-bold text-white">É para</h3>
              </div>

              <div className="space-y-5">
                <div className="flex items-start gap-4 group/item">
                  <div className="flex-shrink-0 w-7 h-7 rounded-full bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center mt-0.5">
                    <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-slate-200 text-base font-medium leading-relaxed">Pessoas Jurídicas (CNPJ)</p>
                </div>
                <div className="flex items-start gap-4 group/item">
                  <div className="flex-shrink-0 w-7 h-7 rounded-full bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center mt-0.5">
                    <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-slate-200 text-base font-medium leading-relaxed">Investem mais de 30 mil</p>
                </div>
                <div className="flex items-start gap-4 group/item">
                  <div className="flex-shrink-0 w-7 h-7 rounded-full bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center mt-0.5">
                    <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-slate-200 text-base font-medium leading-relaxed">Painel LED maior que 5m²</p>
                </div>
              </div>
            </div>

            {/* Não é para quem - Gray/Neutral border */}
            <div className="group relative border-2 border-slate-600/30 hover:border-slate-500/60 rounded-2xl p-8 bg-tech-blue/40 backdrop-blur-sm transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl hover:shadow-slate-500/20">
              <div className="flex items-center gap-4 mb-8">
                <div className="w-14 h-14 rounded-xl bg-slate-600/20 flex items-center justify-center">
                  <XCircle className="w-8 h-8 text-slate-400" />
                </div>
                <h3 className="text-2xl font-bold text-white">Não é para</h3>
              </div>

              <div className="space-y-5">
                <div className="flex items-start gap-4 group/item">
                  <div className="flex-shrink-0 w-7 h-7 rounded-full bg-slate-600/20 border-2 border-slate-500 flex items-center justify-center mt-0.5">
                    <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                  <p className="text-slate-200 text-base font-medium leading-relaxed">Pessoas Físicas (PF)</p>
                </div>
                <div className="flex items-start gap-4 group/item">
                  <div className="flex-shrink-0 w-7 h-7 rounded-full bg-slate-600/20 border-2 border-slate-500 flex items-center justify-center mt-0.5">
                    <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                  <p className="text-slate-200 text-base font-medium leading-relaxed">Investem menos de 30 mil</p>
                </div>
                <div className="flex items-start gap-4 group/item">
                  <div className="flex-shrink-0 w-7 h-7 rounded-full bg-slate-600/20 border-2 border-slate-500 flex items-center justify-center mt-0.5">
                    <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                  <p className="text-slate-200 text-base font-medium leading-relaxed">Painel LED menor que 5m²</p>
                </div>
              </div>
            </div>
          </div>

          {/* CTA Button */}
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
