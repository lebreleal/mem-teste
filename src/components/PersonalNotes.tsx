import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { StickyNote } from 'lucide-react';

interface PersonalNotesProps {
  cardId: string;
}

const PersonalNotes = ({ cardId }: PersonalNotesProps) => {
  const { user } = useAuth();
  const [notes, setNotes] = useState('');
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
        .select('personal_notes')
        .eq('user_id', user.id)
        .eq('card_id', cardId)
        .maybeSingle();
      
      if (lastCardIdRef.current !== cardId) return; // stale
      const note = (data as any)?.personal_notes || '';
      setNotes(note);
      setLoaded(true);
      if (note) setExpanded(true);
    })();
  }, [cardId, user]);

  const saveNotes = useCallback(async (value: string) => {
    if (!user) return;
    if (!value.trim()) {
      // Delete if empty
      await supabase.from('user_card_metadata' as any).delete().eq('user_id', user.id).eq('card_id', cardId);
      return;
    }
    await supabase.from('user_card_metadata' as any).upsert(
      { user_id: user.id, card_id: cardId, personal_notes: value.trim() } as any,
      { onConflict: 'user_id,card_id' }
    );
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
