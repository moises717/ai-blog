/* Web Worker: embeddings (Transformers.js v2.17.2 - Xenova)
   Versión estable con soporte completo de progreso de descarga.
   Se usa la versión 2.x que es la más robusta para fetch en workers.
*/

import {
  pipeline,
  env,
} from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';

let featureExtractionPipeline = null;
let currentConfig = {
  modelId: null,
  device: null,
};

// Tracking de archivos siendo descargados para evitar duplicados
const downloadTracker = new Map();

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

// Función para calcular el progreso total de todas las descargas activas
function calculateTotalProgress() {
  if (downloadTracker.size === 0) return null;

  let totalBytes = 0;
  let loadedBytes = 0;

  for (const [, info] of downloadTracker) {
    totalBytes += info.total;
    loadedBytes += info.loaded;
  }

  if (totalBytes === 0) return null;
  return Math.min(99, Math.round((loadedBytes / totalBytes) * 100));
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

  // Configuración para Xenova/transformers v2
  env.allowRemoteModels = true;
  env.useBrowserCache = true;
  env.allowLocalModels = false;

  // Limpiar tracker de descargas anteriores
  downloadTracker.clear();

  // Interceptar fetch ANTES de la descarga del modelo
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : input?.url || '';

    // Solo trackear descargas de assets del modelo
    const isModelAsset = /huggingface|hf\.co|jsdelivr|onnxruntime|\\.wasm($|\\?)|\\.onnx($|\\?)|\\.bin($|\\?)|\\.json($|\\?)/i.test(url);

    if (!isModelAsset || !report) {
      return originalFetch(input, init);
    }

    const response = await originalFetch(input, init);

    // Clonar headers porque vamos a crear un nuevo Response
    const contentLength = response.headers.get('content-length');
    const total = contentLength ? parseInt(contentLength, 10) : 0;

    if (!response.body || total === 0) {
      // Sin content-length, solo reportar que está descargando
      report({ phase: 'loading', label: 'Descargando modelo', percent: null });
      return response;
    }

    // Usar URL como key única para este archivo
    const fileKey = url.split('/').pop() || url;
    downloadTracker.set(fileKey, { loaded: 0, total });

    const reader = response.body.getReader();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await reader.read();

            if (done) {
              // Marcar este archivo como completado
              const info = downloadTracker.get(fileKey);
              if (info) {
                info.loaded = info.total;
              }

              const totalPct = calculateTotalProgress();
              if (totalPct !== null) {
                report({
                  phase: 'loading',
                  label: 'Descargando modelo',
                  percent: totalPct
                });
              }

              controller.close();
              break;
            }

            // Actualizar progreso
            const info = downloadTracker.get(fileKey);
            if (info && value) {
              info.loaded += value.byteLength;
            }

            const totalPct = calculateTotalProgress();
            if (totalPct !== null) {
              report({
                phase: 'loading',
                label: 'Descargando modelo',
                percent: totalPct
              });
            }

            controller.enqueue(value);
          }
        } catch (err) {
          controller.error(err);
        }
      },
      cancel(reason) {
        reader.cancel(reason);
        downloadTracker.delete(fileKey);
      }
    });

    return new Response(stream, {
      headers: response.headers,
      status: response.status,
      statusText: response.statusText,
    });
  };

  // Mostrar estado inicial
  if (report) {
    report({ phase: 'loading', label: 'Iniciando descarga', percent: 0 });
  }

  const resolvedDevice = device || 'wasm';

  try {
    // En v2.x usamos las opciones de progreso nativas también
    featureExtractionPipeline = await pipeline('feature-extraction', modelId, {
      device: resolvedDevice,
      progress_callback: (progressInfo) => {
        // Callback nativo de transformers.js para progreso de descarga
        if (report && progressInfo) {
          const { status, progress, file } = progressInfo;

          if (status === 'downloading' || status === 'progress') {
            const pct = typeof progress === 'number' ? Math.round(progress) : null;
            report({
              phase: 'loading',
              label: file ? `Descargando ${file}` : 'Descargando modelo',
              percent: pct
            });
          } else if (status === 'done') {
            report({
              phase: 'loading',
              label: 'Modelo listo',
              percent: 100
            });
          }
        }
      }
    });

    currentConfig = { modelId, device: resolvedDevice };

    // Restaurar fetch original
    globalThis.fetch = originalFetch;

    if (report) {
      report({ phase: 'loading', label: 'Modelo listo', percent: 100 });
    }

    return featureExtractionPipeline;
  } catch (err) {
    // Restaurar fetch en caso de error
    globalThis.fetch = originalFetch;
    throw err;
  }
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
      downloadTracker.clear();
      postResponse(requestId, true, { cleared: true });
      return;
    }

    if (type === 'init') {
      const modelId =
        payload?.modelId || 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
      const device = payload?.device || 'wasm';

      postProgress(requestId, {
        phase: 'loading',
        label: 'Iniciando carga del modelo',
        percent: 0,
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
        'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
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
