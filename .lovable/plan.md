
## Remover cor azul de fundo do PWA

O problema e que o `theme-color` (#2563eb - azul) define a cor da barra de status e area ao redor do app no modo PWA. Precisa ser alterado para combinar com o fundo claro/escuro do app.

### Alteracoes necessarias

**1. `index.html` (linha 11)**
- Trocar `<meta name="theme-color" content="#2563eb" />` para `#faf9f7` (cor de fundo do tema claro, correspondente a `--background: 40 20% 98%`)

**2. `vite.config.ts` (linha 37)**
- Trocar `theme_color: "#2563eb"` para `"#faf9f7"` no manifest do PWA
- Trocar `background_color: "#ffffff"` para `"#faf9f7"` para consistencia

**3. `src/hooks/useTheme.ts`**
- Adicionar logica para atualizar dinamicamente o `<meta name="theme-color">` quando o usuario trocar entre modo claro (`#faf9f7`) e escuro (`#141519`, correspondente a `--background: 220 25% 8%`), garantindo que a barra do PWA acompanhe o tema ativo.

### Resultado
- Modo claro: fundo e barra do PWA em tom claro (#faf9f7)
- Modo escuro: fundo e barra do PWA em tom escuro (#141519)
- Sem mais azul aparecendo atras do conteudo
