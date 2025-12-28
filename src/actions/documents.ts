import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro/zod';
import { eq, sql } from 'drizzle-orm';

import { getDb } from '../db/client';
import {
  documentEmbeddings,
  documents,
  EMBEDDING_DIMENSIONS,
} from '../db/schema';
import { semanticSearch } from '../db/semantic-search';

function pickDbError(err: unknown): {
  code?: string;
  message?: string;
  detail?: string;
  constraint?: string;
} {
  const anyErr = err as any;
  const cause = anyErr?.cause;
  return {
    code: cause?.code ?? anyErr?.code,
    message: cause?.message ?? anyErr?.message,
    detail: cause?.detail,
    constraint: cause?.constraint,
  };
}

function fnv1a32(str: string) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function slugify(input: string) {
  const base = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);

  return base || 'post';
}

function makeSlug(title: string) {
  const suffix = Math.random().toString(16).slice(2, 8);
  return `${slugify(title)}-${suffix}`;
}

export const documentsActions = {
  save: defineAction({
    input: z.object({
      id: z.string().uuid().optional(),
      slug: z.string().min(1).optional(),
      title: z.string().min(1),
      rawMarkdown: z.string(),
      metadata: z.record(z.unknown()).optional(),
    }),
    handler: async ({ id, slug, title, rawMarkdown, metadata }) => {
      const db = getDb();
      if (id) {
        try {
          const updated = await db
            .update(documents)
            .set({
              title,
              rawMarkdown,
              metadata: metadata ?? {},
            })
            .where(eq(documents.id, id))
            .returning({
              id: documents.id,
              slug: documents.slug,
              title: documents.title,
            });

          const row = updated[0];
          if (!row) {
            throw new ActionError({
              code: 'NOT_FOUND',
              message: 'Documento no encontrado.',
            });
          }

          return row;
        } catch (err) {
          console.error('documents.save (update) failed', err);
          const dbErr = pickDbError(err);
          throw new ActionError({
            code: 'INTERNAL_SERVER_ERROR',
            message:
              process.env.NODE_ENV === 'production'
                ? 'Error guardando el documento.'
                : `Error guardando el documento (update). ${dbErr.code ?? ''} ${
                    dbErr.message ?? ''
                  }`.trim(),
          });
        }
      }

      const finalSlug = slug ?? makeSlug(title);

      // Insert con fallback simple por colisión de slug.
      // (Si quieres idempotencia fuerte por slug, podemos cambiar a upsert.)
      try {
        const inserted = await db
          .insert(documents)
          .values({
            title,
            slug: finalSlug,
            rawMarkdown,
            metadata: metadata ?? {},
          })
          .returning({
            id: documents.id,
            slug: documents.slug,
            title: documents.title,
          });

        return inserted[0]!;
      } catch (err: any) {
        const dbErr = pickDbError(err);

        // 23505 = unique_violation
        if (dbErr.code === '23505') {
          throw new ActionError({
            code: 'CONFLICT',
            message: 'El slug ya existe. Intenta guardar de nuevo.',
          });
        }

        // 42883 = undefined_function (típico si falta pgcrypto => gen_random_uuid())
        if (
          dbErr.code === '42883' &&
          (dbErr.message ?? '').includes('gen_random_uuid')
        ) {
          throw new ActionError({
            code: 'INTERNAL_SERVER_ERROR',
            message:
              'La BD no tiene habilitada la extensión pgcrypto (gen_random_uuid). Ejecuta `pnpm db:migrate` y asegúrate de que la migración 0001_enable_extensions se aplique en la misma DATABASE_URL que usa Astro.',
          });
        }

        console.error('documents.save (insert) failed', err);
        if (process.env.NODE_ENV !== 'production') {
          throw new ActionError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Error guardando el documento (insert). ${
              dbErr.code ?? ''
            } ${dbErr.message ?? ''}`.trim(),
          });
        }
        throw err;
      }
    },
  }),

  upsertEmbeddings: defineAction({
    input: z.object({
      documentId: z.string().uuid(),
      items: z
        .array(
          z.object({
            chunkIndex: z.number().int().min(0),
            chunkText: z.string().min(1),
            embedding: z.array(z.number()),
            modelId: z.string().min(1),
            device: z.string().min(1),
            pooling: z.string().optional(),
            normalize: z.boolean().optional(),
          }),
        )
        .min(1)
        .max(32),
    }),
    handler: async ({ documentId, items }) => {
      const db = getDb();
      // Verificar existencia del documento (mejor error que FK genérico)
      const doc = await db
        .select({ id: documents.id })
        .from(documents)
        .where(eq(documents.id, documentId))
        .limit(1);

      if (!doc[0]) {
        throw new ActionError({
          code: 'NOT_FOUND',
          message: 'Documento no encontrado para embeddings.',
        });
      }

      for (const it of items) {
        if (it.embedding.length !== EMBEDDING_DIMENSIONS) {
          throw new ActionError({
            code: 'BAD_REQUEST',
            message: `Dimensión inválida del embedding. Esperado ${EMBEDDING_DIMENSIONS}, recibido ${it.embedding.length}.`,
          });
        }
      }

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

      // Upsert por doc+chunk+modelo+device
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

      return { upserted: values.length };
    },
  }),

  list: defineAction({
    input: z.object({
      limit: z.number().int().min(1).max(100).default(20),
      offset: z.number().int().min(0).default(0),
      search: z.string().optional(),
    }),
    handler: async ({ limit, offset, search }) => {
      const db = getDb();

      let query = db
        .select({
          id: documents.id,
          title: documents.title,
          slug: documents.slug,
          rawMarkdown: documents.rawMarkdown,
          metadata: documents.metadata,
          createdAt: documents.createdAt,
          updatedAt: documents.updatedAt,
        })
        .from(documents)
        .orderBy(sql`${documents.createdAt} DESC`)
        .limit(limit)
        .offset(offset);

      if (search && search.trim()) {
        const searchTerm = `%${search.trim().toLowerCase()}%`;
        query = query.where(
          sql`LOWER(${documents.title}) LIKE ${searchTerm}`,
        ) as typeof query;
      }

      const rows = await query;

      // Extract excerpt from rawMarkdown (first 160 chars)
      return rows.map((row) => ({
        ...row,
        excerpt: row.rawMarkdown
          .replace(/^#.*$/gm, '')
          .replace(/[#*_`]/g, '')
          .trim()
          .slice(0, 160) + (row.rawMarkdown.length > 160 ? '...' : ''),
      }));
    },
  }),

  getBySlug: defineAction({
    input: z.object({
      slug: z.string().min(1),
    }),
    handler: async ({ slug }) => {
      const db = getDb();

      const rows = await db
        .select({
          id: documents.id,
          title: documents.title,
          slug: documents.slug,
          rawMarkdown: documents.rawMarkdown,
          metadata: documents.metadata,
          createdAt: documents.createdAt,
          updatedAt: documents.updatedAt,
        })
        .from(documents)
        .where(eq(documents.slug, slug))
        .limit(1);

      const row = rows[0];
      if (!row) {
        throw new ActionError({
          code: 'NOT_FOUND',
          message: 'Documento no encontrado.',
        });
      }

      return row;
    },
  }),

  semanticSearch: defineAction({
    input: z.object({
      queryEmbedding: z.array(z.number()),
      limit: z.number().int().min(1).max(50).default(10),
    }),
    handler: async ({ queryEmbedding, limit }) => {
      if (queryEmbedding.length !== EMBEDDING_DIMENSIONS) {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: `Dimensión inválida del embedding. Esperado ${EMBEDDING_DIMENSIONS}, recibido ${queryEmbedding.length}.`,
        });
      }

      try {
        const results = await semanticSearch(queryEmbedding, limit);
        return results;
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
