import JSZip from "jszip";

/**
 * Extract text from PPTX files (OpenXML Presentation).
 * PPTX is a ZIP containing slide XMLs in ppt/slides/slide*.xml
 */
export async function extractPptxText(file: File): Promise<string> {
  const zip = await JSZip.loadAsync(file);
  const slideFiles: string[] = [];

  zip.forEach((path) => {
    if (/^ppt\/slides\/slide\d+\.xml$/i.test(path)) {
      slideFiles.push(path);
    }
  });

  // Sort slides by number
  slideFiles.sort((a, b) => {
    const numA = parseInt(a.match(/slide(\d+)/)?.[1] || "0");
    const numB = parseInt(b.match(/slide(\d+)/)?.[1] || "0");
    return numA - numB;
  });

  const texts: string[] = [];

  for (const slidePath of slideFiles) {
    const xml = await zip.file(slidePath)!.async("text");
    // Extract text from <a:t> tags (PowerPoint text runs)
    const matches = xml.match(/<a:t[^>]*>([^<]*)<\/a:t>/g);
    if (matches) {
      const slideText = matches
        .map((m) => m.replace(/<[^>]+>/g, ""))
        .join(" ")
        .trim();
      if (slideText) texts.push(slideText);
    }
  }

  return texts.join("\n\n");
}

/**
 * Extract text from DOCX files (OpenXML Word Document).
 * DOCX is a ZIP containing word/document.xml
 */
export async function extractDocxText(file: File): Promise<string> {
  const zip = await JSZip.loadAsync(file);
  const docFile = zip.file("word/document.xml");

  if (!docFile) {
    throw new Error("Arquivo DOCX inválido: document.xml não encontrado");
  }

  const xml = await docFile.async("text");

  // Extract text from <w:t> tags (Word text runs)
  const matches = xml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g);
  if (!matches) return "";

  // Group by paragraphs: detect </w:p> boundaries
  const paragraphs: string[] = [];
  let currentParagraph = "";

  // Split XML by paragraph tags for better structure
  const paraBlocks = xml.split(/<\/w:p>/);
  for (const block of paraBlocks) {
    const textMatches = block.match(/<w:t[^>]*>([^<]*)<\/w:t>/g);
    if (textMatches) {
      const paraText = textMatches
        .map((m) => m.replace(/<[^>]+>/g, ""))
        .join("");
      if (paraText.trim()) paragraphs.push(paraText.trim());
    }
  }

  return paragraphs.join("\n");
}

/**
 * Detect file type and extract text accordingly.
 */
export async function extractDocumentText(file: File): Promise<string> {
  const name = file.name.toLowerCase();

  if (name.endsWith(".pptx") || file.type.includes("presentationml")) {
    return extractPptxText(file);
  }

  if (name.endsWith(".docx") || file.type.includes("wordprocessingml")) {
    return extractDocxText(file);
  }

  // Legacy .ppt/.doc - can't parse, suggest conversion
  if (name.endsWith(".ppt") || name.endsWith(".doc")) {
    throw new Error("Formato antigo (.ppt/.doc) não suportado. Salve como .pptx/.docx.");
  }

  // Fallback: try as text
  return file.text();
}
