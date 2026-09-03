import * as fs from 'fs'
import PDFDocument from 'pdfkit'

import { resolveExportDisplayProfile } from '../../export/contacts/contactResolver'
import { buildGroupNicknameIdCandidates } from '../../export/contacts/groupNickname'
import { appendTransferDesc, isTransferExportContent, resolveTransferDesc } from '../../export/parsers/transferParser'
import { formatTimestamp } from '../../export/utils/timestamp'
import { parallelLimit } from '../../export/utils/parallelLimit'
import type { ExportDisplayProfile, ExportOptions, ExportProgress, ExportTaskControl, MediaExportItem } from '../../export/types'
import { wcdbService } from '../../wcdbService'
import type { ExportContext } from '../core/ExportContext'

export class PdfFormatter {
  constructor(private exportService: ExportContext) {}

  public async export(
    sessionId: string,
    outputPath: string,
    options: ExportOptions,
    onProgress?: (progress: ExportProgress) => void,
    control?: ExportTaskControl
  ): Promise<{ success: boolean; error?: string }> {
    let abortWrite: (() => void) | undefined

    try {
      this.exportService.throwIfStopRequested(control)
      const conn = await this.exportService.ensureConnected()
      if (!conn.success || !conn.cleanedWxid) return { success: false, error: conn.error }

      const cleanedMyWxid = conn.cleanedWxid
      const isGroup = sessionId.includes('@chatroom')
      const rawMyWxid = this.exportService.getConfiguredMyWxid()
      const sessionInfo = await this.exportService.getContactInfo(sessionId)
      const myInfo = await this.exportService.getContactInfo(cleanedMyWxid)

      const contactCache = new Map<string, { success: boolean; contact?: any; error?: string }>()
      const getContactCached = async (username: string) => {
        if (contactCache.has(username)) return contactCache.get(username)!
        const result = await wcdbService.getContact(username)
        contactCache.set(username, result)
        return result
      }

      onProgress?.({
        current: 0,
        total: 100,
        currentSession: sessionInfo.displayName,
        phase: 'preparing'
      })

      const collectParams = this.exportService.resolveCollectParams(options)
      const collectProgressReporter = this.exportService.createCollectProgressReporter(sessionInfo.displayName, onProgress, 5)
      const collected = await this.exportService.collectMessages(
        sessionId,
        cleanedMyWxid,
        options.dateRange,
        options.senderUsername,
        collectParams.mode,
        collectParams.targetMediaTypes,
        control,
        collectProgressReporter
      )
      const totalMessages = collected.rows.length

      if (collected.error) return { success: false, error: collected.error }
      if (totalMessages === 0) {
        return { success: false, error: await this.exportService.buildNoMessagesError(sessionId, collected) }
      }
      await this.exportService.createWeliveRawOutputPlaceholder(outputPath, control)

      await this.exportService.hydrateEmojiCaptionsForMessages(sessionId, collected.rows, control)
      await this.exportService.resolveQuotedMessagesForExport(collected.rows, sessionId)

      const voiceMessages = options.exportVoiceAsText
        ? collected.rows.filter((msg: any) => msg.localType === 34)
        : []
      const voiceMessagesNeedingTranscript = this.exportService.getVoiceMessagesNeedingTranscript(sessionId, voiceMessages)
      if (voiceMessagesNeedingTranscript.length > 0) {
        await this.exportService.ensureVoiceModel(onProgress)
      }

      const senderUsernames = new Set<string>()
      let senderScanIndex = 0
      for (const msg of collected.rows) {
        if ((senderScanIndex++ & 0x7f) === 0) this.exportService.throwIfStopRequested(control)
        if (msg.senderUsername) senderUsernames.add(msg.senderUsername)
      }
      senderUsernames.add(sessionId)
      await this.exportService.preloadContacts(senderUsernames, contactCache)

      const groupNicknameCandidates = isGroup
        ? buildGroupNicknameIdCandidates([
          ...Array.from(senderUsernames.values()),
          ...collected.rows.map((msg: any) => msg.senderUsername),
          cleanedMyWxid,
          rawMyWxid
        ])
        : []
      const groupNicknamesMap = isGroup
        ? await this.exportService.getGroupNicknamesForRoom(sessionId, groupNicknameCandidates)
        : new Map<string, string>()

      const sortedMessages = collected.rows
      const { mediaRootDir, mediaRelativePrefix } = this.exportService.getMediaLayout(outputPath, options)
      const mediaMessages = this.exportService.collectMediaMessagesForExport(sortedMessages, options)
      const mediaCache = new Map<string, MediaExportItem | null>()
      const mediaDirCache = new Set<string>()
      const beforeMediaDoneFiles = this.exportService.getMediaDoneFilesCount()

      if (mediaMessages.length > 0) {
        await this.exportService.preloadMediaLookupCaches(sessionId, mediaMessages, {
          exportImages: options.exportImages,
          exportVideos: options.exportVideos
        }, control)
        const voiceMediaMessages = mediaMessages.filter((msg: any) => msg.localType === 34)
        if (voiceMediaMessages.length > 0) {
          await this.exportService.preloadVoiceWavCache(sessionId, voiceMediaMessages, control)
        }

        onProgress?.({
          current: 25,
          total: 100,
          currentSession: sessionInfo.displayName,
          phase: 'exporting-media',
          phaseProgress: 0,
          phaseTotal: mediaMessages.length,
          phaseLabel: this.exportService.formatMediaPhaseLabel(0, mediaMessages.length, beforeMediaDoneFiles),
          ...this.exportService.getMediaTelemetrySnapshot(),
          estimatedTotalMessages: totalMessages
        })

        const mediaConcurrency = this.exportService.getClampedConcurrency(options.exportConcurrency)
        let mediaExported = 0
        await parallelLimit(mediaMessages, mediaConcurrency, async (msg: any) => {
          this.exportService.throwIfStopRequested(control)
          const mediaKey = this.exportService.getMediaCacheKey(msg)
          if (!mediaCache.has(mediaKey)) {
            const mediaItem = await this.exportService.exportMediaForMessage(msg, sessionId, mediaRootDir, mediaRelativePrefix, {
              exportImages: options.exportImages,
              exportVoices: options.exportVoices,
              exportVideos: options.exportVideos,
              exportEmojis: options.exportEmojis,
              exportFiles: options.exportFiles,
              maxFileSizeMb: options.maxFileSizeMb,
              exportVoiceAsText: options.exportVoiceAsText,
              exportConflictStrategy: options.exportConflictStrategy,
              includeVideoPoster: false,
              dirCache: mediaDirCache,
              control
            })
            mediaCache.set(mediaKey, mediaItem)
          }
          mediaExported++
          if (mediaExported % 5 === 0 || mediaExported === mediaMessages.length) {
            onProgress?.({
              current: 25,
              total: 100,
              currentSession: sessionInfo.displayName,
              phase: 'exporting-media',
              phaseProgress: mediaExported,
              phaseTotal: mediaMessages.length,
              phaseLabel: this.exportService.formatMediaPhaseLabel(mediaExported, mediaMessages.length, beforeMediaDoneFiles),
              ...this.exportService.getMediaTelemetrySnapshot()
            })
          }
        })
      }

      await this.exportService.preloadWeliveRawEmojiMedia(
        sortedMessages,
        mediaCache,
        mediaRootDir,
        mediaRelativePrefix,
        options,
        control,
        onProgress,
        sessionInfo.displayName,
        20
      )
      const fileOnlyExportFailure = this.exportService.buildFileOnlyExportFailure(options, mediaMessages, beforeMediaDoneFiles)
      if (fileOnlyExportFailure) return fileOnlyExportFailure

      const voiceTranscriptMap = new Map<string, string>()
      if (voiceMessages.length > 0) {
        await this.exportService.preloadVoiceWavCache(sessionId, voiceMessagesNeedingTranscript, control)
        onProgress?.({
          current: 45,
          total: 100,
          currentSession: sessionInfo.displayName,
          phase: 'exporting-voice',
          phaseProgress: 0,
          phaseTotal: voiceMessages.length,
          phaseLabel: `语音转文字 0/${voiceMessages.length}`,
          estimatedTotalMessages: totalMessages
        })

        let voiceTranscribed = 0
        await parallelLimit(voiceMessages, 4, async (msg: any) => {
          this.exportService.throwIfStopRequested(control)
          const transcript = await this.exportService.transcribeVoice(
            sessionId,
            String(msg.localId),
            msg.createTime,
            msg.senderUsername,
            msg.serverIdRaw || msg.serverId
          )
          voiceTranscriptMap.set(this.exportService.getStableMessageKey(msg), transcript)
          voiceTranscribed++
          onProgress?.({
            current: 45,
            total: 100,
            currentSession: sessionInfo.displayName,
            phase: 'exporting-voice',
            phaseProgress: voiceTranscribed,
            phaseTotal: voiceMessages.length,
            phaseLabel: `语音转文字 ${voiceTranscribed}/${voiceMessages.length}`
          })
        })
      }

      onProgress?.({
        current: 60,
        total: 100,
        currentSession: sessionInfo.displayName,
        phase: 'writing',
        estimatedTotalMessages: totalMessages,
        collectedMessages: totalMessages,
        exportedMessages: 0
      })

      const doc = new PDFDocument({
        size: 'A4',
        margin: 44,
        bufferPages: false,
        info: {
          Title: `${sessionInfo.displayName || sessionId} - 聊天记录`,
          Author: '聊迹'
        }
      })
      const pdfFontName = this.exportService.loadPdfFont(doc)

      await this.exportService.recordCreatedFileBeforeWrite(outputPath, control)
      const target = this.exportService.createAtomicWriteTarget(outputPath)
      abortWrite = target.abort
      const finished = new Promise<void>((resolve, reject) => {
        target.stream.once('finish', resolve)
        target.stream.once('error', reject)
        doc.once('error', reject)
      })
      doc.pipe(target.stream)

      const contentWidth = () => doc.page.width - doc.page.margins.left - doc.page.margins.right
      const pageBottom = () => doc.page.height - doc.page.margins.bottom
      const ensureSpace = (height: number) => {
        if (doc.y + height > pageBottom()) doc.addPage()
      }
      const writeText = (text: string, size: number, color: string, textOptions?: PDFKit.Mixins.TextOptions) => {
        doc.font(pdfFontName).fontSize(size).fillColor(color).text(String(text || ''), textOptions)
      }
      const measureTextHeight = (text: string, size: number, textOptions?: PDFKit.Mixins.TextOptions) => {
        doc.font(pdfFontName).fontSize(size)
        return doc.heightOfString(String(text || ''), textOptions)
      }
      const pdfLayout = {
        titleFontSize: 20,
        subtitleFontSize: 10.5,
        messageMetaFontSize: 10,
        messageBodyFontSize: 12,
        mediaHintFontSize: 10,
        messageLineGap: 4,
        metaLineGap: 1,
        cardPaddingX: 14,
        cardPaddingTop: 10,
        cardPaddingBottom: 13,
        metaBodyGap: 8,
        cardGap: 14,
        imageTopGap: 10,
        imageBottomGap: 14,
        imageMaxWidth: 360,
        imageMaxHeight: 240
      }

      const exportMeta = this.exportService.getExportMeta(sessionId, sessionInfo, isGroup)
      writeText(sessionInfo.displayName || sessionId, pdfLayout.titleFontSize, '#111827', {
        width: contentWidth(),
        lineGap: 2
      })
      doc.moveDown(0.35)
      writeText(
        `${totalMessages} 条消息 · ${isGroup ? '群聊' : '私聊'} · ${formatTimestamp(exportMeta.chatlab.exportedAt)}`,
        pdfLayout.subtitleFontSize,
        '#667085',
        { width: contentWidth(), lineGap: 1 }
      )
      doc.moveDown(1.3)

      const senderProfileCache = new Map<string, ExportDisplayProfile>()
      for (let i = 0; i < totalMessages; i++) {
        if ((i & 0x7f) === 0) this.exportService.throwIfStopRequested(control)
        const msg = sortedMessages[i]
        const mediaKey = this.exportService.getMediaCacheKey(msg)
        const mediaItem = mediaCache.has(mediaKey)
          ? mediaCache.get(mediaKey) || null
          : await this.exportService.resolveWeliveRawMediaItem(msg, mediaRootDir, mediaRelativePrefix, options, control)
        const isInlinePdfMedia = mediaItem?.kind === 'image' || mediaItem?.kind === 'emoji'
        const shouldUseTranscript = msg.localType === 34 && options.exportVoiceAsText
        const formattedMediaPath = mediaItem?.relativePath
          ? this.exportService.formatExportMediaPath(mediaItem.relativePath, options, 'text')
          : ''
        const contentValue = shouldUseTranscript
          ? this.exportService.formatPlainExportContent(
            msg.content,
            msg.localType,
            options,
            voiceTranscriptMap.get(this.exportService.getStableMessageKey(msg)),
            cleanedMyWxid,
            msg.senderUsername,
            msg.isSend,
            msg.emojiCaption
          )
          : ((msg.localType !== 47 ? formattedMediaPath : '')
            || this.exportService.formatPlainExportContent(
              msg.content,
              msg.localType,
              options,
              voiceTranscriptMap.get(this.exportService.getStableMessageKey(msg)),
              cleanedMyWxid,
              msg.senderUsername,
              msg.isSend,
              msg.emojiCaption
            ))

        let enrichedContentValue = contentValue
        if (isTransferExportContent(contentValue) && msg.content) {
          const transferDesc = await resolveTransferDesc(
            msg.content,
            cleanedMyWxid,
            groupNicknamesMap,
            async (username: string) => {
              const contact = await getContactCached(username)
              if (contact.success && contact.contact) {
                return contact.contact.remark || contact.contact.nickName || contact.contact.alias || username
              }
              return username
            }
          )
          if (transferDesc) enrichedContentValue = appendTransferDesc(contentValue, transferDesc)
        }

        const quotedReplyDisplay = await this.exportService.resolveQuotedReplyDisplayWithNames({
          content: msg.content,
          isGroup,
          displayNamePreference: options.displayNamePreference,
          getContact: getContactCached,
          groupNicknamesMap,
          cleanedMyWxid,
          rawMyWxid,
          myDisplayName: myInfo.displayName || cleanedMyWxid
        })
        if (quotedReplyDisplay) {
          enrichedContentValue = this.exportService.buildQuotedReplyText(quotedReplyDisplay)
        }

        const appendedLinkContent = quotedReplyDisplay
          ? null
          : this.exportService.formatLinkCardExportText(msg.content, msg.localType, 'append-url')
        if (appendedLinkContent) enrichedContentValue = appendedLinkContent

        let senderRole: string
        if (isGroup) {
          const senderProfileKey = `${msg.isSend ? cleanedMyWxid : (msg.senderUsername || cleanedMyWxid)}::${msg.isSend ? '1' : '0'}`
          let senderProfile = senderProfileCache.get(senderProfileKey)
          if (!senderProfile) {
            senderProfile = await resolveExportDisplayProfile(
              msg.isSend ? cleanedMyWxid : (msg.senderUsername || cleanedMyWxid),
              options.displayNamePreference,
              getContactCached,
              groupNicknamesMap,
              msg.isSend ? (myInfo.displayName || cleanedMyWxid) : (msg.senderUsername || ''),
              msg.isSend ? [rawMyWxid, cleanedMyWxid] : []
            )
            senderProfileCache.set(senderProfileKey, senderProfile)
          }
          senderRole = senderProfile.displayName
        } else if (msg.isSend) {
          senderRole = '我'
        } else {
          const contactDetail = await getContactCached(sessionId)
          if (contactDetail.success && contactDetail.contact) {
            const senderNickname = contactDetail.contact.nickName || sessionId
            const senderRemark = contactDetail.contact.remark || ''
            senderRole = senderRemark || senderNickname
          } else {
            senderRole = sessionInfo.displayName || sessionId
          }
        }

        const typeName = this.exportService.getMessageTypeName(msg.localType, msg.content)
        const metaText = `${i + 1}. ${formatTimestamp(msg.createTime)} · ${senderRole} · ${typeName}`
        const shouldHideInlineMediaPath = Boolean(
          isInlinePdfMedia &&
          formattedMediaPath &&
          String(enrichedContentValue || '').trim() === formattedMediaPath
        )
        const messageText = shouldHideInlineMediaPath
          ? ''
          : String(enrichedContentValue || `[${typeName}]`)
        const cardX = doc.page.margins.left - 6
        const cardWidth = contentWidth() + 12
        const textX = cardX + pdfLayout.cardPaddingX
        const textWidth = cardWidth - pdfLayout.cardPaddingX * 2
        const metaHeight = measureTextHeight(metaText, pdfLayout.messageMetaFontSize, {
          width: textWidth,
          lineGap: pdfLayout.metaLineGap
        })
        const textHeight = messageText
          ? measureTextHeight(messageText, pdfLayout.messageBodyFontSize, {
            width: textWidth,
            lineGap: pdfLayout.messageLineGap
          })
          : 0
        const bodyGap = messageText ? pdfLayout.metaBodyGap : 0
        const blockHeight = Math.max(
          messageText ? 76 : 42,
          pdfLayout.cardPaddingTop + metaHeight + bodyGap + textHeight + pdfLayout.cardPaddingBottom
        )
        ensureSpace(Math.min(pageBottom() - doc.page.margins.top, blockHeight + pdfLayout.cardGap))

        const blockTop = doc.y
        const blockPage = doc.page
        const blockHeightOnPage = Math.min(blockHeight, pageBottom() - blockTop)
        doc.save()
          .roundedRect(cardX, blockTop, cardWidth, blockHeightOnPage, 5)
          .fill(msg.isSend ? '#f0fdf4' : '#f8fafc')
          .restore()
        doc.x = textX
        doc.y = blockTop + pdfLayout.cardPaddingTop
        writeText(metaText, pdfLayout.messageMetaFontSize, '#667085', {
          width: textWidth,
          lineGap: pdfLayout.metaLineGap
        })
        if (messageText) {
          doc.y += pdfLayout.metaBodyGap
          doc.x = textX
          writeText(messageText, pdfLayout.messageBodyFontSize, '#111827', {
            width: textWidth,
            lineGap: pdfLayout.messageLineGap
          })
        }
        const blockBottom = blockTop + blockHeightOnPage
        if (doc.page === blockPage && doc.y < blockBottom) doc.y = blockBottom

        if (mediaItem?.relativePath) {
          const absoluteMediaPath = this.exportService.getAbsoluteExportMediaPath(outputPath, mediaItem.relativePath)
          const canEmbedImage = isInlinePdfMedia &&
            this.exportService.canEmbedPdfImage(absoluteMediaPath) &&
            fs.existsSync(absoluteMediaPath)
          if (canEmbedImage) {
            try {
              ensureSpace(pdfLayout.imageTopGap + pdfLayout.imageMaxHeight + pdfLayout.imageBottomGap)
              const imageTop = doc.y + pdfLayout.imageTopGap
              const imageWidth = Math.min(pdfLayout.imageMaxWidth, textWidth)
              doc.image(absoluteMediaPath, textX, imageTop, {
                fit: [imageWidth, pdfLayout.imageMaxHeight]
              })
              doc.y = imageTop + pdfLayout.imageMaxHeight + pdfLayout.imageBottomGap
            } catch (error) {
              console.warn('[Export] PDF 图片嵌入失败:', error)
              doc.x = textX
              writeText(`${mediaItem.kind === 'emoji' ? '表情包' : '图片'}文件已导出：${formattedMediaPath}`, pdfLayout.mediaHintFontSize, '#667085', {
                width: textWidth,
                lineGap: 2
              })
            }
          } else if (isInlinePdfMedia && !messageText.includes(formattedMediaPath)) {
            doc.x = textX
            writeText(`${mediaItem.kind === 'emoji' ? '表情包' : '图片'}文件已导出：${formattedMediaPath}`, pdfLayout.mediaHintFontSize, '#667085', {
              width: textWidth,
              lineGap: 2
            })
          } else if (!isInlinePdfMedia && !messageText.includes(formattedMediaPath)) {
            doc.x = textX
            writeText(`媒体文件：${formattedMediaPath}`, pdfLayout.mediaHintFontSize, '#667085', {
              width: textWidth,
              lineGap: 2
            })
          }
        }

        doc.moveDown(0.45)
        if ((i + 1) % 200 === 0) {
          const progress = 60 + Math.floor((i + 1) / sortedMessages.length * 30)
          onProgress?.({
            current: progress,
            total: 100,
            currentSession: sessionInfo.displayName,
            phase: 'writing',
            estimatedTotalMessages: totalMessages,
            collectedMessages: totalMessages,
            exportedMessages: i + 1
          })
        }
      }

      this.exportService.throwIfStopRequested(control)
      doc.end()
      await finished
      await target.commit()
      abortWrite = undefined

      onProgress?.({
        current: 100,
        total: 100,
        currentSession: sessionInfo.displayName,
        phase: 'complete',
        estimatedTotalMessages: totalMessages,
        collectedMessages: totalMessages,
        exportedMessages: totalMessages,
        writtenFiles: 1
      })
      return { success: true }
    } catch (error) {
      abortWrite?.()
      if (this.exportService.isStopError(error)) return { success: false, error: '导出任务已停止' }
      if (this.exportService.isPauseError(error)) return { success: false, error: '导出任务已暂停' }
      if (error instanceof Error && (error.message.includes('EBUSY') || error.message.includes('locked'))) {
        return { success: false, error: '文件已经打开，请关闭后再导出' }
      }
      return { success: false, error: String(error) }
    }
  }
}
