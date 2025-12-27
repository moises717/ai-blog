export type WorkerRequestType = 'init' | 'embed' | 'status' | 'clearCache';

export type WorkerRequest = {
  type: WorkerRequestType;
  requestId: string;
  payload?: unknown;
};

export type WorkerResponse = {
  type: 'response';
  requestId: string;
  ok: boolean;
  result?: unknown;
  error?: unknown;
};

export type WorkerProgress = {
  type: 'progress';
  requestId: string;
  payload: unknown;
};

function randomId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

let workerInstance: Worker | null = null;

export function getEmbeddingsWorker(workerUrl = '/embeddings-worker.js') {
  if (workerInstance) return workerInstance;

  if (typeof Worker === 'undefined') {
    throw new Error('Web Workers no están soportados en este navegador.');
  }

  // Worker module para permitir imports ESM.
  workerInstance = new Worker(workerUrl, { type: 'module' });
  return workerInstance;
}

export function terminateEmbeddingsWorker() {
  if (workerInstance) {
    workerInstance.terminate();
    workerInstance = null;
  }
}

export function createWorkerRpcClient(worker: Worker) {
  const pending = new Map<
    string,
    {
      resolve: (value: unknown) => void;
      reject: (err: unknown) => void;
      onProgress?: (payload: unknown) => void;
      timeoutId?: number;
    }
  >();

  const isWorkerMessage = (
    value: unknown,
  ): value is WorkerResponse | WorkerProgress => {
    if (!value || typeof value !== 'object') return false;
    const v = value as any;
    return (
      (v.type === 'response' || v.type === 'progress') &&
      typeof v.requestId === 'string'
    );
  };

  const onMessage = (event: MessageEvent) => {
    const data = event.data;
    if (!isWorkerMessage(data)) return;

    const entry = pending.get(data.requestId);
    if (!entry) return;

    if (data.type === 'progress') {
      entry.onProgress?.(data.payload);
      return;
    }

    if (data.type === 'response') {
      if (entry.timeoutId) window.clearTimeout(entry.timeoutId);
      pending.delete(data.requestId);

      if (data.ok) entry.resolve(data.result);
      else
        entry.reject(
          data.error ??
            new Error('Error desconocido del Worker de embeddings.'),
        );
    }
  };

  worker.addEventListener('message', onMessage);

  const call = async <TResult = unknown>(
    type: WorkerRequestType,
    payload?: unknown,
    opts?: {
      timeoutMs?: number;
      onProgress?: (payload: unknown) => void;
    },
  ): Promise<TResult> => {
    const requestId = randomId();

    const timeoutMs = opts?.timeoutMs ?? 60_000;
    return await new Promise<TResult>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        pending.delete(requestId);
        reject(new Error(`Timeout llamando al Worker (${type}).`));
      }, timeoutMs);

      pending.set(requestId, {
        resolve: resolve as unknown as (value: unknown) => void,
        reject,
        onProgress: opts?.onProgress,
        timeoutId,
      });

      const message: WorkerRequest = { type, requestId, payload };
      worker.postMessage(message);
    });
  };

  const dispose = () => {
    worker.removeEventListener('message', onMessage);
    for (const [id, entry] of pending.entries()) {
      if (entry.timeoutId) window.clearTimeout(entry.timeoutId);
      entry.reject(new Error('RPC client disposed'));
      pending.delete(id);
    }
    worker.terminate();
  };

  return { call, dispose };
}
