/**
 * Document Actions - Astro Server Actions for document management.
 * 
 * Este módulo define las acciones del servidor para gestionar documentos y sus embeddings.
 * La lógica de base de datos está delegada a los repositorios en src/db/.
 */

import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro/zod';

// Repositories
import {
  getDocumentBySlug,
  listDocuments,
  createDocument,
  updateDocument,
  documentExists,
  type DocumentRow,
} from '../db/documents';
import {
  upsertEmbeddings,
  validateEmbeddingDimensions,
  EMBEDDING_DIMENSIONS,
} from '../db/embeddings';
import { semanticSearch } from '../db/semantic-search';
import { pickDbError } from '../db/utils';
import { extractExcerpt } from '../lib/embedding-utils';

// ============================================================================
// Schemas (Zod validation)
// ============================================================================

const saveInputSchema = z.object({
  id: z.string().uuid().optional(),
  slug: z.string().min(1).optional(),
  title: z.string().min(1),
  rawMarkdown: z.string(),
  metadata: z.record(z.unknown()).optional(),
});

const embeddingItemSchema = z.object({
  chunkIndex: z.number().int().min(0),
  chunkText: z.string().min(1),
  embedding: z.array(z.number()),
  modelId: z.string().min(1),
  device: z.string().min(1),
  pooling: z.string().optional(),
  normalize: z.boolean().optional(),
});

const upsertEmbeddingsSchema = z.object({
  documentId: z.string().uuid(),
  items: z.array(embeddingItemSchema).min(1).max(32),
});

const listInputSchema = z.object({
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
  search: z.string().optional(),
});

const getBySlugSchema = z.object({
  slug: z.string().min(1),
});

const semanticSearchSchema = z.object({
  queryEmbedding: z.array(z.number()),
  limit: z.number().int().min(1).max(50).default(10),
});

// ============================================================================
// Helpers
// ============================================================================

function toDocumentWithExcerpt(doc: DocumentRow) {
  return {
    ...doc,
    excerpt: extractExcerpt(doc.rawMarkdown, 160),
  };
}

// ============================================================================
// Actions
// ============================================================================

export const documentsActions = {
  /**
   * Guarda un documento (crea nuevo o actualiza existente).
   */
  save: defineAction({
    input: saveInputSchema,
    handler: async ({ id, slug, title, rawMarkdown, metadata }) => {
      // Update existing document
      if (id) {
        const updated = await updateDocument(id, { title, rawMarkdown, metadata });
        
        if (!updated) {
          throw new ActionError({
            code: 'NOT_FOUND',
            message: 'Documento no encontrado.',
          });
        }
        
        return updated;
      }

      // Create new document
      try {
        return await createDocument({ slug, title, rawMarkdown, metadata });
      } catch (err) {
        const dbErr = pickDbError(err);

        // Handle unique violation (slug already exists)
        if (dbErr.code === '23505') {
          throw new ActionError({
            code: 'CONFLICT',
            message: 'El slug ya existe. Intenta guardar de nuevo.',
          });
        }

        // Handle missing pgcrypto extension
        if (dbErr.code === '42883' && dbErr.message?.includes('gen_random_uuid')) {
          throw new ActionError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'La BD no tiene habilitada la extensión pgcrypto. Ejecuta `pnpm db:migrate`.',
          });
        }

        console.error('documents.save failed', err);
        throw new ActionError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error guardando el documento.',
        });
      }
    },
  }),

  /**
   * Inserta o actualiza embeddings para un documento.
   */
  upsertEmbeddings: defineAction({
    input: upsertEmbeddingsSchema,
    handler: async ({ documentId, items }) => {
      // Verify document exists
      const exists = await documentExists(documentId);
      if (!exists) {
        throw new ActionError({
          code: 'NOT_FOUND',
          message: 'Documento no encontrado para embeddings.',
        });
      }

      // Validate embedding dimensions
      for (const item of items) {
        if (!validateEmbeddingDimensions(item.embedding)) {
          throw new ActionError({
            code: 'BAD_REQUEST',
            message: `Dimensión inválida del embedding. Esperado ${EMBEDDING_DIMENSIONS}, recibido ${item.embedding.length}.`,
          });
        }
      }

      const count = await upsertEmbeddings({ documentId, items });
      return { upserted: count };
    },
  }),

  /**
   * Lista documentos con paginación y búsqueda opcional.
   */
  list: defineAction({
    input: listInputSchema,
    handler: async ({ limit, offset, search }) => {
      const docs = await listDocuments({ limit, offset, search });
      return docs.map(toDocumentWithExcerpt);
    },
  }),

  /**
   * Obtiene un documento por su slug.
   */
  getBySlug: defineAction({
    input: getBySlugSchema,
    handler: async ({ slug }) => {
      const doc = await getDocumentBySlug(slug);
      
      if (!doc) {
        throw new ActionError({
          code: 'NOT_FOUND',
          message: 'Documento no encontrado.',
        });
      }

      return doc;
    },
  }),

  /**
   * Realiza búsqueda semántica usando embeddings.
   */
  semanticSearch: defineAction({
    input: semanticSearchSchema,
    handler: async ({ queryEmbedding, limit }) => {
      if (!validateEmbeddingDimensions(queryEmbedding)) {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: `Dimensión inválida del embedding. Esperado ${EMBEDDING_DIMENSIONS}, recibido ${queryEmbedding.length}.`,
        });
      }

      try {
        return await semanticSearch(queryEmbedding, limit);
      } catch (err) {
        console.error('semanticSearch failed', err);
        throw new ActionError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error realizando búsqueda semántica.',
        });
      }
    },
  }),
};
