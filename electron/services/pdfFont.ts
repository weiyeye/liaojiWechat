import * as fs from 'fs'
import * as path from 'path'

export interface PdfFontCandidate {
  filePath: string
  source: 'bundled' | 'system'
  family?: string
}

interface PdfFontDocument {
  registerFont(name: string, src: string, family?: string): unknown
  font(name: string): unknown
  widthOfString(text: string): number
}

interface PdfFontLogger {
  info(message: string): void
  warn(message: string, error?: unknown): void
}

/**
 * PDFKit 的内置字体不包含中文。优先使用将来可随包提供的 Noto 字体，
 * 再回退到各操作系统通常自带的中文字体。
 */
export function createPdfFontCandidates(options: {
  resourceRoots: Array<string | undefined>
  platform: NodeJS.Platform
  windowsRoot?: string
}): PdfFontCandidate[] {
  const candidates: PdfFontCandidate[] = []

  for (const resourceRoot of options.resourceRoots) {
    const normalizedRoot = String(resourceRoot || '').trim()
    if (!normalizedRoot) continue
    candidates.push(
      {
        filePath: path.join(normalizedRoot, 'fonts', 'weport.ttf'),
        source: 'bundled'
      },
      {
        filePath: path.join(normalizedRoot, 'fonts', 'NotoSansSC-Regular.otf'),
        source: 'bundled'
      },
      {
        filePath: path.join(normalizedRoot, 'fonts', 'annual-report', 'NotoSerifSC-Var.ttf'),
        source: 'bundled'
      }
    )
  }

  if (options.platform === 'win32') {
    const windowsRoot = String(options.windowsRoot || '').trim()
    if (windowsRoot) {
      candidates.push(
        { filePath: path.join(windowsRoot, 'Fonts', 'simhei.ttf'), source: 'system' },
        { filePath: path.join(windowsRoot, 'Fonts', 'Deng.ttf'), source: 'system' },
        { filePath: path.join(windowsRoot, 'Fonts', 'simkai.ttf'), source: 'system' },
        { filePath: path.join(windowsRoot, 'Fonts', 'msyh.ttc'), source: 'system', family: 'Microsoft YaHei' },
        { filePath: path.join(windowsRoot, 'Fonts', 'simsun.ttc'), source: 'system', family: 'SimSun' }
      )
    }
  } else if (options.platform === 'darwin') {
    candidates.push(
      { filePath: '/System/Library/Fonts/PingFang.ttc', source: 'system', family: 'PingFang SC' },
      { filePath: '/System/Library/Fonts/STHeiti Light.ttc', source: 'system', family: 'STHeitiSC-Light' },
      { filePath: '/System/Library/Fonts/Supplemental/Arial Unicode.ttf', source: 'system' },
      { filePath: '/Library/Fonts/Arial Unicode.ttf', source: 'system' }
    )
  } else {
    candidates.push(
      { filePath: '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', source: 'system', family: 'Noto Sans CJK SC' },
      { filePath: '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.otf', source: 'system' },
      { filePath: '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.otf', source: 'system' },
      { filePath: '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc', source: 'system', family: 'WenQuanYi Zen Hei' }
    )
  }

  const seen = new Set<string>()
  return candidates.filter(({ filePath, family }) => {
    const normalizedPath = options.platform === 'win32' ? filePath.toLowerCase() : filePath
    const key = `${normalizedPath}\u0000${family || ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function loadPdfFont(
  doc: PdfFontDocument,
  candidates: PdfFontCandidate[],
  options: {
    existsSync?: (filePath: string) => boolean
    logger?: PdfFontLogger
  } = {}
): { fontName: string; candidate: PdfFontCandidate } {
  const existsSync = options.existsSync || fs.existsSync
  const logger = options.logger || console
  const loadErrors: string[] = []

  for (let index = 0; index < candidates.length; index++) {
    const candidate = candidates[index]
    if (!existsSync(candidate.filePath)) continue

    const fontName = `WeportPdfCjk${index}`
    try {
      doc.registerFont(fontName, candidate.filePath, candidate.family)
      doc.font(fontName)
      const probeWidth = doc.widthOfString('中文测试 ABC 123')
      if (!Number.isFinite(probeWidth) || probeWidth <= 0) {
        throw new Error('字体预检失败')
      }
      logger.info(`[Export] PDF 中文字体已加载 source=${candidate.source} path=${candidate.filePath}`)
      return { fontName, candidate }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      loadErrors.push(`${path.basename(candidate.filePath)}: ${message}`)
      logger.warn(`[Export] PDF 中文字体加载失败 source=${candidate.source} path=${candidate.filePath}:`, error)
    }
  }

  const detail = loadErrors.length > 0 ? `（${loadErrors.join('；')}）` : ''
  throw new Error(`PDF 中文字体资源加载失败，请安装系统中文字体或重新安装应用后重试${detail}`)
}
