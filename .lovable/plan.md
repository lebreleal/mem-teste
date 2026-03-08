

## Estrategias para Reduzir Requisicoes ao Banco de Dados

### Diagnostico Atual

Analisei o codebase inteiro. Aqui esta o que encontrei:

**Pontos positivos ja implementados:**
- `staleTime` global de 30s no QueryClient
- `refetchOnWindowFocus: false` global
- `Promise.all` para queries paralelas em varios lugares
- RPC batch (`get_all_user_deck_stats`) para evitar N+1 queries no dashboard

**Problemas identificados:**

#### 1. `fetchStudyQueue` faz 6-8 queries sequenciais ao banco
Cada vez que o usuario abre uma sessao de estudo, essa funcao faz:
- 1 query: todos os decks do usuario
- 1 query: folders (se folderId)
- 2 queries paralelas: cards + scope card IDs
- 1 query: study_plans
- 1 query: plan cards IDs (ou all cards IDs)
- 2 RPCs: hierarchy limits + global limits
- 1 query: profile (daily_new_cards_limit)

Total: **7-9 requests** por abertura de sessao de estudo.

#### 2. `fetchStudyStats` busca ate 365 dias de logs paginados
Cada vez que o StatusBar renderiza (toda pagina), faz:
- 1 query: profile
- N queries paginadas: review_logs (2+ requests para 1500+ logs)

#### 3. Dashboard carrega dados redundantes
- `useDecks` busca todos os decks com stats
- `useDashboardState` faz query separada para `daily_new_cards_limit`
- `useStudyStats` busca profile separadamente
- `useEnergy` busca energy separadamente

O profile e consultado **3x separadamente** em paginas como o Dashboard.

#### 4. ActivityView busca todos os review_logs do ano
Pagina inteira com 1500+ logs buscados no cliente para calcular streak, minutos, etc.

---

### Solucoes Propostas (por prioridade)

#### A. Criar RPC `get_study_queue_v2` no banco (maior impacto)
Mover toda a logica de `fetchStudyQueue` para uma unica funcao SQL que retorna os cards ja filtrados e limitados. Reduz **7-9 requests para 1**.

#### B. Criar RPC `get_user_dashboard_summary` 
Uma unica query que retorna: energy, streak, daily_new_cards_limit, daily_cards_studied, today_minutes. Substitui 3 queries separadas (profile + energy + study stats basicos).

#### C. Cache do profile com `staleTime: 5min`
Criar um hook `useProfile` centralizado que busca o profile uma vez e compartilha entre `useEnergy`, `useStudyStats`, `useDashboardState`.

#### D. Mover calculo de streak/minutos para o servidor
Criar RPC `get_activity_summary` que calcula streak, minutos por dia e contadores diretamente no banco, evitando transferir 1500+ rows para o cliente.

#### E. Invalidacao seletiva apos reviews
Atualmente `invalidateStudyQueries` invalida 7 query keys de uma vez. Usar `setQueryData` para atualizar o cache otimisticamente apos cada review, evitando refetch completo.

---

### Recomendacao

Sugiro implementar na seguinte ordem:
1. **C** (rapido, sem migracao) - Hook `useProfile` centralizado
2. **B** (migracao simples) - RPC de resumo do dashboard
3. **D** (migracao media) - Calculo server-side de atividade
4. **A** (migracao complexa) - Study queue unificado
5. **E** (refactor medio) - Cache otimistico pos-review

A opcao C sozinha ja elimina ~30% das queries redundantes no Dashboard sem nenhuma migracao SQL.

