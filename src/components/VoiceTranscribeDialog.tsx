import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle, CheckCircle2, Download, Loader2, X } from 'lucide-react'
import './VoiceTranscribeDialog.scss'

interface VoiceTranscribeDialogProps {
  onClose: () => void
  onDownloadComplete: () => void
}

function formatMegabytes(bytes: number): string {
  return `${(Math.max(0, bytes) / 1024 / 1024).toFixed(1)} MB`
}

export function VoiceTranscribeDialog({ onClose, onDownloadComplete }: VoiceTranscribeDialogProps) {
  const [downloading, setDownloading] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [complete, setComplete] = useState(false)
  const [progress, setProgress] = useState(0)
  const [downloadedBytes, setDownloadedBytes] = useState(0)
  const [totalBytes, setTotalBytes] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => window.electronAPI.whisper.onDownloadProgress((payload) => {
    const downloaded = Math.max(0, Number(payload.downloadedBytes || 0))
    const total = Math.max(0, Number(payload.totalBytes || 0))
    const percentage = Number.isFinite(payload.percent)
      ? Number(payload.percent)
      : (total > 0 ? (downloaded / total) * 100 : 0)
    setDownloadedBytes(downloaded)
    setTotalBytes(total)
    setProgress(Math.max(0, Math.min(100, percentage)))
  }), [])

  const startDownload = async () => {
    if (downloading) return
    setDownloading(true)
    setError('')
    setProgress(0)
    setDownloadedBytes(0)
    setTotalBytes(0)
    try {
      const result = await window.electronAPI.whisper.downloadModel()
      if (!result.success) throw new Error(result.error || '模型下载失败')
      setComplete(true)
      setProgress(100)
      window.setTimeout(onDownloadComplete, 650)
    } catch (reason) {
      setError(String((reason as Error)?.message || reason))
      setDownloading(false)
    }
  }

  const cancelDownload = async () => {
    if (cancelling) return
    setCancelling(true)
    try {
      await window.electronAPI.whisper.cancelDownloadModel()
    } finally {
      setCancelling(false)
    }
  }

  const canClose = !downloading && !complete
  return createPortal(
    <div className="voice-model-overlay" role="presentation" onClick={() => canClose && onClose()}>
      <section className="voice-model-dialog" role="dialog" aria-modal="true" aria-labelledby="voice-model-title" onClick={(event) => event.stopPropagation()}>
        <header>
          <div>
            <span className="voice-model-icon"><Download size={17} /></span>
            <div><h3 id="voice-model-title">语音转文字</h3><p>本地离线识别模型</p></div>
          </div>
          {canClose && <button type="button" aria-label="关闭" onClick={onClose}><X size={18} /></button>}
        </header>

        {!downloading && !complete && (
          <div className="voice-model-content">
            <div className="voice-model-notice"><AlertCircle size={18} /><span>首次使用需要下载模型，聊天语音不会上传到网络。</span></div>
            <dl>
              <div><dt>模型</dt><dd>SenseVoiceSmall</dd></div>
              <div><dt>大小</dt><dd>约 245 MB</dd></div>
              <div><dt>语言</dt><dd>中文、粤语、英语、日语、韩语</dd></div>
            </dl>
            {error && <div className="voice-model-error"><AlertCircle size={15} /><span>{error}</span></div>}
            <footer><button type="button" className="secondary" onClick={onClose}>稍后</button><button type="button" className="primary" onClick={() => void startDownload()}><Download size={15} />下载模型</button></footer>
          </div>
        )}

        {downloading && !complete && (
          <div className="voice-model-progress">
            <Loader2 size={30} className="spin" />
            <strong>{downloadedBytes > 0 ? '正在下载模型…' : '正在连接下载服务器…'}</strong>
            <div className="voice-model-track"><i style={{ width: `${progress}%` }} /></div>
            <span>{progress.toFixed(1)}%{downloadedBytes > 0 ? ` · ${formatMegabytes(downloadedBytes)}${totalBytes > 0 ? ` / ${formatMegabytes(totalBytes)}` : ''}` : ''}</span>
            {error && <div className="voice-model-error"><AlertCircle size={15} /><span>{error}</span></div>}
            <button type="button" className="secondary" disabled={cancelling} onClick={() => void cancelDownload()}>{cancelling ? '正在取消…' : '取消下载'}</button>
          </div>
        )}

        {complete && (
          <div className="voice-model-progress complete"><CheckCircle2 size={34} /><strong>模型已就绪</strong><span>正在继续转写…</span></div>
        )}
      </section>
    </div>,
    document.body,
  )
}
