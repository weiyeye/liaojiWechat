import * as fs from 'fs'
import * as path from 'path'
import { chatService, type ContactInfo } from './chatService'

export type ContactExportFormat = 'json' | 'csv' | 'vcf'

export interface ContactExportFields {
  displayName: boolean
  remark: boolean
  nickname: boolean
  alias: boolean
  labels: boolean
  description: boolean
  detailDescription: boolean
  region: boolean
}

export interface ContactExportOptions {
  format: ContactExportFormat
  exportAvatars?: boolean
  fields?: Partial<ContactExportFields>
  contactTypes?: {
    friends?: boolean
    groups?: boolean
    officials?: boolean
    formerFriends?: boolean
    blocked?: boolean
    other?: boolean
  }
  selectedUsernames?: string[]
}

export interface ContactExportResult {
  success: boolean
  successCount?: number
  outputPath?: string
  outputDirectory?: string
  error?: string
}

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

/** 联系人导出服务。 */
class ContactExportService {
  async exportContacts(outputDir: string, options: ContactExportOptions): Promise<ContactExportResult> {
    try {
      const contactsResult = await chatService.getContacts()
      if (!contactsResult.success || !contactsResult.contacts) {
        return { success: false, error: contactsResult.error || '获取联系人失败' }
      }

      const selectedUsernames = Array.isArray(options.selectedUsernames)
        ? new Set(options.selectedUsernames.filter(Boolean))
        : null
      const contactTypes = {
        friends: options.contactTypes?.friends ?? true,
        groups: options.contactTypes?.groups ?? true,
        officials: options.contactTypes?.officials ?? true,
        formerFriends: options.contactTypes?.formerFriends ?? true,
        blocked: options.contactTypes?.blocked ?? true,
        other: options.contactTypes?.other ?? true,
      }

      let contacts = contactsResult.contacts.filter((contact) => {
        if (selectedUsernames && !selectedUsernames.has(contact.username)) return false
        switch (contact.type) {
          case 'friend': return contactTypes.friends
          case 'group': return contactTypes.groups
          case 'official': return contactTypes.officials
          case 'former_friend': return contactTypes.formerFriends
          case 'blocked': return contactTypes.blocked
          default: return contactTypes.other
        }
      })

      // vCard 面向个人通讯录；群聊与公众号没有可靠的 vCard 语义。
      if (options.format === 'vcf') {
        contacts = contacts.filter((contact) => contact.type === 'friend')
      }

      if (contacts.length === 0) {
        return {
          success: false,
          error: options.format === 'vcf' ? '所选联系人中没有可导出的好友' : '没有选择联系人',
        }
      }

      const normalizedOutputDir = path.resolve(outputDir)
      fs.mkdirSync(normalizedOutputDir, { recursive: true })

      const fields = { ...DEFAULT_FIELDS, ...(options.fields || {}) }
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
      const outputPath = path.join(normalizedOutputDir, `contacts_${timestamp}.${options.format}`)

      switch (options.format) {
        case 'json':
          this.exportToJSON(contacts, outputPath, fields)
          break
        case 'csv':
          this.exportToCSV(contacts, outputPath, fields)
          break
        case 'vcf':
          this.exportToVCF(contacts, outputPath, fields)
          break
        default:
          return { success: false, error: '不支持的导出格式' }
      }

      return {
        success: true,
        successCount: contacts.length,
        outputPath,
        outputDirectory: normalizedOutputDir,
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  private exportToJSON(contacts: ContactInfo[], outputPath: string, fields: ContactExportFields): void {
    const data = {
      exportedAt: new Date().toISOString(),
      count: contacts.length,
      contacts: contacts.map((contact) => {
        const item: Record<string, unknown> = {
          username: contact.username,
          type: contact.type,
          typeLabel: this.getTypeLabel(contact),
        }
        if (fields.displayName) item.displayName = contact.displayName
        if (fields.remark) item.remark = contact.remark
        if (fields.nickname) item.nickname = contact.nickname
        if (fields.alias) item.alias = contact.alias
        if (fields.labels) item.labels = Array.isArray(contact.labels) ? contact.labels : []
        if (fields.description) item.description = contact.description
        if (fields.detailDescription) item.detailDescription = contact.detailDescription
        if (fields.region) item.region = contact.region
        if (contact.type === 'official') {
          item.officialAccountKind = contact.officialAccountKind
          item.officialAccountType = contact.officialAccountType
        }
        return item
      }),
    }
    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf-8')
  }

  private exportToCSV(contacts: ContactInfo[], outputPath: string, fields: ContactExportFields): void {
    const columns: Array<{ header: string; value: (contact: ContactInfo) => unknown }> = [
      { header: '用户名', value: (contact) => contact.username },
    ]
    if (fields.displayName) columns.push({ header: '显示名称', value: (contact) => contact.displayName })
    if (fields.remark) columns.push({ header: '备注', value: (contact) => contact.remark })
    if (fields.nickname) columns.push({ header: '昵称', value: (contact) => contact.nickname })
    if (fields.alias) columns.push({ header: '微信号', value: (contact) => contact.alias })
    if (fields.labels) columns.push({ header: '标签', value: (contact) => contact.labels?.join(' | ') || '' })
    if (fields.description) columns.push({ header: '描述', value: (contact) => contact.description })
    if (fields.detailDescription) columns.push({ header: '个性签名', value: (contact) => contact.detailDescription })
    if (fields.region) columns.push({ header: '地区', value: (contact) => contact.region })
    columns.push({ header: '类型', value: (contact) => this.getTypeLabel(contact) })

    const escapeCell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`
    const csvContent = [
      columns.map((column) => column.header).join(','),
      ...contacts.map((contact) => columns.map((column) => escapeCell(column.value(contact))).join(',')),
    ].join('\n')

    fs.writeFileSync(outputPath, `\uFEFF${csvContent}`, 'utf-8')
  }

  private exportToVCF(contacts: ContactInfo[], outputPath: string, fields: ContactExportFields): void {
    const escapeValue = (value: unknown) => String(value ?? '')
      .replace(/\\/g, '\\\\')
      .replace(/\r?\n/g, '\\n')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')

    const vcards = contacts.map((contact) => {
      const lines = ['BEGIN:VCARD', 'VERSION:3.0']
      const fullName = fields.displayName ? contact.displayName : contact.username
      lines.push(`FN:${escapeValue(fullName || contact.username)}`)
      if (fields.nickname && contact.nickname) lines.push(`NICKNAME:${escapeValue(contact.nickname)}`)

      const noteParts: string[] = []
      if (fields.remark && contact.remark) noteParts.push(`备注: ${contact.remark}`)
      if (fields.alias && contact.alias) noteParts.push(`微信号: ${contact.alias}`)
      if (fields.labels && contact.labels?.length) noteParts.push(`标签: ${contact.labels.join(', ')}`)
      if (fields.description && contact.description) noteParts.push(`描述: ${contact.description}`)
      if (fields.detailDescription && contact.detailDescription) noteParts.push(`个性签名: ${contact.detailDescription}`)
      if (fields.region && contact.region) noteParts.push(`地区: ${contact.region}`)
      if (noteParts.length > 0) lines.push(`NOTE:${escapeValue(noteParts.join('\n'))}`)

      lines.push(`X-WECHAT-ID:${escapeValue(contact.username)}`, 'END:VCARD')
      return lines.join('\r\n')
    })

    fs.writeFileSync(outputPath, vcards.join('\r\n\r\n'), 'utf-8')
  }

  private getTypeLabel(contact: ContactInfo): string {
    if (contact.type === 'official') {
      if (contact.officialAccountKind === 'service') return '服务号'
      if (contact.officialAccountKind === 'enterprise') return '企业号'
      return '公众号'
    }
    switch (contact.type) {
      case 'friend': return '好友'
      case 'group': return '群聊'
      case 'former_friend': return '已删除好友'
      case 'blocked': return '黑名单'
      default: return '其他'
    }
  }
}

export const contactExportService = new ContactExportService()
