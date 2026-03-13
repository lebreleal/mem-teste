

# Avaliação Honesta: NÃO devemos refatorar tudo

## O que já funciona bem (e NÃO deve mudar)

O sistema atual já tem os pilares do ALEKS implementados:
- Grafo de pré-requisitos (`parent_concept_id`)
- Cascade automático no erro
- Fronteira "Prontos para aprender" com conceitos bloqueados
- Donut chart de progresso por categoria
- Diagnóstico inicial (Knowledge Check)
- Auto-mapeamento via IA

## Por que as 5 tarefas propostas anteriormente NÃO são boas ideias de UX

### 1. "3 acertos consecutivos para dominar" — Frustrante
O FSRS já cuida da graduação com critérios matemáticos (stability, difficulty). Forçar 3 acertos consecutivos por cima do FSRS cria uma experiência frustrante: o aluno acerta, mas o sistema diz "ainda não". Isso contradiz o modelo FSRS que já é sofisticado.

### 2. "Separar Aprender vs Revisar" — Confuso
Ter dois botões de estudo no header complica a experiência. O botão atual "Revisar X" + a seção "Prontos para aprender" já separam isso naturalmente. Dois modos explícitos forçam o usuário a pensar em qual escolher.

### 3. "Reassessment periódico" — Intrusivo
O FSRS já reagenda conceitos dominados quando a stability decai. Um banner forçando reavaliação a cada 15 conceitos é redundante e interrompe o fluxo natural de estudo.

### 4. "Geração de questões on-demand" — Já existe (via baralhos)
O sistema já gera questões nos baralhos que são vinculadas a conceitos. Duplicar essa funcionalidade na página de conceitos cria confusão sobre onde gerar conteúdo.

### 5. "Mapa visual do grafo" — Inapropriado para mobile
Em 768px de viewport, um grafo visual com nós e linhas fica ilegível. A lista com badges de estado e o donut chart já comunicam progresso de forma clara e compacta.

## O que REALMENTE poderia melhorar (incrementalmente)

O arquivo `Concepts.tsx` já tem **1400 linhas** — está no limite. Qualquer adição deve ser cirúrgica:

1. **Extrair componentes**: O arquivo monolítico dificulta manutenção. Extrair `DiagnosticMode`, `StudyMode`, `ConceptList` em componentes separados melhoraria a organização sem mudar UX.

2. **Bug fix real**: Verificar se o estudo de conceitos da fronteira realmente funciona (o `onStartStudy` do `ReadyToLearnSection` faz tudo inline sem error handling robusto).

3. **Performance**: Com muitos conceitos, o `lockedIds` e `filtered` recalculam em cada render. Memoização mais agressiva ajudaria.

## Recomendação

O sistema já está funcional e alinhado com os princípios do ALEKS. **Não refatorar tudo.** Apenas:
- Extrair sub-componentes do arquivo de 1400 linhas para manutenibilidade
- Corrigir bugs pontuais que aparecerem durante testes reais
- Testar o fluxo completo no preview para validar que tudo funciona

