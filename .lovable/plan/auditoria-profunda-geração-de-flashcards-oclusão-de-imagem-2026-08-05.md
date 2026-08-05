# Auditoria profunda: geração de flashcards + oclusão de imagem

Auditoria feita lendo o código atual: `supabase/functions/generate-deck/index.ts`, `src/components/ai-deck/useAIDeckFlow.ts`, `src/lib/pdfUtils.ts`, `src/components/manage-deck/OcclusionEditor.tsx`, `src/components/manage-deck/CardEditorDialog.tsx`, `src/components/deck-detail/DeckDetailHandlers.ts`, `src/pages/ManageDeck.tsx`, `src/services/card/cardQueries.ts`, `src/lib/occlusionColors.ts`.

## O que está realmente quebrado

### 1. O prompt que o admin edita não é usado no modelo padrão
`generate-deck` tem três caminhos de system prompt. Quando o modelo contém `flash-lite` (o econômico, que é o padrão), ele usa o `FLASH_SYSTEM_PROMPT` **hardcoded** e ignora por completo `ai_prompts.generate_deck`. Ou seja: tudo que foi afinado na tabela só vale para Pro/Flash. Além disso há um terceiro desvio silencioso: se `customInstructions` contiver "prova", "exame" ou "questões", o system prompt vira uma frase genérica de duas linhas e todas as regras pedagógicas somem.

### 2. Oclusão: a quantidade de cards depende da COR, e ninguém avisa isso
O modelo de dados é: **1 card por cor distinta**, não por forma. 8 retângulos azuis = 1 card. Os mesmos 8 retângulos com 8 cores = 8 cards. Isso é uma decisão de produto válida (agrupar o que deve ser lembrado junto), mas hoje é invisível na interface — o usuário pinta cores por estética e a contagem de cards muda.

### 3. Colisão de numeração entre cor da imagem e cloze de texto
Em `DeckDetailHandlers.ts` o número do card vem de `OCCLUSION_COLORS.findIndex(cor) + 1`, e os `{{c1::}}` do texto usam o mesmo espaço numérico. Resultado: uma forma **Azul** (índice 0 → número 1) e um `{{c1::}}` no texto viram **o mesmo card** — a forma azul e a lacuna de texto ficam presas juntas mesmo sem relação nenhuma. Isso explica cards de oclusão "a menos" ou revelando coisa errada.

### 4. Cor fora da paleta some do agrupamento
`findIndex` que não acha a cor retorna -1 e o número é simplesmente descartado. Formas com cor legada/alterada deixam de gerar card, sem erro visível. A paleta também tem 12 cores fixas, então há um teto silencioso de 12 cards por imagem.

### 5. Irmãos identificados por igualdade exata de `front_content`
`fetchClozeSiblings` casa cards por string idêntica de `front_content`. Dois cards de cloze com o mesmo texto (comum quando a IA repete uma frase entre lotes) são tratados como irmãos do mesmo grupo; editar um reconcilia/apaga o outro. Não existe uma coluna de grupo — a identidade é acidental.

### 6. Geração por lotes sem visão global
Lotes de 3 páginas rodam 3 em paralelo. Cada lote não sabe o que os outros geraram, e a única defesa contra repetição é um dedup por similaridade de palavras com limiar **0.9** — alto demais: paráfrase ("Qual a função do diafragma" vs "Que papel o diafragma exerce") passa direto. O dedup também é O(n²).

### 7. PDF sem texto = lixo silencioso
`extractPDFPages` só extrai texto. Página escaneada, slide de imagem ou diagrama volta com texto vazio ou 20 caracteres soltos, e o lote é enviado assim mesmo — a IA inventa ou devolve quase nada. Não há aviso nem descarte, e a página é cobrada em créditos igual.

### 8. Nenhuma validação de qualidade depois da geração
As "20 regras" só existem como texto no prompt. Não há verificação nenhuma de: resposta com mais de 15 palavras, resposta em lista, cloze em palavra trivial, cloze com resposta ambígua, frases do tipo "segundo o texto". O filtro atual só descarta card sem front/back.

### 9. `max_tokens: 65000` fixo
Enviado para qualquer modelo do catálogo, independentemente do teto real de saída dele. Modelos com cap menor rejeitam a requisição com 400 (e o lote falha inteiro).

## Plano de correção

### Etapa 1 — Consertar a oclusão (é onde o dano é maior)
- Separar os espaços de numeração: cores da imagem passam a ocupar uma faixa própria (ex.: 101+) e o texto mantém `{{c1..}}`, acabando com a colisão azul/c1.
- Cor desconhecida deixa de ser descartada: mapa dinâmico cor→número, sem depender de `findIndex` na paleta fixa. Isso também remove o teto de 12.
- Unificar a construção do payload de oclusão, hoje duplicada em três lugares (`OcclusionEditor`, `CardEditorDialog`, `DeckDetailHandlers`, `ManageDeck`) com regras ligeiramente diferentes, num único helper `src/lib/occlusion.ts`.
- Mostrar na UI do editor, em tempo real: "isto vai gerar N cartões (1 por cor)", com os grupos listados. Fim da surpresa.

### Etapa 2 — Unificar o prompt
- `flash-lite` passa a usar o prompt do banco também (com uma versão compacta como fallback, não como substituição).
- Remover o desvio por regex "prova|exame|questões" — instrução do usuário entra como instrução, não troca o system prompt inteiro.
- Reduzir o conflito entre "cobertura 100%" e "não invente": no nível abrangente, o texto passa a priorizar cobertura **do que existe**, com permissão explícita de gerar menos.

### Etapa 3 — Qualidade pós-geração (validador determinístico)
Novo módulo compartilhado usado pela edge function, que para cada card verifica e corrige/descarta:
- resposta acima de ~25 palavras ou contendo lista (`;`, `1.`, `- `) → marcado como suspeito;
- referência à fonte ("segundo o texto", "de acordo com", "conforme") → descartado;
- cloze cuja lacuna é palavra trivial ou tem menos de 3 caracteres → descartado;
- cloze em formato de pergunta (contém "?" antes da lacuna) → descartado;
- front duplicado exato dentro do mesmo lote → descartado.
Contagem de descartes volta na resposta e aparece no aviso de geração parcial.

### Etapa 4 — Lotes e dedup
- Dedup com limiar mais realista (0.75) e por bag-of-words com pesos, ignorando stopwords em português; passa a rodar também **entre** lotes com índice incremental em vez do O(n²) atual.
- Cada lote recebe uma lista curta de "títulos já cobertos" pelos lotes anteriores concluídos, para reduzir sobreposição.

### Etapa 5 — Páginas sem texto
- Páginas com menos de ~120 caracteres úteis são marcadas na tela de seleção como "sem texto extraível", desmarcadas por padrão e não cobradas.
- Aviso claro quando o PDF inteiro é imagem: "este PDF parece digitalizado; a extração de texto falhou".

### Etapa 6 — `max_tokens` por modelo
- Passa a vir do `ai_model_catalog` (campo de teto de saída, com fallback conservador), em vez do valor fixo.

## Detalhes técnicos
- Arquivos: `supabase/functions/generate-deck/index.ts`, novo `supabase/functions/_shared/cardQuality.ts`, novo `src/lib/occlusion.ts`, `src/components/manage-deck/OcclusionEditor.tsx`, `src/components/manage-deck/CardEditorDialog.tsx`, `src/components/deck-detail/DeckDetailHandlers.ts`, `src/pages/ManageDeck.tsx`, `src/components/ai-deck/useAIDeckFlow.ts`, `src/components/ai-deck/PageSelectionStep.tsx`, `src/lib/pdfUtils.ts`.
- Migração pequena: coluna de teto de saída em `ai_model_catalog`.
- Cards de oclusão já existentes continuam funcionando: a leitura aceita tanto a numeração antiga quanto a nova.
- Sem mudanças no FSRS, no schema de `cards` nem na tela de estudo.

## Fora deste plano (proponho depois)
- Visão/OCR para páginas digitalizadas (exige re-render em alta escala e muda custo por página).
- Coluna real de `sibling_group_id` em `cards` para substituir o casamento por `front_content` — é a correção definitiva do item 5, mas exige migração com backfill.
