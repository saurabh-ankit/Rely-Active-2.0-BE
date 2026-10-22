import { existsSync } from 'node:fs'
import puppeteer from 'puppeteer-core'

// Chromium-based browsers puppeteer can drive, by platform (servers, then developer machines)
const BROWSER_CANDIDATES: Record<string, string[]> = {
  linux: ['/usr/bin/chromium-browser', '/usr/bin/chromium', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable'],
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ],
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ],
}

/**
 * Uses the system Chromium (as Rely Assist does). PUPPETEER_EXECUTABLE_PATH wins when it exists;
 * otherwise the first installed browser for this platform, so local machines work without setup.
 */
let resolvedExecutablePath: string | undefined
const executablePath = (): string => {
  if (resolvedExecutablePath) return resolvedExecutablePath
  const configured = process.env.PUPPETEER_EXECUTABLE_PATH
  const candidates = [configured, ...(BROWSER_CANDIDATES[process.platform] ?? [])].filter((path): path is string =>
    Boolean(path),
  )
  const found = candidates.find((path) => existsSync(path))
  if (!found) {
    throw new Error(
      `No Chrome/Chromium found for PDF generation (tried ${candidates.join(', ')}). Install one or set PUPPETEER_EXECUTABLE_PATH.`,
    )
  }
  resolvedExecutablePath = found
  return found
}

export const escapeHtml = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

export const formatInr = (value: number): string =>
  `₹${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export const formatDate = (value: Date | string | null | undefined): string => {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(String(value).length === 10 ? `${value}T00:00:00Z` : value)
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })
}

async function toDataUrl(url: string): Promise<string | null> {
  if (url.startsWith('data:image/')) return url
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const type = res.headers.get('content-type') || 'image/png'
    return `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`
  } catch {
    return null
  }
}

/**
 * Renders an HTML document to an A4 PDF. Images are inlined as data URLs first so a
 * slow or private logo URL can't stall or break the render.
 */
export async function renderPdf(html: string, images: Record<string, string | null | undefined> = {}): Promise<Buffer> {
  let doc = html
  for (const [placeholder, url] of Object.entries(images)) {
    const data = url ? await toDataUrl(url) : null
    doc = doc.replaceAll(placeholder, data ?? '')
  }
  const browser = await puppeteer.launch({
    executablePath: executablePath(),
    headless: true,
    pipe: true,
    timeout: 30_000,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-first-run'],
  })
  try {
    const page = await browser.newPage()
    await page.setContent(doc, { waitUntil: 'load' })
    // Page size and margins come from the template's @page rule.
    const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true })
    return Buffer.from(pdf)
  } finally {
    await browser.close()
  }
}

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
]
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

const belowHundred = (n: number) => (n < 20 ? ONES[n]! : `${TENS[Math.floor(n / 10)]} ${ONES[n % 10]}`.trim())
const belowThousand = (n: number) =>
  [n >= 100 ? `${ONES[Math.floor(n / 100)]} Hundred` : '', belowHundred(n % 100)].filter(Boolean).join(' ')

/** Indian-system words for a rupee amount: 10005.34 → "Rupees Ten Thousand Five and Thirty Four Paise Only". */
export function amountInWords(value: number): string {
  const rupees = Math.floor(Math.abs(value))
  const paise = Math.round((Math.abs(value) - rupees) * 100)
  const parts: string[] = []
  let n = rupees
  for (const [size, label] of [
    [10_000_000, 'Crore'],
    [100_000, 'Lakh'],
    [1_000, 'Thousand'],
  ] as const) {
    const count = Math.floor(n / size)
    if (count) {
      // Over 999 crore, the crore count itself is spelled in lakh/thousand terms.
      parts.push(`${count >= 1000 ? amountInWordsPlain(count) : belowThousand(count)} ${label}`)
      n %= size
    }
  }
  if (n) parts.push(belowThousand(n))
  const words = `Rupees ${parts.join(' ') || 'Zero'}`
  return `${words}${paise ? ` and ${belowHundred(paise)} Paise` : ''} Only`
}

const amountInWordsPlain = (n: number) =>
  amountInWords(n)
    .replace(/^Rupees /, '')
    .replace(/ Only$/, '')
