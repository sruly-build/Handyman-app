import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { PencilIcon, TextIcon, TrashIcon, UndoIcon } from '../components/Icons'
import { ErrorNote } from '../components/ui'
import { backend } from '../data/backend'
import { refreshPhotos, usePhotos } from '../data/queries'

type Point = [number, number]
type Mark =
  | { kind: 'line'; color: string; width: number; points: Point[] }
  | { kind: 'text'; color: string; size: number; at: Point; text: string }

const colors = ['#1c1c1e', '#ff3b30', '#007aff', '#0f9d7a', '#ffffff']
const BLANK_W = 1200
const BLANK_H = 1600

/** Finger drawing, on a blank page or on top of a photo, with text for measurements */
export function SketchScreen() {
  const { jobId = '', itemId = '' } = useParams()
  const [search] = useSearchParams()
  const photoId = search.get('photo')
  const { data: photos } = usePhotos(itemId)
  const navigate = useNavigate()
  const qc = useQueryClient()

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [background, setBackground] = useState<HTMLImageElement | null>(null)
  const [bgError, setBgError] = useState<string | null>(null)
  const [marks, setMarks] = useState<Mark[]>([])
  const drawing = useRef<Mark | null>(null)
  const [tool, setTool] = useState<'pen' | 'text'>('pen')
  const [color, setColor] = useState(colors[1])
  const [thick, setThick] = useState(false)

  // Load the photo to draw on, if one was chosen
  useEffect(() => {
    if (!photoId || !photos) return
    const photo = photos.find((p) => p.id === photoId)
    if (!photo) return
    const img = new Image()
    img.crossOrigin = 'anonymous' // needed so the drawing can be saved
    img.onload = () => setBackground(img)
    img.onerror = () => setBgError('Could not load the photo. You can still draw on a blank page.')
    img.src = photo.url
  }, [photoId, photos])

  // Size the canvas to the photo (or a blank portrait page)
  const size = (() => {
    if (!background) return { w: BLANK_W, h: BLANK_H }
    const scale = Math.min(1, 1600 / Math.max(background.naturalWidth, background.naturalHeight))
    return { w: Math.round(background.naturalWidth * scale), h: Math.round(background.naturalHeight * scale) }
  })()
  const lineWidth = Math.round(size.w / (thick ? 90 : 220))

  function render(extra?: Mark | null) {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    if (background) ctx.drawImage(background, 0, 0, canvas.width, canvas.height)
    for (const m of extra ? [...marks, extra] : marks) {
      if (m.kind === 'line') {
        ctx.strokeStyle = m.color
        ctx.lineWidth = m.width
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.beginPath()
        m.points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)))
        if (m.points.length === 1) ctx.lineTo(m.points[0][0] + 0.1, m.points[0][1])
        ctx.stroke()
      } else {
        ctx.font = `bold ${m.size}px -apple-system, system-ui, sans-serif`
        ctx.textBaseline = 'middle'
        ctx.lineWidth = m.size / 6
        ctx.strokeStyle = m.color === '#ffffff' ? '#1c1c1e' : '#ffffff'
        ctx.strokeText(m.text, m.at[0], m.at[1])
        ctx.fillStyle = m.color
        ctx.fillText(m.text, m.at[0], m.at[1])
      }
    }
  }

  useEffect(() => render(drawing.current))

  function pointFrom(e: React.PointerEvent<HTMLCanvasElement>): Point {
    const rect = e.currentTarget.getBoundingClientRect()
    return [((e.clientX - rect.left) * size.w) / rect.width, ((e.clientY - rect.top) * size.h) / rect.height]
  }

  function onDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const at = pointFrom(e)
    if (tool === 'text') {
      const text = prompt('Text to add (e.g. 30 in)')
      if (text?.trim()) setMarks([...marks, { kind: 'text', color, size: Math.round(size.w / 18), at, text: text.trim() }])
      return
    }
    e.currentTarget.setPointerCapture(e.pointerId)
    drawing.current = { kind: 'line', color, width: lineWidth, points: [at] }
    render(drawing.current)
  }

  function onMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const current = drawing.current
    if (current?.kind !== 'line') return
    current.points.push(pointFrom(e))
    render(current)
  }

  function onUp() {
    const current = drawing.current
    drawing.current = null
    if (current) setMarks((m) => [...m, current])
  }

  const save = useMutation({
    mutationFn: async () => {
      render()
      const blob = await new Promise<Blob>((resolve, reject) => {
        try {
          canvasRef.current!.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not save the sketch.'))), 'image/jpeg', 0.88)
        } catch {
          reject(new Error('This photo cannot be drawn on. Try a blank sketch instead.'))
        }
      })
      await backend.addPhoto(itemId, 'sketch', blob)
    },
    onSuccess: () => {
      void refreshPhotos(qc)
      navigate(-1)
    },
  })

  const close = () => {
    if (marks.length === 0 || confirm('Throw away this sketch?')) {
      if (((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0) navigate(-1)
      else navigate(`/jobs/${jobId}/items/${itemId}`, { replace: true })
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-[#2c2c2e] pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
      <div className="flex items-center justify-between px-2">
        <button onClick={close} className="min-h-12 px-3 text-[17px] text-white">
          Cancel
        </button>
        <p className="text-[17px] font-semibold text-white">{photoId ? 'Draw on photo' : 'Sketch'}</p>
        <button
          onClick={() => save.mutate()}
          disabled={save.isPending || marks.length === 0}
          className="min-h-12 px-3 text-[17px] font-bold text-[#34c7a0] disabled:opacity-40"
        >
          {save.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>

      {(bgError || save.error) && (
        <div className="px-3">
          <ErrorNote error={save.error ?? new Error(bgError!)} />
        </div>
      )}

      <div className="flex min-h-0 flex-1 items-center justify-center p-2">
        <canvas
          ref={canvasRef}
          width={size.w}
          height={size.h}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          className="max-h-full max-w-full touch-none rounded-lg bg-white shadow-lg"
          style={{ aspectRatio: `${size.w} / ${size.h}` }}
        />
      </div>

      <div className="space-y-2 px-3 pb-2">
        <div className="flex items-center justify-center gap-3">
          {colors.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`h-10 w-10 rounded-full border-2 ${color === c ? 'border-white ring-2 ring-white/40' : 'border-white/20'}`}
              style={{ background: c }}
              aria-label={`Colour ${c}`}
            />
          ))}
        </div>
        <div className="grid grid-cols-5 gap-2">
          <ToolButton active={tool === 'pen' && !thick} onClick={() => { setTool('pen'); setThick(false) }} label="Thin">
            <PencilIcon size={20} />
          </ToolButton>
          <ToolButton active={tool === 'pen' && thick} onClick={() => { setTool('pen'); setThick(true) }} label="Thick">
            <PencilIcon size={24} strokeWidth={3} />
          </ToolButton>
          <ToolButton active={tool === 'text'} onClick={() => setTool('text')} label="Text">
            <TextIcon size={22} />
          </ToolButton>
          <ToolButton onClick={() => setMarks(marks.slice(0, -1))} label="Undo" disabled={marks.length === 0}>
            <UndoIcon size={22} />
          </ToolButton>
          <ToolButton
            onClick={() => confirm('Clear the whole drawing?') && setMarks([])}
            label="Clear"
            disabled={marks.length === 0}
          >
            <TrashIcon size={22} />
          </ToolButton>
        </div>
        {tool === 'text' && <p className="text-center text-[13px] text-white/70">Tap where the text should go.</p>}
      </div>
    </div>
  )
}

function ToolButton({
  active,
  disabled,
  onClick,
  label,
  children,
}: {
  active?: boolean
  disabled?: boolean
  onClick: () => void
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-semibold disabled:opacity-30 ${
        active ? 'bg-white text-ink' : 'bg-white/10 text-white'
      }`}
    >
      {children}
      {label}
    </button>
  )
}
