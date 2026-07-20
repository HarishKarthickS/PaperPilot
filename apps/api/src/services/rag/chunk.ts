export type TextChunk = {
  index: number;
  content: string;
};

/** Split extracted study text into overlapping character chunks for embedding. */
export function chunkText(text: string, chunkSize = 800, overlap = 120): TextChunk[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const safeSize = Math.max(100, chunkSize);
  const safeOverlap = Math.max(0, Math.min(overlap, safeSize - 1));
  const step = Math.max(1, safeSize - safeOverlap);
  const chunks: TextChunk[] = [];

  for (let start = 0, index = 0; start < normalized.length; start += step, index += 1) {
    const end = Math.min(normalized.length, start + safeSize);
    const content = normalized.slice(start, end).trim();
    if (content) chunks.push({ index, content });
    if (end >= normalized.length) break;
  }

  return chunks;
}
