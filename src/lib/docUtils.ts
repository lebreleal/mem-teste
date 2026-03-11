import JSZip from "jszip";

/**
 * Extract text from PPTX files (OpenXML Presentation).
 * PPTX is a ZIP containing slide XMLs in ppt/slides/slide*.xml
 * Uses multiple extraction strategies for robustness.
 */
export async function extractPptxText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);
  const slideFiles: string[] = [];

  zip.forEach((path) => {
    if (/^ppt\/slides\/slide\d+\.xml$/i.test(path)) {
      slideFiles.push(path);
    }
  });

  if (slideFiles.length === 0) {
    throw new Error("Arquivo PPTX inválido: nenhum slide encontrado");
  }

  // Sort slides by number
  slideFiles.sort((a, b) => {
    const numA = parseInt(a.match(/slide(\d+)/)?.[1] || "0");
    const numB = parseInt(b.match(/slide(\d+)/)?.[1] || "0");
    return numA - numB;
  });

  const texts: string[] = [];

  for (const slidePath of slideFiles) {
    const zipFile = zip.file(slidePath);
    if (!zipFile) continue;
    const xml = await zipFile.async("text");

    // Strategy 1: Extract from <a:t> tags (standard PowerPoint text runs)
    const aMatches = xml.match(/<a:t[^>]*>[^<]*<\/a:t>/g);
    // Strategy 2: Also try <a:fld> fields and <a:r> runs more broadly
    // Strategy 3: Extract any text between XML tags that looks like content
    
    const slideTexts: string[] = [];
    
    if (aMatches && aMatches.length > 0) {
      // Group text by paragraph (<a:p>) boundaries
      const paragraphs = xml.split(/<\/a:p>/);
      for (const para of paragraphs) {
        const textMatches = para.match(/<a:t[^>]*>([^<]*)<\/a:t>/g);
        if (textMatches) {
          const paraText = textMatches
            .map((m) => m.replace(/<[^>]+>/g, ""))
            .join("");
          if (paraText.trim()) slideTexts.push(paraText.trim());
        }
      }
    }
    
    // Fallback: if <a:t> extraction yielded nothing, try broader text extraction
    if (slideTexts.length === 0) {
      // Try extracting text content between any closing/opening tags
      const fallbackMatches = xml.match(/>([^<]{2,})</g);
      if (fallbackMatches) {
        const fallbackText = fallbackMatches
          .map((m) => m.slice(1, -1).trim())
          .filter((t) => t.length > 1 && !/^[\d.]+$/.test(t) && !t.startsWith("rId"))
          .join(" ");
        if (fallbackText.trim()) slideTexts.push(fallbackText.trim());
      }
    }

    if (slideTexts.length > 0) {
      texts.push(slideTexts.join("\n"));
    }
  }

  if (texts.length === 0) {
    throw new Error("Nenhum texto encontrado nos slides. O arquivo pode conter apenas imagens.");
  }

  return texts.join("\n\n");
}

/**
 * Extract text from DOCX files (OpenXML Word Document).
 * DOCX is a ZIP containing word/document.xml
 */
export async function extractDocxText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);
  const docFile = zip.file("word/document.xml");

  if (!docFile) {
    throw new Error("Arquivo DOCX inválido: document.xml não encontrado");
  }

  const xml = await docFile.async("text");

  // Split XML by paragraph tags for better structure
  const paragraphs: string[] = [];
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

  if (paragraphs.length === 0) {
    throw new Error("Nenhum texto encontrado no documento.");
  }

  return paragraphs.join("\n");
}

/**
 * Detect file type and extract text accordingly.
 */
export async function extractDocumentText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  const type = file.type || "";

  if (name.endsWith(".pptx") || type.includes("presentationml") || type.includes("powerpoint")) {
    return extractPptxText(file);
  }

  if (name.endsWith(".docx") || type.includes("wordprocessingml") || type.includes("msword")) {
    return extractDocxText(file);
  }

  // Legacy .ppt/.doc - can't parse, suggest conversion
  if (name.endsWith(".ppt") || name.endsWith(".doc")) {
    throw new Error("Formato antigo (.ppt/.doc) não suportado. Salve como .pptx/.docx.");
  }

  // Fallback: try as text
  return file.text();
}
