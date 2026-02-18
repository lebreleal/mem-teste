import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Download, Smartphone, Monitor, Share } from "lucide-react";
import MemoCardsLogo from "@/components/MemoCardsLogo";
import { useNavigate } from "react-router-dom";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const Install = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const ua = navigator.userAgent;
    setIsIOS(/iPad|iPhone|iPod/.test(ua));

    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setIsInstalled(true);
    setDeferredPrompt(null);
  };

  if (isInstalled) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center gap-4">
        <MemoCardsLogo size={80} />
        <h1 className="text-2xl font-bold">App já instalado! 🎉</h1>
        <p className="text-muted-foreground">O MemoCards já está na sua tela inicial.</p>
        <Button onClick={() => navigate("/dashboard")}>Ir para o Dashboard</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center gap-6">
      <MemoCardsLogo size={80} />
      <h1 className="text-2xl font-bold">Instalar MemoCards</h1>
      <p className="text-muted-foreground max-w-md">
        Instale o MemoCards no seu dispositivo para acesso rápido, experiência em tela cheia e uso offline.
      </p>

      {deferredPrompt && (
        <Button size="lg" onClick={handleInstall} className="gap-2">
          <Download className="h-5 w-5" />
          Instalar agora
        </Button>
      )}

      {!deferredPrompt && !isIOS && (
        <div className="flex flex-col items-center gap-3 p-4 rounded-lg border bg-card">
          <Monitor className="h-8 w-8 text-primary" />
          <p className="text-sm text-muted-foreground">
            Clique no ícone de instalar <Download className="inline h-4 w-4" /> na barra de endereço do seu navegador.
          </p>
        </div>
      )}

      {isIOS && (
        <div className="flex flex-col items-center gap-3 p-4 rounded-lg border bg-card">
          <Smartphone className="h-8 w-8 text-primary" />
          <p className="text-sm text-muted-foreground">
            No Safari, toque em <Share className="inline h-4 w-4" /> e depois em <strong>"Adicionar à Tela de Início"</strong>.
          </p>
        </div>
      )}

      <Button variant="ghost" onClick={() => navigate("/dashboard")}>
        Continuar no navegador
      </Button>
    </div>
  );
};

export default Install;
