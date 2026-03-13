

# Avaliação: Estamos no caminho certo? Melhorias recomendadas

## O que está correto

O Caderno de Erros agora segue os princípios ALEKS:
- Agrupa por **conceito fraco** (KC), não por deck/questão
- Ação principal é **"Estudar conceito"** com questão variada (não reler a errada)
- Conceitos dominados **saem automaticamente** da lista (state !== 2)
- Pré-requisitos fracos são exibidos inline
- Auto-geração de questões via IA quando não há questões vinculadas

A arquitetura está sólida. Mas há **3 problemas concretos** que enfraquecem a experiência ALEKS:

---

## Problema 1: Rating manual no StudyMode (Errei/Bom/Fácil)

**Atual**: Após responder, o aluno vê 3 botões — "Errei", "Bom", "Fácil" — e escolhe manualmente como se autoavaliar.

**ALEKS**: O sistema determina automaticamente. Acertou = progresso. Errou = reforço. Sem autoavaliação.

**Correção**: Remover os 3 botões. Após confirmar a resposta:
- Correto → `rating = 3` (Bom) automaticamente, avança
- Incorreto → `rating = 1` (Again) automaticamente, avança
- O aluno não precisa decidir nada — o FSRS recebe o sinal binário correto

Isso simplifica a UI e elimina a possibilidade do aluno errar e clicar "Fácil".

## Problema 2: Apenas 1 questão por conceito no StudyMode

**Atual**: Para cada conceito na queue, apresenta 1 questão e avança.

**ALEKS**: Exige **2-3 questões corretas consecutivas** para considerar o conceito dominado. Um acerto isolado pode ser sorte.

**Correção**: No StudyMode, quando vindo do ErrorNotebook, apresentar **até 3 questões** por conceito:
- Se acerta 2 consecutivas → rating 3, avança (demonstrou domínio)
- Se erra qualquer uma → rating 1, avança (marca para revisão futura)
- Isso dá confiança real no domínio sem ser excessivamente frustrante

## Problema 3: Bug — `useState` usado como `useEffect`

**Atual** (StudyMode.tsx linha 28-32 e DiagnosticMode.tsx linha 45-49):
```ts
useState(() => {
  if (queue.length > 0 && user) {
    loadQuestion(queue[0]);
  }
});
```

Isso é um **anti-pattern**. `useState` com initializer roda durante o render, não como side effect. Funciona "por acaso" mas pode causar bugs de race condition em React 18 strict mode.

**Correção**: Substituir por `useEffect` com dependência vazia.

---

## Resumo das mudanças

| Arquivo | Mudança |
|---|---|
| `src/components/concepts/StudyMode.tsx` | Remover botões Errei/Bom/Fácil → rating automático binário. Adicionar loop de 2-3 questões por conceito. Corrigir useState → useEffect |
| `src/components/concepts/DiagnosticMode.tsx` | Corrigir useState → useEffect |

Nenhuma mudança no backend, migrations, ou service. Apenas refinamento do fluxo de UI.

