

## Correções do Simulador de Estudos

### Problemas encontrados

1. **Progresso calculado errado**: O `ProgressSummaryCard` soma `newCards` de todos os pontos do gráfico como "cards estudados", mas esses são cards novos **projetados** para serem estudados no futuro. O card deveria mostrar quantos cards novos o usuário já dominou vs. total.

2. **Sem legenda no gráfico**: As barras azul e vermelha não têm nenhuma explicação visual. O usuário não sabe o que significam.

3. **Ícones inconsistentes**: Os controles usam caracteres de texto (`~`, `+`) como ícones em vez de ícones Lucide, ficando fora do padrão visual.

4. **Reset escondido**: O botão "reset" só aparece durante a edição. Deveria mostrar quando há override ativo, mesmo fora do modo edição.

5. **Data de conclusão pode quebrar**: A comparação entre `parseSimDate` (de string) e `earliestTarget` (Date) pode falhar em agregação semanal.

### Correções planejadas

#### 1. Corrigir calculo do ProgressSummaryCard

O progresso real precisa vir dos dados do simulador: o total de cards novos (`totalNewCards`) vs quantos serão completados dentro do horizonte da simulação.

- O `pct` será calculado corretamente: se a simulação mostra que todos os novos serão estudados dentro do período, o percentual é 100%. Se não, mostra a proporção.
- A data de conclusão será o último ponto da simulação onde `newCards > 0`, formatado para exibição.

#### 2. Adicionar mini-legenda ao gráfico

Abaixo do gráfico, adicionar uma linha simples:

```
● Dentro da capacidade   ● Excedente   --- Média
```

Usando divs com as mesmas cores das barras (azul e vermelho) e um tracejado para a linha de referência.

#### 3. Trocar ícones de texto por Lucide

- `~` por `Layers` (cards novos para estudar)
- `+` por `Plus` (cards criados)

#### 4. Mostrar badge "simulando" fora do modo edição

Quando há override ativo, mostrar o badge "simulando" e um botão "reset" inline ao lado do valor, mesmo sem clicar para editar.

#### 5. Robustez da data de conclusão

Usar `parseSimDate` com fallback e garantir que funciona tanto com formato diário (`22/02/26`) quanto semanal.

### Arquivo a editar

**`src/components/study-plan/PlanComponents.tsx`**:

- `ProgressSummaryCard`: corrigir cálculo de `pct` e `studied`
- Após o `ResponsiveContainer`, adicionar mini-legenda com 3 itens (azul, vermelho, tracejado)
- `ControlRow`: trocar `icon: string` por `icon: React.ReactNode` e usar componentes Lucide
- `ControlRow`: mostrar badge + reset quando `isOverridden && !editing`
- `SimulationControls`: atualizar chamadas de `ControlRow` com ícones Lucide

### Detalhes técnicos

**Mini-legenda do gráfico** (adicionada logo abaixo do `ResponsiveContainer`):
```tsx
<div className="flex items-center gap-4 justify-center text-[10px] text-muted-foreground">
  <span className="flex items-center gap-1">
    <span className="h-2 w-2 rounded-sm bg-[hsl(217_91%_60%)] opacity-80" /> Dentro da capacidade
  </span>
  <span className="flex items-center gap-1">
    <span className="h-2 w-2 rounded-sm bg-[hsl(0_84%_60%)] opacity-75" /> Excedente
  </span>
  <span className="flex items-center gap-1">
    <span className="h-3 w-3 border-t border-dashed border-muted-foreground/40" /> Média
  </span>
</div>
```

**Cálculo corrigido do progresso**:
```typescript
// totalNewInSim = soma de newCards previstos na simulação
// Isso representa quantos dos totalNewCards serão estudados no período
const willStudy = Math.min(totalNewCards, totalNewInSim);
const pct = totalNewCards > 0 ? Math.min(100, Math.round((willStudy / totalNewCards) * 100)) : 100;
```

**ControlRow melhorado** — quando `isOverridden && !editing`, mostra o valor com badge "simulando" e botão reset ao lado:
```tsx
{isOverridden && !editing && (
  <>
    <Badge variant="outline" className="text-[9px] h-4 px-1 border-primary/40 text-primary">simulando</Badge>
    <button onClick={onReset} className="text-[10px] text-primary underline">reset</button>
  </>
)}
```
