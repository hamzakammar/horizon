import OpenAI from "openai";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;

function getOpenAIClient(): OpenAI {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY environment variable is not set");
  }
  return new OpenAI({ apiKey: OPENAI_API_KEY });
}

/**
 * Splits text into overlapping chunks based on character count.
 * @param text       Source text to split
 * @param chunkSize  Target chunk size in characters (default 500)
 * @param overlap    Overlap between consecutive chunks in characters (default 50)
 */
export function chunkText(
  text: string,
  chunkSize = 500,
  overlap = 50
): string[] {
  if (!text || text.length === 0) return [];

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const chunk = text.slice(start, end).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }
    if (end === text.length) break;
    // Advance by (chunkSize - overlap) but ensure we always make progress
    start = Math.max(end - overlap, start + 1);
  }

  return chunks;
}

/**
 * Generates an embedding vector for a single text string using
 * OpenAI text-embedding-3-small.
 */
export async function embedText(text: string): Promise<number[]> {
  const client = getOpenAIClient();
  const response = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
    dimensions: EMBEDDING_DIMENSIONS,
  });
  return response.data[0].embedding;
}

/**
 * Batch embeds an array of text chunks.
 * Sends all chunks in a single API call (OpenAI supports array input).
 * Falls back to sequential calls for large batches to stay within rate limits.
 */
export async function embedChunks(chunks: string[]): Promise<number[][]> {
  if (chunks.length === 0) return [];

  const client = getOpenAIClient();
  const BATCH_SIZE = 100; // OpenAI supports up to 2048 inputs but we keep it manageable
  const results: number[][] = [];

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const response = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
      dimensions: EMBEDDING_DIMENSIONS,
    });
    // Responses are returned in the same order as input
    const batchEmbeddings = response.data
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding);
    results.push(...batchEmbeddings);
  }

  return results;
}
