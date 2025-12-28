/**
 * Utilidades compartidas para operaciones de base de datos.
 */

/**
 * Extrae información estructurada de errores de base de datos PostgreSQL.
 */
export function pickDbError(err: unknown): {
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

/**
 * Genera un hash FNV-1a de 32 bits para un string.
 * Útil para crear identificadores de contenido rápidos.
 */
export function fnv1a32(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Convierte un string a un slug URL-friendly.
 */
export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // Eliminar diacríticos
    .replace(/[^a-z0-9]+/g, '-')     // Reemplazar no-alfanuméricos con guión
    .replace(/(^-|-$)/g, '')         // Eliminar guiones al inicio/final
    .slice(0, 80);

  return base || 'post';
}

/**
 * Genera un slug único con sufijo aleatorio.
 */
export function makeSlug(title: string): string {
  const suffix = Math.random().toString(16).slice(2, 8);
  return `${slugify(title)}-${suffix}`;
}
