import { app } from 'electron'
import { existsSync, mkdirSync, statSync, statfsSync, unlinkSync, createWriteStream, openSync, writeSync, closeSync, renameSync } from 'fs'
import { join } from 'path'
import * as https from 'https'
import * as http from 'http'
import { ConfigService } from './config'

// Sherpa-onnx 类型定义
type OfflineRecognizer = any
type OfflineStream = any

type ModelInfo = {
  name: string
  files: {
    model: string
    tokens: string
  }
  sizeBytes: number
  sizeLabel: string
}

type DownloadProgress = {
  modelName: string
  downloadedBytes: number
  totalBytes?: number
  percent?: number
  speed?: number
}

type DownloadResult = {
  success: boolean
  modelDir?: string
  switchedFromChinesePath?: boolean
  originalModelDir?: string
  modelPath?: string
  tokensPath?: string
  error?: string
}

type DownloadTask = {
  promise: Promise<DownloadResult>
  controller: AbortController
  listeners: Set<(progress: DownloadProgress) => void>
}

const SENSEVOICE_MODEL: ModelInfo = {
  name: 'SenseVoiceSmall',
  files: {
    model: 'model.int8.onnx',
    tokens: 'tokens.txt'
  },
  sizeBytes: 245_000_000,
  sizeLabel: '245 MB'
}

const MODEL_DOWNLOAD_URLS = {
  model: 'https://modelscope.cn/models/pengzhendong/sherpa-onnx-sense-voice-zh-en-ja-ko-yue/resolve/master/model.int8.onnx',
  tokens: 'https://modelscope.cn/models/pengzhendong/sherpa-onnx-sense-voice-zh-en-ja-ko-yue/resolve/master/tokens.txt'
}

const MIN_MODEL_BYTES = 200_000_000
const MIN_TOKENS_BYTES = 10_000
const CHINESE_PATH_PATTERN = /[\u3400-\u9fff]/
const DOWNLOAD_INACTIVITY_TIMEOUT_MS = 30_000
const DOWNLOAD_MIN_FREE_SPACE_BYTES = SENSEVOICE_MODEL.sizeBytes + 100 * 1024 * 1024

export class VoiceTranscribeService {
  private configService = new ConfigService()
  private downloadTasks = new Map<string, DownloadTask>()
  private recognizer: OfflineRecognizer | null = null
  private isInitializing = false

  private buildTranscribeWorkerEnv(): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...process.env }
    const platform = process.platform === 'win32' ? 'win' : process.platform
    const platformPkg = `sherpa-onnx-${platform}-${process.arch}`
    const candidates = [
      join(__dirname, '..', 'node_modules', platformPkg),
      join(__dirname, 'node_modules', platformPkg),
      join(process.cwd(), 'node_modules', platformPkg),
      process.resourcesPath ? join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', platformPkg) : ''
    ].filter((item): item is string => Boolean(item) && existsSync(item))

    if (process.platform === 'darwin') {
      const key = 'DYLD_LIBRARY_PATH'
      const existing = env[key] || ''
      const merged = [...candidates, ...existing.split(':').filter(Boolean)]
      env[key] = Array.from(new Set(merged)).join(':')
      if (candidates.length === 0) {
        console.warn(`[VoiceTranscribe] 未找到 ${platformPkg} 目录，可能导致语音引擎加载失败`)
      }
    } else if (process.platform === 'linux') {
      const key = 'LD_LIBRARY_PATH'
      const existing = env[key] || ''
      const merged = [...candidates, ...existing.split(':').filter(Boolean)]
      env[key] = Array.from(new Set(merged)).join(':')
      if (candidates.length === 0) {
        console.warn(`[VoiceTranscribe] 未找到 ${platformPkg} 目录，可能导致语音引擎加载失败`)
      }
    } else if (process.platform === 'win32') {
      // Windows: 把 sherpa-onnx 所在目录加到 PATH，否则 native module 找不到依赖
      const existing = env['PATH'] || ''
      const merged = [...candidates, ...existing.split(';').filter(Boolean)]
      env['PATH'] = Array.from(new Set(merged)).join(';')
      if (candidates.length === 0) {
        console.warn(`[VoiceTranscribe] 未找到 ${platformPkg} 目录，可能导致语音引擎加载失败`)
      }
    }

    return env
  }

  private hasChinesePath(value: string): boolean {
    return CHINESE_PATH_PATTERN.test(value)
  }

  private getDefaultModelDir(): string {
    return join(app.getPath('documents'), 'Weport', 'models', 'sensevoice')
  }

  private getAsciiModelDir(): string {
    const candidates = process.platform === 'win32'
      ? [
          process.env.PUBLIC ? join(process.env.PUBLIC, 'Documents', 'Weport', 'models', 'sensevoice') : '',
          process.env.ProgramData ? join(process.env.ProgramData, 'Weport', 'models', 'sensevoice') : '',
          'C:\\Weport\\models\\sensevoice'
        ]
      : [
          join('/tmp', 'Weport', 'models', 'sensevoice')
        ]

    return candidates.find((item) => item && !this.hasChinesePath(item)) || candidates[candidates.length - 1]
  }

  private isLegacyForeignModelDir(value: string): boolean {
    return /(^|[\\/])deviooexport([\\/]|$)/i.test(value)
  }

  private resolveModelDirInfo(options: { persist?: boolean } = { persist: true }): { dir: string; switchedFromChinese: boolean; originalDir?: string } {
    const configuredValue = (this.configService.get('whisperModelDir') as string | undefined)?.trim() || ''
    // Weport 必须拥有独立模型目录。旧版本若写入了参考项目路径，只迁移配置，
    // 不读取、复制或删除另一个项目的模型文件。
    const configured = this.isLegacyForeignModelDir(configuredValue) ? '' : configuredValue
    const preferred = configured || this.getDefaultModelDir()

    if (!this.hasChinesePath(preferred)) {
      if (options.persist !== false && configuredValue && configuredValue !== preferred) {
        this.configService.set('whisperModelDir', preferred)
      }
      return { dir: preferred, switchedFromChinese: false }
    }

    const asciiDir = this.getAsciiModelDir()
    if (options.persist !== false && configured !== asciiDir) {
      this.configService.set('whisperModelDir', asciiDir)
    }
    console.warn(`[VoiceTranscribe] Model path contains Chinese characters, switch to ASCII path: ${asciiDir}`)
    return { dir: asciiDir, switchedFromChinese: true, originalDir: preferred }
  }

  private ensureDownloadDiskSpace(modelDir: string): void {
    let availableBytes: number
    try {
      const stats = statfsSync(modelDir)
      availableBytes = Number(stats.bavail) * Number(stats.bsize)
    } catch (error) {
      console.warn('[VoiceTranscribe] 无法读取模型目录剩余空间，继续尝试下载:', error)
      return
    }

    if (availableBytes < DOWNLOAD_MIN_FREE_SPACE_BYTES) {
      throw new Error('模型下载空间不足，请至少预留 350 MB 可用磁盘空间')
    }
  }

  private getModelFilesStatus(modelPath: string, tokensPath: string): {
    exists: boolean
    valid: boolean
    modelSize: number
    tokensSize: number
    error?: string
  } {
    const modelExists = existsSync(modelPath)
    const tokensExists = existsSync(tokensPath)

    if (!modelExists || !tokensExists) {
      return { exists: false, valid: false, modelSize: 0, tokensSize: 0 }
    }

    const modelSize = statSync(modelPath).size
    const tokensSize = statSync(tokensPath).size
    const valid = modelSize >= MIN_MODEL_BYTES && tokensSize >= MIN_TOKENS_BYTES
    return {
      exists: true,
      valid,
      modelSize,
      tokensSize,
      error: valid ? undefined : '模型文件不完整，请重新下载模型'
    }
  }

  /**
   * 检查模型状态
   */
  async getModelStatus(): Promise<{
    success: boolean
    exists?: boolean
    valid?: boolean
    modelDir?: string
    switchedFromChinesePath?: boolean
    originalModelDir?: string
    modelPath?: string
    tokensPath?: string
    sizeBytes?: number
    error?: string
  }> {
    try {
      // 状态检查同时完成旧版跨项目路径的一次性配置迁移。
      const modelDirInfo = this.resolveModelDirInfo()
      const modelPath = join(modelDirInfo.dir, SENSEVOICE_MODEL.files.model)
      const tokensPath = join(modelDirInfo.dir, SENSEVOICE_MODEL.files.tokens)
      const status = this.getModelFilesStatus(modelPath, tokensPath)

      if (!status.exists) {
        return {
          success: true,
          exists: false,
          valid: false,
          modelDir: modelDirInfo.dir,
          switchedFromChinesePath: modelDirInfo.switchedFromChinese,
          originalModelDir: modelDirInfo.originalDir,
          modelPath,
          tokensPath
        }
      }

      const totalSize = status.modelSize + status.tokensSize

      return {
        success: true,
        exists: true,
        valid: status.valid,
        modelDir: modelDirInfo.dir,
        switchedFromChinesePath: modelDirInfo.switchedFromChinese,
        originalModelDir: modelDirInfo.originalDir,
        modelPath,
        tokensPath,
        sizeBytes: totalSize,
        error: status.error
      }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  /**
   * 下载模型文件
   */
  async downloadModel(
    onProgress?: (progress: DownloadProgress) => void
  ): Promise<DownloadResult> {
    const cacheKey = 'sensevoice'
    const pending = this.downloadTasks.get(cacheKey)
    if (pending) {
      if (onProgress) pending.listeners.add(onProgress)
      return pending.promise
    }

    const controller = new AbortController()
    const listeners = new Set<(progress: DownloadProgress) => void>()
    if (onProgress) listeners.add(onProgress)
    const reportProgress = (progress: DownloadProgress) => {
      for (const listener of listeners) {
        try {
          listener(progress)
        } catch (error) {
          console.warn('[VoiceTranscribe] 下载进度回调失败:', error)
        }
      }
    }

    const promise = Promise.resolve().then(async (): Promise<DownloadResult> => {
      const modelDirInfo = this.resolveModelDirInfo()
      const modelDir = modelDirInfo.dir
      const modelPath = join(modelDir, SENSEVOICE_MODEL.files.model)
      const tokensPath = join(modelDir, SENSEVOICE_MODEL.files.tokens)
      const modelTempPath = `${modelPath}.part`
      const tokensTempPath = `${tokensPath}.part`

      try {
        const existingStatus = this.getModelFilesStatus(modelPath, tokensPath)
        if (existingStatus.exists && existingStatus.valid) {
          return {
            success: true,
            modelDir,
            switchedFromChinesePath: modelDirInfo.switchedFromChinese,
            originalModelDir: modelDirInfo.originalDir,
            modelPath,
            tokensPath
          }
        }

        if (!existsSync(modelDir)) {
          mkdirSync(modelDir, { recursive: true })
        }
        this.ensureDownloadDiskSpace(modelDir)

        // 初始进度
        reportProgress({
          modelName: SENSEVOICE_MODEL.name,
          downloadedBytes: 0,
          totalBytes: SENSEVOICE_MODEL.sizeBytes,
          percent: 0
        })

        // 下载模型文件 (80% 权重)
        console.info('[VoiceTranscribe] 开始下载模型文件...')
        await this.downloadToFile(
          MODEL_DOWNLOAD_URLS.model,
          modelTempPath,
          'model',
          (downloaded, total, speed) => {
            const percent = total ? (downloaded / total) * 80 : 0
            reportProgress({
              modelName: SENSEVOICE_MODEL.name,
              downloadedBytes: downloaded,
              totalBytes: SENSEVOICE_MODEL.sizeBytes,
              percent,
              speed
            })
          },
          controller.signal
        )

        // 下载 tokens 文件 (20% 权重)
        console.info('[VoiceTranscribe] 开始下载 tokens 文件...')
        await this.downloadToFile(
          MODEL_DOWNLOAD_URLS.tokens,
          tokensTempPath,
          'tokens',
          (downloaded, total, speed) => {
            const modelSize = existsSync(modelTempPath) ? statSync(modelTempPath).size : 0
            const percent = total ? 80 + (downloaded / total) * 20 : 80
            reportProgress({
              modelName: SENSEVOICE_MODEL.name,
              downloadedBytes: modelSize + downloaded,
              totalBytes: SENSEVOICE_MODEL.sizeBytes,
              percent,
              speed
            })
          },
          controller.signal
        )

        if (controller.signal.aborted) {
          throw new Error('模型下载已取消')
        }

        const downloadedStatus = this.getModelFilesStatus(modelTempPath, tokensTempPath)
        if (!downloadedStatus.exists || !downloadedStatus.valid) {
          throw new Error(downloadedStatus.error || '模型文件下载不完整，请重试')
        }

        // 只有两个临时文件都校验通过后才替换正式文件，避免异常中断留下可见的残缺模型。
        if (existsSync(modelPath)) unlinkSync(modelPath)
        if (existsSync(tokensPath)) unlinkSync(tokensPath)
        renameSync(modelTempPath, modelPath)
        renameSync(tokensTempPath, tokensPath)

        const installedStatus = this.getModelFilesStatus(modelPath, tokensPath)
        if (!installedStatus.exists || !installedStatus.valid) {
          throw new Error(installedStatus.error || '模型安装校验失败，请重新下载')
        }

        reportProgress({
          modelName: SENSEVOICE_MODEL.name,
          downloadedBytes: installedStatus.modelSize + installedStatus.tokensSize,
          totalBytes: installedStatus.modelSize + installedStatus.tokensSize,
          percent: 100,
          speed: 0
        })
        console.info('[VoiceTranscribe] 模型下载完成')
        return {
          success: true,
          modelDir,
          switchedFromChinesePath: modelDirInfo.switchedFromChinese,
          originalModelDir: modelDirInfo.originalDir,
          modelPath,
          tokensPath
        }
      } catch (error) {
        try {
          if (existsSync(modelTempPath)) unlinkSync(modelTempPath)
          if (existsSync(tokensTempPath)) unlinkSync(tokensTempPath)
          const installedStatus = this.getModelFilesStatus(modelPath, tokensPath)
          if (!installedStatus.valid) {
            if (existsSync(modelPath)) unlinkSync(modelPath)
            if (existsSync(tokensPath)) unlinkSync(tokensPath)
          }
        } catch { }
        return {
          success: false,
          error: controller.signal.aborted
            ? '模型下载已取消'
            : (error instanceof Error ? error.message : String(error))
        }
      } finally {
        this.downloadTasks.delete(cacheKey)
      }
    })

    this.downloadTasks.set(cacheKey, { promise, controller, listeners })
    return promise
  }

  cancelModelDownload(): boolean {
    const task = this.downloadTasks.get('sensevoice')
    if (!task) return false
    task.controller.abort()
    return true
  }

  /**
   * 转写 WAV 音频数据
   */
  async transcribeWavBuffer(
    wavData: Buffer,
    onPartial?: (text: string) => void,
    languages?: string[]
  ): Promise<{ success: boolean; transcript?: string; error?: string }> {
    return new Promise(async (resolve) => {
      try {
        const modelDirInfo = this.resolveModelDirInfo()
        let modelPath = join(modelDirInfo.dir, SENSEVOICE_MODEL.files.model)
        let tokensPath = join(modelDirInfo.dir, SENSEVOICE_MODEL.files.tokens)
        let modelStatus = this.getModelFilesStatus(modelPath, tokensPath)

        if ((!modelStatus.exists || !modelStatus.valid) && modelDirInfo.switchedFromChinese) {
          const downloadResult = await this.downloadModel()
          if (!downloadResult.success) {
            resolve({ success: false, error: downloadResult.error || '模型下载失败' })
            return
          }

          modelPath = downloadResult.modelPath || modelPath
          tokensPath = downloadResult.tokensPath || tokensPath
          modelStatus = this.getModelFilesStatus(modelPath, tokensPath)
        }

        if (!modelStatus.exists) {
          resolve({ success: false, error: '模型文件不存在，请先下载模型' })
          return
        }

        if (!modelStatus.valid) {
          resolve({ success: false, error: modelStatus.error || '模型文件不完整，请重新下载模型' })
          return
        }

        let supportedLanguages = languages
        if (!supportedLanguages || supportedLanguages.length === 0) {
          supportedLanguages = this.configService.get('transcribeLanguages')
          if (!supportedLanguages || supportedLanguages.length === 0) {
            supportedLanguages = ['zh', 'yue']
          }
        }

        const { fork } = require('child_process')
        const workerPath = join(__dirname, 'transcribeWorker.js')

        const worker = fork(workerPath, [], {
          env: this.buildTranscribeWorkerEnv(),
          stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
          serialization: 'advanced'
        })
        worker.send({
          modelPath,
          tokensPath,
          wavData,
          sampleRate: 16000,
          languages: supportedLanguages
        })

        let settled = false
        const finish = (result: { success: boolean; transcript?: string; error?: string }) => {
          if (settled) return
          settled = true
          resolve(result)
        }

        worker.on('message', (msg: any) => {
          if (msg.type === 'partial') {
            onPartial?.(msg.text)
          } else if (msg.type === 'final') {
            finish({
              success: true,
              transcript: typeof msg.text === 'string' ? msg.text : ''
            })
          } else if (msg.type === 'error') {
            const error = typeof msg.error === 'string' && msg.error.trim()
              ? msg.error
              : '语音转写引擎执行失败'
            console.error('[VoiceTranscribe] Worker 错误:', error)
            finish({ success: false, error })
          }
        })

        worker.on('error', (err: Error) => {
          const error = err?.message || String(err) || '语音转写 Worker 启动失败'
          console.error('[VoiceTranscribe] Worker 进程错误:', error)
          finish({ success: false, error })
        })
        worker.on('exit', (code: number | null, signal: string | null) => {
          if (settled) return

          const isNativeCrash = signal === 'SIGSEGV' || code === -1073741819 || code === 3221225477
          if (isNativeCrash) {
            console.error(`[VoiceTranscribe] Worker 底层运行库异常退出，code=${code}, signal=${signal}`)
            finish({ success: false, error: 'SEGFAULT_ERROR' })
            return
          }

          if (signal) {
            const error = `语音转写 Worker 被终止（${signal}）`
            console.error(`[VoiceTranscribe] ${error}`)
            finish({ success: false, error })
            return
          }

          if (code !== 0) {
            const error = `语音转写 Worker 异常退出（code=${code}）`
            console.error(`[VoiceTranscribe] ${error}`)
            finish({ success: false, error })
            return
          }

          finish({ success: false, error: '语音转写 Worker 未返回结果' })
        })

      } catch (error) {
        resolve({ success: false, error: String(error) })
      }
    })
  }

  /**
   * 下载文件 (支持多线程)
   */
  private async downloadToFile(
    url: string,
    targetPath: string,
    fileName: string,
    onProgress?: (downloaded: number, total?: number, speed?: number) => void,
    signal?: AbortSignal
  ): Promise<void> {
    if (signal?.aborted) throw new Error('模型下载已取消')
    if (existsSync(targetPath)) {
      unlinkSync(targetPath)
    }

    console.info(`[VoiceTranscribe] 准备下载 ${fileName}: ${url}`)

    // 1. 探测支持情况
    let probeResult
    try {
      probeResult = await this.probeUrl(url, 5, signal)
    } catch (err) {
      if (signal?.aborted) throw err
      console.warn(`[VoiceTranscribe] ${fileName} 探测失败，使用单线程`, err)
      return this.downloadSingleThread(url, targetPath, fileName, onProgress, 5, signal)
    }

    const { totalSize, acceptRanges, finalUrl } = probeResult

    // 如果文件太小 (< 2MB) 或者不支持 Range，使用单线程
    if (totalSize < 2 * 1024 * 1024 || !acceptRanges) {
      return this.downloadSingleThread(finalUrl, targetPath, fileName, onProgress, 5, signal)
    }

    console.info(`[VoiceTranscribe] ${fileName} 开始多线程下载 (4 线程), 大小: ${(totalSize / 1024 / 1024).toFixed(2)} MB`)

    const threadCount = 4
    const chunkSize = Math.ceil(totalSize / threadCount)
    const fd = openSync(targetPath, 'w')

    let downloadedTotal = 0
    let lastDownloaded = 0
    let lastTime = Date.now()
    let speed = 0

    const speedInterval = setInterval(() => {
      const now = Date.now()
      const duration = (now - lastTime) / 1000
      if (duration > 0) {
        speed = (downloadedTotal - lastDownloaded) / duration
        lastDownloaded = downloadedTotal
        lastTime = now
        onProgress?.(downloadedTotal, totalSize, speed)
      }
    }, 1000)

    try {
      const promises = []
      for (let i = 0; i < threadCount; i++) {
        const start = i * chunkSize
        const end = i === threadCount - 1 ? totalSize - 1 : (i + 1) * chunkSize - 1

        promises.push(this.downloadChunk(finalUrl, fd, start, end, (bytes) => {
          downloadedTotal += bytes
        }, signal))
      }

      await Promise.all(promises)
      // Final progress update
      onProgress?.(totalSize, totalSize, 0)
      console.info(`[VoiceTranscribe] ${fileName} 多线程下载完成`)
    } catch (err) {
      console.error(`[VoiceTranscribe] ${fileName} 多线程下载失败:`, err)
      throw err
    } finally {
      clearInterval(speedInterval)
      closeSync(fd)
    }
  }

  private async probeUrl(url: string, remainingRedirects = 5, signal?: AbortSignal): Promise<{ totalSize: number, acceptRanges: boolean, finalUrl: string }> {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : http
      const options = {
        method: 'GET',
        signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://modelscope.cn/',
          'Range': 'bytes=0-0'
        }
      }

      const req = protocol.get(url, options, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode || 0)) {
          const location = res.headers.location
          if (location && remainingRedirects > 0) {
            const nextUrl = new URL(location, url).href
            res.destroy()
            this.probeUrl(nextUrl, remainingRedirects - 1, signal).then(resolve).catch(reject)
            return
          }
        }

        if (res.statusCode !== 206 && res.statusCode !== 200) {
          reject(new Error(`Probe failed: HTTP ${res.statusCode}`))
          return
        }

        const contentRange = res.headers['content-range']
        let totalSize = 0
        if (contentRange) {
          const parts = contentRange.split('/')
          totalSize = parseInt(parts[parts.length - 1], 10)
        } else {
          totalSize = parseInt(res.headers['content-length'] || '0', 10)
        }

        const acceptRanges = res.headers['accept-ranges'] === 'bytes' || !!contentRange
        resolve({ totalSize, acceptRanges, finalUrl: url })
        res.destroy()
      })
      req.setTimeout(DOWNLOAD_INACTIVITY_TIMEOUT_MS, () => {
        req.destroy(new Error('模型下载连接超时，请检查网络后重试'))
      })
      req.on('error', reject)
    })
  }

  private async downloadChunk(url: string, fd: number, start: number, end: number, onData: (bytes: number) => void, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : http
      const options = {
        signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://modelscope.cn/',
          'Range': `bytes=${start}-${end}`
        }
      }

      const req = protocol.get(url, options, (res) => {
        if (res.statusCode !== 206) {
          reject(new Error(`Chunk download failed: HTTP ${res.statusCode}`))
          return
        }

        let currentOffset = start
        res.on('data', (chunk: Buffer) => {
          try {
            writeSync(fd, chunk, 0, chunk.length, currentOffset)
            currentOffset += chunk.length
            onData(chunk.length)
          } catch (err) {
            reject(err)
            res.destroy()
          }
        })

        res.on('end', () => {
          const expectedBytes = end - start + 1
          const receivedBytes = currentOffset - start
          if (receivedBytes !== expectedBytes) {
            reject(new Error(`模型分片下载不完整：期望 ${expectedBytes} 字节，实际 ${receivedBytes} 字节`))
            return
          }
          resolve()
        })
        res.on('error', reject)
      })
      req.setTimeout(DOWNLOAD_INACTIVITY_TIMEOUT_MS, () => {
        req.destroy(new Error('模型分片下载超时，请检查网络后重试'))
      })
      req.on('error', reject)
    })
  }

  private async downloadSingleThread(url: string, targetPath: string, fileName: string, onProgress?: (downloaded: number, total?: number, speed?: number) => void, remainingRedirects = 5, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : http
      const options = {
        signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://modelscope.cn/'
        }
      }

      const request = protocol.get(url, options, (response) => {
        if ([301, 302, 303, 307, 308].includes(response.statusCode || 0)) {
          const location = response.headers.location
          if (location && remainingRedirects > 0) {
            const nextUrl = new URL(location, url).href
            response.destroy()
            this.downloadSingleThread(nextUrl, targetPath, fileName, onProgress, remainingRedirects - 1, signal).then(resolve).catch(reject)
            return
          }
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Fallback download failed: HTTP ${response.statusCode}`))
          return
        }

        const totalBytes = Number(response.headers['content-length'] || 0) || undefined
        let downloadedBytes = 0
        let lastDownloaded = 0
        let lastTime = Date.now()
        let speed = 0

        const speedInterval = setInterval(() => {
          const now = Date.now()
          const duration = (now - lastTime) / 1000
          if (duration > 0) {
            speed = (downloadedBytes - lastDownloaded) / duration
            lastDownloaded = downloadedBytes
            lastTime = now
            onProgress?.(downloadedBytes, totalBytes, speed)
          }
        }, 1000)

        const writer = createWriteStream(targetPath)
        response.on('data', (chunk) => {
          downloadedBytes += chunk.length
        })

        writer.on('finish', () => {
          clearInterval(speedInterval)
          writer.close()
          if (totalBytes !== undefined && downloadedBytes !== totalBytes) {
            reject(new Error(`模型下载不完整：期望 ${totalBytes} 字节，实际 ${downloadedBytes} 字节`))
            return
          }
          resolve()
        })

        writer.on('error', (err) => {
          clearInterval(speedInterval)
          // 确保在错误情况下也关闭文件句柄
          writer.destroy()
          reject(err)
        })

        response.on('error', (err) => {
          clearInterval(speedInterval)
          // 确保在响应错误时也关闭文件句柄
          writer.destroy()
          reject(err)
        })

        response.pipe(writer)
      })
      request.setTimeout(DOWNLOAD_INACTIVITY_TIMEOUT_MS, () => {
        request.destroy(new Error('模型下载连接超时，请检查网络后重试'))
      })
      request.on('error', reject)
    })
  }

  dispose() {
    for (const task of this.downloadTasks.values()) {
      task.controller.abort()
    }
    this.downloadTasks.clear()
    if (this.recognizer) {
      this.recognizer = null
    }
  }
}

export const voiceTranscribeService = new VoiceTranscribeService()
