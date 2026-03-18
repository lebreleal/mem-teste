/**
 * Shared color system for both image occlusion and text cloze.
 * Same base colors, different opacities for each use case.
 */

/** Base color definitions (RGB values) */
const BASE_COLORS = [
  { r: 59, g: 130, b: 246, label: 'Azul' },
  { r: 239, g: 68, b: 68, label: 'Vermelho' },
  { r: 34, g: 197, b: 94, label: 'Verde' },
  { r: 234, g: 179, b: 8, label: 'Amarelo' },
  { r: 168, g: 85, b: 247, label: 'Roxo' },
  { r: 249, g: 115, b: 22, label: 'Laranja' },
  { r: 20, g: 184, b: 166, label: 'Teal' },
  { r: 236, g: 72, b: 153, label: 'Rosa' },
  { r: 0, g: 0, b: 0, label: 'Preto' },
  { r: 107, g: 114, b: 128, label: 'Cinza' },
  { r: 6, g: 182, b: 212, label: 'Ciano' },
  { r: 132, g: 204, b: 22, label: 'Lima' },
];

/** High-opacity colors for image occlusion (canvas shapes) */
export interface OcclusionColor {
  fill: string;
  border: string;
  label: string;
}

export const OCCLUSION_COLORS: OcclusionColor[] = BASE_COLORS.map(c => ({
  fill: `rgba(${c.r},${c.g},${c.b},${c.label === 'Azul' ? '0.6' : '0.55'})`,
  border: `rgba(${c.r},${c.g},${c.b},0.9)`,
  label: c.label,
}));

/** Low-opacity colors for text cloze (inline marks) */
export interface ClozeColor {
  bg: string;
  border: string;
  text: string;
  dot: string;  // solid color for the palette dot
  label: string;
}

export const CLOZE_COLORS: ClozeColor[] = BASE_COLORS.map(c => ({
  bg: `rgba(${c.r},${c.g},${c.b},0.15)`,
  border: `rgba(${c.r},${c.g},${c.b},0.5)`,
  text: `rgba(${c.r},${c.g},${c.b},1)`,
  dot: `rgb(${c.r},${c.g},${c.b})`,
  label: c.label,
}));

/**
 * Get visible colors for dynamic palette: used colors + next available.
 * Returns indices into the color arrays.
 */
export function getVisibleColorIndices(usedIndices: Set<number>, totalColors: number = BASE_COLORS.length): number[] {
  const visible: number[] = [];
  // Add all used colors (in order)
  for (let i = 0; i < totalColors; i++) {
    if (usedIndices.has(i)) visible.push(i);
  }
  // Add next unused color
  for (let i = 0; i < totalColors; i++) {
    if (!usedIndices.has(i)) {
      visible.push(i);
      break;
    }
  }
  // Ensure at least 2
  if (visible.length < 2) {
    for (let i = 0; i < totalColors; i++) {
      if (!visible.includes(i)) { visible.push(i); break; }
    }
  }
  return visible;
}
