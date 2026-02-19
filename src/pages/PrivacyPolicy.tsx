import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const PrivacyPolicy = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-10">
        <button onClick={() => navigate(-1)} className="mb-6 flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-5 w-5" />
          <span className="text-sm font-semibold">Voltar</span>
        </button>

        <h1 className="font-display text-3xl font-black text-foreground mb-2">Política de Privacidade</h1>
        <p className="text-sm text-muted-foreground mb-8">Última atualização: 19 de fevereiro de 2026</p>

        <div className="prose prose-sm dark:prose-invert max-w-none space-y-6 text-muted-foreground">
          <section>
            <h2 className="text-lg font-bold text-foreground">1. Informações que coletamos</h2>
            <p>Ao utilizar o MemoCards, coletamos as seguintes informações: nome, endereço de e-mail, dados de uso do aplicativo (como decks criados, cards estudados e estatísticas de desempenho) e informações do dispositivo para melhorar a experiência.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">2. Como usamos suas informações</h2>
            <p>Utilizamos seus dados para: fornecer e manter o serviço, personalizar sua experiência de estudo, enviar notificações relevantes, melhorar nossos algoritmos de repetição espaçada e garantir a segurança da sua conta.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">3. Armazenamento e segurança</h2>
            <p>Seus dados são armazenados de forma segura utilizando criptografia e infraestrutura de nível empresarial. Não vendemos, alugamos ou compartilhamos suas informações pessoais com terceiros para fins comerciais.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">4. Cookies e tecnologias similares</h2>
            <p>Utilizamos cookies e tecnologias similares para manter sua sessão ativa, lembrar suas preferências e analisar o uso do serviço de forma agregada.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">5. Seus direitos</h2>
            <p>Você pode, a qualquer momento: acessar seus dados pessoais, solicitar a correção de informações incorretas, solicitar a exclusão da sua conta e dados, e exportar seus dados. Para exercer esses direitos, entre em contato conosco pelo e-mail contato@memocards.com.br.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">6. Alterações nesta política</h2>
            <p>Podemos atualizar esta política periodicamente. Notificaremos sobre mudanças significativas por e-mail ou aviso no aplicativo.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">7. Contato</h2>
            <p>Para dúvidas sobre esta política, entre em contato: <strong className="text-foreground">contato@memocards.com.br</strong></p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
