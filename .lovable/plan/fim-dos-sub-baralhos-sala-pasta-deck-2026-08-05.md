# Fim dos sub-baralhos: Sala > Pasta > Deck

## Decisão de arquitetura

Sua ideia está certa e é a mesma do Brainscape (lá é Class > Deck > Card). Adotamos:

```text
Sala (nível 1, pasta)
 ├── Deck (solto, só cartões)
 └── Pasta (nível 2)
      └── Deck (só cartões)
```

- Todo deck-pai antigo virou Pasta; todo sub-baralho virou Deck.
- Deck nunca tem filho — só cartões. Isso elimina a tela intermediária que dizia "sem cartões".
- Profundidade máxima: Sala > Pasta > Deck (pasta dentro de pasta só nesse nível; nada mais fundo, para não virar labirinto).
- Pode misturar deck solto e pasta dentro da mesma sala.

## Estado atual (já executado)

- Migração no banco: hierarquia de `parent_deck_id` achatada, pastas criadas para cada deck-pai, cartões órfãos movidos para um deck "Geral", trigger `trg_enforce_folder_depth` impedindo aninhamento extra. Hoje: 0 sub-baralhos no banco.
- Home: `PastaRow` renderiza pastas dentro da sala; decks e pastas convivem lado a lado.
- Rota `/materia/:id` agora redireciona para `/decks/:id`; a página antiga foi removida.
- Contagens da Sala somam decks diretos + decks dentro das pastas.
- Importação do Anki cria decks planos (caminho no nome) em vez de sub-baralhos; matérias de comunidade viram pastas.

O caso citado — sala "TESTE OPENROUTER", deck "teste flash" com 117 cartões — está correto no banco: deck solto dentro da sala, sem pai. Com a rota corrigida ele abre direto na lista de cartões.

## O que falta

1. Verificar no preview a sala "TESTE OPENROUTER": abrir a sala, confirmar que o deck aparece com 117 cartões e abre em `/decks/:id`.
2. Limpar resíduos legados de `parent_deck_id` na UI (textos "sub-baralho" em `DeckSettings`, opções de mover para "matéria" no diálogo de mover, helpers `collectDescendantIds`/`findRootAncestorId` sem uso).
3. Ajustar `followerBootstrap` para não recriar sub-baralhos em salas de comunidade (hoje é código morto, mas fica como armadilha).
4. Ao criar deck por IA dentro de uma sala, oferecer escolher/criar a pasta de destino (opcional, hoje cai solto na sala — o que já é válido).

## Detalhes técnicos

- Coluna `parent_deck_id` permanece na tabela apenas como legado; nenhum caminho de escrita a preenche mais. Remoção definitiva pode ser feita em uma migração posterior depois de um período de estabilidade.
- Trigger de profundidade garante a regra no banco, não só na UI.
