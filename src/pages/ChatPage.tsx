import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  BellOff,
  CalendarDays,
  CheckCheck,
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Info,
  Loader2,
  MapPin,
  MessageSquare,
  MessageSquareText,
  Mic,
  MoreHorizontal,
  Pause,
  Play,
  RefreshCw,
  Search,
  UserRound,
  Users,
  Video,
  X,
} from 'lucide-react'
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso'
import { Avatar } from '../components/Avatar'
import { VoiceTranscribeDialog } from '../components/VoiceTranscribeDialog'
import { renderTextWithEmoji } from '../utils/renderTextWithEmoji'
import './ChatPage.scss'

type SessionFilter = 'all' | 'private' | 'group' | 'official'
type SidebarSearchMode = 'session' | 'message'
type SidePanel = 'detail' | 'members' | null
type MessageViewMode = 'latest' | 'context' | 'date'

interface GroupMemberPanelEntry {
  username: string
  displayName: string
  avatarUrl?: string
  groupNickname?: string
  remark?: string
  isOwner?: boolean
  isFriend: boolean
  messageCount: number
}

interface ChatPageProps {
  onExportSession: (sessionId: string) => void
}

const PAGE_SIZE = 60
const MESSAGE_INDEX_BASE = 100_000
const SYSTEM_MESSAGE_TYPES = new Set([10000, 266287972401])
const voiceTranscriptCache = new Map<string, string>()

function rememberVoiceTranscript(key: string, transcript: string): void {
  if (!voiceTranscriptCache.has(key) && voiceTranscriptCache.size >= 1000) {
    const oldest = voiceTranscriptCache.keys().next().value
    if (oldest) voiceTranscriptCache.delete(oldest)
  }
  voiceTranscriptCache.set(key, transcript)
}

function toSeconds(timestamp: number): number {
  const value = Number(timestamp || 0)
  return value > 10_000_000_000 ? Math.floor(value / 1000) : Math.floor(value)
}

function messageKey(message: ChatMessageRecord): string {
  return message.messageKey || [
    message.serverIdRaw || message.serverId || 0,
    message.localId || 0,
    message.createTime || 0,
    message.sortSeq || 0,
    message.senderUsername || '',
    message.localType || 0,
  ].join(':')
}

function sortAndDedupeMessages(messages: ChatMessageRecord[]): ChatMessageRecord[] {
  const seen = new Set<string>()
  return [...messages]
    .sort((a, b) =>
      (toSeconds(a.createTime) - toSeconds(b.createTime)) ||
      (Number(a.sortSeq || 0) - Number(b.sortSeq || 0)) ||
      (Number(a.localId || 0) - Number(b.localId || 0)),
    )
    .filter((message) => {
      const key = messageKey(message)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

function sessionKind(sessionId: string): Exclude<SessionFilter, 'all'> {
  if (sessionId.endsWith('@chatroom')) return 'group'
  if (sessionId.startsWith('gh_')) return 'official'
  return 'private'
}

function formatSessionTime(timestamp: number): string {
  const seconds = toSeconds(timestamp)
  if (!seconds) return ''
  const date = new Date(seconds * 1000)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const pad = (value: number) => String(value).padStart(2, '0')
  if (day === today) return `${pad(date.getHours())}:${pad(date.getMinutes())}`
  if (day === today - 86_400_000) return '昨天'
  if (date.getFullYear() === now.getFullYear()) return `${date.getMonth() + 1}/${date.getDate()}`
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`
}

function formatMessageTime(timestamp: number): string {
  const date = new Date(toSeconds(timestamp) * 1000)
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function formatFullTime(timestamp?: number): string {
  if (!timestamp) return '—'
  return new Date(toSeconds(timestamp) * 1000).toLocaleString('zh-CN', { hour12: false })
}

function formatDateLabel(timestamp: number): string {
  const date = new Date(toSeconds(timestamp) * 1000)
  const now = new Date()
  const currentDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const targetDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  if (targetDay === currentDay) return '今天'
  if (targetDay === currentDay - 86_400_000) return '昨天'
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
}

function shouldShowDateDivider(message: ChatMessageRecord, previous?: ChatMessageRecord): boolean {
  if (!previous) return true
  const current = new Date(toSeconds(message.createTime) * 1000)
  const before = new Date(toSeconds(previous.createTime) * 1000)
  return current.getFullYear() !== before.getFullYear() ||
    current.getMonth() !== before.getMonth() ||
    current.getDate() !== before.getDate()
}

function formatFileSize(bytes?: number): string {
  const value = Number(bytes || 0)
  if (!value) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)))
  return `${(value / (1024 ** index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

function detectImageMime(base64: string): string {
  if (base64.startsWith('iVBOR')) return 'image/png'
  if (base64.startsWith('R0lGOD')) return 'image/gif'
  if (base64.startsWith('UklGR')) return 'image/webp'
  if (base64.startsWith('Qk')) return 'image/bmp'
  return 'image/jpeg'
}

function safeMediaUrl(value?: string): string | undefined {
  const url = String(value || '').trim()
  if (!url) return undefined
  if (/^(https?:|data:|weport-media:)/i.test(url)) return url
  return undefined
}

function Highlight({ text, keyword }: { text: string; keyword: string }) {
  const query = keyword.trim()
  if (!query) return <>{text}</>
  const index = text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase())
  if (index < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, index)}
      <mark>{text.slice(index, index + query.length)}</mark>
      {text.slice(index + query.length)}
    </>
  )
}

function ChatImage({
  sessionId,
  message,
  onPreview,
}: {
  sessionId: string
  message: ChatMessageRecord
  onPreview: (src: string) => void
}) {
  const fallback = safeMediaUrl(message.cdnThumbUrl || message.linkThumb || message.appMsgThumbUrl)
  const [src, setSrc] = useState<string | undefined>(fallback)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    void window.electronAPI.chat.getImageData(sessionId, String(message.localId), {
      imageMd5: message.imageMd5,
      imageDatName: message.imageDatName,
      createTime: message.createTime,
      rawContent: message.rawContent,
    }).then((result) => {
      if (!active) return
      if (result.success && result.data) {
        setSrc(`data:${detectImageMime(result.data)};base64,${result.data}`)
        setError('')
      } else if (!fallback) {
        setError(result.error || '图片暂时无法读取')
      }
    }).catch((reason) => {
      if (active && !fallback) setError(String(reason))
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [fallback, message.localId, sessionId])

  if (src) {
    return (
      <button type="button" className="chat-image-button" onClick={() => onPreview(src)} title="查看大图">
        <img src={src} alt="聊天图片" loading="lazy" onError={() => setSrc(undefined)} />
        {loading && <span className="chat-media-loading"><Loader2 size={16} className="spin" /></span>}
      </button>
    )
  }
  return (
    <div className="chat-media-placeholder">
      {loading ? <Loader2 size={18} className="spin" /> : <ImageIcon size={20} />}
      <span>{loading ? '正在解密图片…' : (error || '图片')}</span>
    </div>
  )
}

function ChatVoice({
  sessionId,
  message,
  onRequireModelDownload,
}: {
  sessionId: string
  message: ChatMessageRecord
  onRequireModelDownload: (sessionId: string, messageId: string) => void
}) {
  const transcriptKey = `${sessionId}:${message.createTime}:${message.localId}`
  const [src, setSrc] = useState('')
  const [loading, setLoading] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [error, setError] = useState('')
  const [transcript, setTranscript] = useState<string | undefined>(() => voiceTranscriptCache.get(transcriptKey))
  const [transcriptLoading, setTranscriptLoading] = useState(false)
  const [transcriptError, setTranscriptError] = useState('')
  const transcriptRequestedRef = useRef(false)
  const audioRef = useRef<HTMLAudioElement>(null)

  const toggle = async () => {
    if (loading) return
    if (src && audioRef.current) {
      if (audioRef.current.paused) await audioRef.current.play().catch(() => undefined)
      else audioRef.current.pause()
      return
    }
    setLoading(true)
    setError('')
    try {
      const result = await window.electronAPI.chat.getVoiceData(
        sessionId,
        String(message.localId),
        message.createTime,
        message.serverIdRaw || message.serverId,
        message.senderUsername || undefined,
      )
      if (!result.success || !result.data) throw new Error(result.error || '语音暂时无法读取')
      setSrc(`data:audio/wav;base64,${result.data}`)
    } catch (reason) {
      setError(String((reason as Error)?.message || reason))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!src || !audioRef.current) return
    void audioRef.current.play().catch(() => undefined)
  }, [src])

  useEffect(() => window.electronAPI.chat.onVoiceTranscriptPartial((payload) => {
    if (payload.sessionId !== sessionId || payload.msgId !== String(message.localId)) return
    if (payload.createTime != null && Number(payload.createTime) !== Number(message.createTime || 0)) return
    setTranscript(payload.text)
    rememberVoiceTranscript(transcriptKey, payload.text)
  }), [message.createTime, message.localId, sessionId, transcriptKey])

  const requestTranscript = useCallback(async () => {
    if (transcriptLoading || transcriptRequestedRef.current) return
    transcriptRequestedRef.current = true
    setTranscriptLoading(true)
    setTranscriptError('')
    try {
      const status = await window.electronAPI.whisper.getModelStatus()
      if (!status.success) throw new Error(status.error || '无法检查语音识别模型')
      if (!status.exists || status.valid === false) {
        setTranscriptLoading(false)
        onRequireModelDownload(sessionId, String(message.localId))
        return
      }

      const result = await window.electronAPI.chat.getVoiceTranscript(
        sessionId,
        String(message.localId),
        message.createTime,
        message.serverIdRaw || message.serverId,
        message.senderUsername || undefined,
      )
      if (!result.success) throw new Error(result.error || '语音转写失败')
      const text = String(result.transcript || '').trim()
      rememberVoiceTranscript(transcriptKey, text)
      setTranscript(text)
    } catch (reason) {
      transcriptRequestedRef.current = false
      setTranscriptError(String((reason as Error)?.message || reason))
    } finally {
      setTranscriptLoading(false)
    }
  }, [message.createTime, message.localId, message.senderUsername, message.serverId, message.serverIdRaw, onRequireModelDownload, sessionId, transcriptKey, transcriptLoading])

  useEffect(() => {
    const downloaded = (event: Event) => {
      const detail = (event as CustomEvent<{ sessionId?: string; messageId?: string }>).detail
      if (detail?.sessionId !== sessionId || detail.messageId !== String(message.localId)) return
      transcriptRequestedRef.current = false
      setTranscriptError('')
      void requestTranscript()
    }
    const cancelled = (event: Event) => {
      const detail = (event as CustomEvent<{ sessionId?: string; messageId?: string }>).detail
      if (detail?.sessionId !== sessionId || detail.messageId !== String(message.localId)) return
      transcriptRequestedRef.current = false
      setTranscriptLoading(false)
      setTranscriptError('模型下载已取消，点击重试')
    }
    window.addEventListener('voice-model-downloaded', downloaded)
    window.addEventListener('voice-model-download-cancelled', cancelled)
    return () => {
      window.removeEventListener('voice-model-downloaded', downloaded)
      window.removeEventListener('voice-model-download-cancelled', cancelled)
    }
  }, [message.localId, requestTranscript, sessionId])

  useEffect(() => {
    const completed = (event: Event) => {
      const detail = (event as CustomEvent<{
        sessionId: string
        messageId: string
        createTime: number
        success: boolean
        transcript?: string
        error?: string
      }>).detail
      if (detail?.sessionId !== sessionId || detail.messageId !== String(message.localId) || Number(detail.createTime) !== Number(message.createTime)) return
      setTranscriptLoading(false)
      if (detail.success) {
        const text = String(detail.transcript || '').trim()
        rememberVoiceTranscript(transcriptKey, text)
        setTranscript(text)
        setTranscriptError('')
        transcriptRequestedRef.current = true
      } else {
        transcriptRequestedRef.current = false
        setTranscriptError(detail.error || '转写失败，点击重试')
      }
    }
    window.addEventListener('voice-batch-transcript-complete', completed)
    return () => window.removeEventListener('voice-batch-transcript-complete', completed)
  }, [message.createTime, message.localId, sessionId, transcriptKey])

  return (
    <div className="chat-voice-stack">
      <div className="chat-voice">
        <button type="button" onClick={() => void toggle()} aria-label={playing ? '暂停语音' : '播放语音'}>
          {loading ? <Loader2 size={17} className="spin" /> : playing ? <Pause size={17} /> : <Play size={17} />}
        </button>
        <div className="chat-voice-wave" aria-hidden><i /><i /><i /><i /><i /><i /><i /></div>
        <span>{message.voiceDurationSeconds ? `${Math.round(message.voiceDurationSeconds)}″` : '语音'}</span>
        {transcript === undefined && !transcriptLoading && (
          <button type="button" className="chat-voice-transcribe" onClick={() => void requestTranscript()} aria-label="语音转文字" title="转文字">
            <MessageSquareText size={15} />
          </button>
        )}
        {src && (
          <audio
            ref={audioRef}
            src={src}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
          />
        )}
        {error && <span className="chat-media-error" title={error}>读取失败</span>}
      </div>
      {(transcriptLoading || transcriptError || transcript !== undefined) && (
        <button
          type="button"
          className={`chat-voice-transcript${transcriptError ? ' error' : ''}`}
          disabled={!transcriptError}
          title={transcriptError || undefined}
          onClick={() => {
            transcriptRequestedRef.current = false
            void requestTranscript()
          }}
        >
          {transcriptLoading && <Loader2 size={13} className="spin" />}
          <span>{transcriptLoading ? '正在转写…' : transcriptError ? '转写失败，点击重试' : (transcript || '未识别到文字')}</span>
        </button>
      )}
    </div>
  )
}

function ChatVideo({ message }: { message: ChatMessageRecord }) {
  const fallbackPoster = safeMediaUrl(message.cdnThumbUrl)
  const [info, setInfo] = useState<{ videoUrl?: string; coverUrl?: string; thumbUrl?: string; exists: boolean } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        let videoMd5 = String(message.videoMd5 || '').trim()
        if (!videoMd5) {
          const parsed = await window.electronAPI.video.parseVideoMd5(String(message.rawContent || ''))
          videoMd5 = parsed.success ? String(parsed.md5 || '').trim() : ''
        }
        if (!videoMd5) throw new Error('视频缺少文件标识')

        const result = await window.electronAPI.video.getVideoInfo(videoMd5, {
          includePoster: true,
          posterFormat: 'dataUrl',
        })
        if (!active) return
        if (!result.success || !result.exists || !result.videoUrl) {
          setInfo({ exists: false })
          setError(result.error || '本地视频文件未找到')
          return
        }
        setInfo(result)
      } catch (reason) {
        if (!active) return
        setInfo({ exists: false })
        setError(String((reason as Error)?.message || reason))
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [message.rawContent, message.videoMd5, retryKey])

  const poster = safeMediaUrl(info?.thumbUrl || info?.coverUrl) || fallbackPoster
  if (info?.exists && info.videoUrl) {
    return (
      <div className="chat-video-card chat-video-ready">
        <video
          key={`${info.videoUrl}:${retryKey}`}
          src={info.videoUrl}
          poster={poster}
          controls
          preload="metadata"
          playsInline
          onCanPlay={() => setError('')}
          onError={() => setError('视频文件存在，但当前格式无法播放')}
        />
        {error && <span className="chat-video-error" title={error}>{error}</span>}
      </div>
    )
  }

  return (
    <button
      type="button"
      className="chat-video-card chat-video-unavailable"
      onClick={() => !loading && setRetryKey((value) => value + 1)}
      title={error || '正在定位视频'}
    >
      {poster && <img src={poster} alt="视频缩略图" />}
      <span className="chat-video-play">
        {loading ? <Loader2 size={18} className="spin" /> : <Video size={18} />}
      </span>
      <strong>{loading ? '正在读取视频…' : (error || '点击重试')}</strong>
    </button>
  )
}

function MessageContent({
  sessionId,
  message,
  onPreview,
  onRequireVoiceModel,
}: {
  sessionId: string
  message: ChatMessageRecord
  onPreview: (src: string) => void
  onRequireVoiceModel: (sessionId: string, messageId: string) => void
}) {
  const content = String(message.parsedContent || message.appMsgDesc || '').trim()
  const appKind = String(message.appMsgKind || '').toLowerCase()

  if (message.localType === 3) {
    return <ChatImage sessionId={sessionId} message={message} onPreview={onPreview} />
  }
  if (message.localType === 34) {
    return <ChatVoice sessionId={sessionId} message={message} onRequireModelDownload={onRequireVoiceModel} />
  }
  if (message.localType === 47) {
    const emojiSrc = safeMediaUrl(message.emojiLocalPath || message.emojiCdnUrl || message.emojiThumbUrl)
    return emojiSrc
      ? <button type="button" className="chat-emoji" onClick={() => onPreview(emojiSrc)}><img src={emojiSrc} alt="表情" /></button>
      : <div className="chat-message-text">{renderTextWithEmoji(content || '[表情]', 20)}</div>
  }
  if (message.localType === 43) {
    return <ChatVideo message={message} />
  }
  if (message.locationPoiname || message.locationLabel || appKind === 'location') {
    return (
      <div className="chat-location-card">
        <MapPin size={22} />
        <div><strong>{message.locationPoiname || '位置'}</strong><span>{message.locationLabel || message.appMsgLocationLabel || content}</span></div>
      </div>
    )
  }
  if (message.cardNickname || message.cardUsername || appKind === 'contact') {
    return (
      <div className="chat-contact-card">
        <Avatar src={message.cardAvatarUrl} name={message.cardNickname || message.cardUsername} size={38} />
        <div><strong>{message.cardNickname || '联系人名片'}</strong><span>{message.cardUsername || ''}</span></div>
      </div>
    )
  }
  if (message.fileName || appKind === 'file' || message.xmlType === '6') {
    return (
      <div className="chat-file-card">
        <FileText size={28} />
        <div><strong>{message.fileName || message.linkTitle || '文件'}</strong><span>{[message.fileExt, formatFileSize(message.fileSize)].filter(Boolean).join(' · ')}</span></div>
      </div>
    )
  }
  if (message.chatRecordList?.length || appKind === 'chat_record') {
    return (
      <div className="chat-record-card">
        <strong>{message.chatRecordTitle || message.linkTitle || '聊天记录'}</strong>
        {message.chatRecordList?.slice(0, 3).map((item, index) => (
          <span key={`${item.sourcetime}-${index}`}>{item.sourcename}：{item.datadesc || item.datatitle || '[消息]'}</span>
        ))}
        <small>共 {message.chatRecordList?.length || 0} 条</small>
      </div>
    )
  }
  if (message.linkUrl || appKind === 'link' || message.linkTitle) {
    const thumb = safeMediaUrl(message.linkThumb || message.appMsgThumbUrl)
    return (
      <button
        type="button"
        className="chat-link-card"
        onClick={() => message.linkUrl && window.electronAPI.shell.openExternal(message.linkUrl)}
        disabled={!message.linkUrl}
      >
        <div><strong>{message.linkTitle || content || '链接'}</strong><span>{message.appMsgDesc || message.appMsgSourceName || message.linkUrl}</span></div>
        {thumb ? <img src={thumb} alt="" /> : <ExternalLink size={24} />}
      </button>
    )
  }
  if (appKind.includes('transfer') || message.transferPayerUsername || message.transferReceiverUsername) {
    return (
      <div className="chat-transfer-card">
        <span>¥</span>
        <div><strong>{message.linkTitle || content || '微信转账'}</strong><small>{message.appMsgDesc || '转账消息'}</small></div>
      </div>
    )
  }

  return (
    <div className="chat-message-text">
      {renderTextWithEmoji(content || `[消息类型 ${message.localType}]`, 20)}
      {(message.quotedContent || message.quotedSender) && (
        <div className="chat-quote">
          {message.quotedSender && <strong>{message.quotedSender}</strong>}
          <span>{message.quotedContent || '原消息'}</span>
        </div>
      )}
    </div>
  )
}

function MessageRow({
  session,
  message,
  previous,
  myAvatarUrl,
  highlighted,
  onPreview,
  onRequireVoiceModel,
}: {
  session: ChatSessionRecord
  message: ChatMessageRecord
  previous?: ChatMessageRecord
  myAvatarUrl?: string
  highlighted: boolean
  onPreview: (src: string) => void
  onRequireVoiceModel: (sessionId: string, messageId: string) => void
}) {
  const system = SYSTEM_MESSAGE_TYPES.has(message.localType)
  const sent = message.isSend === 1
  const group = session.username.endsWith('@chatroom')
  const avatar = sent ? myAvatarUrl : (message.senderAvatarUrl || (group ? undefined : session.avatarUrl))
  const displayName = sent ? '我' : (message.senderDisplayName || (group ? message.senderUsername : session.displayName) || session.username)
  const showDate = shouldShowDateDivider(message, previous)
  const showTime = !previous || toSeconds(message.createTime) - toSeconds(previous.createTime) >= 300

  if (system) {
    return (
      <div className={`chat-message-row system${highlighted ? ' highlighted' : ''}`} data-message-key={messageKey(message)}>
        {showDate && <div className="chat-date-divider"><span>{formatDateLabel(message.createTime)}</span></div>}
        <div className="chat-system-message">{message.parsedContent || '系统消息'}</div>
      </div>
    )
  }

  return (
    <div className={`chat-message-row ${sent ? 'sent' : 'received'}${highlighted ? ' highlighted' : ''}`} data-message-key={messageKey(message)}>
      {showDate && <div className="chat-date-divider"><span>{formatDateLabel(message.createTime)}</span></div>}
      <div className="chat-message-line">
        <Avatar src={avatar} name={displayName} size={36} className="chat-message-avatar" />
        <div className="chat-message-stack">
          {group && !sent && <span className="chat-message-sender">{displayName}</span>}
          {showTime && <span className="chat-message-time">{formatMessageTime(message.createTime)}</span>}
          <div className="chat-message-bubble">
            <MessageContent sessionId={session.username} message={message} onPreview={onPreview} onRequireVoiceModel={onRequireVoiceModel} />
          </div>
        </div>
      </div>
    </div>
  )
}

function SessionRow({
  session,
  active,
  keyword,
  onSelect,
}: {
  session: ChatSessionRecord
  active: boolean
  keyword: string
  onSelect: () => void
}) {
  const name = session.displayName || session.username
  return (
    <button
      type="button"
      className="chat-session-row"
      data-active={active}
      data-session-id={session.username}
      onClick={onSelect}
    >
      <Avatar src={session.avatarUrl} name={name} size={44} className={session.username.endsWith('@chatroom') ? 'group' : ''} />
      <span className="chat-session-copy">
        <span className="chat-session-topline">
          <strong><Highlight text={name} keyword={keyword} /></strong>
          <time>{formatSessionTime(session.lastTimestamp || session.sortTimestamp)}</time>
        </span>
        <span className="chat-session-bottomline">
          <span>{session.summary || '暂无消息'}</span>
          <span className="chat-session-badges">
            {session.isMuted && <BellOff size={12} />}
            {session.unreadCount > 0 && <i>{session.unreadCount > 99 ? '99+' : session.unreadCount}</i>}
          </span>
        </span>
      </span>
    </button>
  )
}

export default function ChatPage({ onExportSession }: ChatPageProps) {
  const api = window.electronAPI
  const virtuosoRef = useRef<VirtuosoHandle>(null)
  const loadSessionSequence = useRef(0)
  const sessionSequence = useRef(0)
  const selectedSessionIdRef = useRef('')
  const messageViewModeRef = useRef<MessageViewMode>('latest')
  const atBottomRef = useRef(true)
  const lastMessageRef = useRef<ChatMessageRecord | undefined>(undefined)
  const pendingJumpRef = useRef<ChatMessageRecord | null>(null)

  const [sessions, setSessions] = useState<ChatSessionRecord[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState('')
  const [sessionsLoading, setSessionsLoading] = useState(true)
  const [sessionsRefreshing, setSessionsRefreshing] = useState(false)
  const [sessionsError, setSessionsError] = useState('')
  const [sessionFilter, setSessionFilter] = useState<SessionFilter>('all')
  const [sidebarSearchMode, setSidebarSearchMode] = useState<SidebarSearchMode>('session')
  const [sidebarKeyword, setSidebarKeyword] = useState('')
  const [globalResults, setGlobalResults] = useState<ChatMessageRecord[]>([])
  const [globalSearching, setGlobalSearching] = useState(false)

  const [messages, setMessages] = useState<ChatMessageRecord[]>([])
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [messagesRefreshing, setMessagesRefreshing] = useState(false)
  const [messagesError, setMessagesError] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const [nextOffset, setNextOffset] = useState(0)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [firstItemIndex, setFirstItemIndex] = useState(MESSAGE_INDEX_BASE)
  const [messageViewMode, setMessageViewMode] = useState<MessageViewMode>('latest')
  const [viewLabel, setViewLabel] = useState('')
  const [highlightedMessageKey, setHighlightedMessageKey] = useState('')
  const [atBottom, setAtBottom] = useState(true)
  const [myAvatarUrl, setMyAvatarUrl] = useState<string | undefined>(undefined)

  const [inSessionSearchOpen, setInSessionSearchOpen] = useState(false)
  const [inSessionKeyword, setInSessionKeyword] = useState('')
  const [inSessionResults, setInSessionResults] = useState<ChatMessageRecord[]>([])
  const [inSessionSearching, setInSessionSearching] = useState(false)
  const inSessionInputRef = useRef<HTMLInputElement>(null)

  const [datePopoverOpen, setDatePopoverOpen] = useState(false)
  const [messageDates, setMessageDates] = useState<string[]>([])
  const [messageDateCounts, setMessageDateCounts] = useState<Record<string, number>>({})
  const [selectedDate, setSelectedDate] = useState('')
  const [datesLoading, setDatesLoading] = useState(false)

  const [sidePanel, setSidePanel] = useState<SidePanel>(null)
  const [detailFast, setDetailFast] = useState<ChatSessionDetailFast | null>(null)
  const [detailExtra, setDetailExtra] = useState<ChatSessionDetailExtra | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [groupMembers, setGroupMembers] = useState<GroupMemberPanelEntry[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [memberKeyword, setMemberKeyword] = useState('')
  const [batchBusy, setBatchBusy] = useState<'voice' | 'image' | null>(null)
  const [operationStatus, setOperationStatus] = useState('')
  const [previewImage, setPreviewImage] = useState('')
  const [showVoiceModelDialog, setShowVoiceModelDialog] = useState(false)
  const [pendingVoiceTranscripts, setPendingVoiceTranscripts] = useState<Array<{ sessionId: string; messageId: string }>>([])
  const pendingBatchVoiceRef = useRef<{ sessionId: string; messages: ChatMessageRecord[] } | null>(null)
  const batchVoiceCancelledRef = useRef(false)

  const requireVoiceModel = useCallback((sessionId: string, messageId: string) => {
    setPendingVoiceTranscripts((current) => current.some((item) => item.sessionId === sessionId && item.messageId === messageId)
      ? current
      : [...current, { sessionId, messageId }])
    setShowVoiceModelDialog(true)
  }, [])

  const selectedSession = useMemo(
    () => sessions.find((session) => session.username === selectedSessionId),
    [selectedSessionId, sessions],
  )

  useEffect(() => { selectedSessionIdRef.current = selectedSessionId }, [selectedSessionId])
  useEffect(() => { messageViewModeRef.current = messageViewMode }, [messageViewMode])
  useEffect(() => { atBottomRef.current = atBottom }, [atBottom])
  useEffect(() => { lastMessageRef.current = messages[messages.length - 1] }, [messages])

  const scrollToBottom = useCallback((behavior: 'auto' | 'smooth' = 'auto') => {
    const lastIndex = firstItemIndex + messages.length - 1
    if (messages.length > 0) virtuosoRef.current?.scrollToIndex({ index: lastIndex, align: 'end', behavior })
  }, [firstItemIndex, messages.length])

  const loadSessions = useCallback(async (refresh = false) => {
    const sequence = ++sessionSequence.current
    if (refresh) setSessionsRefreshing(true)
    else setSessionsLoading(true)
    setSessionsError('')
    try {
      const connected = await api.chat.connect()
      if (!connected.success) throw new Error(connected.error || '数据库连接失败')
      const result = await api.chat.getSessions()
      if (!result.success) throw new Error(result.error || '会话列表读取失败')
      const seen = new Set<string>()
      let next = (result.sessions || []).filter((session) => {
        const id = String(session.username || '').trim()
        if (!id || id.toLowerCase().includes('placeholder_foldgroup') || seen.has(id)) return false
        seen.add(id)
        return true
      })
      const unresolved = next.filter((session) => !session.displayName || session.displayName === session.username || !session.avatarUrl)
      if (unresolved.length > 0) {
        try {
          const enriched = await api.chat.enrichSessionsContactInfo(unresolved.map((session) => session.username)) as {
            success?: boolean
            contacts?: Record<string, { displayName?: string; avatarUrl?: string }>
          }
          if (enriched?.contacts) {
            next = next.map((session) => ({ ...session, ...enriched.contacts?.[session.username] }))
          }
        } catch { /* 会话原始信息仍然可用 */ }
      }
      next.sort((a, b) => {
        const timeDiff = (b.sortTimestamp || b.lastTimestamp || 0) - (a.sortTimestamp || a.lastTimestamp || 0)
        return timeDiff || (a.displayName || a.username).localeCompare(b.displayName || b.username, 'zh-Hans-CN')
      })
      if (sequence !== sessionSequence.current) return
      setSessions(next)
      setSelectedSessionId((current) => current && next.some((session) => session.username === current)
        ? current
        : (next[0]?.username || ''))
    } catch (reason) {
      if (sequence === sessionSequence.current) setSessionsError(String((reason as Error)?.message || reason))
    } finally {
      if (sequence === sessionSequence.current) {
        setSessionsLoading(false)
        setSessionsRefreshing(false)
      }
    }
  }, [api])

  useEffect(() => {
    void loadSessions(false)
    void api.chat.getMyAvatarUrl().then((result) => {
      if (result.success) setMyAvatarUrl(result.avatarUrl)
    }).catch(() => undefined)
  }, [api, loadSessions])

  const setMessageWindow = useCallback((nextMessages: ChatMessageRecord[], options?: {
    hasMore?: boolean
    nextOffset?: number
    mode?: MessageViewMode
    label?: string
    highlight?: ChatMessageRecord
  }) => {
    const normalized = sortAndDedupeMessages(nextMessages)
    const startIndex = MESSAGE_INDEX_BASE - normalized.length
    setMessages(normalized)
    setFirstItemIndex(startIndex)
    setHasMore(options?.hasMore === true)
    setNextOffset(Number(options?.nextOffset || normalized.length))
    setMessageViewMode(options?.mode || 'latest')
    setViewLabel(options?.label || '')
    const targetKey = options?.highlight ? messageKey(options.highlight) : ''
    setHighlightedMessageKey(targetKey)
    window.setTimeout(() => {
      const targetPosition = options?.highlight
        ? Math.max(0, normalized.findIndex((message) => messageKey(message) === targetKey))
        : normalized.length - 1
      if (targetPosition >= 0) {
        virtuosoRef.current?.scrollToIndex({
          index: startIndex + targetPosition,
          align: options?.highlight ? 'center' : 'end',
          behavior: 'auto',
        })
      }
    }, 40)
  }, [])

  const loadLatestMessages = useCallback(async (sessionId: string, refresh = false) => {
    const sequence = ++loadSessionSequence.current
    if (refresh) setMessagesRefreshing(true)
    else setMessagesLoading(true)
    setMessagesError('')
    try {
      const result = await api.chat.getLatestMessages(sessionId, PAGE_SIZE)
      if (!result.success) throw new Error(result.error || '消息读取失败')
      if (sequence !== loadSessionSequence.current || selectedSessionIdRef.current !== sessionId) return
      setMessageWindow(result.messages || [], {
        hasMore: result.hasMore,
        nextOffset: result.nextOffset,
        mode: 'latest',
      })
      setSessions((current) => current.map((session) => session.username === sessionId
        ? { ...session, unreadCount: 0 }
        : session))
    } catch (reason) {
      if (sequence === loadSessionSequence.current) setMessagesError(String((reason as Error)?.message || reason))
    } finally {
      if (sequence === loadSessionSequence.current) {
        setMessagesLoading(false)
        setMessagesRefreshing(false)
      }
    }
  }, [api, setMessageWindow])

  const showMessageContext = useCallback(async (sessionId: string, target: ChatMessageRecord) => {
    const sequence = ++loadSessionSequence.current
    setMessagesLoading(true)
    setMessagesError('')
    try {
      const result = await api.chat.getMessagesAround(sessionId, {
        localId: target.localId,
        createTime: target.createTime,
        messageKey: target.messageKey,
      }, 70)
      if (!result.success) throw new Error(result.error || '无法定位消息')
      if (sequence !== loadSessionSequence.current || selectedSessionIdRef.current !== sessionId) return
      setMessageWindow([...result.before, target, ...result.after], {
        mode: 'context',
        label: `正在查看 ${formatFullTime(target.createTime)} 附近的消息`,
        highlight: target,
      })
    } catch (reason) {
      if (sequence === loadSessionSequence.current) setMessagesError(String((reason as Error)?.message || reason))
    } finally {
      if (sequence === loadSessionSequence.current) setMessagesLoading(false)
    }
  }, [api, setMessageWindow])

  useEffect(() => {
    if (!selectedSessionId) {
      setMessages([])
      return
    }
    setInSessionSearchOpen(false)
    setInSessionKeyword('')
    setInSessionResults([])
    setDatePopoverOpen(false)
    setMessageDates([])
    setMessageDateCounts({})
    setSelectedDate('')
    setSidePanel(null)
    setDetailFast(null)
    setDetailExtra(null)
    setGroupMembers([])
    setOperationStatus('')
    const target = pendingJumpRef.current
    pendingJumpRef.current = null
    if (target) void showMessageContext(selectedSessionId, target)
    else void loadLatestMessages(selectedSessionId)
  }, [loadLatestMessages, selectedSessionId, showMessageContext])

  const chooseSession = useCallback((sessionId: string, target?: ChatMessageRecord) => {
    if (target) pendingJumpRef.current = target
    if (selectedSessionIdRef.current === sessionId) {
      pendingJumpRef.current = null
      if (target) void showMessageContext(sessionId, target)
      return
    }
    setSelectedSessionId(sessionId)
  }, [showMessageContext])

  const loadOlder = useCallback(async () => {
    if (!selectedSessionId || loadingOlder || !hasMore || messageViewMode !== 'latest') return
    setLoadingOlder(true)
    try {
      const result = await api.chat.getMessages(selectedSessionId, nextOffset, PAGE_SIZE)
      if (!result.success) throw new Error(result.error || '更早消息读取失败')
      const currentKeys = new Set(messages.map(messageKey))
      const older = sortAndDedupeMessages(result.messages || []).filter((message) => !currentKeys.has(messageKey(message)))
      if (older.length > 0) {
        setMessages((current) => sortAndDedupeMessages([...older, ...current]))
        setFirstItemIndex((current) => current - older.length)
      }
      setHasMore(result.hasMore === true)
      setNextOffset(Number(result.nextOffset || nextOffset + PAGE_SIZE))
    } catch (reason) {
      setMessagesError(String((reason as Error)?.message || reason))
    } finally {
      setLoadingOlder(false)
    }
  }, [api, hasMore, loadingOlder, messageViewMode, messages, nextOffset, selectedSessionId])

  // 当前会话静默增量刷新：不显示旋转图标，避免造成页面“持续刷新”的视觉干扰。
  useEffect(() => {
    if (!selectedSessionId) return
    const timer = window.setInterval(() => {
      if (document.hidden || messageViewModeRef.current !== 'latest') return
      const latest = lastMessageRef.current
      if (!latest) return
      void api.chat.getNewMessages(selectedSessionId, toSeconds(latest.createTime), PAGE_SIZE, {
        createTime: latest.createTime,
        sortSeq: latest.sortSeq,
        localId: latest.localId,
        serverId: latest.serverId,
        serverIdRaw: latest.serverIdRaw,
      }).then((result) => {
        if (!result.success || !result.messages?.length || selectedSessionIdRef.current !== selectedSessionId) return
        const incoming = result.messages
        setMessages((current) => sortAndDedupeMessages([...current, ...incoming]))
        const normalizedIncoming = sortAndDedupeMessages(incoming)
        const newest = normalizedIncoming[normalizedIncoming.length - 1]
        if (newest) {
          setSessions((current) => [...current.map((session) => session.username === selectedSessionId
            ? {
                ...session,
                summary: newest.parsedContent || session.summary,
                sortTimestamp: newest.createTime,
                lastTimestamp: newest.createTime,
              }
            : session)].sort((a, b) => (b.sortTimestamp || b.lastTimestamp || 0) - (a.sortTimestamp || a.lastTimestamp || 0)))
        }
        if (atBottomRef.current) window.setTimeout(() => scrollToBottom('smooth'), 40)
      }).catch(() => undefined)
    }, 6_000)
    return () => window.clearInterval(timer)
  }, [api, scrollToBottom, selectedSessionId])

  const filteredSessions = useMemo(() => {
    const keyword = sidebarKeyword.trim().toLocaleLowerCase()
    return sessions.filter((session) => {
      if (sessionFilter !== 'all' && sessionKind(session.username) !== sessionFilter) return false
      if (sidebarSearchMode !== 'session' || !keyword) return true
      return [session.displayName, session.username, session.summary]
        .some((value) => String(value || '').toLocaleLowerCase().includes(keyword))
    })
  }, [sessionFilter, sessions, sidebarKeyword, sidebarSearchMode])

  useEffect(() => {
    const keyword = sidebarKeyword.trim()
    if (sidebarSearchMode !== 'message' || keyword.length < 2) {
      setGlobalResults([])
      setGlobalSearching(false)
      return
    }
    const sequence = Date.now()
    const holder = { current: sequence }
    setGlobalSearching(true)
    const timer = window.setTimeout(() => {
      void api.chat.searchMessages(keyword, undefined, 100, 0).then((result) => {
        if (holder.current !== sequence) return
        setGlobalResults(result.success ? (result.messages || []) : [])
      }).catch(() => setGlobalResults([])).finally(() => {
        if (holder.current === sequence) setGlobalSearching(false)
      })
    }, 350)
    return () => {
      holder.current = 0
      window.clearTimeout(timer)
    }
  }, [api, sidebarKeyword, sidebarSearchMode])

  const runInSessionSearch = useCallback(async () => {
    const keyword = inSessionKeyword.trim()
    if (!selectedSessionId || !keyword) {
      setInSessionResults([])
      return
    }
    setInSessionSearching(true)
    try {
      const result = await api.chat.searchMessages(keyword, selectedSessionId, 100, 0)
      setInSessionResults(result.success ? (result.messages || []) : [])
    } finally {
      setInSessionSearching(false)
    }
  }, [api, inSessionKeyword, selectedSessionId])

  const toggleInSessionSearch = useCallback(() => {
    setDatePopoverOpen(false)
    setInSessionSearchOpen((open) => {
      if (!open) window.setTimeout(() => inSessionInputRef.current?.focus(), 30)
      return !open
    })
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === 'f' && selectedSessionId) {
        event.preventDefault()
        if (!inSessionSearchOpen) toggleInSessionSearch()
        else inSessionInputRef.current?.focus()
      }
      if (event.key === 'Escape') {
        setDatePopoverOpen(false)
        setInSessionSearchOpen(false)
        setPreviewImage('')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [inSessionSearchOpen, selectedSessionId, toggleInSessionSearch])

  const toggleDatePopover = useCallback(async () => {
    if (!selectedSessionId) return
    setInSessionSearchOpen(false)
    const nextOpen = !datePopoverOpen
    setDatePopoverOpen(nextOpen)
    if (!nextOpen || messageDates.length > 0 || datesLoading) return
    setDatesLoading(true)
    try {
      const [dates, counts] = await Promise.all([
        api.chat.getMessageDates(selectedSessionId),
        api.chat.getMessageDateCounts(selectedSessionId),
      ])
      const values = dates.success ? [...(dates.dates || [])].sort().reverse() : []
      setMessageDates(values)
      setMessageDateCounts(counts.success ? (counts.counts || {}) : {})
      setSelectedDate(values[0] || '')
    } finally {
      setDatesLoading(false)
    }
  }, [api, datePopoverOpen, datesLoading, messageDates.length, selectedSessionId])

  const jumpToDate = useCallback(async () => {
    if (!selectedSessionId || !selectedDate) return
    const [year, month, day] = selectedDate.split('-').map(Number)
    if (!year || !month || !day) return
    const start = Math.floor(new Date(year, month - 1, day, 0, 0, 0).getTime() / 1000)
    const end = Math.floor(new Date(year, month - 1, day, 23, 59, 59).getTime() / 1000)
    setDatePopoverOpen(false)
    setMessagesLoading(true)
    setMessagesError('')
    try {
      const result = await api.chat.getMessages(selectedSessionId, 0, 200, start, end, true)
      if (!result.success) throw new Error(result.error || '指定日期消息读取失败')
      setMessageWindow(result.messages || [], {
        mode: 'date',
        label: `${selectedDate} · ${messageDateCounts[selectedDate] ?? result.messages?.length ?? 0} 条消息`,
      })
    } catch (reason) {
      setMessagesError(String((reason as Error)?.message || reason))
    } finally {
      setMessagesLoading(false)
    }
  }, [api, messageDateCounts, selectedDate, selectedSessionId, setMessageWindow])

  useEffect(() => {
    if (!selectedSessionId || sidePanel !== 'detail') return
    let active = true
    setDetailLoading(true)
    void Promise.all([
      api.chat.getSessionDetailFast(selectedSessionId),
      api.chat.getSessionDetailExtra(selectedSessionId),
    ]).then(([fast, extra]) => {
      if (!active) return
      setDetailFast(fast.success ? (fast.detail || null) : null)
      setDetailExtra(extra.success ? (extra.detail || null) : null)
    }).finally(() => { if (active) setDetailLoading(false) })
    return () => { active = false }
  }, [api, selectedSessionId, sidePanel])

  useEffect(() => {
    if (!selectedSessionId.endsWith('@chatroom') || sidePanel !== 'members') return
    let active = true
    setMembersLoading(true)
    void api.groupAnalytics.getGroupMembersPanelData(selectedSessionId, { includeMessageCounts: true }).then((result) => {
      if (active) setGroupMembers(result.success ? (result.data || []) as GroupMemberPanelEntry[] : [])
    }).finally(() => { if (active) setMembersLoading(false) })
    return () => { active = false }
  }, [api, selectedSessionId, sidePanel])

  const filteredMembers = useMemo(() => {
    const keyword = memberKeyword.trim().toLocaleLowerCase()
    if (!keyword) return groupMembers
    return groupMembers.filter((member) => [member.displayName, member.groupNickname, member.remark, member.username]
      .some((value) => String(value || '').toLocaleLowerCase().includes(keyword)))
  }, [groupMembers, memberKeyword])

  const markAllRead = async () => {
    const result = await api.chat.markAllSessionsRead()
    if (result.success) setSessions((current) => current.map((session) => ({ ...session, unreadCount: 0 })))
  }

  const preloadImages = async () => {
    if (!selectedSessionId || batchBusy) return
    setBatchBusy('image')
    setOperationStatus('正在批量解密图片…')
    try {
      const result = await api.chat.preloadSessionImages(selectedSessionId)
      if (!result.success) throw new Error(result.error || '图片处理失败')
      setOperationStatus(`图片处理完成：已解密 ${result.prepared || 0} / ${result.total || 0} 张${result.failed ? `，${result.failed} 张未找到` : ''}`)
    } catch (reason) {
      setOperationStatus(String((reason as Error)?.message || reason))
    } finally {
      setBatchBusy(null)
    }
  }

  const transcribeLoadedVoices = async (
    preparedBatch?: { sessionId: string; messages: ChatMessageRecord[] },
    skipModelCheck = false,
  ) => {
    if (batchBusy) return
    const batch = preparedBatch || {
      sessionId: selectedSessionId,
      // 只处理已经加载到聊天页的语音，避免一次查询并解码整个历史会话造成长时间假死。
      messages: messages.filter((message) => message.localType === 34),
    }
    if (!batch.sessionId) return
    if (batch.messages.length === 0) {
      setOperationStatus('当前已加载的消息中没有语音')
      return
    }

    batchVoiceCancelledRef.current = false
    setBatchBusy('voice')
    setOperationStatus('正在检查语音识别模型…')
    try {
      if (!skipModelCheck) {
        const modelStatus = await api.whisper.getModelStatus()
        if (!modelStatus.success) throw new Error(modelStatus.error || '无法检查语音识别模型')
        if (!modelStatus.exists || modelStatus.valid === false) {
          // 模型缺失时先暂停任务，下载完成后继续处理原会话与原消息集合。
          pendingBatchVoiceRef.current = batch
          setShowVoiceModelDialog(true)
          setOperationStatus('首次转写需要先下载本地模型')
          return
        }
        setOperationStatus(`模型已就绪，正在转写 0 / ${batch.messages.length}`)
      } else {
        setOperationStatus(`模型已就绪，正在转写 0 / ${batch.messages.length}`)
      }

      let cursor = 0
      let completed = 0
      let succeeded = 0
      const runWorker = async () => {
        while (!batchVoiceCancelledRef.current) {
          const index = cursor++
          const message = batch.messages[index]
          if (!message) return
          const result = await api.chat.getVoiceTranscript(
            batch.sessionId,
            String(message.localId),
            message.createTime,
            message.serverIdRaw || message.serverId,
            message.senderUsername || undefined,
          )
          completed += 1
          if (result.success) succeeded += 1
          window.dispatchEvent(new CustomEvent('voice-batch-transcript-complete', {
            detail: {
              sessionId: batch.sessionId,
              messageId: String(message.localId),
              createTime: message.createTime,
              success: result.success,
              transcript: result.transcript,
              error: result.error,
            },
          }))
          setOperationStatus(`正在批量转写语音：${completed} / ${batch.messages.length}`)
        }
      }

      // 每个 Worker 都会加载识别模型，固定两个并发兼顾速度与内存占用。
      await Promise.all(Array.from({ length: Math.min(2, batch.messages.length) }, () => runWorker()))
      setOperationStatus(batchVoiceCancelledRef.current
        ? `已停止批量转写：完成 ${completed} / ${batch.messages.length} 条`
        : `语音转写完成：成功 ${succeeded} / ${batch.messages.length} 条`)
    } catch (reason) {
      setOperationStatus(String((reason as Error)?.message || reason))
    } finally {
      setBatchBusy(null)
    }
  }

  const copyText = (value: string) => {
    void navigator.clipboard.writeText(value).then(() => {
      setOperationStatus('已复制到剪贴板')
      window.setTimeout(() => setOperationStatus(''), 1600)
    }).catch(() => undefined)
  }

  const globalMessageRows = useMemo(() => globalResults.map((message) => ({
    message,
    session: sessions.find((session) => session.username === message.sessionId),
  })).filter((row) => Boolean(row.message.sessionId)), [globalResults, sessions])

  return (
    <div className="chat-shell">
      <aside className="chat-session-sidebar">
        <div className="chat-sidebar-head">
          <div className="chat-sidebar-title">
            <div><MessageSquare size={16} /><strong>聊天</strong><span>{sessions.length}</span></div>
            <div>
              <button type="button" className="chat-icon-button" title="全部标为已读" onClick={() => void markAllRead()}><CheckCheck size={16} /></button>
              <button type="button" className="chat-icon-button" title="刷新会话" disabled={sessionsRefreshing} onClick={() => void loadSessions(true)}>
                <RefreshCw size={16} className={sessionsRefreshing ? 'spin' : ''} />
              </button>
            </div>
          </div>
          <div className="chat-sidebar-search">
            <Search size={15} />
            <input
              value={sidebarKeyword}
              onChange={(event) => setSidebarKeyword(event.target.value)}
              placeholder={sidebarSearchMode === 'session' ? '搜索联系人、群聊或微信号' : '搜索全部聊天记录'}
            />
            {globalSearching && <Loader2 size={14} className="spin" />}
            {sidebarKeyword && !globalSearching && <button type="button" onClick={() => setSidebarKeyword('')}><X size={13} /></button>}
          </div>
          <div className="chat-sidebar-modes">
            <button type="button" data-active={sidebarSearchMode === 'session'} onClick={() => setSidebarSearchMode('session')}>会话</button>
            <button type="button" data-active={sidebarSearchMode === 'message'} onClick={() => setSidebarSearchMode('message')}>消息</button>
          </div>
          {sidebarSearchMode === 'session' && (
            <div className="chat-session-filters">
              {([
                ['all', '全部'],
                ['private', '私聊'],
                ['group', '群聊'],
                ['official', '公众号'],
              ] as Array<[SessionFilter, string]>).map(([value, label]) => (
                <button key={value} type="button" data-active={sessionFilter === value} onClick={() => setSessionFilter(value)}>{label}</button>
              ))}
            </div>
          )}
        </div>

        <div className="chat-sidebar-list">
          {sessionsLoading ? (
            <div className="chat-sidebar-state"><Loader2 size={20} className="spin" /><span>正在读取会话…</span></div>
          ) : sessionsError ? (
            <div className="chat-sidebar-state error"><span>{sessionsError}</span><button type="button" onClick={() => void loadSessions()}>重试</button></div>
          ) : sidebarSearchMode === 'message' ? (
            sidebarKeyword.trim().length < 2 ? (
              <div className="chat-sidebar-state"><Search size={20} /><span>输入至少 2 个字搜索全部消息</span></div>
            ) : globalMessageRows.length === 0 && !globalSearching ? (
              <div className="chat-sidebar-state"><span>没有找到相关消息</span></div>
            ) : (
              <Virtuoso
                data={globalMessageRows}
                itemContent={(_, row) => (
                  <button
                    type="button"
                    className="chat-global-result"
                    onClick={() => chooseSession(String(row.message.sessionId), row.message)}
                  >
                    <Avatar src={row.session?.avatarUrl} name={row.session?.displayName || row.message.sessionId} size={36} />
                    <span><strong>{row.session?.displayName || row.message.sessionId}</strong><small><Highlight text={row.message.parsedContent || '[媒体消息]'} keyword={sidebarKeyword} /></small><time>{formatFullTime(row.message.createTime)}</time></span>
                  </button>
                )}
              />
            )
          ) : filteredSessions.length === 0 ? (
            <div className="chat-sidebar-state"><span>没有匹配的会话</span></div>
          ) : (
            <Virtuoso
              data={filteredSessions}
              itemContent={(_, session) => (
                <SessionRow
                  session={session}
                  active={session.username === selectedSessionId}
                  keyword={sidebarKeyword}
                  onSelect={() => chooseSession(session.username)}
                />
              )}
            />
          )}
        </div>
      </aside>

      <main className="chat-main">
        {!selectedSession ? (
          <div className="chat-empty-main"><MessageSquare size={38} /><strong>选择一个会话</strong><span>在左侧打开联系人或群聊，查看完整聊天记录</span></div>
        ) : (
          <>
            <header className="chat-message-header">
              <Avatar src={selectedSession.avatarUrl} name={selectedSession.displayName || selectedSession.username} size={38} />
              <div className="chat-header-copy">
                <strong>{selectedSession.displayName || selectedSession.username}</strong>
                <span>{sessionKind(selectedSession.username) === 'group' ? '群聊' : sessionKind(selectedSession.username) === 'official' ? '公众号' : selectedSession.username}</span>
              </div>
              <div className="chat-header-actions">
                {selectedSession.username.endsWith('@chatroom') && (
                  <button type="button" className="chat-icon-button" data-active={sidePanel === 'members'} title="群成员" onClick={() => setSidePanel((value) => value === 'members' ? null : 'members')}><Users size={17} /></button>
                )}
                <button type="button" className="chat-icon-button" title="导出当前会话" onClick={() => onExportSession(selectedSession.username)}><Download size={17} /></button>
                <button type="button" className="chat-icon-button" title="转写当前已加载的语音" disabled={Boolean(batchBusy)} onClick={() => void transcribeLoadedVoices()}>
                  {batchBusy === 'voice' ? <Loader2 size={17} className="spin" /> : <Mic size={17} />}
                </button>
                <button type="button" className="chat-icon-button" title="批量解密图片" disabled={Boolean(batchBusy)} onClick={() => void preloadImages()}>
                  {batchBusy === 'image' ? <Loader2 size={17} className="spin" /> : <ImageIcon size={17} />}
                </button>
                <div className="chat-popover-anchor">
                  <button type="button" className="chat-icon-button" data-active={datePopoverOpen} title="跳转到日期" onClick={() => void toggleDatePopover()}><CalendarDays size={17} /></button>
                  {datePopoverOpen && (
                    <div className="chat-date-popover">
                      <div><strong>跳转到日期</strong><button type="button" onClick={() => setDatePopoverOpen(false)}><X size={14} /></button></div>
                      {datesLoading ? (
                        <span className="chat-popover-loading"><Loader2 size={16} className="spin" />正在统计日期…</span>
                      ) : messageDates.length === 0 ? (
                        <span className="chat-popover-loading">此会话没有可用日期</span>
                      ) : (
                        <>
                          <input
                            type="date"
                            value={selectedDate}
                            min={messageDates[messageDates.length - 1]}
                            max={messageDates[0]}
                            onChange={(event) => setSelectedDate(event.target.value)}
                          />
                          <label>最近有消息的日期</label>
                          <select value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)}>
                            {messageDates.slice(0, 120).map((date) => <option key={date} value={date}>{date}（{messageDateCounts[date] || 0}）</option>)}
                          </select>
                          <button type="button" className="chat-popover-primary" onClick={() => void jumpToDate()}>查看当天消息</button>
                        </>
                      )}
                    </div>
                  )}
                </div>
                <button type="button" className="chat-icon-button" data-active={inSessionSearchOpen} title="搜索当前会话（Ctrl+F）" onClick={toggleInSessionSearch}><Search size={17} /></button>
                <button type="button" className="chat-icon-button" title="刷新消息" disabled={messagesRefreshing || messagesLoading} onClick={() => void loadLatestMessages(selectedSession.username, true)}><RefreshCw size={17} className={messagesRefreshing ? 'spin' : ''} /></button>
                <button type="button" className="chat-icon-button" data-active={sidePanel === 'detail'} title="会话详情" onClick={() => setSidePanel((value) => value === 'detail' ? null : 'detail')}><Info size={17} /></button>
              </div>
            </header>

            {inSessionSearchOpen && (
              <div className="chat-in-session-search">
                <form onSubmit={(event) => { event.preventDefault(); void runInSessionSearch() }}>
                  <Search size={15} />
                  <input ref={inSessionInputRef} value={inSessionKeyword} onChange={(event) => setInSessionKeyword(event.target.value)} placeholder="搜索当前会话的聊天记录" />
                  {inSessionSearching && <Loader2 size={14} className="spin" />}
                  <button type="submit">搜索</button>
                  <button type="button" aria-label="关闭搜索" onClick={() => setInSessionSearchOpen(false)}><X size={14} /></button>
                </form>
                {inSessionResults.length > 0 && (
                  <div className="chat-in-session-results">
                    <div><span>找到 {inSessionResults.length} 条结果</span><button type="button" onClick={() => setInSessionResults([])}>清空</button></div>
                    <div>
                      {inSessionResults.map((message) => (
                        <button key={messageKey(message)} type="button" onClick={() => void showMessageContext(selectedSession.username, message)}>
                          <time>{formatFullTime(message.createTime)}</time>
                          <span><Highlight text={message.parsedContent || '[媒体消息]'} keyword={inSessionKeyword} /></span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {messageViewMode !== 'latest' && (
              <div className="chat-context-banner">
                <span>{viewLabel}</span>
                <button type="button" onClick={() => void loadLatestMessages(selectedSession.username)}>返回最新消息</button>
              </div>
            )}

            <div className="chat-message-list">
              {messagesLoading ? (
                <div className="chat-message-state"><Loader2 size={22} className="spin" /><span>正在读取聊天记录…</span></div>
              ) : messagesError ? (
                <div className="chat-message-state error"><span>{messagesError}</span><button type="button" onClick={() => void loadLatestMessages(selectedSession.username)}>重试</button></div>
              ) : messages.length === 0 ? (
                <div className="chat-message-state"><MessageSquare size={28} /><span>这个会话暂时没有消息</span></div>
              ) : (
                <Virtuoso
                  key={`${selectedSession.username}-${messageViewMode}`}
                  ref={virtuosoRef}
                  data={messages}
                  firstItemIndex={firstItemIndex}
                  initialTopMostItemIndex={firstItemIndex + messages.length - 1}
                  startReached={() => void loadOlder()}
                  atBottomStateChange={setAtBottom}
                  increaseViewportBy={{ top: 450, bottom: 320 }}
                  components={{
                    Header: () => hasMore && messageViewMode === 'latest'
                      ? <div className="chat-load-older">{loadingOlder ? <><Loader2 size={14} className="spin" />正在加载更早消息…</> : '向上滚动加载更早消息'}</div>
                      : null,
                  }}
                  itemContent={(absoluteIndex, message) => {
                    const index = absoluteIndex - firstItemIndex
                    return (
                      <MessageRow
                        session={selectedSession}
                        message={message}
                        previous={index > 0 ? messages[index - 1] : undefined}
                        myAvatarUrl={myAvatarUrl}
                        highlighted={messageKey(message) === highlightedMessageKey}
                        onPreview={setPreviewImage}
                        onRequireVoiceModel={requireVoiceModel}
                      />
                    )
                  }}
                />
              )}
              {!atBottom && messageViewMode === 'latest' && (
                <button type="button" className="chat-scroll-bottom" onClick={() => scrollToBottom('smooth')} title="回到底部"><ChevronDown size={18} /></button>
              )}
            </div>
          </>
        )}
      </main>

      {selectedSession && sidePanel && (
        <aside className="chat-side-panel">
          <div className="chat-side-panel-head">
            <strong>{sidePanel === 'detail' ? '会话详情' : `群成员（${groupMembers.length || '…'}）`}</strong>
            <button type="button" className="chat-icon-button" onClick={() => setSidePanel(null)}><X size={16} /></button>
          </div>
          {sidePanel === 'detail' ? (
            detailLoading ? (
              <div className="chat-panel-state"><Loader2 size={20} className="spin" />正在读取详情…</div>
            ) : (
              <div className="chat-detail-content">
                <Avatar src={detailFast?.avatarUrl || selectedSession.avatarUrl} name={detailFast?.displayName || selectedSession.displayName} size={68} />
                <h3>{detailFast?.displayName || selectedSession.displayName || selectedSession.username}</h3>
                <span className="chat-kind-pill">{sessionKind(selectedSession.username) === 'group' ? '群聊' : sessionKind(selectedSession.username) === 'official' ? '公众号' : '联系人'}</span>
                <dl>
                  <div><dt>微信 ID</dt><dd>{selectedSession.username}<button type="button" onClick={() => copyText(selectedSession.username)}><Copy size={12} /></button></dd></div>
                  {detailFast?.remark && <div><dt>备注</dt><dd>{detailFast.remark}</dd></div>}
                  {detailFast?.nickName && <div><dt>昵称</dt><dd>{detailFast.nickName}</dd></div>}
                  {detailFast?.alias && <div><dt>微信号</dt><dd>{detailFast.alias}</dd></div>}
                  <div><dt>消息总数</dt><dd>{(detailFast?.messageCount ?? selectedSession.messageCountHint ?? 0).toLocaleString('zh-CN')}</dd></div>
                  <div><dt>第一条消息</dt><dd>{formatFullTime(detailExtra?.firstMessageTime)}</dd></div>
                  <div><dt>最新消息</dt><dd>{formatFullTime(detailExtra?.latestMessageTime || selectedSession.lastTimestamp)}</dd></div>
                </dl>
                {detailExtra?.messageTables?.length ? (
                  <div className="chat-storage-detail">
                    <strong>数据来源</strong>
                    {detailExtra.messageTables.map((table) => <span key={`${table.dbName}-${table.tableName}`}>{table.dbName} · {table.tableName}<i>{table.count.toLocaleString('zh-CN')}</i></span>)}
                  </div>
                ) : null}
                <button type="button" className="chat-panel-primary" onClick={() => onExportSession(selectedSession.username)}><Download size={15} />导出当前会话</button>
              </div>
            )
          ) : (
            <div className="chat-members-content">
              <div className="chat-member-search"><Search size={14} /><input value={memberKeyword} onChange={(event) => setMemberKeyword(event.target.value)} placeholder="搜索群成员" /></div>
              {membersLoading ? (
                <div className="chat-panel-state"><Loader2 size={20} className="spin" />正在读取群成员…</div>
              ) : filteredMembers.length === 0 ? (
                <div className="chat-panel-state">没有匹配的群成员</div>
              ) : (
                <Virtuoso
                  data={filteredMembers}
                  itemContent={(_, member) => (
                    <div className="chat-member-row">
                      <Avatar src={member.avatarUrl} name={member.displayName} size={36} />
                      <span><strong>{member.displayName || member.username}</strong><small>{member.groupNickname || member.remark || member.username}</small></span>
                      <span className="chat-member-meta">{member.isOwner && <i>群主</i>}<b>{member.messageCount.toLocaleString('zh-CN')}</b></span>
                    </div>
                  )}
                />
              )}
            </div>
          )}
        </aside>
      )}

      {operationStatus && (
        <div className="chat-operation-status">
          {batchBusy && <Loader2 size={14} className="spin" />}
          <span>{operationStatus}</span>
          {batchBusy === 'voice' && (
            <button
              type="button"
              className="chat-operation-stop"
              onClick={() => {
                batchVoiceCancelledRef.current = true
                setOperationStatus('正在停止批量转写…')
              }}
            >停止</button>
          )}
          {!batchBusy && <button type="button" onClick={() => setOperationStatus('')}><X size={13} /></button>}
        </div>
      )}

      {showVoiceModelDialog && (
        <VoiceTranscribeDialog
          onClose={() => {
            const pendingBatch = pendingBatchVoiceRef.current
            pendingBatchVoiceRef.current = null
            setShowVoiceModelDialog(false)
            pendingVoiceTranscripts.forEach((request) => window.dispatchEvent(new CustomEvent('voice-model-download-cancelled', { detail: request })))
            setPendingVoiceTranscripts([])
            if (pendingBatch) setOperationStatus('已取消批量语音转写')
          }}
          onDownloadComplete={() => {
            const pendingBatch = pendingBatchVoiceRef.current
            pendingBatchVoiceRef.current = null
            setShowVoiceModelDialog(false)
            pendingVoiceTranscripts.forEach((request) => window.dispatchEvent(new CustomEvent('voice-model-downloaded', { detail: request })))
            setPendingVoiceTranscripts([])
            if (pendingBatch) window.setTimeout(() => { void transcribeLoadedVoices(pendingBatch, true) }, 0)
          }}
        />
      )}

      {previewImage && (
        <div className="chat-image-preview" role="dialog" aria-modal="true" aria-label="图片预览" onClick={() => setPreviewImage('')}>
          <button type="button" aria-label="关闭图片预览" onClick={() => setPreviewImage('')}><X size={22} /></button>
          <img src={previewImage} alt="聊天图片大图" onClick={(event) => event.stopPropagation()} />
        </div>
      )}
    </div>
  )
}
