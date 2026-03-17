

# Plano: Corrigir Bug do Cloze + Redesenhar Seletor de Cor/Grifo

## Problema 1 — Cloze perde formatação após 2a letra

**Causa raiz**: `ClozeMark` está definido com `inclusive: false` (linha 35). Isso faz o TipTap NÃO estender a mark para novos caracteres digitados na borda. Quando `clozeActive` é true e o usuário digita, cada novo caractere cai fora da mark após o primeiro.

**Solução**: Adicionar um listener de `transaction` que, enquanto `clozeActive` for true, re-aplica a mark cloze ao texto recém-digitado. Concretamente:
- No `useEffect` que já escuta `transaction` (linhas 211-228), detectar quando `clozeActive` é true e o cursor está logo após a borda de um `clozeMark`
- Re-aplicar `setMark('clozeMark', { num: clozeCounter })` na posição atual
- Isso mantém `inclusive: false` para comportamento normal (digitar depois de um cloze finalizado fica fora) enquanto força extensão durante criação ativa

**Arquivo**: `src/components/RichEditor.tsx`
- Modificar o `useEffect` de transaction (linhas 211-228) para incluir lógica de re-aplicação de mark
- O cloze só para de "grudar" quando o usuário clica no botão cloze de novo, aperta Enter ou Escape (já implementado nas linhas 231-243)

---

## Problema 2 — Seletor de Cor precisa de Grifo (highlight/fundo)

**Estado atual**: Apenas cor de texto via `@tiptap/extension-color`. Sem suporte a highlight/fundo. O popover é um grid 4x2 de quadrados coloridos sem separação entre texto e fundo.

**Solução**: Redesenhar conforme a referência (Noji):

### Layout novo do Popover (duas linhas horizontais):

```text
Grifo:   [⊘] [verde-claro] [rosa-claro] [azul-claro] [amarelo-claro] [roxo-claro]
         ─── separador ───
Texto:   [preto] [verde] [vermelho] [azul] [laranja] [roxo]
```

### Mudanças técnicas:
1. **Instalar** `@tiptap/extension-highlight` com `multicolor: true`
2. **Adicionar** Highlight às extensions do editor (linha 141-149)
3. **Redesenhar** o popover de cor (linhas 663-688):
   - Linha 1: label "Grifo" + círculos de cores de fundo (pastéis)
   - Linha 2: label "Texto" + círculos de cores de texto (sólidas)
   - Cada círculo é redondo (`rounded-full`) em vez de quadrado
4. **Dividir** `handleSetColor` em `handleSetTextColor` e `handleSetHighlight`
5. **Atualizar** o ícone do botão para refletir estado de highlight ativo (barra inferior mostra cor ativa)

### Cores:
- **Grifo (fundo)**: nenhum, `#E1FFBE`, `#FFE6E8`, `#DDF1FF`, `#FFF3CE`, `#E8E8FF`
- **Texto**: default (foreground), `#47C700`, `#FF375B`, `#0093F0`, `#FF8B00`, `#4E5EE5`

**Arquivos**:
- `src/components/RichEditor.tsx` — redesenhar popover, adicionar Highlight extension, split handler
- `package.json` — adicionar `@tiptap/extension-highlight`

---

## Problema 3 — Recursos que faltam vs Noji/Brainscape

Análise de funcionalidades que competidores têm e MemoCards não:

| Recurso | Noji | Brainscape | MemoCards | Prioridade |
|---------|------|------------|-----------|------------|
| Compartilhar streak nas redes sociais | Sim | Sim | Nao | Alta — engajamento viral |
| Operações em lote (selecionar + mover/deletar/taguear) | Sim | Sim | Parcial | Media |
| Marketplace de decks pagos | Nao | Sim | Nao | Baixa — requer infraestrutura |
| Edição colaborativa de deck | Nao | Sim | Nao | Baixa |
| Notas pessoais em cards de comunidade | Sim | Nao | Parcial (PersonalNotes.tsx existe) | Media |
| Modo offline completo | Sim | Parcial | Nao | Alta — essencial mobile |

Os 2 recursos de maior impacto que faltam:
1. **Compartilhar streak/conquistas** — imagem gerável para Instagram/WhatsApp com stats do dia
2. **Modo offline** — Service Worker com cache de cards da sessão atual para estudo sem internet

---

## Resumo de Implementação

| Passo | O que | Arquivo |
|-------|-------|---------|
| 1 | Instalar `@tiptap/extension-highlight` | `package.json` |
| 2 | Corrigir cloze: re-aplicar mark via transaction listener enquanto `clozeActive` | `RichEditor.tsx` |
| 3 | Redesenhar popover de cor com 2 linhas (grifo + texto) e círculos | `RichEditor.tsx` |
| 4 | Adicionar Highlight extension ao editor | `RichEditor.tsx` |

