import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const TermsOfService = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-10">
        <button onClick={() => navigate(-1)} className="mb-6 flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-5 w-5" />
          <span className="text-sm font-semibold">Voltar</span>
        </button>

        <h1 className="font-display text-3xl font-black text-foreground mb-2">Termos de Serviço</h1>
        <p className="text-sm text-muted-foreground mb-8">Última atualização: 19 de fevereiro de 2026</p>

        <div className="prose prose-sm dark:prose-invert max-w-none space-y-6 text-muted-foreground">
          <section>
            <h2 className="text-lg font-bold text-foreground">1. Aceitação dos termos</h2>
            <p>Ao acessar ou utilizar o MemoCards, você concorda com estes Termos de Serviço. Se não concordar com algum dos termos, não utilize o serviço.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">2. Descrição do serviço</h2>
            <p>O MemoCards é uma plataforma de estudo baseada em repetição espaçada (flashcards) que permite criar, organizar e revisar conteúdo educacional. O serviço inclui funcionalidades como criação de decks, estudo com algoritmos inteligentes, turmas colaborativas e simulados.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">3. Conta do usuário</h2>
            <p>Você é responsável por manter a confidencialidade da sua conta e senha. Notifique-nos imediatamente sobre qualquer uso não autorizado. Você deve ter pelo menos 13 anos para criar uma conta.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">4. Uso aceitável</h2>
            <p>Você concorda em não: violar leis aplicáveis, publicar conteúdo ofensivo ou ilegal, tentar acessar contas de outros usuários, usar o serviço para spam ou atividades maliciosas, ou fazer engenharia reversa do software.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">5. Propriedade intelectual</h2>
            <p>O conteúdo que você cria permanece seu. O MemoCards retém os direitos sobre a plataforma, marca, design e algoritmos. Ao publicar conteúdo em turmas ou no marketplace, você concede uma licença de uso dentro da plataforma.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">6. Pagamentos e assinaturas</h2>
            <p>Alguns recursos podem exigir pagamento. Os preços serão exibidos antes da compra. Reembolsos seguem a política vigente e as leis de proteção ao consumidor aplicáveis.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">7. Limitação de responsabilidade</h2>
            <p>O MemoCards é fornecido "como está". Não garantimos que o serviço será ininterrupto ou livre de erros. Nossa responsabilidade é limitada ao máximo permitido por lei.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">8. Encerramento</h2>
            <p>Podemos suspender ou encerrar sua conta por violação destes termos. Você pode encerrar sua conta a qualquer momento nas configurações do perfil.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">9. Contato</h2>
            <p>Para dúvidas sobre estes termos, entre em contato: <strong className="text-foreground">contato@memocards.com.br</strong></p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default TermsOfService;
