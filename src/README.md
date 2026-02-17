# Memo Cards — Arquitetura do Projeto

## Visão Geral

Aplicação React (Vite + TypeScript + Tailwind) com backend Lovable Cloud.  
Flashcards com repetição espaçada (SM-2 / FSRS), provas, comunidades e IA generativa.

---

## Estrutura de Diretórios

```
src/
├── assets/            # Imagens e recursos estáticos
├── components/        # Componentes reutilizáveis e sub-componentes de página
│   ├── ui/            # Shadcn/ui primitives (não editar manualmente)
│   ├── dashboard/     # Sub-componentes do Dashboard
│   ├── turma-detail/  # Sub-componentes + Context da TurmaDetail
│   ├── lesson-detail/ # Sub-componentes da LessonDetail
│   ├── exam-create/   # Sub-componentes do ExamCreate
│   ├── ai-deck/       # Fluxo de criação de deck com IA
│   ├── community/     # Preview e settings de comunidade
│   └── feedback/      # Feature requests
├── hooks/             # Custom hooks (queries, mutations, auth)
├── lib/               # Utilitários puros (algoritmos, formatação)
├── pages/             # Componentes de rota (orquestradores)
├── services/          # Camada de acesso a dados (Supabase queries)
├── types/             # Tipos de domínio centralizados
└── integrations/      # Auto-gerado (client, types)
```

---

## Convenções

### Camadas

| Camada     | Responsabilidade                          | Importa de          |
|------------|-------------------------------------------|---------------------|
| `pages/`   | Orquestração, layout, roteamento          | hooks, components   |
| `hooks/`   | React Query, mutations, estado reativo    | services, types     |
| `services/`| Chamadas Supabase, transformação de dados | types, client       |
| `types/`   | Interfaces e tipos de domínio             | —                   |
| `lib/`     | Funções puras, algoritmos                 | —                   |

### Regras

1. **Sem lógica de negócio em páginas** — delegue para hooks e services.
2. **Sem Supabase direto em componentes** — use services via hooks.
3. **Tipos centralizados** — importe de `@/types` ou `@/types/<domain>`.
4. **Barrel exports** — `@/types` e `@/services` exportam tudo.
5. **Componentes pequenos** — páginas grandes devem ser decompostas em sub-componentes.
6. **Context API** — para estado complexo compartilhado entre muitos sub-componentes (ex: `TurmaDetailContext`).
7. **Custom hooks de estado** — `useDashboardState` para estado local complexo sem necessidade de Context.

### Nomenclatura

- Hooks: `use<Entity>.ts` (ex: `useDecks.ts`)
- Services: `<entity>Service.ts` (ex: `deckService.ts`)
- Types: `<entity>.ts` em `src/types/`
- Sub-componentes: `src/components/<page-name>/`

### Design System

- Cores via tokens semânticos HSL em `index.css`
- Nunca usar cores hardcoded em componentes
- Shadcn/ui para primitivos de UI
- Tailwind classes via design tokens (`bg-primary`, `text-muted-foreground`, etc.)

---

## Algoritmos de Estudo

- **SM-2**: `src/lib/sm2.ts` — SuperMemo 2 modificado
- **FSRS**: `src/lib/fsrs.ts` — Free Spaced Repetition Scheduler

---

## Backend (Lovable Cloud)

- **Auth**: Email/senha com verificação
- **Database**: PostgreSQL com RLS em todas as tabelas
- **Edge Functions**: IA generativa (chat, geração de decks, correção de provas)
- **Storage**: `card-images`, `community-covers`, `lesson-files`

---

## Funcionalidades Removidas

- **Marketplace**: Removido (tabelas DB ainda existem como legado). Toda a lógica frontend foi eliminada.
