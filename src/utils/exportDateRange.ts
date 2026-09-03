export type ExportDateRangePreset =
  | 'all'
  | 'today'
  | 'yesterday'
  | 'last3days'
  | 'last7days'
  | 'last30days'
  | 'last1year'
  | 'last2years'
  | 'custom'

export interface ExportDateRange {
  start: Date
  end: Date
}

export interface ExportDateRangeSelection {
  preset: ExportDateRangePreset
  useAllTime: boolean
  dateRange: ExportDateRange
}

export interface ExportDefaultDateRangeConfig {
  version?: 1
  preset?: ExportDateRangePreset | string
  useAllTime?: boolean
  start?: string | number | Date | null
  end?: string | number | Date | null
}

export const EXPORT_DATE_RANGE_PRESETS: Array<{
  value: Exclude<ExportDateRangePreset, 'custom' | 'last2years'>
  label: string
}> = [
  { value: 'all', label: '全部时间' },
  { value: 'today', label: '今天' },
  { value: 'yesterday', label: '昨天' },
  { value: 'last3days', label: '最近3天' },
  { value: 'last7days', label: '最近一周' },
  { value: 'last30days', label: '最近30天' },
  { value: 'last1year', label: '最近一年' },
]

const PRESET_LABELS: Record<Exclude<ExportDateRangePreset, 'custom'>, string> = {
  all: '全部时间',
  today: '今天',
  yesterday: '昨天',
  last3days: '最近3天',
  last7days: '最近一周',
  last30days: '最近30天',
  last1year: '最近一年',
  last2years: '最近两年',
}

const LEGACY_PRESET_MAP: Record<string, Exclude<ExportDateRangePreset, 'custom'> | 'legacy90days'> = {
  all: 'all',
  today: 'today',
  yesterday: 'yesterday',
  last3days: 'last3days',
  last7days: 'last7days',
  last30days: 'last30days',
  last1year: 'last1year',
  last2years: 'last2years',
  '7d': 'last7days',
  '30d': 'last30days',
  '90d': 'legacy90days',
}

export const startOfDay = (date: Date): Date => {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

export const endOfDay = (date: Date): Date => {
  const next = new Date(date)
  next.setHours(23, 59, 59, 999)
  return next
}

const createDefaultDateRange = (now = new Date()): ExportDateRange => ({
  start: startOfDay(now),
  end: new Date(now),
})

export const createDateRangeByPreset = (
  preset: Exclude<ExportDateRangePreset, 'all' | 'custom'>,
  now = new Date(),
): ExportDateRange => {
  const end = new Date(now)
  const baseStart = startOfDay(now)

  if (preset === 'today') return { start: baseStart, end }

  if (preset === 'yesterday') {
    const yesterday = new Date(baseStart)
    yesterday.setDate(yesterday.getDate() - 1)
    return { start: yesterday, end: endOfDay(yesterday) }
  }

  if (preset === 'last1year' || preset === 'last2years') {
    const start = new Date(baseStart)
    const expectedMonth = start.getMonth()
    start.setFullYear(start.getFullYear() - (preset === 'last1year' ? 1 : 2))
    // 2 月 29 日向非闰年回退时，保持在目标月份最后一天。
    if (start.getMonth() !== expectedMonth) start.setDate(0)
    return { start, end }
  }

  const daysBack = preset === 'last3days' ? 2 : preset === 'last7days' ? 6 : 29
  const start = new Date(baseStart)
  start.setDate(start.getDate() - daysBack)
  return { start, end }
}

const createDateRangeByLastNDays = (days: number, now = new Date()): ExportDateRange => {
  const start = startOfDay(now)
  start.setDate(start.getDate() - Math.max(0, days - 1))
  return { start, end: new Date(now) }
}

export const createExportDateRangeSelectionFromPreset = (
  preset: Exclude<ExportDateRangePreset, 'custom'>,
  now = new Date(),
): ExportDateRangeSelection => ({
  preset,
  useAllTime: preset === 'all',
  dateRange: preset === 'all' ? createDefaultDateRange(now) : createDateRangeByPreset(preset, now),
})

// Weport 既有行为是导出全部消息；新增设置时继续以“全部时间”为默认，避免静默缩小导出范围。
export const createDefaultExportDateRangeSelection = (now = new Date()): ExportDateRangeSelection => (
  createExportDateRangeSelectionFromPreset('all', now)
)

export const formatDateValue = (date: Date): string => {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

const formatStoredDateTime = (date: Date): string => {
  const hours = `${date.getHours()}`.padStart(2, '0')
  const minutes = `${date.getMinutes()}`.padStart(2, '0')
  const seconds = `${date.getSeconds()}`.padStart(2, '0')
  return `${formatDateValue(date)} ${hours}:${minutes}:${seconds}`
}

export const parseDateValue = (value: string, boundary: 'start' | 'end'): Date | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const parsed = new Date(year, month - 1, day)
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return null
  return boundary === 'start' ? startOfDay(parsed) : endOfDay(parsed)
}

const parseStoredDate = (value: unknown): Date | null => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return new Date(value)
  if (typeof value === 'number' && Number.isFinite(value)) {
    const timestamp = value > 10_000_000_000 ? value : value * 1000
    const parsed = new Date(timestamp)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  if (typeof value !== 'string') return null

  // 按本地时区解析参考项目写入的 `YYYY-MM-DD HH:mm`，避免浏览器把纯日期当作 UTC。
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(value.trim())
  if (match) {
    const year = Number(match[1])
    const month = Number(match[2])
    const day = Number(match[3])
    const hours = Number(match[4] || 0)
    const minutes = Number(match[5] || 0)
    const seconds = Number(match[6] || 0)
    const parsed = new Date(year, month - 1, day, hours, minutes, seconds)
    if (
      parsed.getFullYear() === year &&
      parsed.getMonth() === month - 1 &&
      parsed.getDate() === day &&
      parsed.getHours() === hours &&
      parsed.getMinutes() === minutes
    ) return parsed
    return null
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const normalizePreset = (raw: unknown): Exclude<ExportDateRangePreset, 'custom'> | 'legacy90days' | null => {
  if (typeof raw !== 'string') return null
  return LEGACY_PRESET_MAP[raw] ?? null
}

export const resolveExportDateRangeConfig = (
  raw: ExportDefaultDateRangeConfig | string | null | undefined,
  now = new Date(),
): ExportDateRangeSelection => {
  if (!raw) return createDefaultExportDateRangeSelection(now)

  if (typeof raw === 'string') {
    const preset = normalizePreset(raw)
    if (!preset) return createDefaultExportDateRangeSelection(now)
    if (preset === 'legacy90days') {
      return { preset: 'custom', useAllTime: false, dateRange: createDateRangeByLastNDays(90, now) }
    }
    return createExportDateRangeSelectionFromPreset(preset, now)
  }

  const preset = normalizePreset(raw.preset)
  if (raw.useAllTime || preset === 'all') return createExportDateRangeSelectionFromPreset('all', now)
  if (preset && preset !== 'legacy90days') return createExportDateRangeSelectionFromPreset(preset, now)
  if (preset === 'legacy90days') {
    return { preset: 'custom', useAllTime: false, dateRange: createDateRangeByLastNDays(90, now) }
  }

  const parsedStart = parseStoredDate(raw.start)
  const parsedEnd = parseStoredDate(raw.end)
  if (!parsedStart || !parsedEnd) return createDefaultExportDateRangeSelection(now)

  return {
    preset: 'custom',
    useAllTime: false,
    dateRange: {
      start: startOfDay(parsedStart),
      end: endOfDay(parsedEnd < parsedStart ? parsedStart : parsedEnd),
    },
  }
}

export const serializeExportDateRangeConfig = (
  selection: ExportDateRangeSelection,
): ExportDefaultDateRangeConfig => {
  if (selection.useAllTime) return { version: 1, preset: 'all', useAllTime: true }
  if (selection.preset === 'custom') {
    return {
      version: 1,
      preset: 'custom',
      useAllTime: false,
      start: formatStoredDateTime(selection.dateRange.start),
      end: formatStoredDateTime(selection.dateRange.end),
    }
  }
  return { version: 1, preset: selection.preset, useAllTime: false }
}

export const getExportDateRangeLabel = (selection: ExportDateRangeSelection): string => {
  if (selection.useAllTime) return PRESET_LABELS.all
  if (selection.preset !== 'custom') return PRESET_LABELS[selection.preset]
  return `${formatDateValue(selection.dateRange.start)} 至 ${formatDateValue(selection.dateRange.end)}`
}

export const toExportTimestampRange = (
  selection: ExportDateRangeSelection,
  now = new Date(),
): { start: number; end: number } | null => {
  if (selection.useAllTime || selection.preset === 'all') return null
  const range = selection.preset === 'custom'
    ? selection.dateRange
    : createDateRangeByPreset(selection.preset, now)
  return {
    start: Math.floor(range.start.getTime() / 1000),
    end: Math.floor(range.end.getTime() / 1000),
  }
}
