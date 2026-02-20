

# Implementar Google Cloud TTS

## 1. Adicionar Secret
- Salvar `GOOGLE_CLOUD_TTS_KEY` com o valor fornecido como secret no Supabase

## 2. Reescrever Edge Function `supabase/functions/tts/index.ts`
- Substituir chamada OpenAI pela API REST do Google Cloud TTS
- Endpoint: `https://texttospeech.googleapis.com/v1/text:synthesize?key=API_KEY`
- Deteccao automatica de idioma (PT-BR vs EN-US) por heuristica simples
- Vozes: `pt-BR-Neural2-A` (portugues) e `en-US-Neural2-J` (ingles)
- Decodificar base64 do response do Google para retornar audio/mpeg binario
- Manter logging de uso existente, atualizando modelo para `google-tts-neural2`

## 3. Frontend
- Nenhuma alteracao necessaria -- `TtsButton.tsx` ja envia texto e recebe audio/mpeg

## Detalhes Tecnicos

### Heuristica de idioma
Verifica presenca de caracteres/palavras tipicas do portugues (ç, ã, õ, é, "que", "como", "para"). Se encontrar, usa voz PT-BR; caso contrario, usa EN-US.

### Fluxo da edge function
```text
1. Recebe { text, voice? } do frontend
2. Detecta idioma do texto
3. POST para Google Cloud TTS com voz adequada
4. Recebe { audioContent: "base64..." }
5. Decodifica base64 para bytes
6. Retorna Response com Content-Type: audio/mpeg
```

### Economia estimada
- De $15/1M caracteres (OpenAI) para $4/1M caracteres (Google Neural2)
- ~3.7x mais barato com pronuncia PT-BR nativa superior

