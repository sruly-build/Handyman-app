import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowIcon,
  CropIcon,
  PencilIcon,
  RedoIcon,
  RulerIcon,
  SelectIcon,
  TextIcon,
  TrashIcon,
  UndoIcon,
} from '../components/Icons'
import { ErrorNote } from '../components/ui'
import { backend } from '../data/backend'
import { keys, refreshAll, refreshPhotos, usePhotos } from '../data/queries'
import type { Measurement, Photo, SketchMark as Mark, SketchPoint as Point } from '../data/types'
import { takePendingImage } from '../lib/pendingImage'

type Tool = 'select' | 'pen' | 'arrow' | 'measure' | 'text'
/** What's on the page: the photo underneath (none = blank paper) and the marks on top */
interface Doc {
  background: HTMLImageElement | null
  marks: Mark[]
}
type Box = { x: number; y: number; w: number; h: number }

const colors = [
  { value: '#e5484d', name: 'Red' },
  { value: '#f5a524', name: 'Amber' },
  { value: '#0a84ff', name: 'Blue' },
  { value: '#30a46c', name: 'Green' },
  { value: '#111827', name: 'Black' },
  { value: '#ffffff', name: 'White' },
]
const weights = ['Fine', 'Medium', 'Bold'] as const
const BLANK = { w: 1200, h: 1600 }
const FONT = `'Inter Variable', Inter, system-ui, -apple-system, sans-serif`

/** The item, once the new measurement has been saved (it is saved as the item screen closes) */
async function itemWithMeasurement(itemId: string, measurementId: string) {
  for (let tries = 0; tries < 6; tries++) {
    const item = await backend.getItem(itemId)
    if (item.measurements.some((m) => m.id === measurementId)) return item
    await new Promise((r) => setTimeout(r, 500))
  }
  return null
}

function loadImage(src: string, remote = false) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    if (remote) img.crossOrigin = 'anonymous' // needed so the drawing can be saved
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not load the photo.'))
    img.src = src
  })
}

// ---------- Drawing the marks ----------

/** Dark text on light colours, white on the rest */
const inkOn = (fill: string) => (fill === '#ffffff' || fill === '#f5a524' ? '#111827' : '#ffffff')

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** A soft shadow so marks stand off a photo */
function shadow(ctx: CanvasRenderingContext2D, u: number, on: boolean) {
  ctx.shadowColor = on ? 'rgba(0,0,0,0.35)' : 'transparent'
  ctx.shadowBlur = on ? 6 * u : 0
  ctx.shadowOffsetY = on ? 1.5 * u : 0
}

const labelSize = (m: { width: number }, u: number) => Math.max(30 * u, m.width * 5)

/** A text label in a rounded tag, centred on `at`, turned to `angle` */
function drawTag(ctx: CanvasRenderingContext2D, text: string, at: Point, size: number, fill: string, angle = 0) {
  ctx.save()
  ctx.translate(at[0], at[1])
  ctx.rotate(angle)
  ctx.font = `600 ${size}px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const w = ctx.measureText(text).width + size * 0.9
  const h = size * 1.45
  roundRect(ctx, -w / 2, -h / 2, w, h, h * 0.3)
  ctx.fillStyle = fill
  ctx.fill()
  ctx.shadowColor = 'transparent'
  if (fill === '#ffffff') {
    ctx.lineWidth = Math.max(1, size / 22)
    ctx.strokeStyle = 'rgba(17,24,39,0.25)'
    ctx.stroke()
  }
  ctx.fillStyle = inkOn(fill)
  ctx.fillText(text, 0, size * 0.04)
  ctx.restore()
  return { w, h }
}

function arrowHead(ctx: CanvasRenderingContext2D, from: Point, to: Point, len: number) {
  const a = Math.atan2(to[1] - from[1], to[0] - from[0])
  ctx.beginPath()
  ctx.moveTo(to[0], to[1])
  ctx.lineTo(to[0] - len * Math.cos(a - Math.PI / 8), to[1] - len * Math.sin(a - Math.PI / 8))
  ctx.lineTo(to[0] - len * 0.78 * Math.cos(a), to[1] - len * 0.78 * Math.sin(a))
  ctx.lineTo(to[0] - len * Math.cos(a + Math.PI / 8), to[1] - len * Math.sin(a + Math.PI / 8))
  ctx.closePath()
  ctx.fill()
}

/** Keep a label upright whichever way its line was drawn */
const upright = (from: Point, to: Point) => {
  let a = Math.atan2(to[1] - from[1], to[0] - from[0])
  if (a > Math.PI / 2) a -= Math.PI
  if (a < -Math.PI / 2) a += Math.PI
  return a
}

function drawMark(ctx: CanvasRenderingContext2D, m: Mark, u: number, onPhoto: boolean) {
  ctx.save()
  shadow(ctx, u, onPhoto)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  if (m.kind === 'line') {
    ctx.strokeStyle = m.color
    ctx.lineWidth = m.width
    const p = m.points
    ctx.beginPath()
    ctx.moveTo(p[0][0], p[0][1])
    if (p.length === 1) ctx.lineTo(p[0][0] + 0.1, p[0][1])
    // Smooth curves through the finger's path
    for (let i = 1; i < p.length - 1; i++) {
      ctx.quadraticCurveTo(p[i][0], p[i][1], (p[i][0] + p[i + 1][0]) / 2, (p[i][1] + p[i + 1][1]) / 2)
    }
    if (p.length > 1) ctx.lineTo(p[p.length - 1][0], p[p.length - 1][1])
    ctx.stroke()
  } else if (m.kind === 'arrow') {
    const { from, to, width } = m
    const len = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1
    const ux = (to[0] - from[0]) / len
    const uy = (to[1] - from[1]) / len
    const head = Math.max(width * 4.5, 16 * u)
    ctx.strokeStyle = m.color
    ctx.fillStyle = m.color
    ctx.lineWidth = width
    // The shaft stops where the head starts, so the tip stays sharp
    const start: Point = m.both ? [from[0] + ux * head * 0.7, from[1] + uy * head * 0.7] : from
    const end: Point = [to[0] - ux * head * 0.7, to[1] - uy * head * 0.7]
    ctx.beginPath()
    ctx.moveTo(start[0], start[1])
    ctx.lineTo(end[0], end[1])
    ctx.stroke()
    arrowHead(ctx, from, to, head)
    if (m.both) {
      arrowHead(ctx, to, from, head)
      // End stops, like a drawing's dimension line
      const t = head * 0.75
      ctx.lineWidth = Math.max(1, width * 0.7)
      for (const p of [from, to]) {
        ctx.beginPath()
        ctx.moveTo(p[0] - uy * t, p[1] + ux * t)
        ctx.lineTo(p[0] + uy * t, p[1] - ux * t)
        ctx.stroke()
      }
      if (m.label) drawTag(ctx, m.label, [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2], labelSize(m, u), m.color, upright(from, to))
    }
  } else {
    drawTag(ctx, m.text, m.at, m.size, m.color)
  }
  ctx.restore()
}

/** The area a mark covers (for selecting it) */
function boundsOf(ctx: CanvasRenderingContext2D, m: Mark, u: number): Box {
  if (m.kind === 'text') {
    ctx.font = `600 ${m.size}px ${FONT}`
    const w = ctx.measureText(m.text).width + m.size * 0.9
    const h = m.size * 1.45
    return { x: m.at[0] - w / 2, y: m.at[1] - h / 2, w, h }
  }
  const pts = m.kind === 'line' ? m.points : [m.from, m.to]
  const pad = m.kind === 'line' ? m.width : Math.max(m.width * 4.5, 16 * u) * 0.6
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  let box = { x: Math.min(...xs) - pad, y: Math.min(...ys) - pad, w: Math.max(...xs) - Math.min(...xs) + 2 * pad, h: Math.max(...ys) - Math.min(...ys) + 2 * pad }
  if (m.kind === 'arrow' && m.both && m.label) {
    const s = labelSize(m, u)
    ctx.font = `600 ${s}px ${FONT}`
    const half = (ctx.measureText(m.label).width + s * 0.9) / 2
    const cx = (m.from[0] + m.to[0]) / 2
    const cy = (m.from[1] + m.to[1]) / 2
    const x = Math.min(box.x, cx - half)
    const y = Math.min(box.y, cy - s)
    box = { x, y, w: Math.max(box.x + box.w, cx + half) - x, h: Math.max(box.y + box.h, cy + s) - y }
  }
  return box
}

function distToSegment(p: Point, a: Point, b: Point) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const t = dx || dy ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy))) : 0
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)
}

/** Which mark is under the finger (the top one first) */
function hitTest(ctx: CanvasRenderingContext2D, marks: Mark[], p: Point, u: number): number | null {
  const reach = 22 * u
  for (let i = marks.length - 1; i >= 0; i--) {
    const m = marks[i]
    if (m.kind === 'text') {
      const b = boundsOf(ctx, m, u)
      if (p[0] >= b.x - reach / 2 && p[0] <= b.x + b.w + reach / 2 && p[1] >= b.y - reach / 2 && p[1] <= b.y + b.h + reach / 2) return i
    } else if (m.kind === 'arrow') {
      if (distToSegment(p, m.from, m.to) < Math.max(reach, m.width * 2)) return i
      if (m.label) {
        const mid: Point = [(m.from[0] + m.to[0]) / 2, (m.from[1] + m.to[1]) / 2]
        if (Math.hypot(p[0] - mid[0], p[1] - mid[1]) < labelSize(m, u) * 1.5) return i
      }
    } else {
      for (let k = 0; k < m.points.length; k++) {
        if (distToSegment(p, m.points[k], m.points[Math.min(k + 1, m.points.length - 1)]) < Math.max(reach, m.width * 1.5)) return i
      }
    }
  }
  return null
}

function moved(m: Mark, dx: number, dy: number): Mark {
  const shift = (p: Point): Point => [p[0] + dx, p[1] + dy]
  if (m.kind === 'line') return { ...m, points: m.points.map(shift) }
  if (m.kind === 'text') return { ...m, at: shift(m.at) }
  return { ...m, from: shift(m.from), to: shift(m.to) }
}

/**
 * Finger drawing, on a blank page or on top of a photo: pen, arrows,
 * dimension lines (with the size written on them), text and cropping.
 * Each mark stays separate, so it can be selected, moved, recoloured,
 * retyped or deleted, even after saving (the layers are saved with the
 * picture). Opened from a measurement, the drawing is attached to it.
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
  const [doc, setDoc] = useState<Doc>({ background: null, marks: [] })
  const [past, setPast] = useState<Doc[]>([])
  const [future, setFuture] = useState<Doc[]>([])
  const [blank, setBlank] = useState(BLANK)
  const [loading, setLoading] = useState(Boolean(photoId) || fromFile)
  const [bgError, setBgError] = useState<string | null>(null)
  /** The saved drawing being changed (replaced when saved) */
  const [editing, setEditing] = useState<Photo | null>(null)
  const drawing = useRef<Mark | null>(null)
  const drag = useRef<{ index: number; start: Point; original: Mark; moved: boolean } | null>(null)
  const [tool, setTool] = useState<Tool>(measurementId && !photoId ? 'measure' : 'pen')
  const [color, setColor] = useState(colors[0].value)
  const [weight, setWeight] = useState(1)
  const [selected, setSelected] = useState<number | null>(null)
  // Typing: a new label at a spot, or new words for an existing mark
  const [typing, setTyping] = useState<{ at?: Point; index?: number; fresh?: boolean } | null>(null)
  const [text, setText] = useState('')
  const [measurement, setMeasurement] = useState<Measurement | null>(null)
  // Cropping: the box being chosen (in the drawing's pixels)
  const [crop, setCrop] = useState<Box | null>(null)
  const cropDrag = useRef<{ mode: 'move' | 'nw' | 'ne' | 'sw' | 'se'; start: Point; box: Box } | null>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  // The space the picture can take on screen
  const areaRef = useRef<HTMLDivElement>(null)
  const [area, setArea] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = areaRef.current
    if (!el) return
    const measure = () => setArea({ w: el.clientWidth - 16, h: el.clientHeight - 16 })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const changed = past.length > 0

  /** Make a change that Undo can take back */
  function commit(next: Doc) {
    setPast((p) => [...p, doc])
    setFuture([])
    setDoc(next)
  }
  const setMarks = (marks: Mark[]) => commit({ ...doc, marks })

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
    setLoading(false)
    if (!file) return setBgError('The photo was lost. Go back and add it again.')
    loadImage(URL.createObjectURL(file)).then(
      (img) => setDoc({ background: img, marks: [] }),
      () => setBgError('That file could not be opened as a photo.'),
    )
  }, [fromFile])

  // An existing photo: a saved drawing opens with its marks still separate
  const opened = useRef(false)
  useEffect(() => {
    if (!photoId || !photos || opened.current) return
    const photo = photos.find((p) => p.id === photoId)
    if (!photo) return
    opened.current = true
    void (async () => {
      try {
        const saved = await backend.sketchLayers(photo)
        if (photo.kind === 'sketch') setEditing(photo)
        if (saved) {
          const background = saved.baseUrl ? await loadImage(saved.baseUrl, true) : null
          if (!background) setBlank({ w: saved.layers.w, h: saved.layers.h })
          setDoc({ background, marks: saved.layers.marks })
          setTool('select')
        } else {
          setDoc({ background: await loadImage(photo.url, true), marks: [] })
        }
      } catch {
        setBgError('Could not load the photo. You can still draw on a blank page.')
      } finally {
        setLoading(false)
      }
    })()
  }, [photoId, photos])

  // Size the drawing to the photo (or a blank portrait page)
  const { background, marks } = doc
  const size = (() => {
    if (!background) return blank
    const s = Math.min(1, 1600 / Math.max(background.naturalWidth, background.naturalHeight))
    return { w: Math.round(background.naturalWidth * s), h: Math.round(background.naturalHeight * s) }
  })()
  const u = size.w / 1000
  // Largest size that fits the screen, keeping the picture's shape
  const scale = area.w > 0 && area.h > 0 ? Math.min(area.w / size.w, area.h / size.h) : 0
  const fit = scale ? { width: Math.floor(size.w * scale), height: Math.floor(size.h * scale) } : { width: '100%', aspectRatio: `${size.w} / ${size.h}` }
  const penWidth = [4, 8, 13][weight] * u
  const arrowWidth = [4, 7, 11][weight] * u
  const textSize = [26, 36, 50][weight] * u

  function render(opts: { extra?: Mark | null; showSelection?: boolean } = {}) {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    if (background) ctx.drawImage(background, 0, 0, canvas.width, canvas.height)
    const all = opts.extra ? [...marks, opts.extra] : marks
    for (const m of all) drawMark(ctx, m, u, Boolean(background))
    if (opts.showSelection && selected != null && marks[selected]) {
      const b = boundsOf(ctx, marks[selected], u)
      const pad = 8 * u
      ctx.save()
      ctx.lineWidth = 2.5 * u
      ctx.setLineDash([10 * u, 7 * u])
      ctx.strokeStyle = '#ffffff'
      roundRect(ctx, b.x - pad, b.y - pad, b.w + 2 * pad, b.h + 2 * pad, 10 * u)
      ctx.stroke()
      ctx.lineDashOffset = 8.5 * u
      ctx.strokeStyle = '#0a84ff'
      ctx.stroke()
      ctx.restore()
    }
  }

  useEffect(() => render({ extra: drawing.current, showSelection: tool === 'select' }))

  function pointFrom(e: React.PointerEvent<HTMLCanvasElement>): Point {
    const rect = e.currentTarget.getBoundingClientRect()
    return [((e.clientX - rect.left) * size.w) / rect.width, ((e.clientY - rect.top) * size.h) / rect.height]
  }

  function onDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (typing || loading) return
    const at = pointFrom(e)
    if (tool === 'select') {
      const hit = hitTest(canvasRef.current!.getContext('2d')!, marks, at, u)
      setSelected(hit)
      if (hit != null) {
        e.currentTarget.setPointerCapture(e.pointerId)
        drag.current = { index: hit, start: at, original: marks[hit], moved: false }
      }
      return
    }
    if (tool === 'text') {
      setText('')
      setTyping({ at })
      return
    }
    e.currentTarget.setPointerCapture(e.pointerId)
    drawing.current =
      tool === 'pen'
        ? { kind: 'line', color, width: penWidth, points: [at] }
        : { kind: 'arrow', color, width: arrowWidth, from: at, to: at, both: tool === 'measure' }
    render({ extra: drawing.current })
  }

  function onMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const d = drag.current
    if (d) {
      const p = pointFrom(e)
      const dx = p[0] - d.start[0]
      const dy = p[1] - d.start[1]
      if (!d.moved && Math.hypot(dx, dy) < 4 * u) return
      if (!d.moved) {
        d.moved = true
        setPast((h) => [...h, doc])
        setFuture([])
      }
      setDoc((cur) => ({ ...cur, marks: cur.marks.map((m, i) => (i === d.index ? moved(d.original, dx, dy) : m)) }))
      return
    }
    const current = drawing.current
    if (!current) return
    if (current.kind === 'line') current.points.push(pointFrom(e))
    else if (current.kind === 'arrow') current.to = pointFrom(e)
    render({ extra: current })
  }

  function onUp() {
    drag.current = null
    const current = drawing.current
    drawing.current = null
    if (!current) return
    if (current.kind === 'arrow') {
      const length = Math.hypot(current.to[0] - current.from[0], current.to[1] - current.from[1])
      if (length < size.w / 40) return render() // just a tap
      setMarks([...marks, current])
      // A dimension line: write the size on it next
      if (current.both) {
        setText('')
        setTyping({ index: marks.length, fresh: true })
      }
      return
    }
    setMarks([...marks, current])
  }

  /** Finish typing: a new label, or new words for a mark */
  function addText(value: string) {
    const words = value.trim()
    const t = typing
    setTyping(null)
    setText('')
    if (!t) return
    if (t.index != null) {
      const m = marks[t.index]
      if (!m) return
      if (m.kind === 'text') {
        if (!words) {
          setSelected(null)
          return setMarks(marks.filter((_, i) => i !== t.index))
        }
        if (words !== m.text) setMarks(marks.map((x, i) => (i === t.index ? { ...m, text: words } : x)))
      } else if (m.kind === 'arrow' && (m.label ?? '') !== words) {
        const next = marks.map((x, i) => (i === t.index ? { ...m, label: words || undefined } : x))
        // Typed right after drawing the line: part of the same change (one Undo removes both)
        if (t.fresh) setDoc((cur) => ({ ...cur, marks: next }))
        else setMarks(next)
      }
      return
    }
    if (words && t.at) setMarks([...marks, { kind: 'text', color, size: textSize, at: t.at, text: words }])
  }

  // ---- The selected mark ----
  const chosen = tool === 'select' && selected != null ? marks[selected] : undefined
  const canRetype = chosen && (chosen.kind === 'text' || (chosen.kind === 'arrow' && chosen.both))
  function recolor(value: string) {
    setColor(value)
    if (chosen && selected != null && chosen.color !== value) setMarks(marks.map((m, i) => (i === selected ? { ...m, color: value } : m)))
  }
  function deleteSelected() {
    if (selected == null) return
    setMarks(marks.filter((_, i) => i !== selected))
    setSelected(null)
  }
  function retype() {
    if (selected == null || !chosen) return
    setText(chosen.kind === 'text' ? chosen.text : chosen.kind === 'arrow' ? (chosen.label ?? '') : '')
    setTyping({ index: selected })
  }

  // ---- Cropping ----
  function framePoint(e: React.PointerEvent): Point {
    const rect = frameRef.current!.getBoundingClientRect()
    return [((e.clientX - rect.left) * size.w) / rect.width, ((e.clientY - rect.top) * size.h) / rect.height]
  }
  function cropStart(e: React.PointerEvent, mode: 'move' | 'nw' | 'ne' | 'sw' | 'se') {
    if (!crop) return
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
    cropDrag.current = { mode, start: framePoint(e), box: crop }
  }
  function cropMove(e: React.PointerEvent) {
    const d = cropDrag.current
    if (!d) return
    const [px, py] = framePoint(e)
    const dx = px - d.start[0]
    const dy = py - d.start[1]
    const min = Math.round(Math.min(size.w, size.h) * 0.1)
    let { x, y, w, h } = d.box
    if (d.mode === 'move') {
      x = Math.min(Math.max(0, x + dx), size.w - w)
      y = Math.min(Math.max(0, y + dy), size.h - h)
    } else {
      if (d.mode.includes('w')) {
        const nx = Math.min(Math.max(0, x + dx), x + w - min)
        w += x - nx
        x = nx
      } else w = Math.min(Math.max(min, w + dx), size.w - x)
      if (d.mode.includes('n')) {
        const ny = Math.min(Math.max(0, y + dy), y + h - min)
        h += y - ny
        y = ny
      } else h = Math.min(Math.max(min, h + dy), size.h - y)
    }
    setCrop({ x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) })
  }
  /** Cut the photo to the box; the marks move with it and stay changeable */
  async function applyCrop() {
    if (!crop || !background) return
    const out = document.createElement('canvas')
    out.width = crop.w
    out.height = crop.h
    const sx = background.naturalWidth / size.w
    const sy = background.naturalHeight / size.h
    out.getContext('2d')!.drawImage(background, crop.x * sx, crop.y * sy, crop.w * sx, crop.h * sy, 0, 0, crop.w, crop.h)
    try {
      const blob = await new Promise<Blob>((resolve, reject) =>
        out.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not crop.'))), 'image/jpeg', 0.92),
      )
      const img = await loadImage(URL.createObjectURL(blob))
      // The new picture may be drawn at a different scale (it's capped at 1600 px)
      const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight))
      const fix = (m: Mark): Mark => {
        const p = (q: Point): Point => [(q[0] - crop.x) * k, (q[1] - crop.y) * k]
        if (m.kind === 'line') return { ...m, points: m.points.map(p), width: m.width * k }
        if (m.kind === 'text') return { ...m, at: p(m.at), size: m.size * k }
        return { ...m, from: p(m.from), to: p(m.to), width: m.width * k }
      }
      commit({ background: img, marks: marks.map(fix) })
      setSelected(null)
      setCrop(null)
    } catch {
      setBgError('This photo cannot be cropped. You can still draw on it.')
      setCrop(null)
    }
  }

  function undo() {
    const last = past[past.length - 1]
    if (!last) return
    setFuture((f) => [doc, ...f])
    setPast((p) => p.slice(0, -1))
    setDoc(last)
    setSelected(null)
  }
  function redo() {
    const [next, ...rest] = future
    if (!next) return
    setPast((p) => [...p, doc])
    setFuture(rest)
    setDoc(next)
    setSelected(null)
  }

  const save = useMutation({
    mutationFn: async () => {
      const canvas = canvasRef.current!
      const toBlob = (c: HTMLCanvasElement) =>
        new Promise<Blob>((resolve, reject) => {
          try {
            c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not save the drawing.'))), 'image/jpeg', 0.9)
          } catch {
            reject(new Error('This photo cannot be drawn on. Try a blank sketch instead.'))
          }
        })
      render()
      const image = await toBlob(canvas)
      // The clean photo underneath, so the marks can be changed later
      let base: Blob | null = null
      if (background) {
        const c = document.createElement('canvas')
        c.width = size.w
        c.height = size.h
        c.getContext('2d')!.drawImage(background, 0, 0, size.w, size.h)
        base = await toBlob(c)
      }
      const saved = await backend.saveSketch(itemId, image, { version: 1, w: size.w, h: size.h, marks }, base, editing)
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
        const old = before && before !== saved.id && before !== editing?.id && photos?.find((p) => p.id === before)
        if (old) await backend.deletePhoto(old)
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
    if (!changed || confirm('Throw away your changes?')) {
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
  const hint = loading
    ? 'Opening…'
    : {
        select: chosen ? 'Drag to move it, or change it below.' : marks.length ? 'Tap a mark to change it.' : 'Nothing drawn yet.',
        pen: 'Draw with your finger.',
        arrow: 'Drag from the start to what it points at.',
        measure: 'Drag across what you measured, then type the size.',
        text: 'Tap where the label goes.',
      }[tool]
  const title = measurement ? measurement.label || 'Measurement photo' : editing ? 'Edit drawing' : photoId || fromFile ? 'Mark up photo' : 'Sketch'
  const panel = 'rounded-[22px] bg-[#1c1c1e]/95 ring-1 ring-white/10'

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-[#0b0b0d] pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] text-white">
      <div className="flex items-center justify-between gap-2 px-3 py-1.5">
        <button onClick={close} className="min-h-11 rounded-full px-3 text-[16px] font-medium text-white/80 active:bg-white/10">
          Cancel
        </button>
        <p className="min-w-0 truncate text-[16px] font-semibold tracking-tight">{title}</p>
        <button
          onClick={() => {
            setSelected(null)
            save.mutate()
          }}
          disabled={save.isPending || !changed || Boolean(typing) || Boolean(crop)}
          className="min-h-11 rounded-full bg-white px-5 text-[16px] font-semibold text-[#0b0b0d] disabled:bg-white/15 disabled:text-white/40"
        >
          {save.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>

      {(bgError || save.error) && (
        <div className="px-3">
          <ErrorNote error={save.error ?? new Error(bgError!)} />
        </div>
      )}

      <div ref={areaRef} className="flex min-h-0 flex-1 items-center justify-center p-2">
        <div ref={frameRef} className="relative" style={fit}>
          <canvas
            ref={canvasRef}
            width={size.w}
            height={size.h}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            aria-label="Drawing"
            className={`block h-full w-full touch-none rounded-md bg-white shadow-[0_20px_50px_-12px_rgba(0,0,0,0.8)] ${loading ? 'opacity-40' : ''}`}
          />
          {crop && (
            <div
              className="absolute inset-0 touch-none overflow-hidden rounded-md"
              onPointerMove={cropMove}
              onPointerUp={() => (cropDrag.current = null)}
              onPointerCancel={() => (cropDrag.current = null)}
            >
              <div
                aria-label="Crop area"
                className="absolute cursor-move border border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.6)]"
                style={{
                  left: `${(crop.x / size.w) * 100}%`,
                  top: `${(crop.y / size.h) * 100}%`,
                  width: `${(crop.w / size.w) * 100}%`,
                  height: `${(crop.h / size.h) * 100}%`,
                }}
                onPointerDown={(e) => cropStart(e, 'move')}
              >
                <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
                  {Array.from({ length: 9 }, (_, i) => (
                    <span key={i} className="border border-white/20" />
                  ))}
                </div>
                {(['nw', 'ne', 'sw', 'se'] as const).map((corner) => (
                  <span
                    key={corner}
                    role="button"
                    aria-label={`Crop corner ${corner}`}
                    onPointerDown={(e) => {
                      e.stopPropagation()
                      cropStart(e, corner)
                    }}
                    className={`absolute h-10 w-10 ${corner.includes('n') ? '-top-[6px]' : '-bottom-[6px]'} ${corner.includes('w') ? '-left-[6px]' : '-right-[6px]'}`}
                  >
                    {/* An L-shaped corner grip */}
                    <span
                      className={`absolute h-6 w-6 border-white ${corner.includes('n') ? 'top-0 border-t-4' : 'bottom-0 border-b-4'} ${corner.includes('w') ? 'left-0 border-l-4' : 'right-0 border-r-4'}`}
                    />
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2 px-3 pb-3">
        {crop ? (
          <div className={`${panel} space-y-2 p-2`}>
            <p className="pt-1 text-center text-[13px] text-white/60">Drag the box or its corners, then tap Apply.</p>
            <div className="grid grid-cols-3 gap-2">
              <button type="button" onClick={() => setCrop(null)} className="min-h-12 rounded-2xl bg-white/10 text-[15px] font-semibold">
                Cancel
              </button>
              <button type="button" onClick={() => setCrop({ x: 0, y: 0, w: size.w, h: size.h })} className="min-h-12 rounded-2xl bg-white/10 text-[15px] font-semibold">
                Reset
              </button>
              <button type="button" onClick={() => void applyCrop()} className="min-h-12 rounded-2xl bg-white text-[15px] font-semibold text-[#0b0b0d]">
                Apply
              </button>
            </div>
          </div>
        ) : typing ? (
          <form
            className={`${panel} space-y-2 p-2`}
            onSubmit={(e) => {
              e.preventDefault()
              addText(text)
            }}
          >
            {sizes.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {sizes.map((s) => (
                  <button key={s} type="button" onClick={() => addText(s)} className="min-h-10 rounded-full bg-white/10 px-3.5 text-[15px] font-semibold">
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
                placeholder={typing.index != null && marks[typing.index]?.kind === 'arrow' ? 'Size, e.g. 30 in' : 'Label, e.g. Replace valve'}
                aria-label="Text to add"
                className="min-h-12 min-w-0 flex-1 rounded-2xl bg-white px-3.5 text-[17px] text-[#0b0b0d] outline-none"
              />
              <button type="submit" className="min-h-12 rounded-2xl bg-[#0a84ff] px-4 text-[16px] font-semibold">
                Done
              </button>
              <button type="button" onClick={() => setTyping(null)} className="min-h-12 rounded-2xl bg-white/10 px-3 text-[15px] text-white/80">
                Skip
              </button>
            </div>
          </form>
        ) : (
          <>
            {chosen && (
              <div className={`${panel} flex items-center gap-1 p-1.5`}>
                {canRetype && (
                  <button onClick={retype} className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-2xl text-[15px] font-semibold active:bg-white/10">
                    <TextIcon size={18} /> {chosen.kind === 'text' ? 'Edit text' : 'Edit size'}
                  </button>
                )}
                <button
                  onClick={deleteSelected}
                  className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-2xl text-[15px] font-semibold text-[#ff6b6b] active:bg-white/10"
                >
                  <TrashIcon size={18} /> Delete
                </button>
                <button onClick={() => setSelected(null)} className="min-h-11 flex-1 rounded-2xl text-[15px] font-semibold text-white/70 active:bg-white/10">
                  Deselect
                </button>
              </div>
            )}
            <div className={`${panel} space-y-2 p-2`}>
              <div className="flex items-center justify-between gap-2 px-1">
                <div className="flex items-center gap-2">
                  {colors.map((c) => (
                    <button
                      key={c.value}
                      onClick={() => recolor(c.value)}
                      className={`h-8 w-8 rounded-full transition ${
                        (chosen ? chosen.color : color) === c.value ? 'ring-2 ring-white ring-offset-2 ring-offset-[#1c1c1e]' : 'ring-1 ring-white/25'
                      }`}
                      style={{ background: c.value }}
                      aria-label={`Colour ${c.name}`}
                    />
                  ))}
                </div>
                <button
                  onClick={() => setWeight((w) => (w + 1) % 3)}
                  className="flex h-9 min-w-[76px] items-center justify-center gap-2 rounded-full bg-white/10 px-3 text-[13px] font-semibold"
                  aria-label={`Line weight: ${weights[weight]}. Tap to change.`}
                >
                  <span className="rounded-full bg-white" style={{ width: [5, 8, 12][weight], height: [5, 8, 12][weight] }} />
                  {weights[weight]}
                </button>
              </div>
              <div className="flex items-stretch gap-1">
                <ToolButton active={tool === 'select'} onClick={() => setTool('select')} label="Select">
                  <SelectIcon size={21} />
                </ToolButton>
                <ToolButton active={tool === 'pen'} onClick={() => setTool('pen')} label="Pen">
                  <PencilIcon size={21} />
                </ToolButton>
                <ToolButton active={tool === 'arrow'} onClick={() => setTool('arrow')} label="Arrow">
                  <ArrowIcon size={21} />
                </ToolButton>
                <ToolButton active={tool === 'measure'} onClick={() => setTool('measure')} label="Measure">
                  <RulerIcon size={21} />
                </ToolButton>
                <ToolButton active={tool === 'text'} onClick={() => setTool('text')} label="Text">
                  <TextIcon size={21} />
                </ToolButton>
                {background && (
                  <ToolButton
                    onClick={() => {
                      setSelected(null)
                      const m = Math.round(Math.min(size.w, size.h) * 0.08)
                      setCrop({ x: m, y: m, w: size.w - 2 * m, h: size.h - 2 * m })
                    }}
                    label="Crop"
                  >
                    <CropIcon size={21} />
                  </ToolButton>
                )}
              </div>
              <div className="flex items-center gap-1 border-t border-white/10 pt-1.5">
                <p className="min-w-0 flex-1 truncate px-1 text-[13px] text-white/55">{hint}</p>
                <IconButton onClick={undo} disabled={!past.length} label="Undo">
                  <UndoIcon size={20} />
                </IconButton>
                <IconButton onClick={redo} disabled={!future.length} label="Redo">
                  <RedoIcon size={20} />
                </IconButton>
                <IconButton
                  onClick={() => {
                    if (confirm('Clear all the marks?')) {
                      setSelected(null)
                      setMarks([])
                    }
                  }}
                  disabled={marks.length === 0}
                  label="Clear"
                >
                  <TrashIcon size={19} />
                </IconButton>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function ToolButton({
  active,
  onClick,
  label,
  children,
}: {
  active?: boolean
  onClick: () => void
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl text-[11px] font-medium transition ${
        active ? 'bg-white text-[#0b0b0d]' : 'text-white/75 active:bg-white/10'
      }`}
    >
      {children}
      {label}
    </button>
  )
}

function IconButton({ onClick, disabled, label, children }: { onClick: () => void; disabled?: boolean; label: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex h-10 w-10 items-center justify-center rounded-full text-white/85 active:bg-white/10 disabled:opacity-25"
    >
      {children}
    </button>
  )
}
