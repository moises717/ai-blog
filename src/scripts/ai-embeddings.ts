import { $lastMarkdownSnapshot } from '@/store/editor-store';
import {
  createWorkerRpcClient,
  getEmbeddingsWorker,
  isWorkerAlive,
  terminateEmbeddingsWorker,
} from './worker-rpc';
import {
  clearEmbeddingsStore,
  computeEmbeddingIdentity,
  getStoredEmbedding,
  putStoredEmbedding,
} from './embeddings-store';

export type EmbeddingModelConfig = {
  modelId: string;
  device: 'wasm' | 'webgpu';
};

export type EmbedPostArgs = {
  postId: string;
  text: string;
  model?: Partial<EmbeddingModelConfig>;
  onProgress?: (p: unknown) => void;
};

const DEFAULT_MODEL: EmbeddingModelConfig = {
  modelId: 'Xenova/multilingual-e5-small',
  device: 'wasm',
};

// Estado centralizado - sin duplicación
let rpc: ReturnType<typeof createWorkerRpcClient> | null = null;
let modelInitPromise: Promise<void> | null = null;
let activeModel: EmbeddingModelConfig | null = null;

/**
 * Asegura que el worker y RPC client estén listos.
 * Reutiliza el singleton existente si está vivo.
 */
export async function ensureSwReady() {
  // Si ya hay RPC y worker activo, reutilizar
  if (rpc && isWorkerAlive()) {
    return;
  }
  
  // Crear/obtener worker y RPC
  const worker = getEmbeddingsWorker('/embeddings-worker.js');
  rpc = createWorkerRpcClient(worker);
}

export async function initEmbeddingModel(
  model?: Partial<EmbeddingModelConfig>,
  onProgress?: (p: unknown) => void,
) {
  await ensureSwReady();

  const cfg: EmbeddingModelConfig = {
    modelId: model?.modelId ?? DEFAULT_MODEL.modelId,
    device: model?.device ?? DEFAULT_MODEL.device,
  };

  return await rpc!.call('init', cfg, {
    timeoutMs: 10 * 60_000,
    onProgress,
  });
}

/**
 * Asegura que el modelo esté inicializado.
 * Reutiliza la promesa existente si el modelo es el mismo.
 */
export async function ensureModelInitialized(
  cfg: EmbeddingModelConfig,
  onProgress?: (p: unknown) => void,
) {
  const sameModel =
    activeModel?.modelId === cfg.modelId && activeModel?.device === cfg.device;

  if (modelInitPromise && sameModel) return modelInitPromise;

  modelInitPromise = (async () => {
    await initEmbeddingModel(cfg, onProgress);
    activeModel = cfg;
  })().catch((err) => {
    modelInitPromise = null;
    throw err;
  });

  return modelInitPromise;
}

export async function embedPost(args: EmbedPostArgs): Promise<number[]> {
  const cfg: EmbeddingModelConfig = {
    modelId: args.model?.modelId ?? DEFAULT_MODEL.modelId,
    device: args.model?.device ?? DEFAULT_MODEL.device,
  };

  await ensureModelInitialized(cfg, args.onProgress);

  // 1) cache local por hash del contenido + modelo (no depende de postId)
  const cached = await getStoredEmbedding({
    modelId: cfg.modelId,
    device: cfg.device,
    text: args.text,
  });

  if (cached?.embedding?.length) return cached.embedding;

  // 2) generar con SW
  const res = (await rpc!.call(
    'embed',
    {
      modelId: cfg.modelId,
      device: cfg.device,
      texts: [args.text],
    },
    {
      timeoutMs: 10 * 60_000,
      onProgress: args.onProgress,
    },
  )) as any;

  const embedding = (res?.embeddings?.[0] ?? null) as number[] | null;
  if (!embedding) throw new Error('No se pudo generar embedding.');

  // 3) persistir
  const ident = computeEmbeddingIdentity({
    modelId: cfg.modelId,
    device: cfg.device,
    text: args.text,
  });

  await putStoredEmbedding({
    key: ident.key,
    postId: args.postId,
    modelId: cfg.modelId,
    device: cfg.device,
    pooling: ident.pooling,
    normalize: ident.normalize,
    contentHash: ident.contentHash,
    embedding,
  });

  return embedding;
}

export type EmbedQueryArgs = {
  query: string;
  model?: Partial<EmbeddingModelConfig>;
  onProgress?: (p: unknown) => void;
};

/**
 * Genera embedding para una query de búsqueda.
 * Usa el prefijo 'query:' requerido por el modelo E5.
 * No se cachea en IndexedDB ya que las queries son efímeras.
 */
export async function embedQuery(args: EmbedQueryArgs): Promise<number[]> {
  const cfg: EmbeddingModelConfig = {
    modelId: args.model?.modelId ?? DEFAULT_MODEL.modelId,
    device: args.model?.device ?? DEFAULT_MODEL.device,
  };

  await ensureModelInitialized(cfg, args.onProgress);

  // El modelo E5 requiere prefijo 'query:' para queries de búsqueda
  const text = args.query.startsWith('query:')
    ? args.query
    : `query: ${args.query}`;

  const res = (await rpc!.call(
    'embed',
    {
      modelId: cfg.modelId,
      device: cfg.device,
      texts: [text],
    },
    {
      timeoutMs: 10 * 60_000,
      onProgress: args.onProgress,
    },
  )) as any;

  const embedding = (res?.embeddings?.[0] ?? null) as number[] | null;
  if (!embedding) throw new Error('No se pudo generar embedding para la query.');

  return embedding;
}

type DebounceUnsubscribe = () => void;

export function subscribeDebouncedEmbeddings(opts: {
  postId: string;
  delayMs?: number;
  model?: Partial<EmbeddingModelConfig>;
  onProgress?: (p: unknown) => void;
  onEmbedding?: (embedding: number[]) => void;
  onError?: (err: unknown) => void;
}): DebounceUnsubscribe {
  const delayMs = opts.delayMs ?? 2000;
  let timeoutId: number | null = null;

  const unsubscribe = $lastMarkdownSnapshot.listen((content) => {
    if (!content) return;

    if (timeoutId) window.clearTimeout(timeoutId);

    timeoutId = window.setTimeout(async () => {
      try {
        const text = content.startsWith('passage:')
          ? content
          : `passage: ${content}`;

        const embedding = await embedPost({
          postId: opts.postId,
          text,
          model: opts.model,
          onProgress: opts.onProgress,
        });

        opts.onEmbedding?.(embedding);
      } catch (err) {
        console.warn('Error en embeddings debounced', err);
        opts.onError?.(err);
      }
    }, delayMs);
  });

  return () => {
    if (timeoutId) window.clearTimeout(timeoutId);
    unsubscribe();
  };
}

/**
 * Limpia el cliente RPC pero NO termina el worker.
 * El worker se mantiene vivo para preservar el modelo en memoria.
 * Solo llamar terminateEmbeddingsWorker() si realmente quieres eliminar el modelo.
 */
export function disposeEmbeddingsClient(options?: { terminateWorker?: boolean }) {
  if (rpc) {
    rpc.dispose();
    rpc = null;
  }
  
  // Por defecto NO terminamos el worker para preservar el modelo en memoria
  if (options?.terminateWorker) {
    terminateEmbeddingsWorker();
    activeModel = null;
    modelInitPromise = null;
  }
}

export async function swStatus() {
  await ensureSwReady();
  return await rpc!.call('status');
}

export async function clearAllEmbeddingsCaches() {
  await ensureSwReady();
  await rpc!.call('clearCache');
  await clearEmbeddingsStore();
}
