export type SessionIdentityKind = 'private' | 'group' | 'official'

export interface SessionIdentityItem {
  username: string
  displayName?: string
  avatarUrl?: string
  alias?: string
}

interface SessionContactEnrichment {
  success?: boolean
  contacts?: Record<string, { displayName?: string; avatarUrl?: string }>
}

export function getSessionIdentityKind(username: string): SessionIdentityKind {
  if (username.endsWith('@chatroom')) return 'group'
  if (username.startsWith('gh_')) return 'official'
  return 'private'
}

export function getSessionIdentityKindLabel(kind: SessionIdentityKind): string {
  if (kind === 'group') return '群聊'
  if (kind === 'official') return '公众号'
  return '联系人'
}

export function hasResolvedSessionDisplayName(session: Pick<SessionIdentityItem, 'username' | 'displayName'>): boolean {
  const username = String(session.username || '').trim().toLowerCase()
  const displayName = String(session.displayName || '').trim().toLowerCase()
  return Boolean(displayName && displayName !== username)
}

/**
 * 会话接口为了快速返回，会先把 username 放进 displayName。
 * 这里把这种占位值也视为“待补全”，并一次合并昵称与头像。
 */
export async function hydrateSessionIdentities<T extends SessionIdentityItem>(
  sessions: T[],
  enrich: (usernames: string[]) => Promise<SessionContactEnrichment>,
): Promise<T[]> {
  const usernames = Array.from(new Set(
    sessions
      .filter((session) => !hasResolvedSessionDisplayName(session) || !session.avatarUrl)
      .map((session) => String(session.username || '').trim())
      .filter(Boolean),
  ))
  if (usernames.length === 0) return sessions

  const result = await enrich(usernames)
  if (result?.success === false || !result?.contacts) return sessions

  return sessions.map((session) => {
    const contact = result.contacts?.[session.username]
    if (!contact) return session

    const enrichedName = String(contact.displayName || '').trim()
    const nextDisplayName = hasResolvedSessionDisplayName({ username: session.username, displayName: enrichedName })
      ? enrichedName
      : session.displayName
    const nextAvatarUrl = String(contact.avatarUrl || '').trim() || session.avatarUrl
    if (nextDisplayName === session.displayName && nextAvatarUrl === session.avatarUrl) return session

    return {
      ...session,
      displayName: nextDisplayName,
      avatarUrl: nextAvatarUrl,
    }
  })
}
