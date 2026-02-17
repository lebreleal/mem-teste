import { useNavigate } from 'react-router-dom';
import { MoreVertical, BookOpen, Trash2, Settings, Layers, Link2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { DeckWithStats } from '@/hooks/useDecks';

interface DeckCardProps {
  deck: DeckWithStats;
  onStudy: (id: string) => void;
  onDelete: (id: string) => void;
}

const DeckCard = ({ deck, onStudy, onDelete }: DeckCardProps) => {
  const navigate = useNavigate();
  const totalDue = deck.new_count + deck.learning_count + deck.review_count;

  return (
    <Card className="group border-border/50 shadow-sm hover:shadow-md transition-all duration-200 animate-fade-in">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="font-display text-lg font-semibold text-card-foreground truncate">
                {deck.name}
              </h3>
              {deck.source_turma_deck_id && (
                <button
                  className="shrink-0 text-info hover:text-info/70 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    const findTurma = async () => {
                      const { data } = await supabase.from('turma_decks').select('turma_id, lesson_id').eq('id', deck.source_turma_deck_id!).single();
                      if (data) {
                        const td = data as any;
                        if (td.lesson_id) {
                          navigate(`/turmas/${td.turma_id}/lessons/${td.lesson_id}`);
                        } else {
                          navigate(`/turmas/${td.turma_id}`);
                        }
                      }
                    };
                    findTurma();
                  }}
                  title="Ver na comunidade"
                >
                  <Link2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="mt-3 flex items-center gap-3">
              <span className="inline-flex items-center rounded-full bg-info/10 px-2.5 py-0.5 text-xs font-medium text-info">
                {deck.new_count} novos
              </span>
              <span className="inline-flex items-center rounded-full bg-warning/10 px-2.5 py-0.5 text-xs font-medium text-warning">
                {deck.learning_count} aprendendo
              </span>
              <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                {deck.review_count} revisar
              </span>
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => navigate(`/decks/${deck.id}/manage`)}>
                <Layers className="mr-2 h-4 w-4" />
                Gerenciar Cards
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate(`/decks/${deck.id}/settings`)}>
                <Settings className="mr-2 h-4 w-4" />
                Configurações
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => onDelete(deck.id)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <Button
          onClick={() => onStudy(deck.id)}
          className="mt-4 w-full"
          disabled={totalDue === 0}
        >
          <BookOpen className="mr-2 h-4 w-4" />
          {totalDue > 0 ? `Estudar (${totalDue})` : 'Nenhum card para revisar'}
        </Button>
      </CardContent>
    </Card>
  );
};

export default DeckCard;
