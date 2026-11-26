import { readFile } from "node:fs/promises"
import { join } from "node:path"
import type { PDFDocumentProxy } from "pdfjs-dist"

class LocalPdfResources {
  async fetch({ kind, filename }: { kind: string; filename: string }) {
    const folder = kind === "cMapUrl" ? "cmaps" : kind === "standardFontDataUrl" ? "standard_fonts" : null
    if (!folder || !/^[\w-]+\.(?:bcmap|pfb|ttf)$/iu.test(filename)) throw Error("无效的 PDF 字体资源")
    return new Uint8Array(await readFile(join(process.cwd(), "node_modules", "pdfjs-dist", folder, filename)))
  }
}

export async function withPdfDocument<T>(bytes: Buffer, read: (pdf: PDFDocumentProxy) => Promise<T>): Promise<T> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs")
  const loading = getDocument({
    data: new Uint8Array(bytes),
    disableFontFace: true,
    useSystemFonts: true,
    useWorkerFetch: false,
    useWasm: false,
    BinaryDataFactory: LocalPdfResources,
  })
  try {
    return await read(await loading.promise)
  } finally {
    await loading.destroy()
  }
}
