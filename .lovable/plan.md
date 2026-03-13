

# Diagnóstico: Caderno de Erros vs ALEKS

## Problema Central

O Caderno de Erros atual funciona como um **log passivo de questões erradas** agrupado por baralho. No ALEKS, quando o aluno erra, o sistema **não mostra a questão errada de volta** — ele identifica o Knowledge Component fraco e redireciona para **estudo ativo do conceito**, não revisão da questão.

## Diferenças Concretas

| Aspecto | ALEKS | Sistema Atual |
|---|---|---|
| **Foco** | No conceito fraco (KC) | Na questão errada |
| **Ação principal** | Estudar o conceito fraco com questões variadas | "Revisar erros" (reler a mesma questão) |
| **Agrupamento** | Por conceito/KC | Por baralho |
| **Diagnóstico** | Automático e imediato | Manual (clicar questão → esperar API) |
| **Remediação** | Estudo guiado do KC até domínio | "Preencher lacuna" gera cards soltos |
| **Progresso** | Conceito sai da lista quando dominado | Questão some só quando acertar de novo |

## Correções Propostas

### 1. Agrupar por Conceito, não por Baralho
Inverter a hierarquia: o nível principal é o **Knowledge Component fraco**, com as questões erradas como evidência embaixo. Isso elimina a visão por deck que não tem significado pedagógico.

### 2. Ação principal = "Estudar Conceito"
Em vez de "Revisar erros" (reler a questão), o botão principal inicia uma mini-sessão de estudo do conceito fraco usando `getOrGenerateQuestion` — questão **diferente** da que errou, testando o mesmo KC.

### 3. Diagnóstico hierárquico pré-carregado
Carregar os pré-requisitos fracos automaticamente ao abrir a página (em batch), eliminando o clique-e-espera por questão. O `buildHierarchyDiagnostic` já faz muitas queries sequenciais — pré-carregar ao menos os source concepts + parents.

### 4. Remover "Preencher lacuna com cards"
O botão `generateCascadeContent` cria um deck "Reforço: X" solto que o aluno nunca vai encontrar. Substituir por "Estudar pré-requisito" que inicia o `StudyMode` direto com o conceito fraco.

### 5. Progresso visível: conceitos saem da lista
Quando um conceito atinge `state === 2` (dominado), ele some automaticamente da lista de lacunas. Isso dá feedback tangível de progresso.

## Implementação Técnica

### Arquivo: `src/pages/ErrorNotebook.tsx` (reescrever)
- Query principal: buscar todos os conceitos do usuário com `state IN (0, 3)` que têm questões erradas vinculadas
- Agrupar por conceito (não por deck)
- Para cada conceito fraco: mostrar nome, health, count de erros, pré-requisitos (via parent_concept_id join simples, sem recursão completa)
- Botão "Estudar" → abre `StudyMode` com queue = [conceito]
- Remover `ConceptDrillQuiz`, `HierarchyTreeView`, `generateCascadeContent`

### Arquivo: `src/services/conceptHierarchyService.ts`
- Simplificar: manter apenas `getWeakConceptsWithErrors` que retorna conceitos fracos + parents fracos em uma query
- Remover as funções recursivas de ancestors/descendants/siblings (over-engineering)

### Dados necessários (sem migration)
- `global_concepts` já tem `state`, `parent_concept_id`
- `question_concepts` já vincula questões a conceitos
- `deck_question_attempts` já tem `is_correct`
- Tudo já existe no schema

