

## Plano: Sistema de herança de limites do baralho raiz

### Regra implementada

- **O baralho raiz (ancestral mais alto) governa os limites de todos os descendentes.**
- Se um deck filho estuda 1 card novo, isso conta contra o `daily_new_limit` do raiz.
- Mesmo iniciando o estudo por um filho, o limite global do raiz é respeitado.
- Quando o total de cards novos estudados em QUALQUER descendente atinge o limite do raiz, nenhum descendente recebe mais cards novos.
- Config usada: `daily_new_limit`, `daily_review_limit`, `shuffle_cards`, `algorithm_mode` do raiz.

### Mudanças implementadas

| Arquivo | O que mudou |
|---------|-----------|
| `src/lib/studyUtils.ts` | Adicionada `findRootAncestorId` - sobe a hierarquia até o ancestral sem pai |
| `src/services/studyService.ts` | `fetchStudyQueue` agora busca o raiz, usa sua config, e conta reviews de hoje em TODA a hierarquia do raiz |

### Como funciona

1. Ao iniciar estudo de um deck, `findRootAncestorId` encontra o ancestral mais alto.
2. A config (limites, shuffle, algoritmo) vem do raiz.
3. `limitScopeIds` = todos os descendentes do raiz (não só do deck clicado).
4. Cards novos estudados hoje em qualquer ponto da hierarquia são contados contra o limite global.
5. Cards da fila vêm apenas do deck clicado + seus filhos diretos.


