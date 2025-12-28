import { sql } from 'drizzle-orm';
import { getDb } from './client';
import { documents, documentEmbeddings, EMBEDDING_DIMENSIONS } from './schema';

export interface SemanticSearchResult {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  similarity: number;
  createdAt: Date;
}

/**
 * Realiza búsqueda semántica usando pgvector con cosine distance.
 * El embedding de la query debe tener el prefijo 'query:' aplicado antes de generar.
 * 
 * @param queryEmbedding - Vector de embedding de la query (dimensión: 384)
 * @param limit - Número máximo de resultados
 * @returns Documentos ordenados por similitud descendente
 */
export async function semanticSearch(
  queryEmbedding: number[],
  limit: number = 10
): Promise<SemanticSearchResult[]> {
  if (queryEmbedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Dimensión inválida del embedding. Esperado ${EMBEDDING_DIMENSIONS}, recibido ${queryEmbedding.length}.`
    );
  }

  const db = getDb();

  // Convertir array a formato pgvector: '[0.1, 0.2, ...]'
  const vectorLiteral = `[${queryEmbedding.join(',')}]`;

  // Query usando cosine distance (<=>)
  // Menor distancia = mayor similitud, por eso ordenamos ASC
  // Convertimos distancia a similitud: 1 - distance
  const results = await db
    .select({
      id: documents.id,
      title: documents.title,
      slug: documents.slug,
      rawMarkdown: documents.rawMarkdown,
      createdAt: documents.createdAt,
      // Cosine similarity = 1 - cosine distance
      similarity: sql<number>`1 - (${documentEmbeddings.embedding} <=> ${vectorLiteral}::vector)`,
    })
    .from(documentEmbeddings)
    .innerJoin(documents, sql`${documentEmbeddings.documentId} = ${documents.id}`)
    .orderBy(sql`${documentEmbeddings.embedding} <=> ${vectorLiteral}::vector ASC`)
    .limit(limit);

  // Agrupar por documento (puede haber múltiples chunks por doc)
  // Tomamos el chunk con mayor similitud por documento
  const docMap = new Map<string, SemanticSearchResult>();

  for (const row of results) {
    const existing = docMap.get(row.id);
    
    if (!existing || row.similarity > existing.similarity) {
      // Generar excerpt desde rawMarkdown
      const normalizedText = row.rawMarkdown
        .replace(/<[^>]*>/g, ' ')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/```[\s\S]*?```/g, '')
        .replace(/`[^`]*`/g, '')
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/(\*\*|__)(.*?)\1/g, '$2')
        .replace(/(\*|_)(.*?)\1/g, '$2')
        .replace(/^>\s*/gm, '')
        .replace(/^-{3,}$/gm, '')
        .replace(/^[\s]*[-*+]\s+/gm, '')
        .replace(/^[\s]*\d+\.\s+/gm, '')
        .replace(/\s+/g, ' ')
        .trim();

      docMap.set(row.id, {
        id: row.id,
        title: row.title,
        slug: row.slug,
        excerpt: normalizedText.slice(0, 180) + (normalizedText.length > 180 ? '...' : ''),
        similarity: row.similarity,
        createdAt: row.createdAt,
      });
    }
  }

  // Convertir a array y ordenar por similitud
  return Array.from(docMap.values()).sort((a, b) => b.similarity - a.similarity);
}
