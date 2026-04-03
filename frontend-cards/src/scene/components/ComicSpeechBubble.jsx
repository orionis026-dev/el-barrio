const AGENT_VARIANTS = {
  el_yoyo: 'swoop',
  paco: 'hook',
  yanelis: 'ribbon',
  doña_marta: 'plume'
}

export function getPortalBubbleVariant(agentId) {
  return AGENT_VARIANTS[agentId] || 'swoop'
}

export default function ComicSpeechBubble({
  userText,
  assistantText,
  variant = 'swoop',
  accent = '#8bc2ff',
  glow = '#ffd8aa',
  side = 'right',
  faded = false
}) {
  return (
    <div
      className="portal-comic-stack"
      data-variant={variant}
      data-side={side}
      data-faded={faded ? 'true' : 'false'}
      style={{
        '--portal-comic-accent': accent,
        '--portal-comic-glow': glow
      }}
    >
      {userText && (
        <div className="portal-comic-caption">
          <span className="portal-comic-caption-tag">Tu</span>
          <span className="portal-comic-caption-text">{userText}</span>
        </div>
      )}

      <div className="portal-comic-shell">
        <div className="portal-comic-bubble">
          <p className="portal-comic-assistant">{assistantText}</p>
        </div>
      </div>
    </div>
  )
}
