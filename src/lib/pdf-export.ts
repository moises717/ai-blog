/**
 * PDF Export Module utilizando el motor nativo del navegador.
 * Soporta oklch, Tailwind v4 y mantiene alta resolución.
 */

import { inferTitle } from "@/lib/utils";
import { editorInstance } from "@/store/editor-store";

// Estilos base para la impresión (puedes usar clases de Tailwind aquí si las inyectas)
const PRINT_STYLES = `
  @media print {
    @page { size: A4; margin: 20mm; }
    body { font-family: sans-serif; color: #1a1a1a; }
    pre { 
      background: #1e1e1e !important; 
      color: #d4d4d4 !important; 
      padding: 1rem; 
      border-radius: 8px;
      white-space: pre-wrap;
    }
    img { max-width: 100%; height: auto; border-radius: 8px; }
    .token.keyword { color: #07a; } /* Ejemplo de colores para código */
  }
`;

interface ExportOptions {
  title?: string;
  markdown?: string;
}

/**
 * Exporta el contenido actual del editor o los datos proporcionados a PDF.
 * Si se proporciona title/markdown, los usa directamente (modo readonly).
 * Si no, obtiene el contenido del editorInstance (modo edición).
 */
export async function exportToPdf(options?: ExportOptions): Promise<void> {
  let title: string;
  let editorElement: Element | null;

  if (options?.title && options?.markdown) {
    // Modo readonly: usar los datos proporcionados
    title = options.title;
    editorElement = document.querySelector(".milkdown .ProseMirror");
  } else {
    // Modo edición: obtener del editorInstance
    const crepe = editorInstance.get();
    if (!crepe) return;

    const rawMarkdown = await crepe.getMarkdown();
    title = inferTitle(rawMarkdown);
    editorElement = document.querySelector(".milkdown .ProseMirror");
  }

  if (!editorElement) return;

  // 1. Crear un Iframe oculto
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!iframeDoc) return;

  // 2. Inyectar el contenido y los estilos actuales del sitio
  // Esto es clave: copiamos todos los <style> y <link> para que oklch() funcione
  const headContent = Array.from(
    document.head.querySelectorAll("style, link[rel='stylesheet']")
  )
    .map((node) => node.outerHTML)
    .join("");

  const formattedDate = new Intl.DateTimeFormat("es", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date());

  iframeDoc.write(`
    <html>
      <head>
        <title>${title}</title>
        ${headContent}
        <style>${PRINT_STYLES}</style>
      </head>
      <body>
        <div style="padding: 20px;">
          <h1 style="border-bottom: 2px solid #eee; padding-bottom: 10px;">${title}</h1>
          <p style="color: #666; font-size: 0.8rem;">${formattedDate}</p>
          <div class="milkdown">
            <div class="ProseMirror">
              ${editorElement.innerHTML}
            </div>
          </div>
        </div>
      </body>
    </html>
  `);
  iframeDoc.close();

  // 3. Esperar a que las imágenes carguen antes de imprimir
  const images = iframeDoc.querySelectorAll("img");
  const imagePromises = Array.from(images).map((img) => {
    if (img.complete) return Promise.resolve();
    return new Promise((resolve) => {
      img.onload = resolve;
      img.onerror = resolve;
    });
  });

  await Promise.all(imagePromises);

  // 4. Disparar la impresión
  setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    // Eliminar el iframe después de cerrar el diálogo de impresión
    setTimeout(() => document.body.removeChild(iframe), 1000);
  }, 500);
}
