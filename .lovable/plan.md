
## Plano: Corrigir legenda da simulacao de estudos

### Problemas identificados

1. **Total de cards novos inflado**: `totalNewRemaining = totalNewCards + createdInPeriod` adiciona `90 criados/dia * N dias`, transformando 412 em 1042 (7d), 3112 (30d), 5182 (1 ano). O correto e mostrar apenas `totalNewCards` (412) como "cards novos restantes".

2. **"X dias" quando sao semanas**: Quando `horizonDays > 30`, o worker agrega os dados em semanas (S1, S2...). Mas a legenda usa `data.length` e `intenseDays` como se fossem dias. No 90d, mostra "13 dias" quando sao 13 semanas. No 1 ano, "53 dias" quando sao 53 semanas.

3. **Texto confuso em todos os cenarios**: As fases "intensa" e "manutencao" calculadas sobre dados semanais nao fazem sentido textual.

---

### Solucao

#### 1. Remover `createdInPeriod` do total exibido

```typescript
// De:
const createdInPeriod = (createdCardsOverride ?? defaultCreatedCardsPerDay) * data.length;
const totalNewRemaining = totalNewCards + createdInPeriod;

// Para:
const totalNewRemaining = totalNewCards;
```

O campo "cards criados/dia" ja esta visivel no slider acima. Nao faz sentido soma-lo ao total restante, pois sao cards que ainda nao existem.

#### 2. Detectar se dados sao semanais e usar unidade correta

```typescript
const isWeeklyData = data.length > 0 && data[0]?.day?.startsWith('S');
const periodLabel = isWeeklyData ? 'semanas' : 'dias';
const periodCount = data.length;
// Para converter semanas de volta em dias aproximados:
const approxDays = isWeeklyData ? periodCount * 7 : periodCount;
```

Usar `approxDays` para calculos de duracao e `periodLabel` para textos.

#### 3. Reescrever a legenda de forma simples e universal

Remover o sistema de "fases" (intensa/manutencao) que e confuso. Substituir por um resumo direto:

**Bloco principal** (sempre visivel):
- "Nos proximos {approxDays} dias, media de {avgMin}/dia. Pico de {peakMin} em {peakDay}."

**Bloco target** (quando ha data limite):
- "Faltam {412} cards novos ate {data} -- ritmo atual: ~{actualNewPerDay}/dia."

**Bloco status**:
- Verde: "Seu ritmo cabe na meta de {capacidade}/dia."
- Amarelo: "Media de {avg} excede sua capacidade de {cap}/dia." + botoes de ajuste.

---

### Detalhes tecnicos

**`src/components/study-plan/PlanComponents.tsx` (linhas 469-596)**:

Substituir todo o bloco da legenda:

```typescript
{summary && (() => {
  const currentNewCards = newCardsOverride ?? defaultNewCardsPerDay;
  const daysWithNewAll = data.filter(d => d.newCards > 0);
  const actualNewPerDay = daysWithNewAll.length > 0
    ? Math.round(daysWithNewAll.reduce((s, d) => s + d.newCards, 0) / daysWithNewAll.length)
    : 0;
  const isBelowCapacity = summary.avgDailyMin < avgCapacity;
  const peakDay = data.reduce((max, d) => d.totalMin > max.totalMin ? d : max, data[0]);
  
  // Detect weekly aggregation
  const isWeeklyData = data.length > 0 && data[0]?.day?.startsWith('S');
  const approxDays = isWeeklyData ? data.length * 7 : data.length;
  
  // Target
  const plansTarget = (plansList ?? []).filter(p => p.target_date);
  const earliestTarget = plansTarget.length > 0 ? /* same logic */ : null;
  const totalNewRemaining = totalNewCards; // NO MORE createdInPeriod

  return (
    <div className="rounded-lg bg-muted/50 border px-3 py-2.5 space-y-2">
      {/* Main summary - always one line */}
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Nos proximos <strong>{approxDays} dias</strong>, media de <strong>{formatMinutes(summary.avgDailyMin)}/dia</strong>.
        Pico em <strong>{peakDay.day} ({peakDay.date})</strong> com <strong>{formatMinutes(summary.peakMin)}</strong>.
      </p>

      {/* Target */}
      {earliestTarget && totalNewRemaining > 0 && (
        <>
          <div className="h-px bg-border" />
          <p className="text-[10px] text-muted-foreground">
            🎯 <strong>{totalNewRemaining} cards novos</strong> ate <strong>{format(earliestTarget, "dd/MM/yyyy")}</strong> -- ritmo atual: ~<strong>{actualNewPerDay}/dia</strong>.
          </p>
        </>
      )}

      {/* Status */}
      {isBelowCapacity ? (
        <p className="text-[11px] text-emerald-600">
          ✓ Cabe na sua meta de <strong>{formatMinutes(avgCapacity)}/dia</strong>.
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-[11px] text-amber-600">
            Media de <strong>{formatMinutes(summary.avgDailyMin)}</strong> excede sua meta de <strong>{formatMinutes(avgCapacity)}</strong>.
          </p>
          {/* Buttons to reduce/increase */}
        </div>
      )}
    </div>
  );
})()}
```

### Arquivos a editar

- `src/components/study-plan/PlanComponents.tsx` -- reescrever bloco da legenda (linhas 469-596)
