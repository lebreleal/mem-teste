

## Plano: Melhorar Autoavaliação Inline (durante prática de questões)

### Decisão de UX: Manter inline, sem navegação extra

A melhor abordagem e manter a autoavaliacao **exatamente onde ja esta** — inline, logo apos responder a questao. Criar uma secao separada ou mover pro caderno de erros adicionaria fricao de navegacao sem ganho real. O momento cognitivo ideal para autoavaliar e **imediatamente apos responder**.

### O que muda

**1. Escala de 3 niveis (substitui binario Sim/Nao)**

Trocar os 2 botoes por 3 opcoes visuais distintas:
- **"Dominei"** (verde, icone Check) — marca como compreendido, colapsa o conceito
- **"Mais ou menos"** (amarelo/amber, icone ~) — mostra cards existentes + oferece explicacao IA  
- **"Nao entendi"** (vermelho, icone X) — comportamento atual (busca cards, oferece criar, explica com IA)

**2. Barra de progresso no topo da secao**

Adicionar mini progress bar mostrando "2/4 conceitos dominados" com cores proporcionais (verde para dominados, amarelo para parciais, vermelho para nao compreendidos).

**3. Colapso visual de conceitos avaliados**

Apos avaliar, o conceito colapsa para uma linha compacta com indicador colorido (borda lateral), podendo expandir ao tocar. Isso reduz ruido visual quando ha muitos conceitos.

**4. Borda lateral colorida por status**

Cada card de conceito ganha uma borda esquerda colorida:
- Verde = dominado
- Amber = parcial  
- Vermelho = nao entendido
- Cinza = ainda nao avaliado

### Arquivo editado

- `src/components/deck-detail/DeckQuestionsTab.tsx` — componente `ConceptMasterySection` (linhas 148-344)

### Escopo

- Sem mudancas no backend/banco
- Sem novas dependencias
- Apenas refatoracao de UI no componente existente
- O campo `mastery_level` no banco ja suporta valores como `strong`, `learning`, `weak` — mapeamento direto

