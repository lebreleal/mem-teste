

## Plano: Enterrar Card + Remover Anexos

### 1. Enterrar Card (Bury) na sessao de estudo

**O que e "Enterrar"?**
No Anki, enterrar um card significa pula-lo por hoje -- ele desaparece da sessao atual e volta no dia seguinte. E diferente de congelar (que remove permanentemente).

**Quando aparece?**
O botao de enterrar deve aparecer **tanto na frente quanto no verso** do card. O usuario pode querer pular o card antes mesmo de ver a resposta (ex: "nao quero estudar isso agora") ou depois de ver (ex: "ja sei, nao preciso revisar hoje"). No Anki, o bury esta disponivel em ambos os lados.

**Onde fica?**
Substituira o icone de "Notas pessoais" (`StickyNote`) no componente `StudyCardActions`. O icone sera uma pa (Shovel -- usaremos `Pickaxe` do Lucide ou similar). As notas pessoais continuam acessiveis, mas dentro do dropdown de editar (junto com congelar e editar).

**Comportamento:**
- Ao clicar no icone da pa, abre um AlertDialog explicando: "Enterrar este card? Ele sera removido da sessao de hoje e voltara amanha."
- Ao confirmar, o card recebe `scheduled_date = inicio do dia seguinte` sem alterar `state`, `stability` ou `difficulty`
- O card e removido da fila local (`localQueue`)
- Irmao cloze tambem sao enterrados (mesmo comportamento do Anki)

**Arquivos editados:**
- `src/components/StudyCardActions.tsx` -- adicionar botao de enterrar (icone de pa) e AlertDialog explicativo; mover "Notas pessoais" para dentro do dropdown
- `src/pages/Study.tsx` -- adicionar callback `onCardBuried` que remove o card (e irmaos cloze) da `localQueue`
- `src/components/FlashCard.tsx` -- garantir que o botao de enterrar apareca tanto na frente quanto no verso (as actions ja sao renderizadas em ambos)

### 2. Remover anexos dentro do deck (PublicDeckPreview)

Atualmente o dono pode adicionar anexos, mas nao pode remove-los. Adicionaremos um botao de lixeira em cada arquivo quando `isOwner` for true.

**Comportamento:**
- Icone de lixeira aparece ao lado do icone de download para o dono
- Ao clicar, confirma com toast ou AlertDialog simples
- Remove o registro de `turma_lesson_files` e invalida a query

**Arquivo editado:**
- `src/pages/PublicDeckPreview.tsx` -- adicionar botao de remocao de arquivo na lista de anexos, com mutacao de delete

### Detalhes tecnicos

**Bury -- logica de banco:**
```sql
-- Agendar para o inicio do dia seguinte (meia-noite UTC+0 do proximo dia)
UPDATE cards 
SET scheduled_date = (CURRENT_DATE + INTERVAL '1 day')::timestamptz
WHERE id = :cardId;
```

**Bury -- sibling burying:**
Reutilizar a funcao `getSiblingIds` ja existente em `Study.tsx` para encontrar irmaos cloze e remove-los da fila local tambem.

**Novo callback em StudyCardActions:**
```typescript
interface StudyCardActionsProps {
  // ... existing props
  onCardBuried: () => void;  // novo
}
```

**Remocao de arquivo:**
```typescript
const handleDeleteFile = async (fileId: string) => {
  await supabase.from('turma_lesson_files').delete().eq('id', fileId);
  queryClient.invalidateQueries({ queryKey: ['turma-deck-files'] });
  toast({ title: 'Arquivo removido' });
};
```

