# Sistema de Tags - Plano de Implementação

## Status: Fases 1-4 Concluídas ✅

### Fase 1 - Fundação ✅
- Tabelas `tags`, `deck_tags`, `card_tags` com RLS, triggers de `usage_count`, busca fuzzy (pg_trgm)
- `src/types/tag.ts`, `src/services/tagService.ts`, `src/hooks/useTags.ts`
- `src/components/TagInput.tsx` com autocomplete

### Fase 2 - IA como Curadora ✅
- Edge function `suggest-tags` usando Gemini Flash
- Prioriza Leader Tags existentes, sugere novas quando necessário
- Botão ✨ no TagInput que mostra sugestões da IA como chips clicáveis

### Fase 3 - Integração na Comunidade ✅
- Tags exibidas nos DeckCards da comunidade (até 3, +N)
- Filtro por tags como chips no ContentTab
- Batch query de tags para todos os decks da comunidade
- Filtro por tags na tela de Turmas (marketplace)

### Fase 4 - Admin + Cards ✅
- `/admin/tags` — dashboard com stats, busca, toggle oficial, merge, delete
- Tags em cards individuais: exibição inline na lista + editor no dialog de edição
- `CardTagsInline` e `CardTagEditor` components

### Fase 5 - Futuro (não implementado)
- Auto-tag ao criar deck via IA
- Contextualização por perfil de estudo
- Tags hierárquicas (pai/filho)
- Normalização automática de sinônimos pela IA
