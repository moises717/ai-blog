import { eq, sql } from 'drizzle-orm';
import { getDb } from './client';
import { documents } from './schema';
import { makeSlug } from './utils';

// ============================================================================
// Types
// ============================================================================

export interface DocumentRow {
  id: string;
  title: string;
  slug: string;
  rawMarkdown: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface DocumentSummary {
  id: string;
  slug: string;
  title: string;
}

export interface SaveDocumentInput {
  id?: string;
  slug?: string;
  title: string;
  rawMarkdown: string;
  metadata?: Record<string, unknown>;
}

export interface ListDocumentsInput {
  limit?: number;
  offset?: number;
  search?: string;
}

// ============================================================================
// Queries
// ============================================================================

/**
 * Obtiene un documento por su slug.
 */
export async function getDocumentBySlug(slug: string): Promise<DocumentRow | null> {
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

  return (rows[0] as DocumentRow | undefined) ?? null;
}

/**
 * Obtiene un documento por su ID.
 */
export async function getDocumentById(id: string): Promise<DocumentRow | null> {
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
    .where(eq(documents.id, id))
    .limit(1);

  return (rows[0] as DocumentRow | undefined) ?? null;
}

/**
 * Lista documentos con paginación y búsqueda opcional por título.
 */
export async function listDocuments(input: ListDocumentsInput = {}): Promise<DocumentRow[]> {
  const { limit = 20, offset = 0, search } = input;
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

  if (search?.trim()) {
    const searchTerm = `%${search.trim().toLowerCase()}%`;
    query = query.where(
      sql`LOWER(${documents.title}) LIKE ${searchTerm}`,
    ) as typeof query;
  }

  return await query as DocumentRow[];
}

// ============================================================================
// Mutations
// ============================================================================

/**
 * Crea un nuevo documento.
 */
export async function createDocument(input: SaveDocumentInput): Promise<DocumentSummary> {
  const db = getDb();
  const finalSlug = input.slug ?? makeSlug(input.title);

  const inserted = await db
    .insert(documents)
    .values({
      title: input.title,
      slug: finalSlug,
      rawMarkdown: input.rawMarkdown,
      metadata: input.metadata ?? {},
    })
    .returning({
      id: documents.id,
      slug: documents.slug,
      title: documents.title,
    });

  return inserted[0]!;
}

/**
 * Actualiza un documento existente.
 */
export async function updateDocument(
  id: string,
  input: Omit<SaveDocumentInput, 'id' | 'slug'>
): Promise<DocumentSummary | null> {
  const db = getDb();

  const updated = await db
    .update(documents)
    .set({
      title: input.title,
      rawMarkdown: input.rawMarkdown,
      metadata: input.metadata ?? {},
    })
    .where(eq(documents.id, id))
    .returning({
      id: documents.id,
      slug: documents.slug,
      title: documents.title,
    });

  return updated[0] ?? null;
}

/**
 * Verifica si un documento existe por su ID.
 */
export async function documentExists(id: string): Promise<boolean> {
  const db = getDb();
  
  const rows = await db
    .select({ id: documents.id })
    .from(documents)
    .where(eq(documents.id, id))
    .limit(1);

  return rows.length > 0;
}
