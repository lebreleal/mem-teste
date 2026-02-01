// Asset path resolver - maps gallery image paths to proper imports
// This handles both local assets (src/assets/) and remote URLs (http/https)

import ledbrasOutdoor from '../assets/ledbras_outdoor.png';
import ledbrasRental from '../assets/ledbras_rental.png';
import painelPortaAberta from '../assets/painel led porta aberta.jpg';
import casePainelLed from '../assets/case painel led.jpg';
import projetoPainel1 from '../assets/projeto painel led 1.jpg';
import projetoPainel2 from '../assets/projeto painel LED 2.jpg';
import projetoPainel1_2 from '../assets/projeto painel led 1.2.jpg';
import container from '../assets/conteiner.png';
import fabricaPainel from '../assets/imagem fabrica paine led.jpg';
import painelOutdoor from '../assets/painel led outdoor.jpg';
import painelAluguel from '../assets/painel led aluguel.jpg';
import embalagemPainel from '../assets/embalagem 2 painel led case.jpg';

// Map of local asset paths to their imported versions
const localAssetMap: Record<string, string> = {
  '/src/assets/ledbras_outdoor.png': ledbrasOutdoor,
  '/src/assets/ledbras_rental.png': ledbrasRental,
  '/src/assets/painel led porta aberta.jpg': painelPortaAberta,
  '/src/assets/case painel led.jpg': casePainelLed,
  '/src/assets/projeto painel led 1.jpg': projetoPainel1,
  '/src/assets/projeto painel LED 2.jpg': projetoPainel2,
  '/src/assets/projeto painel led 1.2.jpg': projetoPainel1_2,
  '/src/assets/conteiner.png': container,
  '/src/assets/imagem fabrica paine led.jpg': fabricaPainel,
  '/src/assets/painel led outdoor.jpg': painelOutdoor,
  '/src/assets/painel led aluguel.jpg': painelAluguel,
  '/src/assets/embalagem 2 painel led case.jpg': embalagemPainel,
};

/**
 * Resolves an image URL from the database to a usable URL
 * - Local assets (starting with /src/assets/) are resolved to their webpack imports
 * - Remote URLs (http/https) are returned as-is
 */
export function resolveImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  
  // If it's a remote URL, return as-is
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  
  // If it's a local asset path, resolve it
  if (url.startsWith('/src/assets/')) {
    return localAssetMap[url] || null;
  }
  
  // For other paths, return as-is (might be a public folder path)
  return url;
}

/**
 * Check if a URL is a local asset
 */
export function isLocalAsset(url: string | null | undefined): boolean {
  if (!url) return false;
  return url.startsWith('/src/assets/');
}
