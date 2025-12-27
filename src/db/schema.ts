import { sql } from 'drizzle-orm';
import {
  bigserial,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from 'drizzle-orm/pg-core';

// IMPORTANT:
// Xenova/paraphrase-multilingual-MiniLM-L12-v2 normalmente devuelve embeddings de 1024 dimensiones.
// Si cambias el modelo, ajusta este valor y genera una nueva migración.
export const EMBEDDING_DIMENSIONS = 384;

export const documents = pgTable(
  'documents',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    title: text('title').notNull(),
    slug: text('slug').notNull(),
    rawMarkdown: text('raw_markdown').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('documents_slug_unique').on(table.slug),
    index('idx_documents_slug').on(table.slug),
  ],
);

export const documentEmbeddings = pgTable(
  'document_embeddings',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    chunkIndex: integer('chunk_index').notNull(),
    chunkText: text('chunk_text').notNull(),
    modelId: text('model_id').notNull(),
    device: text('device').notNull(),
    pooling: text('pooling').notNull().default('mean'),
    normalize: integer('normalize').notNull().default(1),
    contentHash: text('content_hash').notNull(),
    embedding: vector('embedding', {
      dimensions: EMBEDDING_DIMENSIONS,
    }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('document_embeddings_doc_chunk_model_device_unique').on(
      table.documentId,
      table.chunkIndex,
      table.modelId,
      table.device,
    ),
    index('idx_document_embeddings_document_id').on(table.documentId),
  ],
);
