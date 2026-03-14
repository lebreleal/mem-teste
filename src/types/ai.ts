/**
 * Domain types for AI-related features (deck generation, exam generation).
 */

export interface GeneratedCard {
  front: string;
  back: string;
  type: 'basic' | 'cloze';
  options?: string[];
  correctIndex?: number;
}

export interface PageItem {
  pageNumber: number;
  thumbnailUrl?: string;
  textContent: string;
  selected: boolean;
}

export type DetailLevel = 'essential' | 'standard' | 'comprehensive';
export type CardFormat = 'cloze' | 'qa';

export const DETAIL_OPTIONS: { value: DetailLevel; label: string; desc: string }[] = [
  { value: 'essential', label: 'Essencial', desc: 'Conceitos básicos para revisão rápida' },
  { value: 'standard', label: 'Padrão', desc: 'Bom equilíbrio de informações-chave' },
  { value: 'comprehensive', label: 'Abrangente', desc: 'Cobertura mais detalhada' },
];

export const FORMAT_OPTIONS: { value: CardFormat; label: string }[] = [
  { value: 'qa', label: 'Pergunta / resposta' },
  { value: 'cloze', label: 'Preencha o espaço' },
];

export const CREDITS_PER_PAGE = 2;

export const ACCEPTED_FILE_TYPES = 'application/pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,text/csv';
