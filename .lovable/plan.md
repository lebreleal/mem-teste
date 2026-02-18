
# Organizacao Hierarquica Inteligente na Importacao

## Problema Atual

Quando a IA organiza 400+ cartoes, pode criar um subdeck com 200 cartoes porque o tema e amplo. Isso acontece porque:
- O prompt atual so permite uma camada de subdecks (flat)
- Nao ha limite maximo por subdeck
- Nao ha instrucao para subdividir temas grandes

## Solucao

Implementar organizacao em ate 2 niveis de hierarquia, seguindo boas praticas do Anki:
- Cada subdeck deve ter idealmente entre 10-50 cartoes
- Se um tema tiver mais de 60 cartoes, ele deve virar um **deck independente com seus proprios subdecks**
- A IA decide a estrutura: subdecks simples OU decks separados com filhos

## Mudancas

### 1. Edge Function `organize-import` - Novo prompt hierarquico

Alterar o prompt e o schema da tool call para suportar estrutura hierarquica:

```text
Estrutura de retorno:
- decks[] (array de decks de nivel superior)
  - name: nome do deck
  - card_indices: cartoes diretamente neste deck (pode ser vazio se tiver subdecks)
  - children[]: subdecks opcionais
    - name: nome do subdeck
    - card_indices: cartoes do subdeck
```

Regras no prompt:
- Cada grupo final (folha) deve ter entre 10 e 50 cartoes
- Se um tema tiver mais de 60 cartoes, criar subdecks dentro dele
- Se houver poucos temas (menos de 3), pode retornar um unico deck pai com subdecks
- Se houver muitos temas distintos, criar decks separados no nivel superior

### 2. Pos-processamento na edge function

Apos receber a resposta da IA, validar:
- Se algum grupo folha tiver mais de 80 cartoes, logar aviso
- Garantir que todos os indices estao atribuidos
- Remover grupos vazios

### 3. Frontend - `ImportCardsDialog.tsx`

Atualizar o `SubdeckPreview` para mostrar a hierarquia de 2 niveis:
- Decks de nivel superior com icone de pasta
- Subdecks identados abaixo de cada deck pai
- Contagem de cartoes em cada nivel

### 4. Interface `SubdeckOrganization`

Estender para suportar filhos:

```typescript
export interface SubdeckOrganization {
  name: string;
  card_indices: number[];
  children?: SubdeckOrganization[];
}
```

### 5. `deckService.ts` - `importDeckWithSubdecks`

Atualizar para suportar a criacao hierarquica:
- Se a resposta tiver apenas 1 deck no nivel superior: criar como deck pai com subdecks (comportamento atual)
- Se tiver multiplos decks no nivel superior: criar cada um como deck independente, com seus subdecks como filhos
- Suporte a 2 niveis de `parent_deck_id`

### 6. `Dashboard.tsx`

Atualizar o handler de import para lidar com a nova estrutura:
- Se `subdecks` tiver filhos (`children`), chamar a versao atualizada que cria a arvore completa
- Mensagem de sucesso mostrando quantos decks e subdecks foram criados

## Arquivos Afetados

| Acao | Arquivo |
|------|---------|
| Editar | `supabase/functions/organize-import/index.ts` - prompt + schema hierarquico |
| Editar | `src/components/ImportCardsDialog.tsx` - preview hierarquico + tipo atualizado |
| Editar | `src/services/deckService.ts` - importacao hierarquica |
| Editar | `src/pages/Dashboard.tsx` - handler atualizado |

## Exemplo Pratico

Importacao de 400 cartoes de Ginecologia:

**Antes (problema):**
```
Ginecologia (deck pai)
  ├── Leiomioma (15 cartoes)
  ├── Amenorreia (12 cartoes)
  ├── Obstetrica (200 cartoes)  <-- problema!
  └── PCOS (18 cartoes)
```

**Depois (solucao):**
```
Ginecologia (deck pai)
  ├── Leiomioma (15 cartoes)
  ├── Amenorreia (12 cartoes)
  └── PCOS (18 cartoes)

Obstetrica (deck separado)
  ├── Pre-natal (35 cartoes)
  ├── Parto Normal (42 cartoes)
  ├── Cesarea (38 cartoes)
  ├── Complicacoes (45 cartoes)
  └── Puerpero (40 cartoes)
```
