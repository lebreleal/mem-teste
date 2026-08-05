# Fim dos subdecks: Sala > Pasta > Deck

## O bug de agora

O deck **"teste flash"** (117 cartões, dentro de TESTE OPENROUTER) é um deck raiz. Hoje **todo** deck raiz abre a tela de "matéria", que só sabe listar subdecks — como ele não tem nenhum, aparece "Esta coleção não tem cartões", mesmo com os 117 cartões dentro dele.

Sintoma do problema maior: as telas não sabem distinguir "deck que agrupa" de "deck que guarda cartões".

## Sua ideia funciona — e é melhor que a anterior

Mantemos as salas (já existem, 22 hoje, e a criação de sala continua). A hierarquia fica:

```text
Sala                     (nível 1)
├── Deck                 (solto direto na sala)
└── Pasta                (nível 2)
    └── Deck             (nível 3 — sempre folha, só cartões)
```

- Acabam os subdecks. Deck é sempre folha: só contém cartões.
- Dentro de uma sala podem coexistir decks soltos e pastas — misturados na mesma lista.
- Pasta não contém outra pasta. Profundidade máxima: Sala > Pasta > Deck.
- Assim os 16 decks-pai que hoje moram dentro de uma sala viram **pasta dentro daquela mesma sala** — ninguém é promovido nem sai do lugar. É exatamente a correção que faltava no plano anterior.

## O que acontece com o que já existe

Hoje: 71 decks raiz (56 dentro de sala, 15 soltos), 135 subdecks, 21 raízes com filhos, 41 raízes com cartões próprios, 2 com cartões **e** filhos, 1 neto de 3º nível, 22 salas.

- **Deck-pai com filhos → vira pasta**, dentro da mesma sala onde já estava; os filhos viram decks dentro dessa pasta.
- **Deck-pai com cartões próprios e filhos** (2 casos): vira pasta e os cartões próprios vão para um deck **"Geral"** dentro dela.
- **Deck-pai sem filhos** (maioria, inclui "teste flash"): continua deck normal — o bug some.
- **Deck-pai com filhos e sem sala**: criamos a sala **"Decks sem Sala"** e a pasta nasce lá dentro. Os 15 decks-folha soltos podem continuar soltos no Início, ou ir para essa mesma sala — digo abaixo o que assumo.
- O neto de 3º nível vira deck na pasta correspondente.
- Nada de cartões, histórico de revisão ou agendamento FSRS é perdido: os cartões ficam nos mesmos decks, só muda a "casa" do deck.

**Assumo:** decks-folha que hoje estão soltos (15) continuam soltos no Início. A sala "Decks sem Sala" só é criada se algum deck-pai sem sala precisar virar pasta.

## Como fica o uso

- Início: salas e decks soltos. Abrir sala → decks e pastas misturados. Abrir pasta → decks. Abrir deck → cartões.
- Criar com IA: escolhe sala e (opcional) pasta; o deck nasce com os cartões dentro dele — nunca mais um deck "vazio" que na verdade tem cartões.
- Estudar sala ou pasta continua agregando os decks abaixo, respeitando limites diários.
- Sai "criar sub-baralho"; entram "criar pasta" e "criar deck".

## Detalhes técnicos

**Banco (migração)**
- Para cada deck raiz ativo com filhos: cria `folders` com `parent_id = folder_id do deck-pai` (ou `NULL` + sala "Decks sem Sala" quando não houver), move os filhos para essa pasta com `parent_deck_id = NULL`.
- Deck-pai com cartões: cria deck "Geral" na nova pasta e reaponta `cards.deck_id`; o registro do deck-pai é então removido pela lógica equivalente a `delete_deck_cascade` (sem apagar cartões).
- Preserva `sort_order`, `source_turma_deck_id`, `community_id` e configurações FSRS.
- Constraint: `folders.parent_id` só pode apontar para pasta de nível 1 (sem neto de pasta). Hoje já existem 4 pastas aninhadas — compatíveis com o novo modelo.
- `parent_deck_id` deixa de ser escrito pelo app (coluna mantida como legada) e as RPCs que a percorrem passam a agregar por `folder_id`: `build_study_queue`, `count_descendant_cards_by_state`, `get_descendant_cards_page`, `get_dashboard_summary`, `get_recent_cards`, `get_user_performance_summary`, `search_user_content`, `delete_deck_cascade`, `bootstrap_follower_decks`, `leave_turma`.

**Frontend**
- `src/components/dashboard/DeckRow.tsx`: remove o desvio "deck raiz → `/materia/:id`"; deck sempre abre `/decks/:id`. (Correção imediata do bug.)
- `src/pages/MateriaDetail.tsx`: vira tela de pasta/sala (`/pasta/:id`), listando decks e pastas; `/materia/:id` redireciona.
- `src/hooks/useDashboardActions.ts`, `useDashboardState.ts`, `useDashboardSalas.ts`, `DashboardModals.tsx`: "novo sub-baralho" → "nova pasta"/"novo deck"; criação por IA recebe `folderId`.
- `src/lib/studyUtils.ts`: `getAllDescendantDeckIds` / `findRootDeckId` substituídos por agregação por pasta/sala.
- `src/hooks/useStudyPlan.ts`, `src/services/uiQueryService.ts`, `src/pages/DeckDetail.tsx` (breadcrumb), `src/pages/TurmaDetail.tsx`, `src/services/turmaLessonService.ts`: passam a usar `folder_id`.
- Testes: `src/test/studyQueue.test.ts` e `architecture.test.ts` atualizados.

## Ordem de execução

1. Correção do bug de navegação (deck raiz com cartões abre os cartões).
2. Migração de dados.
3. Ajuste das RPCs.
4. Refatoração das telas e hooks; fim do conceito de subdeck.
5. Rodar a suíte e conferir no preview: TESTE OPENROUTER → teste flash → 117 cartões.
