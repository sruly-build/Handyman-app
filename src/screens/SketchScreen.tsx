import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowIcon, PencilIcon, RulerIcon, TextIcon, TrashIcon, UndoIcon } from '../components/Icons'
import { ErrorNote } from '../components/ui'
import { backend } from '../data/backend'
import { keys, refreshAll, refreshPhotos, usePhotos } from '../data/queries'
import type { Measurement } from '../data/types'
import { takePendingImage } from '../lib/pendingImage'

type Point = [number, number]
type Mark =
  | { kind: 'line'; color: string; width: number; points: Point[] }
  | { kind: 'text'; color: string; size: number; at: Point; text: string }
  /** An arrow; "both" = a dimension line with a head at each end */
  | { kind: 'arrow'; color: string; width: number; from: Point; to: Point; both: boolean }

type Tool = 'pen' | 'arrow' | 'measure' | 'text'

const colors = ['#1c1c1e', '#ff3b30', '#ffcc00', '#007aff', '#0f9d7a', '#ffffff']
const BLANK_W = 1200
const BLANK_H = 1600

/** The item, once the new measurement has been saved (it is saved as the item screen closes) */
async function itemWithMeasurement(itemId: string, measurementId: string) {
  for (let tries = 0; tries < 6; tries++) {
    const item = await backend.getItem(itemId)
    if (item.measurements.some((m) => m.id === measurementId)) return item
    await new Promise((r) => setTimeout(r, 500))
  }
  return null
}

function drawArrowHead(ctx: CanvasRenderingContext2D, from: Point, to: Point, size: number) {
  const angle = Math.atan2(to[1] - from[1], to[0] - from[0])
  ctx.beginPath()
  ctx.moveTo(to[0], to[1])
  ctx.lineTo(to[0] - size * Math.cos(angle - Math.PI / 7), to[1] - size * Math.sin(angle - Math.PI / 7))
  ctx.lineTo(to[0] - size * Math.cos(angle + Math.PI / 7), to[1] - size * Math.sin(angle + Math.PI / 7))
  ctx.closePath()
  ctx.fill()
}

/**
 * Finger drawing, on a blank page or on top of a photo: pen, arrows,
 * dimension lines (↔ with the measurement written on them) and text.
 * Opened from a measurement, the result is attached to that measurement.
 */
export function SketchScreen() {
  const { jobId = '', itemId = '' } = useParams()
  const [search] = useSearchParams()
  const photoId = search.get('photo')
  const measurementId = search.get('measurement')
  const fromFile = search.get('fromFile') === '1'
  const { data: photos } = usePhotos(itemId)
  const navigate = useNavigate()
  const qc = useQueryClient()

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [background, setBackground] = useState<HTMLImageElement | null>(null)
  const [bgError, setBgError] = useState<string | null>(null)
  const [marks, setMarks] = useState<Mark[]>([])
  const drawing = useRef<Mark | null>(null)
  const [tool, setTool] = useState<Tool>(measurementId ? 'measure' : 'pen')
  const [color, setColor] = useState(colors[1])
  const [thick, setThick] = useState(false)
  // Typing a label: where it goes, and what's typed
  const [typing, setTyping] = useState<{ at: Point } | null>(null)
  const [text, setText] = useState('')
  const [measurement, setMeasurement] = useState<Measurement | null>(null)

  // The measurement this drawing is for (its sizes are offered as one-tap labels)
  useEffect(() => {
    if (!measurementId) return
    let live = true
    void itemWithMeasurement(itemId, measurementId).then(
      (item) => live && setMeasurement(item?.measurements.find((m) => m.id === measurementId) ?? null),
    )
    return () => {
      live = false
    }
  }, [itemId, measurementId])

  // A photo just taken from a measurement (not uploaded until the drawing is saved)
  useEffect(() => {
    if (!fromFile) return
    const file = takePendingImage()
    if (!file) return setBgError('The photo was lost. Go back and add it again.')
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => setBackground(img)
    img.onerror = () => setBgError('That file could not be opened as a photo.')
    img.src = url
  }, [fromFile])

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
  const arrowWidth = Math.round(size.w / 160)
  const textSize = Math.round(size.w / 18)

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
      } else if (m.kind === 'arrow') {
        // A white edge so it shows on any photo
        for (const [stroke, extraWidth] of [[m.color === '#ffffff' ? '#1c1c1e' : '#ffffff', m.width * 0.9], [m.color, 0]] as const) {
          ctx.strokeStyle = stroke
          ctx.fillStyle = stroke
          ctx.lineWidth = m.width + extraWidth
          ctx.lineCap = 'round'
          ctx.beginPath()
          ctx.moveTo(m.from[0], m.from[1])
          ctx.lineTo(m.to[0], m.to[1])
          ctx.stroke()
          const head = m.width * 4.5 + extraWidth
          drawArrowHead(ctx, m.from, m.to, head)
          if (m.both) drawArrowHead(ctx, m.to, m.from, head)
        }
      } else {
        ctx.font = `bold ${m.size}px -apple-system, system-ui, sans-serif`
        ctx.textBaseline = 'middle'
        ctx.textAlign = 'center'
        ctx.lineWidth = m.size / 6
        ctx.lineJoin = 'round'
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
    if (typing) return
    const at = pointFrom(e)
    if (tool === 'text') {
      setText('')
      setTyping({ at })
      return
    }
    e.currentTarget.setPointerCapture(e.pointerId)
    drawing.current =
      tool === 'pen'
        ? { kind: 'line', color, width: lineWidth, points: [at] }
        : { kind: 'arrow', color, width: arrowWidth, from: at, to: at, both: tool === 'measure' }
    render(drawing.current)
  }

  function onMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const current = drawing.current
    if (!current) return
    if (current.kind === 'line') current.points.push(pointFrom(e))
    else if (current.kind === 'arrow') current.to = pointFrom(e)
    render(current)
  }

  function onUp() {
    const current = drawing.current
    drawing.current = null
    if (!current) return
    if (current.kind === 'arrow') {
      const length = Math.hypot(current.to[0] - current.from[0], current.to[1] - current.from[1])
      if (length < size.w / 40) return render() // just a tap
      setMarks((m) => [...m, current])
      // A dimension line: write the size on it next
      if (current.both) {
        const mid: Point = [(current.from[0] + current.to[0]) / 2, (current.from[1] + current.to[1]) / 2 - textSize * 0.9]
        setText('')
        setTyping({ at: mid })
      }
      return
    }
    setMarks((m) => [...m, current])
  }

  function addText(value: string) {
    if (typing && value.trim()) setMarks((m) => [...m, { kind: 'text', color, size: textSize, at: typing.at, text: value.trim() }])
    setTyping(null)
    setText('')
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
      const saved = (await backend.addPhoto(itemId, 'sketch', blob)) as { id: string }
      if (measurementId) {
        // Attach it to the measurement (replacing the earlier marked-up photo)
        const item = await itemWithMeasurement(itemId, measurementId)
        if (!item) throw new Error('The measurement was not saved yet. Go back, wait a second, and try again.')
        const before = item.measurements.find((m) => m.id === measurementId)?.photo_id
        const updated = await backend.updateItem(itemId, {
          measurements: item.measurements.map((m) => (m.id === measurementId ? { ...m, photo_id: saved.id } : m)),
        })
        // So the item screen shows (and keeps) the link straight away
        qc.setQueryData(keys.item(itemId), updated)
        const old = before && photos?.find((p) => p.id === before)
        if (old && old.id !== saved.id) await backend.deletePhoto(old)
      }
    },
    onSuccess: () => {
      void refreshPhotos(qc)
      void qc.invalidateQueries({ queryKey: keys.item(itemId) })
      void refreshAll(qc)
      navigate(-1)
    },
  })

  const close = () => {
    if (marks.length === 0 || confirm('Throw away this drawing?')) {
      if (((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0) navigate(-1)
      else navigate(`/jobs/${jobId}/items/${itemId}`, { replace: true })
    }
  }

  // One-tap labels: the measurement's own sizes
  const sizes = measurement
    ? (['width', 'height', 'depth'] as const)
        .filter((d) => measurement[d].trim())
        .map((d) => `${measurement[d].trim()} ${measurement.unit}`)
    : []
  const hint = {
    pen: '',
    arrow: 'Drag from where the arrow starts to what it points at.',
    measure: 'Drag across what you measured, then type the size.',
    text: 'Tap where the text should go.',
  }[tool]

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-[#2c2c2e] pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
      <div className="flex items-center justify-between px-2">
        <button onClick={close} className="min-h-12 px-3 text-[17px] text-white">
          Cancel
        </button>
        <p className="min-w-0 truncate text-[17px] font-semibold text-white">
          {measurement ? measurement.label || 'Measurement photo' : photoId || fromFile ? 'Draw on photo' : 'Sketch'}
        </p>
        <button
          onClick={() => save.mutate()}
          disabled={save.isPending || marks.length === 0 || Boolean(typing)}
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
          aria-label="Drawing"
          className="max-h-full max-w-full touch-none rounded-lg bg-white shadow-lg"
          style={{ aspectRatio: `${size.w} / ${size.h}` }}
        />
      </div>

      {typing ? (
        <form
          className="space-y-2 px-3 pb-3"
          onSubmit={(e) => {
            e.preventDefault()
            addText(text)
          }}
        >
          {sizes.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {sizes.map((s) => (
                <button key={s} type="button" onClick={() => addText(s)} className="min-h-10 rounded-full bg-white px-3 text-[15px] font-semibold text-ink">
                  {s}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Text, e.g. 30 in"
              aria-label="Text to add"
              className="min-h-12 min-w-0 flex-1 rounded-xl bg-white px-3 text-[17px] text-ink outline-none"
            />
            <button type="submit" className="min-h-12 rounded-xl bg-[#34c7a0] px-4 text-[17px] font-bold text-[#0f2a23]">
              Add
            </button>
            <button type="button" onClick={() => setTyping(null)} className="min-h-12 rounded-xl bg-white/10 px-3 text-[15px] text-white">
              Skip
            </button>
          </div>
        </form>
      ) : (
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
          <div className="grid grid-cols-6 gap-1.5">
            <ToolButton active={tool === 'pen' && !thick} onClick={() => { setTool('pen'); setThick(false) }} label="Pen">
              <PencilIcon size={20} />
            </ToolButton>
            <ToolButton active={tool === 'pen' && thick} onClick={() => { setTool('pen'); setThick(true) }} label="Thick">
              <PencilIcon size={24} strokeWidth={3} />
            </ToolButton>
            <ToolButton active={tool === 'arrow'} onClick={() => setTool('arrow')} label="Arrow">
              <ArrowIcon size={22} />
            </ToolButton>
            <ToolButton active={tool === 'measure'} onClick={() => setTool('measure')} label="Measure">
              <RulerIcon size={22} />
            </ToolButton>
            <ToolButton active={tool === 'text'} onClick={() => setTool('text')} label="Text">
              <TextIcon size={22} />
            </ToolButton>
            <ToolButton onClick={() => setMarks(marks.slice(0, -1))} label="Undo" disabled={marks.length === 0}>
              <UndoIcon size={22} />
            </ToolButton>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-[13px] text-white/70">{hint}</p>
            <button
              onClick={() => confirm('Clear the whole drawing?') && setMarks([])}
              disabled={marks.length === 0}
              className="flex min-h-10 items-center gap-1 px-2 text-[13px] text-white/70 disabled:opacity-30"
            >
              <TrashIcon size={16} /> Clear
            </button>
          </div>
        </div>
      )}
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
