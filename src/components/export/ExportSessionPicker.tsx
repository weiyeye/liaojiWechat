import { Check, RefreshCw, Search, Users } from 'lucide-react'
import { Virtuoso } from 'react-virtuoso'
import { SessionIdentity } from '../SessionIdentity'
import type { SessionIdentityItem } from '../../utils/sessionIdentity'

export type ExportSessionType = 'all' | 'private' | 'group' | 'official'
export type ExportSelectionMode = 'all' | 'selected'

export interface ExportSessionPickerItem extends SessionIdentityItem {
  summary?: string
  messageCountHint?: number
  sortTimestamp?: number
  lastTimestamp?: number
}

interface ExportSessionPickerProps {
  sessions: ExportSessionPickerItem[]
  totalSessions?: number
  selectedIds: Set<string>
  selectionMode: ExportSelectionMode
  search: string
  type: ExportSessionType
  loading: boolean
  onSearchChange: (value: string) => void
  onTypeChange: (value: ExportSessionType) => void
  onSelectionModeChange: (value: ExportSelectionMode) => void
  onToggle: (username: string) => void
  onToggleVisible: () => void
  onRefresh: () => void
  allVisibleSelected: boolean
  disabled?: boolean
}

export default function ExportSessionPicker({
  sessions,
  totalSessions = sessions.length,
  selectedIds,
  selectionMode,
  search,
  type,
  loading,
  onSearchChange,
  onTypeChange,
  onSelectionModeChange,
  onToggle,
  onToggleVisible,
  onRefresh,
  allVisibleSelected,
  disabled = false,
}: ExportSessionPickerProps) {
  const selectionCountLabel = selectionMode === 'all' ? `全部 ${totalSessions}` : `已选 ${selectedIds.size}`
  const isFiltered = type !== 'all' || search.trim().length > 0

  const toggleSession = (username: string) => {
    if (selectionMode === 'all') onSelectionModeChange('selected')
    onToggle(username)
  }

  const toggleVisible = () => {
    if (selectionMode === 'all') onSelectionModeChange('selected')
    onToggleVisible()
  }

  return (
    <aside className="export-session-sidebar" aria-label="选择导出会话">
      <div className="export-session-sidebar-head">
        <div className="export-session-picker-title">
          <span className="export-session-step">1</span>
          <Users size={15} />
          <strong>选择会话</strong>
          <span className="export-selection-count">{selectionCountLabel}</span>
        </div>
        <button
          className="ghost-btn icon-only"
          type="button"
          aria-label="刷新会话列表"
          title="刷新会话列表"
          disabled={disabled || loading}
          onClick={onRefresh}
        >
          <RefreshCw size={13} className={loading ? 'spin' : undefined} />
        </button>
      </div>

      <p className="export-session-sidebar-hint">
        {selectionMode === 'all'
          ? '当前导出全部会话；直接勾选会自动切换为仅导出选中项。'
          : '仅导出已勾选的会话，搜索和分类不会清除隐藏的已选项。'}
      </p>

      <div className="export-session-picker-toolbar">
        <label className="export-session-search">
          <Search size={13} />
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="搜索联系人、群聊或微信号…"
            aria-label="搜索导出会话"
            disabled={disabled || loading}
          />
        </label>
        <div className="export-session-filters" role="radiogroup" aria-label="会话类型">
          {([
            ['all', '全部'],
            ['private', '私聊'],
            ['group', '群聊'],
            ['official', '公众号'],
          ] as Array<[ExportSessionType, string]>).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={type === value}
              data-active={type === value}
              disabled={disabled || loading}
              onClick={() => onTypeChange(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="export-session-scope">
        <div className="export-selection-mode" role="radiogroup" aria-label="导出范围">
          {([
            ['all', '全部会话'],
            ['selected', `仅选中（${selectedIds.size}）`],
          ] as Array<[ExportSelectionMode, string]>).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={selectionMode === value}
              data-active={selectionMode === value}
              disabled={disabled || loading}
              onClick={() => onSelectionModeChange(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          className="ghost-btn compact"
          type="button"
          disabled={disabled || loading || sessions.length === 0}
          onClick={toggleVisible}
        >
          {allVisibleSelected ? '取消当前' : '全选当前'}
        </button>
      </div>

      <div className="export-session-list-head">
        <span>{isFiltered ? '筛选结果' : '联系人与群聊'}</span>
        <span>{sessions.length} 项</span>
      </div>

      <div className="export-session-list" role="listbox" aria-label="导出会话列表" aria-multiselectable="true">
        {loading ? (
          <div className="export-session-empty">正在加载会话…</div>
        ) : sessions.length === 0 ? (
          <div className="export-session-empty">没有匹配的会话</div>
        ) : (
          <Virtuoso
            data={sessions}
            style={{ height: '100%' }}
            overscan={240}
            computeItemKey={(_index, session) => session.username}
            itemContent={(_index, session) => {
              const selected = selectedIds.has(session.username)
              const count = Number(session.messageCountHint)
              return (
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className="export-session-row"
                  data-selected={selected}
                  disabled={disabled}
                  onClick={() => toggleSession(session.username)}
                >
                  <span className="export-session-check" aria-hidden="true">
                    {selected && <Check size={11} strokeWidth={2.5} />}
                  </span>
                  <SessionIdentity session={session} avatarSize={36} />
                  <span className="export-session-count">
                    {Number.isFinite(count) && count >= 0 ? `${count.toLocaleString()} 条` : ''}
                  </span>
                </button>
              )
            }}
          />
        )}
      </div>
    </aside>
  )
}
