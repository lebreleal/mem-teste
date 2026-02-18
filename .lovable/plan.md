

# Configurar PWA com Icones para Desktop, iOS e Android

## O que sera feito

Transformar o app MemoCards em um PWA (Progressive Web App) instalavel em qualquer dispositivo - desktop, iPhone e Android - usando o logo do elefante azul que ja existe no projeto.

## Mudancas

### 1. Instalar `vite-plugin-pwa`

Adicionar o plugin que gera automaticamente o service worker, manifest.json e icones.

### 2. Gerar icones PWA a partir do logo existente

Criar versoes do logo (`src/assets/logo.png`) nos tamanhos necessarios e colocar em `public/`:

- `pwa-192x192.png` - Android e geral
- `pwa-512x512.png` - Android splash e geral
- `apple-touch-icon-180x180.png` - iOS (obrigatorio para "Add to Home Screen")
- `maskable-icon-512x512.png` - Android adaptive icon (com padding)
- `favicon.svg` - Favicon vetorial moderno

Como o Lovable nao tem ferramentas de redimensionamento de imagem, os icones serao criados como copias do logo original e o manifest referenciara eles nos tamanhos corretos. O navegador faz o resize automaticamente.

### 3. Configurar `vite-plugin-pwa` no `vite.config.ts`

Adicionar o plugin com:
- Nome do app: "MemoCards"
- Cores do tema: azul (#2563eb) matching o logo
- Display: "standalone" (parece app nativo)
- Registro automatico do service worker
- Lista de icones para cada plataforma
- `navigateFallbackDenylist: [/^\/~oauth/]` para nao cachear OAuth

### 4. Atualizar `index.html`

Adicionar meta tags para PWA:
- `<meta name="theme-color">` - cor da barra de status
- `<link rel="apple-touch-icon">` - icone iOS
- `<meta name="apple-mobile-web-app-capable">` - fullscreen no iOS
- `<meta name="apple-mobile-web-app-status-bar-style">` - estilo da barra iOS

### 5. Criar pagina `/install` (opcional mas util)

Uma pagina simples que instrui o usuario a instalar o app e dispara o prompt de instalacao nativo do navegador (`beforeinstallprompt`).

## Resultado final

- No **Android**: o usuario vera "Adicionar a tela inicial" automaticamente no Chrome
- No **iOS**: o usuario pode usar "Compartilhar > Adicionar a Tela de Inicio" no Safari
- No **Desktop**: o usuario vera o icone de instalar na barra de endereco do Chrome/Edge
- O app funciona **offline** com cache automatico dos assets
- O icone do elefante azul aparece em todos os dispositivos

## Arquivos modificados/criados

| Arquivo | Acao |
|---------|------|
| `package.json` | Adicionar `vite-plugin-pwa` |
| `vite.config.ts` | Configurar plugin PWA |
| `index.html` | Meta tags para iOS e PWA |
| `public/pwa-192x192.png` | Icone 192x192 (copia do logo) |
| `public/pwa-512x512.png` | Icone 512x512 (copia do logo) |
| `public/apple-touch-icon-180x180.png` | Icone iOS |
| `public/maskable-icon-512x512.png` | Icone adaptativo Android |
| `src/pages/Install.tsx` | Pagina de instalacao |
| `src/App.tsx` | Adicionar rota `/install` |

