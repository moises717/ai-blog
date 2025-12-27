import { $lastMarkdownSnapshot } from '@/store/editor-store';
import {
  createWorkerRpcClient,
  getEmbeddingsWorker,
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
  // Para E5 es recomendable prefijar: "passage: ..." (doc) o "query: ..." (búsqueda)
  text: string;
  model?: Partial<EmbeddingModelConfig>;
  onProgress?: (p: unknown) => void;
};

const DEFAULT_MODEL: EmbeddingModelConfig = {
  modelId: 'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
  device: 'wasm',
};

let rpc: ReturnType<typeof createWorkerRpcClient> | null = null;
let worker: Worker | null = null;
let ready = false;
let modelInitPromise: Promise<void> | null = null;
let activeModel: EmbeddingModelConfig | null = null;

export async function ensureSwReady() {
  if (ready && rpc && worker) return;
  worker = getEmbeddingsWorker('/embeddings-worker.js');
  rpc = createWorkerRpcClient(worker);
  ready = true;
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

async function ensureModelInitialized(
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

export function disposeEmbeddingsClient() {
  if (rpc) {
    rpc.dispose();
    rpc = null;
  }
  terminateEmbeddingsWorker();
  worker = null;
  ready = false;
  activeModel = null;
  modelInitPromise = null;
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
