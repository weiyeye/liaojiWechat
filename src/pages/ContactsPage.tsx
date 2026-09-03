import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  BadgeCheck,
  Ban,
  BookUser,
  Braces,
  Check,
  ContactRound,
  Download,
  FileSpreadsheet,
  FolderOpen,
  MessageCircleMore,
  RefreshCw,
  Search,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react'
import { Virtuoso } from 'react-virtuoso'
import { Avatar } from '../components/Avatar'
import './ContactsPage.scss'

type ContactFilter = 'all' | WechatContactType
type ContactExportFormat = ContactExportRequest['format']
type ContactFieldKey = keyof ContactExportFields
type NotifyKind = 'ok' | 'err' | 'info'

interface ContactsPageProps {
  onNotify?: (kind: NotifyKind, title: string, body?: string) => void
}

const AVATAR_BATCH_SIZE = 60

const FILTERS: Array<{
  id: ContactFilter
  label: string
  icon: typeof ContactRound
}> = [
  { id: 'all', label: '全部', icon: BookUser },
  { id: 'friend', label: '好友', icon: UserRound },
  { id: 'group', label: '群聊', icon: UsersRound },
  { id: 'official', label: '公众号', icon: BadgeCheck },
  { id: 'former_friend', label: '已删除', icon: ContactRound },
  { id: 'blocked', label: '黑名单', icon: Ban },
]

const FORMATS: Array<{
  id: ContactExportFormat
  title: string
  description: string
  icon: typeof FileSpreadsheet
}> = [
  { id: 'csv', title: 'CSV', description: '适合 Excel 查看与整理', icon: FileSpreadsheet },
  { id: 'json', title: 'JSON', description: '保留完整结构化字段', icon: Braces },
  { id: 'vcf', title: 'VCF', description: '导入系统通讯录，仅好友', icon: ContactRound },
]

const FIELD_OPTIONS: Array<{ key: ContactFieldKey; label: string; description: string }> = [
  { key: 'displayName', label: '显示名称', description: '当前展示的联系人名称' },
  { key: 'remark', label: '备注', description: '你为联系人设置的备注' },
  { key: 'nickname', label: '昵称', description: '联系人微信昵称' },
  { key: 'alias', label: '微信号', description: '联系人设置的微信号' },
  { key: 'labels', label: '标签', description: '微信联系人标签' },
  { key: 'description', label: '描述', description: '联系人描述信息' },
  { key: 'detailDescription', label: '个性签名', description: '个人签名或详细描述' },
  { key: 'region', label: '地区', description: '联系人所在地区' },
]

const DEFAULT_FIELDS: ContactExportFields = {
  displayName: true,
  remark: true,
  nickname: true,
  alias: true,
  labels: true,
  description: true,
  detailDescription: true,
  region: true,
}

function getContactTypeLabel(contact: WechatContactInfo): string {
  if (contact.type === 'official') {
    if (contact.officialAccountKind === 'service') return '服务号'
    if (contact.officialAccountKind === 'enterprise') return '企业号'
    return '公众号'
  }
  switch (contact.type) {
    case 'friend': return '好友'
    case 'group': return '群聊'
    case 'former_friend': return '已删除'
    case 'blocked': return '黑名单'
    default: return '其他'
  }
}

function getContactSearchText(contact: WechatContactInfo): string {
  return [
    contact.displayName,
    contact.remark,
    contact.nickname,
    contact.alias,
    contact.username,
    contact.labels?.join(' '),
    contact.region,
  ].filter(Boolean).join(' ').toLocaleLowerCase()
}

export default function ContactsPage({ onNotify }: ContactsPageProps) {
  const api = window.electronAPI
  const loadGenerationRef = useRef(0)
  const [contacts, setContacts] = useState<WechatContactInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<ContactFilter>('all')
  const [selectedUsernames, setSelectedUsernames] = useState<Set<string>>(new Set())
  const [avatarProgress, setAvatarProgress] = useState<{ done: number; total: number } | null>(null)
  const [format, setFormat] = useState<ContactExportFormat>('csv')
  const [fields, setFields] = useState<ContactExportFields>(DEFAULT_FIELDS)
  const [outputDirectory, setOutputDirectory] = useState('')
  const [exporting, setExporting] = useState(false)
  const [lastExportPath, setLastExportPath] = useState('')

  const enrichContactAvatars = useCallback(async (source: WechatContactInfo[], generation: number) => {
    const usernames = source
      .filter((contact) => !contact.avatarUrl)
      .map((contact) => contact.username)
      .filter(Boolean)
    if (usernames.length === 0) return

    setAvatarProgress({ done: 0, total: usernames.length })
    for (let offset = 0; offset < usernames.length; offset += AVATAR_BATCH_SIZE) {
      if (loadGenerationRef.current !== generation) return
      const batch = usernames.slice(offset, offset + AVATAR_BATCH_SIZE)
      try {
        const result = await api.chat.enrichSessionsContactInfo(batch, { onlyMissingAvatar: true }) as {
          success: boolean
          contacts?: Record<string, { displayName?: string; avatarUrl?: string }>
        }
        if (loadGenerationRef.current !== generation) return
        if (result.success && result.contacts) {
          const enriched = result.contacts
          setContacts((current) => current.map((contact) => {
            const extra = enriched[contact.username]
            if (!extra) return contact
            return {
              ...contact,
              displayName: extra.displayName || contact.displayName,
              avatarUrl: extra.avatarUrl || contact.avatarUrl,
            }
          }))
        }
      } catch {
        // 单批头像失败不影响联系人列表与导出；Avatar 会自动显示文字占位。
      }
      setAvatarProgress({ done: Math.min(offset + batch.length, usernames.length), total: usernames.length })
    }
    if (loadGenerationRef.current === generation) setAvatarProgress(null)
  }, [api])

  const loadContacts = useCallback(async () => {
    const generation = loadGenerationRef.current + 1
    loadGenerationRef.current = generation
    setLoading(true)
    setLoadError('')
    setAvatarProgress(null)
    try {
      const result = await api.chat.getContacts()
      if (loadGenerationRef.current !== generation) return
      if (!result.success || !result.contacts) {
        throw new Error(result.error || '联系人读取失败')
      }
      setContacts(result.contacts)
      const existingUsernames = new Set(result.contacts.map((contact) => contact.username))
      setSelectedUsernames((current) => new Set([...current].filter((username) => existingUsernames.has(username))))
      void enrichContactAvatars(result.contacts, generation)
    } catch (error) {
      if (loadGenerationRef.current === generation) {
        setContacts([])
        setLoadError(error instanceof Error ? error.message : String(error))
      }
    } finally {
      if (loadGenerationRef.current === generation) setLoading(false)
    }
  }, [api, enrichContactAvatars])

  useEffect(() => {
    void loadContacts()
    return () => {
      loadGenerationRef.current += 1
    }
  }, [loadContacts])

  useEffect(() => {
    let active = true
    void api.config.get('exportPath').then((value) => {
      if (active && typeof value === 'string') setOutputDirectory(value)
    }).catch(() => undefined)
    return () => {
      active = false
    }
  }, [api])

  const typeCounts = useMemo(() => {
    const counts: Record<ContactFilter, number> = {
      all: contacts.length,
      friend: 0,
      group: 0,
      official: 0,
      former_friend: 0,
      blocked: 0,
      other: 0,
    }
    for (const contact of contacts) counts[contact.type] += 1
    return counts
  }, [contacts])

  const filteredContacts = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase()
    return contacts.filter((contact) => {
      if (filter !== 'all' && contact.type !== filter) return false
      return !keyword || getContactSearchText(contact).includes(keyword)
    })
  }, [contacts, filter, search])

  const selectedFriendCount = useMemo(() => {
    if (selectedUsernames.size === 0) return 0
    return contacts.reduce((count, contact) => (
      contact.type === 'friend' && selectedUsernames.has(contact.username) ? count + 1 : count
    ), 0)
  }, [contacts, selectedUsernames])

  const allVisibleSelected = filteredContacts.length > 0
    && filteredContacts.every((contact) => selectedUsernames.has(contact.username))
  const exportableCount = format === 'vcf' ? selectedFriendCount : selectedUsernames.size
  const exportDisabled = loading || exporting || !outputDirectory.trim() || exportableCount === 0

  const toggleContact = useCallback((username: string) => {
    setSelectedUsernames((current) => {
      const next = new Set(current)
      if (next.has(username)) next.delete(username)
      else next.add(username)
      return next
    })
  }, [])

  const toggleVisibleContacts = useCallback(() => {
    setSelectedUsernames((current) => {
      const next = new Set(current)
      const shouldClear = filteredContacts.length > 0
        && filteredContacts.every((contact) => next.has(contact.username))
      for (const contact of filteredContacts) {
        if (shouldClear) next.delete(contact.username)
        else next.add(contact.username)
      }
      return next
    })
  }, [filteredContacts])

  const chooseOutputDirectory = useCallback(async () => {
    const selectedPath = await api.dialog.openDirectory({
      title: '选择联系人导出目录',
      defaultPath: outputDirectory || undefined,
    })
    if (!selectedPath) return
    setOutputDirectory(selectedPath)
    await api.config.set('exportPath', selectedPath)
  }, [api, outputDirectory])

  const runExport = useCallback(async () => {
    if (exportDisabled) return
    setExporting(true)
    setLastExportPath('')
    try {
      const result = await api.export.exportContacts(outputDirectory.trim(), {
        format,
        fields,
        contactTypes: {
          friends: true,
          groups: true,
          officials: true,
          formerFriends: true,
          blocked: true,
          other: true,
        },
        selectedUsernames: [...selectedUsernames],
      })
      if (!result.success) throw new Error(result.error || '联系人导出失败')

      setLastExportPath(result.outputPath || '')
      onNotify?.('ok', '联系人导出完成', `成功导出 ${result.successCount || 0} 个联系人`)
      await api.shell.openPath(result.outputDirectory || outputDirectory.trim())
    } catch (error) {
      onNotify?.('err', '联系人导出失败', error instanceof Error ? error.message : String(error))
    } finally {
      setExporting(false)
    }
  }, [api, exportDisabled, fields, format, onNotify, outputDirectory, selectedUsernames])

  return (
    <div className="contacts-export-page">
      <section className="contacts-browser-panel" aria-label="联系人列表">
        <header className="contacts-browser-header">
          <div>
            <h2><BookUser size={18} />联系人</h2>
            <p>{loading ? '正在读取联系人…' : `共 ${contacts.length.toLocaleString()} 个联系人`}</p>
          </div>
          <button
            type="button"
            className="contacts-icon-btn"
            aria-label="刷新联系人"
            title="刷新联系人"
            disabled={loading}
            onClick={() => void loadContacts()}
          >
            <RefreshCw size={16} className={loading ? 'is-spinning' : ''} />
          </button>
        </header>

        <div className="contacts-search-box">
          <Search size={15} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜索名称、备注、微信号或标签…"
            aria-label="搜索联系人"
          />
          {search && (
            <button type="button" aria-label="清除搜索" onClick={() => setSearch('')}>
              <X size={14} />
            </button>
          )}
        </div>

        <div className="contacts-filter-grid" role="tablist" aria-label="联系人类型">
          {FILTERS.map((item) => {
            const Icon = item.icon
            const isActive = filter === item.id
            return (
              <button
                key={item.id}
                type="button"
                className={isActive ? 'is-active' : ''}
                role="tab"
                aria-selected={isActive}
                onClick={() => setFilter(item.id)}
              >
                <Icon size={14} />
                <span>{item.label}</span>
                <strong>{typeCounts[item.id].toLocaleString()}</strong>
              </button>
            )
          })}
        </div>

        <div className="contacts-selection-bar">
          <button type="button" disabled={filteredContacts.length === 0} onClick={toggleVisibleContacts}>
            <span className={`contacts-check ${allVisibleSelected ? 'is-checked' : ''}`}>
              {allVisibleSelected && <Check size={12} />}
            </span>
            {allVisibleSelected ? '取消当前' : '全选当前'}
          </button>
          <span>已选 {selectedUsernames.size.toLocaleString()}</span>
          {selectedUsernames.size > 0 && (
            <button type="button" className="contacts-clear-selection" onClick={() => setSelectedUsernames(new Set())}>
              清空
            </button>
          )}
        </div>

        <div className="contacts-list-status">
          <span>{search || filter !== 'all' ? `筛选结果 ${filteredContacts.length.toLocaleString()} 项` : '联系人与群聊'}</span>
          {avatarProgress && (
            <span>头像 {avatarProgress.done}/{avatarProgress.total}</span>
          )}
        </div>

        <div className="contacts-list-body">
          {loading ? (
            <div className="contacts-empty-state">
              <RefreshCw size={24} className="is-spinning" />
              <strong>正在读取联系人</strong>
              <span>首次加载会同时整理名称和联系人类型</span>
            </div>
          ) : loadError ? (
            <div className="contacts-empty-state is-error">
              <Ban size={24} />
              <strong>联系人读取失败</strong>
              <span>{loadError}</span>
              <button type="button" className="ghost-btn" onClick={() => void loadContacts()}>重新加载</button>
            </div>
          ) : filteredContacts.length === 0 ? (
            <div className="contacts-empty-state">
              <Search size={24} />
              <strong>没有匹配的联系人</strong>
              <span>可以尝试更换类型或搜索词</span>
            </div>
          ) : (
            <Virtuoso
              data={filteredContacts}
              style={{ height: '100%' }}
              increaseViewportBy={240}
              itemContent={(_, contact) => {
                const selected = selectedUsernames.has(contact.username)
                return (
                  <label className={`contacts-list-item ${selected ? 'is-selected' : ''}`}>
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleContact(contact.username)}
                    />
                    <span className={`contacts-check ${selected ? 'is-checked' : ''}`} aria-hidden="true">
                      {selected && <Check size={12} />}
                    </span>
                    <Avatar src={contact.avatarUrl} name={contact.displayName || contact.username} size={38} />
                    <span className="contacts-item-copy">
                      <strong title={contact.displayName || contact.username}>{contact.displayName || contact.username}</strong>
                      <span title={contact.alias || contact.username}>
                        {contact.alias ? `微信号：${contact.alias}` : contact.username}
                      </span>
                    </span>
                    <span className={`contacts-type-badge type-${contact.type}`}>{getContactTypeLabel(contact)}</span>
                  </label>
                )
              }}
            />
          )}
        </div>
      </section>

      <section className="contacts-export-panel" aria-label="联系人导出设置">
        <header className="contacts-export-header">
          <span className="contacts-export-icon"><Download size={18} /></span>
          <div>
            <h2>导出联系人</h2>
            <p>选择格式、字段和保存位置</p>
          </div>
          <span className="contacts-selected-count">{selectedUsernames.size} 项</span>
        </header>

        <div className="contacts-export-scroll">
          <div className="contacts-setting-section">
            <div className="contacts-setting-title">
              <span>1</span>
              <div>
                <strong>导出格式</strong>
                <small>CSV 默认，更适合直接查看</small>
              </div>
            </div>
            <div className="contacts-format-grid">
              {FORMATS.map((item) => {
                const Icon = item.icon
                const active = format === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={active ? 'is-active' : ''}
                    onClick={() => setFormat(item.id)}
                  >
                    <Icon size={17} />
                    <span><strong>{item.title}</strong><small>{item.description}</small></span>
                    <span className={`contacts-radio ${active ? 'is-active' : ''}`} />
                  </button>
                )
              })}
            </div>
            {format === 'vcf' && selectedUsernames.size > selectedFriendCount && (
              <p className="contacts-inline-note">
                VCF 仅导出好友；当前可导出 {selectedFriendCount} 个，群聊和公众号将自动跳过。
              </p>
            )}
          </div>

          <div className="contacts-setting-section">
            <div className="contacts-setting-title">
              <span>2</span>
              <div>
                <strong>导出字段</strong>
                <small>用户名和联系人类型始终保留</small>
              </div>
              <button
                type="button"
                className="contacts-fields-toggle"
                onClick={() => {
                  const shouldSelectAll = Object.values(fields).some((enabled) => !enabled)
                  setFields(Object.fromEntries(
                    Object.keys(fields).map((key) => [key, shouldSelectAll]),
                  ) as unknown as ContactExportFields)
                }}
              >
                {Object.values(fields).every(Boolean) ? '取消全部' : '全部选择'}
              </button>
            </div>
            <div className="contacts-fields-grid">
              {FIELD_OPTIONS.map((item) => (
                <label key={item.key} className={fields[item.key] ? 'is-checked' : ''} title={item.description}>
                  <input
                    type="checkbox"
                    checked={fields[item.key]}
                    onChange={() => setFields((current) => ({ ...current, [item.key]: !current[item.key] }))}
                  />
                  <span className={`contacts-check ${fields[item.key] ? 'is-checked' : ''}`}>
                    {fields[item.key] && <Check size={12} />}
                  </span>
                  {item.label}
                </label>
              ))}
            </div>
          </div>

          <div className="contacts-setting-section">
            <div className="contacts-setting-title">
              <span>3</span>
              <div>
                <strong>保存位置</strong>
                <small>默认使用桌面的 exportWechatDir</small>
              </div>
            </div>
            <div className="contacts-path-row">
              <FolderOpen size={15} />
              <input
                value={outputDirectory}
                onChange={(event) => setOutputDirectory(event.target.value)}
                onBlur={() => {
                  if (outputDirectory.trim()) void api.config.set('exportPath', outputDirectory.trim())
                }}
                placeholder="请选择联系人导出目录…"
                aria-label="联系人导出目录"
              />
              <button type="button" onClick={() => void chooseOutputDirectory()}>浏览</button>
            </div>
          </div>

          {lastExportPath && (
            <div className="contacts-last-export">
              <Check size={15} />
              <div>
                <strong>最近一次导出</strong>
                <span title={lastExportPath}>{lastExportPath}</span>
              </div>
            </div>
          )}
        </div>

        <footer className="contacts-export-footer">
          <div>
            <strong>{exportableCount.toLocaleString()}</strong>
            <span>{format === 'vcf' ? '个好友可导出' : '个联系人待导出'}</span>
          </div>
          <button type="button" disabled={exportDisabled} onClick={() => void runExport()}>
            {exporting ? <RefreshCw size={16} className="is-spinning" /> : <Download size={16} />}
            {exporting ? '正在导出…' : exportableCount === 0 ? '请先选择联系人' : `导出 ${exportableCount} 项`}
          </button>
        </footer>
      </section>
    </div>
  )
}
