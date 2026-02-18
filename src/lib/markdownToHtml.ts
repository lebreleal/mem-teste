/**
 * Convert inline markdown formatting to HTML.
 * Handles **bold**, *italic*, __underline__, ~~strikethrough~~, `code`.
 * Works on both plain text and mixed HTML+markdown content.
 */
export function markdownToHtml(text: string): string {
  if (!text) return text;
  // Don't skip HTML content — AI responses may mix HTML tags with markdown
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<u>$1</u>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/~~(.+?)~~/g, '<s>$1</s>')
    .replace(/`(.+?)`/g, '<code>$1</code>');
}
