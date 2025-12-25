/* Web Worker: embeddings (Transformers.js)
   Motivo: onnxruntime-web usa import() internamente; en ServiceWorkerGlobalScope se bloquea.
   Este worker módulo permite cargar WASM y medir progreso de descarga.
*/

import {
  pipeline,
  env,
} from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/+esm';

let featureExtractionPipeline = null;
let currentConfig = {
  modelId: null,
  device: null,
};

function toPlainArray(vectorLike) {
  if (!vectorLike) return null;
  if (Array.isArray(vectorLike)) return vectorLike;
  if (ArrayBuffer.isView(vectorLike)) return Array.from(vectorLike);
  return vectorLike;
}

function postProgress(requestId, payload) {
  self.postMessage({
    type: 'progress',
    requestId,
    payload,
  });
}

function postResponse(requestId, ok, result, error) {
  self.postMessage({
    type: 'response',
    requestId,
    ok,
    result,
    error,
  });
}

async function ensurePipeline({ modelId, device, reportProgress }) {
  if (
    featureExtractionPipeline &&
    currentConfig.modelId === modelId &&
    currentConfig.device === device
  ) {
    return featureExtractionPipeline;
  }

  const report = typeof reportProgress === 'function' ? reportProgress : null;

  env.allowRemoteModels = true;
  env.useBrowserCache = true;

  // Wrap fetch para emitir progreso de descarga de assets del modelo
  const baseFetch = env.fetch || fetch;
  env.fetch = async (...args) => {
    const res = await baseFetch(...args);
    if (!report || !res?.body) return res;

    let url = '';
    try {
      const input = args[0];
      url = typeof input === 'string' ? input : input?.url || '';
    } catch {
      // ignore
    }

    // Evitar “ruido”: solo reportar descargas de assets típicos del modelo/runtime
    const isModelAsset =
      /huggingface|hf\.co|jsdelivr|onnxruntime|\.wasm(\?|$)|\.onnx(\?|$)/i.test(
        url,
      );
    if (!isModelAsset) return res;

    const total = Number(res.headers?.get('content-length')) || 0;
    if (!total || !Number.isFinite(total)) {
      report({ phase: 'loading', label: 'Descargando modelo', percent: null });
      return res;
    }

    let loaded = 0;
    const reader = res.body.getReader();
    const stream = new ReadableStream({
      async pull(controller) {
        const { done, value } = await reader.read();
        if (done) {
          report({
            phase: 'loading',
            label: 'Modelo descargado',
            percent: 100,
          });
          controller.close();
          return;
        }

        loaded += value?.byteLength || 0;
        const pct = Math.min(99, Math.round((loaded / total) * 100));
        report({ phase: 'loading', label: 'Descargando modelo', percent: pct });
        controller.enqueue(value);
      },
      cancel(reason) {
        try {
          reader.cancel(reason);
        } catch {
          // ignore
        }
      },
    });

    return new Response(stream, {
      headers: res.headers,
      status: res.status,
      statusText: res.statusText,
    });
  };

  const resolvedDevice = device || 'wasm';

  featureExtractionPipeline = await pipeline('feature-extraction', modelId, {
    device: resolvedDevice,
  });

  currentConfig = { modelId, device: resolvedDevice };
  if (report) report({ phase: 'loading', label: 'Modelo listo', percent: 100 });

  return featureExtractionPipeline;
}

self.addEventListener('message', async (event) => {
  const data = event.data || {};
  const { type, requestId, payload } = data;

  try {
    if (type === 'status') {
      postResponse(requestId, true, {
        ready: Boolean(featureExtractionPipeline),
        config: currentConfig,
      });
      return;
    }

    if (type === 'clearCache') {
      featureExtractionPipeline = null;
      currentConfig = { modelId: null, device: null };
      postResponse(requestId, true, { cleared: true });
      return;
    }

    if (type === 'init') {
      const modelId = payload?.modelId || 'Xenova/multilingual-e5-large';
      const device = payload?.device || 'wasm';

      postProgress(requestId, {
        phase: 'loading',
        message: 'Cargando modelo…',
      });
      await ensurePipeline({
        modelId,
        device,
        reportProgress: (p) => postProgress(requestId, p),
      });
      postResponse(requestId, true, { ready: true, config: currentConfig });
      return;
    }

    if (type === 'embed') {
      const modelId =
        payload?.modelId ||
        currentConfig.modelId ||
        'Xenova/multilingual-e5-large';
      const device = payload?.device || currentConfig.device || 'wasm';
      const texts = payload?.texts;

      if (!Array.isArray(texts) || texts.length === 0) {
        postResponse(requestId, false, null, {
          message: '`texts` debe ser un array no vacío',
        });
        return;
      }

      const pipe = await ensurePipeline({
        modelId,
        device,
        reportProgress: (p) => postProgress(requestId, p),
      });

      const embeddings = [];
      for (let i = 0; i < texts.length; i++) {
        postProgress(requestId, {
          phase: 'running',
          index: i,
          total: texts.length,
          percent: Math.round(((i + 1) / texts.length) * 100),
        });

        const output = await pipe(texts[i], {
          pooling: 'mean',
          normalize: true,
        });

        const vector = Array.isArray(output) ? output : output?.data;
        embeddings.push(toPlainArray(vector));
      }

      postResponse(requestId, true, {
        modelId: currentConfig.modelId,
        device: currentConfig.device,
        embeddings,
      });
      return;
    }

    postResponse(requestId, false, null, {
      message: `Tipo de mensaje desconocido: ${type}`,
    });
  } catch (err) {
    postResponse(requestId, false, null, {
      message: err?.message || String(err),
      name: err?.name,
      stack: err?.stack,
    });
  }
});
