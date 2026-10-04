// Adapted from deepseek-harness. MIT license: ./DeepSeek-LICENSE.txt
/** Build-owned, same-version PDF.js resources; all binary assets are decoded locally. */
import workerSource from 'pdfjs-dist/build/pdf.worker.min.mjs?raw'

export { workerSource }

/** Resource kinds used by PDF.js 6's BinaryDataFactory requests. */
export type PdfAssetKind = 'cMapUrl' | 'standardFontDataUrl' | 'wasmUrl'

/** Original filenames mapped to base64, in the same PDF.js version as the worker. */
export type PdfAssetMap = Readonly<Record<PdfAssetKind, Readonly<Record<string, string>>>>

import assets from 'virtual:kunyu-pdf-assets'

/** Public methods required by PDF.js's BinaryDataFactory option. */
export interface PdfBinaryDataFactory {
  /** @param request - PDF.js resource kind and exact filename. @returns independent transferable resource bytes. */
  fetch(request: { readonly kind: PdfAssetKind; readonly filename: string }): Promise<Uint8Array>
}

/**
 * Capture this build's binary assets without network fallbacks.
 * @param resources - build-inlined base64 resources, read only when a PDF is opened.
 * @returns the constructor passed to PDF.js getDocument.
 */
export function createPdfBinaryDataFactory(resources: PdfAssetMap = assets): new () => PdfBinaryDataFactory {
  return class implements PdfBinaryDataFactory {
    fetch({ kind, filename }: { readonly kind: PdfAssetKind; readonly filename: string }): Promise<Uint8Array> {
      return Promise.resolve().then(() => {
        const files = resources[kind]
        const data = Object.hasOwn(files, filename) ? files[filename] : undefined
        if (data === undefined) throw new Error(`PDF.js asset is not bundled: ${kind}/${filename}`)
        return Uint8Array.from(atob(data), character => character.charCodeAt(0))
      })
    }
  }
}
