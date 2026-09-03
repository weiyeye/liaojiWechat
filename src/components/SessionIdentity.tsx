import type { ReactNode } from 'react'
import {
  getSessionIdentityKind,
  getSessionIdentityKindLabel,
  type SessionIdentityItem,
} from '../utils/sessionIdentity'
import { Avatar } from './Avatar'
import './SessionIdentity.scss'

interface SessionIdentityProps {
  session: SessionIdentityItem
  avatarSize?: number
  secondary?: ReactNode
  showKind?: boolean
  className?: string
}


export function SessionIdentity({
  session,
  avatarSize = 34,
  secondary,
  showKind = true,
  className = '',
}: SessionIdentityProps) {
  const kind = getSessionIdentityKind(session.username)
  const name = String(session.displayName || '').trim() || session.username
  const detail = secondary ?? session.alias ?? session.username

  return (
    <span
      className={`wp-session-identity ${className}`.trim()}
      data-kind={kind}
      data-username={session.username}
    >
      <Avatar
        src={session.avatarUrl}
        name={name}
        size={avatarSize}
        shape="rounded"
        className="wp-session-identity-avatar"
      />
      <span className="wp-session-identity-copy">
        <strong className="wp-session-identity-name" title={name}>{name}</strong>
        <span className="wp-session-identity-secondary" title={typeof detail === 'string' ? detail : undefined}>
          {detail}
        </span>
      </span>
      {showKind && (
        <span className="wp-session-identity-kind">{getSessionIdentityKindLabel(kind)}</span>
      )}
    </span>
  )
}
