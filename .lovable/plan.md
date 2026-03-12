

# Fallback AI: Geração Automática de Cards de Reforço

## Contexto

Quando o Leech Trigger dispara e o conceito não tem cards relacionados nos decks do usuário, comunidade ou oficiais, o sistema deve gerar cards automaticamente com IA (modelo Pro, custo zero para o usuário). Isso alimenta a plataforma com conteúdo mesmo sem base de usuários, e os cards gerados ficam disponíveis como material de reforço permanente.

## Fluxo

```text
Leech dispara → getConceptRelatedCards() → cards encontrados?
  SIM → mostra mini-sessão normalmente
  NÃO → UI mostra "Buscando conteúdo de reforço..."
       → invoke generate-deck com conceptName como "conteúdo"
       → cards gerados → salvos num deck "__reforço: {conceptName}"
       → mini-sessão exibe os cards gerados
       → próxima vez, getConceptRelatedCards() já encontra esses cards
```

O usuário nunca percebe a diferença. Vê apenas "Buscando..." e depois os cards aparecem.

## Implementação

### 1. Novo service: `generateReinforcementCards` em `globalConceptService.ts`

- Recebe `conceptName: string`, `userId: string`
- Invoca `generate-deck` edge function com:
  - `content`: prompt descritivo baseado no nome do conceito (ex: "Explique detalhadamente: {conceptName}. Cubra definição, mecanismo, causas, consequências clínicas.")
  - `aiModel`: `'pro'` (sempre Pro para qualidade)
  - `energyCost`: `0` (gratuito — fallback do sistema)
  - `deckName`: `"Reforço: {conceptName}"`
  - `formats`: `['cloze', 'qa']`
  - `density`: `'standard'`
- Retorna os cards gerados

### 2. Alterar fluxo do Leech em `Study.tsx`

No `handleRate`, após `getConceptRelatedCards` retornar vazio:

1. Mostrar `leechMode` com estado `loading: true` e mensagem "Buscando conteúdo de reforço..."
2. Chamar `generateReinforcementCards(concept.name, userId)`
3. Quando retornar, atualizar `leechMode.reinforceCards` com os cards gerados
4. Se falhar, cair no fallback atual (mostrar back_content do card)

### 3. Estado de loading no leechMode

Adicionar `loading?: boolean` ao tipo do estado `leechMode`. Na UI, se `loading === true`, mostrar spinner + mensagem. Quando os cards chegam, atualizar o estado.

### 4. Se não há conceito vinculado (concept === null)

Usar o `front_content` + `back_content` do card leech como prompt para gerar cards de reforço sobre o mesmo tema. O nome do conceito é inferido do conteúdo do card.

## Arquivos a editar

| Arquivo | Mudança |
|---|---|
| `src/services/globalConceptService.ts` | Adicionar `generateReinforcementCards(conceptName, userId)` que invoca `generate-deck` |
| `src/pages/Study.tsx` | Adicionar estado `loading` ao leechMode, chamar fallback AI quando `reinforceCards` vazio, UI de loading |

## Notas

- O deck criado ("Reforço: X") fica permanente no acervo do usuário, alimentando futuras buscas por `getConceptRelatedCards`
- Custo zero para o usuário — a plataforma absorve o custo do Pro como investimento em conteúdo
- Cards gerados seguem as mesmas regras pedagógicas do `generate-deck` (Wozniak, cloze+basic)
- Na próxima vez que o mesmo conceito for leech, os cards já existem — sem nova geração

