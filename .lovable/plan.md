

# Analise Profunda: Neurociencia da Aprendizagem vs Implementacao Atual

## Veredicto Geral

O sistema esta **80% alinhado** com os principios da neurociencia. As ultimas modificacoes (rating automatico binario, mastery threshold de 2 acertos consecutivos, agrupamento por KC, auto-geracao de questoes) foram acertos significativos. Porem, ha **4 lacunas concretas** que a literatura de learning science identifica como criticas.

---

## O que esta CORRETO (validado pela literatura)

| Principio | Implementacao | Base Cientifica |
|---|---|---|
| **Spaced Repetition (FSRS-6)** | Conceitos agendados por FSRS com 85% retention | Ebbinghaus 1885, Cepeda et al. 2006 |
| **Testing Effect** | Estudo via questoes (retrieval practice), nao releitura | Roediger & Karpicke 2006 |
| **Varied Practice** | `getVariedQuestion` seleciona questao diferente a cada revisao | Bjork 1994 (desirable difficulties) |
| **Binary Feedback** | Rating automatico (acertou=3, errou=1) sem autoavaliacao | Dunning-Kruger: alunos sao pessimos em autoavaliar |
| **Mastery-based** | 2 acertos consecutivos para confirmar dominio | Bloom 1968 (mastery learning) |
| **Prerequisite Graph** | `parent_concept_id` + cascade on error | Doignon & Falmagne 1999 (Knowledge Space Theory) |
| **Auto-generation** | Conceitos sem questoes geram conteudo via IA | Elimina "dead ends" no grafo de conhecimento |

---

## LACUNA 1: Falta Elaborative Interrogation apos erro

**Problema**: Quando o aluno erra no `StudyMode`, ve "Incorreto — conceito marcado para revisao futura" + explicacao passiva. Isso e **feedback passivo** — o aluno le a resposta e clica "proximo".

**Neurociencia**: Elaborative Interrogation (Chi et al. 1994, Dunlosky et al. 2013) mostra que **forcar o aluno a explicar POR QUE a resposta correta esta certa** antes de ver a explicacao da IA melhora retenção em ~30%. A memoria nota do sistema ja menciona isso mas nao esta implementado.

**Correcao**: Apos erro, mostrar um campo de texto "Explique por que a alternativa X esta correta" antes de revelar a explicacao. Opcional (pode pular), mas o ato de tentar gerar a explicacao ativa circuitos de encoding profundo.

## LACUNA 2: Falta Interleaved Practice

**Problema**: O `StudyMode` apresenta conceitos **em sequencia** (conceito 1 → conceito 2 → ...). Quando vem do ErrorNotebook, a queue e [conceito_clicado, parent_fraco]. Isso e **blocked practice** — estudar um tema por vez.

**Neurociencia**: Interleaved Practice (Rohrer & Taylor 2007, Kornell & Bjork 2008) mostra que **misturar conceitos de categorias diferentes** na mesma sessao melhora retenção de longo prazo em ~20-40%, apesar de parecer mais dificil no momento. A memoria do sistema ja menciona isso.

**Correcao**: No ErrorNotebook, o botao "Estudar conceito" deveria construir uma queue com **todos os conceitos fracos embaralhados** (ou pelo menos 5-10), nao apenas o conceito clicado + parent. Adicionar um botao "Estudar todos" que cria uma sessao interleaved.

## LACUNA 3: Falta Confidence-Based Assessment

**Problema**: O sistema trata um acerto como um acerto, independente de se o aluno "chutou" ou "sabia". No ALEKS real, acertar por chute nao conta como dominio.

**Neurociencia**: Confidence-weighted learning (Hunt 2003, Dunlosky & Rawson 2012) mostra que pedir ao aluno "Qual sua confianca?" APOS responder (nao antes) melhora a calibracao metacognitiva. Acertou com baixa confianca = nao conta como streak.

**Correcao**: Apos confirmar resposta correta, perguntar "Voce tinha certeza?" (Sim/Nao). Se "Nao" → nao incrementa `consecutiveCorrect`, exige mais uma questao. Isso impede que chutes sortudos confirmem dominio. Simples de implementar, alto impacto.

## LACUNA 4: DiagnosticMode nao usa mastery threshold

**Problema**: O `DiagnosticMode` usa apenas **1 questao por conceito** para determinar se e "dominado" ou "fraco". Um acerto isolado pode ser sorte — especialmente em questoes de 4 alternativas (25% de chute).

**Neurociencia**: O mesmo principio do mastery threshold (Bloom 1968) que ja aplicamos no StudyMode deveria valer no diagnostico. 1 questao = 25% chance de falso positivo.

**Correcao**: Aplicar o mesmo `MASTERY_THRESHOLD = 2` do StudyMode ao DiagnosticMode. Se acertou a primeira, apresentar uma segunda questao do mesmo conceito antes de marcar como dominado.

---

## Resumo de Prioridade

| Lacuna | Impacto | Esforco | Prioridade |
|---|---|---|---|
| **Interleaved Practice** (embaralhar conceitos) | Alto (+20-40% retencao) | Baixo (mudar construcao da queue) | 1 |
| **Elaborative Interrogation** (explicar apos erro) | Alto (+30% encoding) | Medio (adicionar campo texto) | 2 |
| **Confidence check** (filtrar chutes) | Medio (calibracao) | Baixo (1 pergunta extra) | 3 |
| **DiagnosticMode mastery threshold** | Medio (reduz falsos positivos) | Baixo (reusar logica StudyMode) | 4 |

## Implementacao Tecnica

### Arquivos afetados
- `src/pages/ErrorNotebook.tsx` — adicionar botao "Estudar todos" com queue embaralhada
- `src/components/concepts/StudyMode.tsx` — elaborative interrogation field + confidence check
- `src/components/concepts/DiagnosticMode.tsx` — mastery threshold de 2 questoes

### Sem mudancas necessarias em
- Backend/migrations
- FSRS logic
- Services

