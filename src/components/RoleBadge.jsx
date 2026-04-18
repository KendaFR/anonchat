const ROLES = {
  admin:     { label: 'Admin',  bg: '#FF4444', color: '#fff', icon: '⚡' },
  moderator: { label: 'Modo',   bg: '#F59E0B', color: '#fff', icon: '🛡️' },
}

export default function RoleBadge({ role, size = 'sm' }) {
  if (!role || role === 'user') return null
  const r = ROLES[role]
  const small = size === 'sm'
  return (
    <span className={`role-badge role-badge-${role}`} style={{
      background: r.bg, color: r.color,
      fontSize: small ? 9 : 11,
      padding: small ? '1px 5px' : '2px 7px',
    }}>
      {r.icon} {r.label}
    </span>
  )
}