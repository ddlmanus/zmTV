"use client"

type PanoramaAxisPreviewProps = {
  yaw: number
  pitch: number
}

export function PanoramaAxisPreview({ yaw, pitch }: PanoramaAxisPreviewProps) {
  const normalizedYaw = ((yaw % 360) + 360) % 360
  const yawRad = (normalizedYaw * Math.PI) / 180
  const pitchRad = (pitch * Math.PI) / 180
  const centerX = 31
  const centerY = 31
  const xEnd = {
    x: centerX + Math.cos(yawRad) * 11.5,
    y: centerY - Math.sin(yawRad) * 11.5,
  }
  const zEnd = {
    x: centerX - Math.sin(yawRad) * 11.5,
    y: centerY - Math.cos(yawRad) * 11.5,
  }
  const yEnd = {
    x: centerX,
    y: centerY - (14 + Math.sin(pitchRad) * 5),
  }
  const ringOffsetX = Math.sin(yawRad) * 6
  const ringOffsetY = Math.cos(yawRad) * 6

  return (
    <svg width="62" height="62" viewBox="0 0 62 62" fill="none" aria-hidden="true">
      <rect x="0.5" y="0.5" width="61" height="61" rx="8" fill="rgba(0,0,0,0.34)" stroke="rgba(255,255,255,0.08)" />
      <circle cx={centerX} cy={centerY} r="14.5" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
      <circle cx={centerX + ringOffsetX} cy={centerY - ringOffsetY} r="5.5" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
      <path d={`M ${centerX} ${centerY} L ${xEnd.x} ${xEnd.y}`} stroke="#D75A48" strokeWidth="1.7" strokeLinecap="round" />
      <path d={`M ${centerX} ${centerY} L ${yEnd.x} ${yEnd.y}`} stroke="#78D36E" strokeWidth="1.7" strokeLinecap="round" />
      <path d={`M ${centerX} ${centerY} L ${zEnd.x} ${zEnd.y}`} stroke="#4B8DFF" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx={centerX} cy={centerY} r="2.4" fill="#F3F4F6" />
      <text x={xEnd.x + 2.5} y={xEnd.y + 0.5} fill="#D75A48" fontSize="5.5" fontWeight="600">X</text>
      <text x={yEnd.x - 1.8} y={yEnd.y - 2.8} fill="#78D36E" fontSize="5.5" fontWeight="600">Y</text>
      <text x={zEnd.x - 5.8} y={zEnd.y + 1.8} fill="#4B8DFF" fontSize="5.5" fontWeight="600">Z</text>
    </svg>
  )
}
