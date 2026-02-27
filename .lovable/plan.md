

## Separar ocultação de irmãos em 3 configurações (como Anki)

### Situacao atual
Existe apenas um campo booleano `bury_siblings` no baralho. Quando ativo, remove **todos** os irmãos cloze da fila independente do estado (novo, aprendendo, revisao). Isso e mais agressivo que o Anki e causa a situacao onde 9 novos aparecem no contador mas nao aparecem na sessao.

### O que muda

Dividir em 3 campos independentes, alinhados com o Anki:
- `bury_new_siblings` -- Ocultar novos irmaos ate o dia seguinte
- `bury_review_siblings` -- Ocultar irmaos de revisao ate o dia seguinte  
- `bury_learning_siblings` -- Ocultar irmaos em aprendizado ate o dia seguinte

Todos ativados por padrao (mantendo compatibilidade com o comportamento atual).

### Plano tecnico

**1. Banco de dados -- adicionar 3 novas colunas na tabela `decks`**

Criar migracao SQL:
```sql
ALTER TABLE decks 
  ADD COLUMN bury_new_siblings boolean NOT NULL DEFAULT true,
  ADD COLUMN bury_review_siblings boolean NOT NULL DEFAULT true,
  ADD COLUMN bury_learning_siblings boolean NOT NULL DEFAULT true;

-- Copiar valor atual do bury_siblings para os 3 novos campos
UPDATE decks SET 
  bury_new_siblings = bury_siblings,
  bury_review_siblings = bury_siblings,
  bury_learning_siblings = bury_siblings;
```

**2. Logica da fila de estudo -- `src/services/studyService.ts`**

Atualizar o select para incluir os 3 novos campos. Substituir a logica de burying unica por uma logica que verifica o estado de cada cartao:

```text
Para cada cartao cloze na fila:
  - Se state=0 (novo) e bury_new_siblings=true --> ocultar se irmao ja visto
  - Se state=2 (revisao) e bury_review_siblings=true --> ocultar se irmao ja visto
  - Se state=1 ou 3 (aprendendo/reaprendendo) e bury_learning_siblings=true --> ocultar se irmao ja visto
```

O campo antigo `bury_siblings` sera mantido temporariamente mas nao mais utilizado na logica.

**3. Logica na sessao de estudo -- `src/pages/Study.tsx`**

A mesma logica de burying por estado tambem se aplica quando um cartao e respondido durante a sessao (remocao de irmaos em tempo real). Atualizar para respeitar as 3 flags.

**4. Tela de configuracoes -- `src/pages/DeckSettings.tsx`**

Substituir o toggle unico "Ocultar irmaos" por 3 toggles separados:
- Ocultar novos irmaos ate o dia seguinte
- Ocultar irmaos de revisao ate o dia seguinte
- Ocultar irmaos em aprendizado ate o dia seguinte

**5. Contadores do deck-detail -- `src/components/deck-detail/DeckDetailContext.tsx`**

Garantir que os contadores exibidos no card superior reflitam a fila efetiva (com burying aplicado por estado), para que o numero de "novos" mostrado bata com o que realmente aparece na sessao.

### Arquivos alterados
- Nova migracao SQL em `supabase/migrations/`
- `src/integrations/supabase/types.ts` (tipos gerados -- atualizados apos migracao)
- `src/services/studyService.ts` (logica de burying por estado)
- `src/pages/Study.tsx` (burying em tempo real por estado)
- `src/pages/DeckSettings.tsx` (UI dos 3 toggles)
- `src/components/deck-detail/DeckDetailContext.tsx` (contadores alinhados)

### Compatibilidade
- Baralhos existentes manterao o mesmo comportamento (todos os 3 campos herdam o valor atual de `bury_siblings`)
- O campo antigo `bury_siblings` fica como fallback ate ser removido numa limpeza futura
