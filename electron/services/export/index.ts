import { ExportContext } from './core/ExportContext'
import { ExportOrchestrator } from './core/ExportOrchestrator'
import { ExportStatsService } from './stats/ExportStatsService'
import { chatService } from '../chatService'
import { parallelLimit } from './utils/parallelLimit'
import { ExportOptions, ExportProgress, ExportTaskControl, ExportStatsResult, VoiceTranscriptPreparationResult } from './types'

export * from './types'
export * from './utils/parallelLimit'

export class ExportServiceFacade {
  public context: ExportContext
  public orchestrator: ExportOrchestrator
  public statsService: ExportStatsService

  constructor() {
    this.context = new ExportContext()
    this.orchestrator = new ExportOrchestrator(this.context)
    this.statsService = new ExportStatsService(this.context)
  }

  setRuntimeConfig(config: any): void {
    return this.context.setRuntimeConfig(config)
  }

  setWeliveRawExportPaths(paths: Record<string, string> | null | undefined): void {
    return this.context.setWeliveRawExportPaths(paths)
  }

  clearWeliveRawExportPaths(): void {
    return this.context.clearWeliveRawExportPaths()
  }

  async exportSessions(
    sessionIds: string[],
    outputDir: string,
    options: ExportOptions,
    onProgress?: (progress: ExportProgress) => void,
    control?: ExportTaskControl
  ) {
    return this.orchestrator.exportSessions(sessionIds, outputDir, options, onProgress, control)
  }

  async exportSessionToChatLab(
    sessionId: string,
    outputPath: string,
    options: ExportOptions,
    onProgress?: (progress: ExportProgress) => void,
    control?: ExportTaskControl
  ) {
    return this.orchestrator.exportSessionToChatLab(sessionId, outputPath, options, onProgress, control)
  }

  async getExportStats(
    sessionIds: string[],
    options: ExportOptions
  ): Promise<ExportStatsResult> {
    return this.statsService.getExportStats(sessionIds, options)
  }

  /**
   * 在创建导出文件前完成当前范围内的语音转写，正式导出只读取转写缓存。
   */
  async prepareVoiceTranscripts(
    sessionIds: string[],
    options: ExportOptions,
    onProgress?: (progress: ExportProgress) => void,
    control?: ExportTaskControl
  ): Promise<VoiceTranscriptPreparationResult> {
    const emptyResult = { total: 0, processed: 0, converted: 0, failed: 0 }
    try {
      const conn = await this.context.ensureConnected()
      if (!conn.success || !conn.cleanedWxid) {
        return { success: false, ...emptyResult, error: conn.error || '数据库连接失败' }
      }

      const normalizedSessionIds = this.context.normalizeSessionIds(sessionIds)
      if (normalizedSessionIds.length === 0) return { success: true, ...emptyResult }

      const stats = await this.statsService.getExportStats(normalizedSessionIds, options)
      const total = Math.max(0, Math.floor(Number(stats.needTranscribeCount || 0)))
      if (total === 0) return { success: true, ...emptyResult }

      await this.context.ensureVoiceModel(onProgress)
      let processed = 0
      let converted = 0
      let failed = 0
      const displayNames = new Map(stats.sessions.map((session) => [session.sessionId, session.displayName] as const))

      onProgress?.({
        current: 0,
        total,
        currentSession: '正在准备语音数据…',
        phase: 'exporting-voice',
        phaseProgress: 0,
        phaseTotal: total,
        phaseLabel: `语音转文字 0/${total}`
      })

      for (const sessionId of normalizedSessionIds) {
        this.context.throwIfStopRequested(control)
        const collected = await this.context.collectMessages(
          sessionId,
          conn.cleanedWxid,
          options.dateRange,
          options.senderUsername,
          'media-fast',
          new Set([34]),
          control
        )
        if (collected.error) {
          throw new Error(collected.error)
        }

        const pendingMessages = this.context.getVoiceMessagesNeedingTranscript(sessionId, collected.rows)
        // 与 ChatService 的 12 条 WAV LRU 上限一致，避免预解码后尚未转写就被淘汰。
        const chunkSize = 12
        for (let offset = 0; offset < pendingMessages.length; offset += chunkSize) {
          this.context.throwIfStopRequested(control)
          const chunk = pendingMessages.slice(offset, offset + chunkSize)
          await this.context.preloadVoiceWavCache(sessionId, chunk, control)
          await parallelLimit(chunk, 4, async (message: any) => {
            this.context.throwIfStopRequested(control)
            const result = await chatService.getVoiceTranscript(
              sessionId,
              String(message.localId),
              Number(message.createTime),
              undefined,
              message.senderUsername || undefined,
              message.serverIdRaw || message.serverId
            )
            processed++
            if (result.success) converted++
            else failed++
            onProgress?.({
              current: Math.min(processed, total),
              total,
              currentSession: displayNames.get(sessionId) || sessionId,
              currentSessionId: sessionId,
              phase: 'exporting-voice',
              phaseProgress: Math.min(processed, total),
              phaseTotal: total,
              phaseLabel: `语音转文字 ${Math.min(processed, total)}/${total}`
            })
          })
        }
      }

      onProgress?.({
        current: total,
        total,
        currentSession: failed > 0 ? `${failed} 条语音转换失败` : '语音转换完成',
        phase: 'exporting-voice',
        phaseProgress: total,
        phaseTotal: total,
        phaseLabel: `语音转文字 ${total}/${total}`
      })
      // 转写缓存数量已变化，后续导出预检查必须重新计算待处理数。
      this.context.exportStatsCache.clear()
      return { success: true, total, processed, converted, failed }
    } catch (error) {
      if (this.context.isStopError(error)) {
        return { success: false, ...emptyResult, cancelled: true, error: '语音转换已取消' }
      }
      return { success: false, ...emptyResult, error: String((error as Error)?.message || error) }
    }
  }
}

export const exportService = new ExportServiceFacade()
