import { useState, useRef, useCallback, useEffect } from 'react';
import { Volume2, Loader2, Square } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';

interface TtsButtonProps {
  text: string;
  className?: string;
  /** If true, the text is still being streamed — button will wait before playing */
  isStreaming?: boolean;
}

/** Strip markdown/HTML to plain text for TTS */
function stripToPlainText(md: string): string {
  return md
    .replace(/#{1,6}\s?/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .replace(/<[^>]*>/g, '')
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, ' ')
    .trim();
}

/** Extract only the "Explicação" section from structured AI tutor responses */
export function extractExplanationSection(text: string): string {
  const patterns = [
    /(?:#{1,3}\s*)?(?:\d+\.\s*)?(?:\*\*)?Explicação(?:\*\*)?[:\s]*\n?([\s\S]*?)(?=(?:#{1,3}\s*)?(?:\d+\.\s*)?(?:\*\*)?(?:Conexão|Relação|3\.)|$)/i,
    /(?:#{1,3}\s*)?2\.\s*(?:\*\*)?[^*\n]+(?:\*\*)?[:\s]*\n?([\s\S]*?)(?=(?:#{1,3}\s*)?3\.|$)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return text;
}

const TtsButton = ({ text, className = '', isStreaming = false }: TtsButtonProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [waitingForStream, setWaitingForStream] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const { toast } = useToast();

  // When streaming finishes and we were waiting, trigger play
  useEffect(() => {
    if (waitingForStream && !isStreaming) {
      setWaitingForStream(false);
      doPlay();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStreaming, waitingForStream]);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    setIsPlaying(false);
    setWaitingForStream(false);
  }, []);

  const doPlay = useCallback(async () => {
    const plainText = stripToPlainText(text);
    if (!plainText) return;

    setIsLoading(true);
    try {
      const { supabase } = await import('@/integrations/supabase/client');
      const { data: { session } } = await supabase.auth.getSession();
      
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      };
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tts`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ text: plainText }),
        }
      );

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || 'Erro ao gerar áudio');
      }

      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      urlRef.current = url;

      const audio = new Audio(url);
      audioRef.current = audio;

      audio.onended = () => stop();
      audio.onerror = () => {
        toast({ title: 'Erro ao reproduzir áudio', variant: 'destructive' });
        stop();
      };

      setIsPlaying(true);
      await audio.play();
    } catch (e: any) {
      toast({ title: 'Erro no TTS', description: e.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [text, stop, toast]);

  const handleClick = useCallback(() => {
    if (isPlaying) {
      stop();
      return;
    }
    if (waitingForStream) {
      setWaitingForStream(false);
      return;
    }
    if (isStreaming) {
      // Text is still streaming — wait for it to finish
      setWaitingForStream(true);
      return;
    }
    doPlay();
  }, [isPlaying, isStreaming, waitingForStream, stop, doPlay]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={handleClick}
          disabled={isLoading}
          className={`flex h-6 w-6 items-center justify-center rounded-full transition-colors ${
            isPlaying || waitingForStream
              ? 'text-primary bg-primary/10'
              : 'text-muted-foreground hover:text-primary hover:bg-primary/10'
          } disabled:opacity-40 ${className}`}
          aria-label={isPlaying ? 'Parar áudio' : waitingForStream ? 'Aguardando...' : 'Ouvir'}
        >
          {isLoading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : waitingForStream ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : isPlaying ? (
            <Square className="h-3 w-3 fill-current" />
          ) : (
            <Volume2 className="h-3 w-3" />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent>
        <p>{isPlaying ? 'Parar' : waitingForStream ? 'Aguardando texto...' : 'Ouvir'}</p>
      </TooltipContent>
    </Tooltip>
  );
};

export default TtsButton;
