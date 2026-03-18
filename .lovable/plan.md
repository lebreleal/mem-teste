

## Diagnóstico e Correções

### Bug 1: Maximum call stack size exceeded (CRÍTICO)

**Causa raiz**: Loop infinito entre `syncClozeState` e `enforceCloze` no `useEffect` (linha 230-270 do RichEditor).

Fluxo do bug:
1. `clozeActive = true`, cursor fora do cloze
2. `enforceCloze` chama `syncClozeState()`
3. `syncClozeState` detecta `clozeActive && !inCloze` → chama `editor.chain().unsetMark().run()`
4. Isso dispara nova `transaction` → `enforceCloze` roda de novo
5. `enforceCloze` tenta `setMark` (porque `clozeActive` ainda é `true` no closure) → nova transaction
6. Loop infinito

**Correção**: Usar um ref `isUpdatingRef` como guard de re-entrada. Quando `syncClozeState` desativa o cloze, setar o ref antes de chamar `unsetMark`, e `enforceCloze` checa o ref antes de agir. Além disso, mover o `setClozeActive(false)` para ANTES do `editor.chain()` para que o próximo tick do `enforceCloze` já veja `clozeActive = false`.

### Bug 2: Paleta de cores do cloze empurra a toolbar

Atualmente os dots aparecem **inline** na toolbar (linha 717-734). Isso desloca os outros botões.

**Correção**: Mudar para um `Popover` que abre **acima** do botão cloze (side="top"), usando o componente `Popover` já importado. O popover abre quando `showPalette` é true e fecha ao clicar fora.

### Bug 3: OcclusionEditor — zoom e comportamento do canvas

Problemas relatados:
- **Zoom distorce a imagem**: O zoom atual multiplica o `scale` que dimensiona a imagem (`getDisplaySize` linha 121). Isso faz a imagem crescer/encolher dentro do container. O correto é manter o tamanho do container fixo e aplicar `transform: scale()` com `overflow: auto` para simular zoom de viewport.
- **Tamanho do modal/canvas não muda**: O container deveria ser fixo (ex: 100% do espaço disponível), e a imagem se ajusta dentro. Zoom é apenas visual.
- **Move não pode sair do canvas**: Já implementado com `clamp` (linha 285-286). Está correto.
- **Imagem demora a abrir**: Quando o modal abre com `imageUrl` já definido, a imagem precisa carregar. Adicionar `loading="eager"` e fazer prefetch da URL quando o usuário clica para abrir o modal.

**Correção do zoom**:
- `getDisplaySize` calcula o fit SEM zoom (imagem se ajusta ao container)
- O zoom é aplicado via `transform: scale(zoom)` no wrapper da imagem + shapes, com `transformOrigin: 'center center'`
- O container tem `overflow: auto` para permitir scroll quando zoom > 1
- Pan funciona naturalmente com scroll ou com a ferramenta Hand
- Ao salvar, ignora zoom e pan — usa coordenadas normalizadas da imagem original

### Bug 4: ToolBtn ref warning

Console mostra "Function components cannot be given refs" para `ToolBtn`. Isso acontece porque `ToolBtn` é um componente funcional usado dentro de `TooltipTrigger asChild` ou similar que tenta passar ref.

**Correção**: Converter `ToolBtn` para usar `React.forwardRef`.

---

### Arquivos modificados

| Arquivo | Mudança |
|---|---|
| `src/components/RichEditor.tsx` | Fix stack overflow (guard de re-entrada no useEffect), paleta em Popover acima do botão, ToolBtn com forwardRef |
| `src/components/manage-deck/OcclusionEditor.tsx` | Zoom via transform ao invés de scale no displaySize, container fixo, prefetch de imagem |

### Impacto

Nenhuma mudança em services, tipos, ou lógica de estudo. Apenas correções de UI e bug de runtime.

