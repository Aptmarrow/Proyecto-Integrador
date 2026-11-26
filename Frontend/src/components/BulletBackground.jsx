import { memo, useMemo } from 'react'

function BulletBackground() {
  const particles = useMemo(() => {
    const colors = ['#ff2d55', '#00f0ff', '#bf00ff', '#ff8800', '#00ff88']
    return Array.from({ length: 25 }, (_, i) => {
      const color = colors[Math.floor(Math.random() * colors.length)]
      const sizePx = 12 + Math.random() * 8
      return {
        id: i,
        left: `${(i * 97) % 100}%`,
        drift: `${-24 + Math.random() * 48}px`,
        size: `${sizePx.toFixed(1)}px`,
        background: `radial-gradient(circle, #ffffff 0%, ${color} 32%, ${color}80 56%, transparent 100%)`,
        duration: `${6 + Math.random() * 10}s`,
        delay: `${Math.random() * 8}s`,
        opacity: 0.45 + Math.random() * 0.4,
      }
    })
  }, [])

  return (
    <div className="bullet-bg" aria-hidden="true">
      {particles.map(p => (
        <div
          key={p.id}
          className="bullet-particle"
          style={{
            left: p.left,
            width: p.size,
            height: p.size,
            '--bullet-drift-x': p.drift,
            background: p.background,
            animationDuration: p.duration,
            animationDelay: p.delay,
            opacity: p.opacity,
          }}
        />
      ))}
    </div>
  )
}

export default memo(BulletBackground)
