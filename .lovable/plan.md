

## Reorganização: Barra de Estudo da Sala (layout macaco)

### Layout atual (3 elementos separados)
```text
Linha 1: ~15min restantes hoje  (ℹ)
Linha 2: [⚙️]  [◉ 42%]  [══ ESTUDAR ▶ ══]
```

### Layout proposto (tudo numa linha só)
```text
[◉ 42%  ~15min]     [⚙️] [ESTUDAR ▶]
```

- **Esquerda**: Gráfico circular (52px) + texto de tempo restante ao lado — ambos informacionais, se relacionam
- **Direita**: Botão config (⚙️) + botão ESTUDAR — ambos são ações

O tempo sai da posição acima do banner e vai para dentro da barra, colado ao gráfico. Uma linha só, leitura natural: "estou em 42%, faltam 15min" → "vou estudar".

### Mudança

**Arquivo único**: `src/components/dashboard/SalaHero.tsx`

1. **Remover** o bloco de tempo estimado separado (linhas 278-292)
2. **Reorganizar** a study bar (linhas 297-418) para:
   - `flex items-center justify-between`
   - Lado esquerdo: `flex items-center gap-2` com o SVG circular + `<span>~15min</span>`
   - Lado direito: `flex items-center gap-2` com o botão ⚙️ + botão ESTUDAR (ESTUDAR fica menor, `flex-none` ao invés de `flex-1`)
3. O popover de info do gráfico e do tempo permanecem (tap no gráfico = classificação, tap no tempo = explicação)

