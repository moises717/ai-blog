# Instrucciones de Copilot (ai-blog)

## Contexto del proyecto (big picture)

- App Astro 5 con salida `server` y adapter Node standalone: ver
  `astro.config.mjs`.
- Editor Markdown en el navegador con Milkdown Crepe en `src/pages/index.astro`.
- Flujo de guardado:
  - UI (browser) llama `actions.documents.save` (Astro Actions) → persiste
    `documents` (Postgres via Drizzle).
  - Luego genera embeddings en cliente vía Web Worker
    (`public/embeddings-worker.js`) + RPC (`src/scripts/worker-rpc.ts`) + cache
    en IndexedDB (`src/scripts/embeddings-store.ts`).
  - Finalmente sube embeddings al server con
    `actions.documents.upsertEmbeddings` → tabla `document_embeddings` usando
    pgvector.

## Workflows y comandos

- Dev server: `pnpm dev` (Astro en `http://localhost:4321`).
- Build/preview: `pnpm build`, `pnpm preview`.
- Drizzle:
  - Generar migraciones: `pnpm db:generate`
  - Aplicar migraciones: `pnpm db:migrate`
  - UI de Drizzle: `pnpm db:studio`
- Requisito: configurar `DATABASE_URL` (server-only) para Astro y drizzle-kit:
  ver `src/db/client.ts` y `drizzle.config.ts`.

## Base de datos (Postgres + pgvector)

- Schema en `src/db/schema.ts` y SQL en `drizzle/*.sql`.
- Extensiones requeridas: `pgcrypto` (para `gen_random_uuid()`) y `vector`
  (pgvector). Migración: `drizzle/0001_enable_extensions.sql`.
- Dimensiones de embeddings: `EMBEDDING_DIMENSIONS = 1024` (alineado con
  `Xenova/multilingual-e5-large`). Si cambias el modelo, ajusta este valor +
  nueva migración.

## Convenciones de código y patrones (hazlo “como aquí”)

- Imports con alias `@/*` → `src/*` (ver `tsconfig.json`).
- Server actions:
  - Definir acciones con `defineAction` + validación Zod (ver
    `src/actions/documents.ts`).
  - Usar `ActionError` con `code` semántico (`NOT_FOUND`, `CONFLICT`, etc.).
  - En errores de DB, el proyecto extrae `code/message` (ver `pickDbError`) y en
    producción evita filtrar detalle.
- DB access:
  - Usar `getDb()` desde `src/db/client.ts` (incluye cache global en dev para
    HMR).
  - Evitar crear nuevos clients Postgres fuera de ese módulo.
- Embeddings en cliente:
  - Mantener la separación: worker (carga modelo y genera vectores) en
    `public/embeddings-worker.js`; RPC en `src/scripts/worker-rpc.ts`.
  - Cache por contenido+modelo en IndexedDB (key no depende de `postId`) en
    `src/scripts/embeddings-store.ts`.
  - Para E5, prefijar texto con `passage: ...` (ver
    `src/scripts/ai-embeddings.ts` y `src/pages/index.astro`).
- UI/estado:
  - Estado global con Nanostores (`src/store/editor-store.ts`) y hooks via
    `useSyncExternalStore` (ver `src/components/editor-header.tsx`).
  - Comunicación UI↔editor por eventos DOM (`editor:save`,
    `editor:importMarkdown`, etc.) definidos/escuchados en
    `src/pages/index.astro`.

## Cosas a NO romper

- `public/embeddings-worker.js` es un módulo ESM y usa CDN ESM de
  Transformers.js; mantener `new Worker(url, { type: 'module' })`.
- `upsertEmbeddings` valida dimensión exacta antes de insertar; si ajustas el
  modelo, propaga cambios a DB y a cliente.

## Dónde mirar primero (rutas guía)

- UI + flujo principal: `src/pages/index.astro`
- Menubar/acciones de UI: `src/components/editor-header.tsx`
- Actions server: `src/actions/documents.ts`
- DB schema/client: `src/db/schema.ts`, `src/db/client.ts`
- Embeddings worker/RPC/cache: `public/embeddings-worker.js`,
  `src/scripts/worker-rpc.ts`, `src/scripts/ai-embeddings.ts`,
  `src/scripts/embeddings-store.ts`
