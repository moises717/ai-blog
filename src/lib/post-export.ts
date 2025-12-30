import { exportToPdf } from "@/lib/pdf-export";

function sanitizeFilename(name: string): string {
  return (
    String(name || "documento")
      .replace(/[\\/:*?"<>|]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80) || "documento"
  );
}

function downloadTextFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function exportPostAsMarkdown(title: string, rawMarkdown: string): void {
  const filename = `${sanitizeFilename(title)}.md`;
  downloadTextFile(filename, rawMarkdown, "text/markdown;charset=utf-8");
}

/**
 * Exporta el post actual como PDF usando el motor nativo del navegador.
 */
export async function exportPostAsPdf(
  title: string,
  rawMarkdown: string
): Promise<void> {
  await exportToPdf({ title, markdown: rawMarkdown });
}
