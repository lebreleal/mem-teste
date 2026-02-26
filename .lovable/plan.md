

# Tornar FSRS-6 o unico algoritmo padrao

## Resumo
Remover o SM-2 como opcao de algoritmo, tornar FSRS-6 o unico padrao para todos os decks (novos e existentes), ajustar a retencao padrao para 85%, definir limite de revisao diaria como 9999, e atualizar o modal Premium e seletores de algoritmo para refletir que so existem FSRS-6 e Revisao Rapida.

## Alteracoes

### 1. Migracao de banco de dados
Uma unica migracao SQL para:
- Alterar default de `algorithm_mode` de `'sm2'` para `'fsrs'`
- Alterar default de `requested_retention` de `0.9` para `0.85`
- Alterar default de `daily_review_limit` de `100` para `9999`
- Converter todos os decks existentes com `algorithm_mode = 'sm2'` para `'fsrs'`
- Atualizar `requested_retention` para `0.85` em todos os decks que ainda estao em `0.9`
- Atualizar `daily_review_limit` para `9999` em todos os decks existentes

### 2. Modal Premium (`src/components/dashboard/PremiumModal.tsx`)
- Remover a linha do beneficio "Algoritmo FSRS 6" da lista BENEFITS (ja que nao e mais exclusivo Premium)
- Substituir por outro beneficio ou simplesmente remover a entrada

### 3. Seletor de algoritmo em DeckSettings (`src/pages/DeckSettings.tsx`)
- Remover a opcao SM-2 do modal de selecao de algoritmo
- Manter apenas FSRS-6 e Revisao Rapida
- Remover o badge "Premium" do FSRS-6 (agora e o padrao para todos)
- Atualizar `algoLabel` para nao referenciar SM-2
- Atualizar tipo de `algorithmMode` de `'sm2' | 'fsrs' | 'quick_review'` para `'fsrs' | 'quick_review'`
- Alterar `algorithmChangeTarget` para `'fsrs' | 'quick_review' | null`
- No modal de configuracoes avancadas, remover o branch SM-2 (easy bonus, interval modifier) e mostrar apenas as configs FSRS (retencao, intervalo maximo, learning steps)
- Adicionar learning steps tambem ao painel FSRS avancado (atualmente so aparece no SM-2)
- Atualizar retencao padrao para 0.85

### 4. Seletor de algoritmo em DeckDetailDialogs (`src/components/deck-detail/DeckDetailDialogs.tsx`)
- Remover a opcao SM-2 da lista de algoritmos
- Remover badge Premium do FSRS-6
- Manter apenas FSRS-6 e Revisao Rapida

### 5. DeckDetailContext (`src/components/deck-detail/DeckDetailContext.tsx`)
- Alterar fallback de `algorithm_mode` de `'sm2'` para `'fsrs'`

### 6. DeckDetail page (`src/pages/DeckDetail.tsx`)
- Remover referencia a SM-2 no label do algoritmo

### 7. Servicos e hooks com fallback SM-2
- `src/services/studyService.ts`: mudar fallback `|| 'sm2'` para `|| 'fsrs'`
- `src/hooks/useStudySession.ts`: mudar fallback `|| 'sm2'` para `|| 'fsrs'`
- `src/hooks/usePerformance.ts`: mudar fallback `|| 'sm2'` para `|| 'fsrs'`
- `src/components/FlashCard.tsx`: atualizar fallbacks se houver
- `src/components/turma-detail/TrialStudyModal.tsx`: mudar `algorithmMode="sm2"` para `"fsrs"`

### 8. Criacao de decks
- `src/components/ai-deck/useAIDeckFlow.ts`: remover condicional `isPremium ? 'fsrs' : 'sm2'`, sempre usar `'fsrs'`
- `src/services/deckService.ts`: sem mudanca necessaria (ja aceita parametro)

### 9. Limpeza de codigo SM-2
- `src/lib/sm2.ts`: manter o arquivo por enquanto para compatibilidade retroativa (cards antigos podem ter sido agendados com SM-2), mas nao sera mais referenciado para novos agendamentos
- `src/services/studyService.ts`: a logica de `submitCardReview` que chama sm2 para `algorithmMode === 'sm2'` pode ser mantida como fallback de seguranca para cards ja agendados

## Detalhes tecnicos

### SQL da migracao
```sql
ALTER TABLE public.decks ALTER COLUMN algorithm_mode SET DEFAULT 'fsrs';
ALTER TABLE public.decks ALTER COLUMN requested_retention SET DEFAULT 0.85;
ALTER TABLE public.decks ALTER COLUMN daily_review_limit SET DEFAULT 9999;

UPDATE public.decks SET algorithm_mode = 'fsrs' WHERE algorithm_mode = 'sm2';
UPDATE public.decks SET requested_retention = 0.85 WHERE requested_retention = 0.9;
UPDATE public.decks SET daily_review_limit = 9999;
```

### Arquivos a editar (10 arquivos + 1 migracao)
1. Migracao SQL (nova)
2. `src/components/dashboard/PremiumModal.tsx`
3. `src/pages/DeckSettings.tsx`
4. `src/components/deck-detail/DeckDetailDialogs.tsx`
5. `src/components/deck-detail/DeckDetailContext.tsx`
6. `src/pages/DeckDetail.tsx`
7. `src/services/studyService.ts`
8. `src/hooks/useStudySession.ts`
9. `src/hooks/usePerformance.ts`
10. `src/components/ai-deck/useAIDeckFlow.ts`
11. `src/components/turma-detail/TrialStudyModal.tsx`

