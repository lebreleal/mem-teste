

# Corrigir Terminologia: Novos / Aprendendo / Dominados

## Problema

Dois lugares na interface usam terminologia inconsistente com o padrao Anki:

1. **Pagina do Baralho (DeckStatsCard)**: Mostra "Em andamento" em vez de "Aprendendo"
2. **Carrossel do Dashboard (DeckCarousel)**: Mostra "Novos / Revisoes / Feitos" mas deveria mostrar "Novos / Aprendendo / Dominados"
   - Atualmente combina `reviewAvailable + learningAvailable` em um unico numero ("Revisoes")
   - Mostra `studiedToday` como "Feitos" com icone de Layers — o que confunde, pois o usuario pensa que sao "Dominados"

## Sobre o Simulador

Os tempos do simulador estao corretos agora:
- Novos: 7.6s, Aprendendo: 2.8s, Dominados: 8s (fallback pois quase nao tem dados reais de state 2 ainda)
- O grafico mostra "Dominados" ocupando mais tempo porque sao muitos cards acumulando com a repeticao espacada (20 novos/dia graduam e viram revisao). Isso e o comportamento correto do FSRS.

## Mudancas

### 1. DeckStatsCard.tsx (linha 69)
- Trocar "Em andamento" por "Aprendendo"

### 2. DeckCarousel.tsx (linhas 66-78)
- Separar os 3 contadores para mostrar corretamente:
  - SquarePlus icon: `newAvailable` = "Novos"
  - RotateCcw icon: `learningAvailable` = "Aprendendo" (state 1 e 3)
  - Layers icon: `reviewAvailable` = "Dominados" (state 2, que vem da repeticao espacada)
- Remover o conceito de "Feitos" dos contadores (o progresso ja aparece na barra abaixo)

Nenhuma mudanca no backend ou no simulador.

