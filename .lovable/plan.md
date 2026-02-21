

# Simulador de Carga Independente com Capacidade por Dia da Semana

## Contexto

Atualmente o simulador usa diretamente a capacidade global do perfil (`dailyMinutes` / `weeklyMinutes`). Qualquer mudanca exige editar a capacidade real. O usuario quer poder "brincar" com cenarios sem afetar o plano ativo.

## Mudancas

### 1. Adicionar campo editavel de "Tempo de estudo" ao Simulador

Dentro do componente `ForecastSimulator` (em `PlanComponents.tsx`), adicionar um terceiro campo editavel logo abaixo de "cards criados/dia":

```
~ 20 novos para estudar/dia [editar]
+ 88 cards criados/dia       [editar]
⏱ 60min/dia                  [editar] [por dia da semana]
```

- Por padrao, mostra a capacidade real do perfil
- Ao editar, o usuario pode mudar o valor **apenas no simulador**
- Um botao "por dia da semana" expande 7 sliders inline (Seg-Dom) dentro do proprio simulador
- Isso NAO altera a capacidade real do perfil

### 2. Botao "Aplicar ao meu plano"

Quando o usuario editar o tempo no simulador e gostar do resultado:
- Aparece um botao discreto "Aplicar ao meu plano" abaixo do grafico
- Ao clicar, os valores simulados sao salvos na capacidade global real (`profiles.daily_study_minutes` e `profiles.weekly_study_minutes`)
- Toast de confirmacao

### 3. Mudancas tecnicas

**Arquivo: `src/components/study-plan/PlanComponents.tsx`**
- Adicionar estado local `editingCapacity`, `tempDailyMin`, `tempWeekly`, `editingWeeklyMode`
- Novo campo editavel de minutos/dia com icone de relogio
- Toggle "por dia da semana" que expande 7 inputs inline compactos
- Botao "Aplicar ao meu plano" que chama um callback `onApplyCapacity`
- O campo mostra um indicador visual quando o valor simulado difere do real (ex: badge "simulando")

**Arquivo: `src/pages/StudyPlan.tsx` (ForecastSimulatorSection)**
- Adicionar estados `dailyMinutesOverride` e `weeklyMinutesOverride`
- Passar os overrides ao hook `useForecastSimulator` em vez dos valores reais quando editados
- Implementar `handleApplyCapacity` que chama `updateCapacity.mutateAsync` com os valores simulados
- Passar `onApplyCapacity` e os valores reais como props ao `ForecastSimulator`

**Arquivo: `src/hooks/useForecastSimulator.ts`**
- Ja recebe `dailyMinutes` e `weeklyMinutes` como params -- nenhuma mudanca necessaria, os overrides serao passados pelo caller

### 4. UI do campo de capacidade no simulador

Layout compacto, consistente com os campos de novos/dia e criados/dia:

```
⏱ 60min/dia [lapis]              -- modo visualizacao
⏱ [__60__] min/dia [check]       -- modo edicao uniforme
  [Igual todo dia] [Por dia]      -- toggle aparece ao editar
```

Se "Por dia da semana":
```
Seg [__60__]  Ter [__60__]  Qua [__45__]
Qui [__60__]  Sex [__30__]  Sab [__90__]
Dom [__90__]
[Confirmar]
```

### 5. Botao "Aplicar" aparece condicionalmente

O botao "Aplicar ao meu plano" so aparece quando pelo menos um dos valores simulados difere dos valores reais:
- `dailyMinutesOverride !== undefined`
- `weeklyMinutesOverride !== undefined`
- `newCardsOverride !== undefined`
- `createdCardsOverride !== undefined`

Estilo: botao outline com icone de check, posicionado abaixo do grafico/sumario.

### 6. Renomear secao

- De: "Previsao de Carga"
- Para: "Simulador de Carga"

## Resumo do fluxo

1. Usuario abre /plano
2. Ve o Simulador com valores reais pre-preenchidos
3. Edita "novos/dia", "criados/dia" ou "tempo/dia" -- grafico recalcula em tempo real
4. Se gostar, clica "Aplicar ao meu plano" -- valores salvos no perfil
5. Se nao gostar, simplesmente sai -- nada muda

## Arquivos modificados

- `src/components/study-plan/PlanComponents.tsx` -- UI do simulador
- `src/pages/StudyPlan.tsx` -- estado e callbacks de aplicacao
