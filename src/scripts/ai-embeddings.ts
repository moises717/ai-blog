import { createEmbeddingsWorker, createWorkerRpcClient } from './worker-rpc';
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
  modelId: 'Xenova/multilingual-e5-large',
  device: 'wasm',
};

let rpc: ReturnType<typeof createWorkerRpcClient> | null = null;
let worker: Worker | null = null;
let ready = false;

export async function ensureSwReady() {
  if (ready) return;
  worker = await createEmbeddingsWorker('/embeddings-worker.js');
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

export async function embedPost(args: EmbedPostArgs): Promise<number[]> {
  await ensureSwReady();

  const cfg: EmbeddingModelConfig = {
    modelId: args.model?.modelId ?? DEFAULT_MODEL.modelId,
    device: args.model?.device ?? DEFAULT_MODEL.device,
  };

  // 1) cache local por postId + hash del contenido
  const cached = await getStoredEmbedding({
    postId: args.postId,
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
    postId: args.postId,
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

export async function swStatus() {
  await ensureSwReady();
  return await rpc!.call('status');
}

export async function clearAllEmbeddingsCaches() {
  await ensureSwReady();
  await rpc!.call('clearCache');
  await clearEmbeddingsStore();
}
