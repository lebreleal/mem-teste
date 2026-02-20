

# Configurar Vozes TTS no Painel Admin

## O que sera feito

Adicionar uma nova secao "Configurar Voz" no painel Admin IA onde voce podera:
- Escolher a voz PT-BR (entre varias opcoes Neural2 do Google)
- Escolher a voz EN-US (entre varias opcoes Neural2 do Google)
- Ouvir uma preview de cada voz com um botao de teste
- Salvar a escolha no banco (tabela `ai_settings`)
- A edge function `tts` vai ler a voz configurada do banco

Todas as vozes Neural2 tem o mesmo custo, entao nao muda nada no preco.

---

## Detalhes Tecnicos

### 1. Vozes disponiveis (Neural2, mesmo custo)

**PT-BR:**
- `pt-BR-Neural2-A` (Feminina)
- `pt-BR-Neural2-B` (Masculina)
- `pt-BR-Neural2-C` (Feminina)

**EN-US:**
- `en-US-Neural2-A` (Masculina)
- `en-US-Neural2-C` (Feminina)
- `en-US-Neural2-D` (Masculina)
- `en-US-Neural2-E` (Feminina)
- `en-US-Neural2-F` (Feminina)
- `en-US-Neural2-G` (Feminina)
- `en-US-Neural2-H` (Feminina)
- `en-US-Neural2-I` (Masculina)
- `en-US-Neural2-J` (Masculina)

### 2. Banco de dados (`ai_settings`)
Usar duas novas chaves na tabela `ai_settings` existente (sem migracao necessaria, so insert):
- `tts_voice_pt` -> ex: `pt-BR-Neural2-B`
- `tts_voice_en` -> ex: `en-US-Neural2-J`

### 3. Admin IA (`src/pages/AdminIA.tsx`)
Adicionar um novo card "Configurar Voz" na tela principal do Admin IA que abre uma secao com:
- Select para voz PT-BR com as 3 opcoes
- Select para voz EN-US com as 9 opcoes
- Botao "Testar" ao lado de cada select que chama a edge function TTS com um texto curto de exemplo e toca o audio
- Botao "Salvar Vozes"

### 4. Edge function TTS (`supabase/functions/tts/index.ts`)
Modificar para:
- Ler as configuracoes `tts_voice_pt` e `tts_voice_en` do banco usando service role
- Usar a voz configurada ao inves das hardcoded
- Se nao houver configuracao, manter os defaults atuais (`pt-BR-Neural2-A` e `en-US-Neural2-J`)

### 5. Fluxo
1. Admin abre Admin IA -> clica em "Configurar Voz"
2. Seleciona uma voz PT-BR e uma EN-US
3. Clica "Testar" para ouvir preview
4. Clica "Salvar" para gravar no `ai_settings`
5. Proximas chamadas TTS usam a voz escolhida

