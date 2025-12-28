import { sql } from 'drizzle-orm';
import { getDb } from './client';
import { documentEmbeddings, EMBEDDING_DIMENSIONS } from './schema';
import { fnv1a32 } from './utils';

// ============================================================================
// Types
// ============================================================================

export interface EmbeddingItem {
  chunkIndex: number;
  chunkText: string;
  embedding: number[];
  modelId: string;
  device: string;
  pooling?: string;
  normalize?: boolean;
}

export interface UpsertEmbeddingsInput {
  documentId: string;
  items: EmbeddingItem[];
}

export { EMBEDDING_DIMENSIONS };

// ============================================================================
// Validation
// ============================================================================

/**
 * Valida que un embedding tenga las dimensiones correctas.
 */
export function validateEmbeddingDimensions(embedding: number[]): boolean {
  return embedding.length === EMBEDDING_DIMENSIONS;
}

// ============================================================================
// Mutations
// ============================================================================

/**
 * Inserta o actualiza embeddings para un documento.
 * Usa conflict resolution para actualizar si ya existen.
 */
export async function upsertEmbeddings(input: UpsertEmbeddingsInput): Promise<number> {
  const { documentId, items } = input;
  const db = getDb();

  const values = items.map((it) => {
    const contentHash = fnv1a32(it.chunkText);
    return {
      documentId,
      chunkIndex: it.chunkIndex,
      chunkText: it.chunkText,
      modelId: it.modelId,
      device: it.device,
      pooling: it.pooling ?? 'mean',
      normalize: it.normalize ?? true ? 1 : 0,
      contentHash,
      embedding: it.embedding,
    };
  });

  await db
    .insert(documentEmbeddings)
    .values(values)
    .onConflictDoUpdate({
      target: [
        documentEmbeddings.documentId,
        documentEmbeddings.chunkIndex,
        documentEmbeddings.modelId,
        documentEmbeddings.device,
      ],
      set: {
        chunkText: sql`excluded.chunk_text`,
        pooling: sql`excluded.pooling`,
        normalize: sql`excluded.normalize`,
        contentHash: sql`excluded.content_hash`,
        embedding: sql`excluded.embedding`,
      },
    });

  return values.length;
}

/**
 * Elimina todos los embeddings de un documento.
 */
export async function deleteDocumentEmbeddings(documentId: string): Promise<void> {
  const db = getDb();
  
  await db
    .delete(documentEmbeddings)
    .where(sql`${documentEmbeddings.documentId} = ${documentId}`);
}
