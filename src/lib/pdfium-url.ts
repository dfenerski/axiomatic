export interface PdfiumUrlParams {
  path: string
  page: number
  width: number
  dpr?: number
}

export function buildPdfiumUrl(params: PdfiumUrlParams, os: string): string {
  const { path, page, width, dpr = 1 } = params
  const base = os === 'android' ? 'http://pdfium.localhost' : 'pdfium://localhost'
  const encoded = encodeURIComponent(path)
  return `${base}/render?path=${encoded}&page=${page}&width=${width}&dpr=${dpr}`
}
