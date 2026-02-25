import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { StickyNote } from 'lucide-react';

interface PersonalNotesProps {
  cardId: string;
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'agora';
  if (diffMin < 60) return `${diffMin}min atrás`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h atrás`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d atrás`;
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

const PersonalNotes = ({ cardId }: PersonalNotesProps) => {
  const { user } = useAuth();
  const [notes, setNotes] = useState('');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCardIdRef = useRef(cardId);

  // Load notes for this card
  useEffect(() => {
    if (!user || !cardId) return;
    lastCardIdRef.current = cardId;
    setLoaded(false);
    setExpanded(false);

    (async () => {
      const { data } = await supabase
        .from('user_card_metadata' as any)
        .select('personal_notes, updated_at')
        .eq('user_id', user.id)
        .eq('card_id', cardId)
        .maybeSingle();
      
      if (lastCardIdRef.current !== cardId) return; // stale
      const note = (data as any)?.personal_notes || '';
      const savedAt = (data as any)?.updated_at || null;
      setNotes(note);
      setUpdatedAt(savedAt);
      setLoaded(true);
      if (note) setExpanded(true);
    })();
  }, [cardId, user]);

  const saveNotes = useCallback(async (value: string) => {
    if (!user) return;
    if (!value.trim()) {
      await supabase.from('user_card_metadata' as any).delete().eq('user_id', user.id).eq('card_id', cardId);
      setUpdatedAt(null);
      return;
    }
    const { data } = await supabase.from('user_card_metadata' as any).upsert(
      { user_id: user.id, card_id: cardId, personal_notes: value.trim() } as any,
      { onConflict: 'user_id,card_id' }
    ).select('updated_at').single();
    if ((data as any)?.updated_at) setUpdatedAt((data as any).updated_at);
    else setUpdatedAt(new Date().toISOString());
  }, [user, cardId]);

  const handleChange = (value: string) => {
    setNotes(value);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => saveNotes(value), 800);
  };

  // Save on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  if (!loaded) return null;

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors py-1"
      >
        <StickyNote className="h-3 w-3" />
        <span>Notas pessoais</span>
      </button>
    );
  }

  return (
    <div className="w-full animate-fade-in">
      <div className="flex items-center gap-1.5 mb-1">
        <StickyNote className="h-3 w-3 text-muted-foreground" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Notas pessoais</span>
        {updatedAt && notes.trim() && (
          <span className="text-[9px] text-muted-foreground/60 ml-auto">
            salvo {formatRelativeDate(updatedAt)}
          </span>
        )}
      </div>
      <textarea
        value={notes}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Suas anotações privadas sobre este card..."
        rows={2}
        className="w-full rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/30 resize-none"
      />
    </div>
  );
};

export default PersonalNotes;
