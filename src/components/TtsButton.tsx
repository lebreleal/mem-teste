import { useState, useRef, useCallback } from 'react';
import { Volume2, Loader2, Square } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';

interface TtsButtonProps {
  text: string;
  className?: string;
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

const TtsButton = ({ text, className = '' }: TtsButtonProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const { toast } = useToast();

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
  }, []);

  const play = useCallback(async () => {
    if (isPlaying) {
      stop();
      return;
    }

    const plainText = stripToPlainText(text);
    if (!plainText) return;

    setIsLoading(true);
    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tts`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
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

      audio.onended = () => {
        stop();
      };

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
  }, [text, isPlaying, stop, toast]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={play}
          disabled={isLoading}
          className={`flex h-6 w-6 items-center justify-center rounded-full transition-colors ${
            isPlaying
              ? 'text-primary bg-primary/10'
              : 'text-muted-foreground hover:text-primary hover:bg-primary/10'
          } disabled:opacity-40 ${className}`}
          aria-label={isPlaying ? 'Parar áudio' : 'Ouvir'}
        >
          {isLoading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : isPlaying ? (
            <Square className="h-3 w-3 fill-current" />
          ) : (
            <Volume2 className="h-3 w-3" />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent><p>{isPlaying ? 'Parar' : 'Ouvir'}</p></TooltipContent>
    </Tooltip>
  );
};

export default TtsButton;
