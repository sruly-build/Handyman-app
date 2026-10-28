import { useRef, useState } from 'react'
import { Hand, PenLine, StickyNote, Trash2, Undo2 } from 'lucide-react'
import { uid, useStore } from '../data/store'
import type { Project, Sticky } from '../data/types'
import { cx } from './ui'

const W = 900
const H = 600
const NOTE_COLORS: Record<Sticky['color'], string> = {
  yellow: '#fff4b8',
  blue: '#d8e8ff',
  pink: '#ffdbe4',
  green: '#d9f2dc',
}

type Tool = 'move' | 'pen'

export function Whiteboard({ project }: { project: Project }) {
  const { update } = useStore()
  const [tool, setTool] = useState<Tool>('move')
  const [live, setLive] = useState<[number, number][] | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const boardRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null)

  const point = (e: React.PointerEvent): [number, number] => {
    const r = boardRef.current!.getBoundingClientRect()
    return [Math.round(e.clientX - r.left), Math.round(e.clientY - r.top)]
  }

  const edit = (fn: (p: Project) => void) =>
    update((s) => {
      fn(s.projects.find((x) => x.id === project.id)!)
    })

  const addNote = (color: Sticky['color']) => {
    const id = uid('k')
    const scroller = boardRef.current?.parentElement
    const x = (scroller?.scrollLeft ?? 0) + 40 + Math.random() * 60
    const y = (scroller?.scrollTop ?? 0) + 40 + Math.random() * 60
    edit((p) => p.stickies.push({ id, x, y, text: '', color }))
    setTool('move')
    setEditing(id)
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex rounded-full bg-card p-1 shadow-card">
          <ToolBtn active={tool === 'move'} onClick={() => setTool('move')} label="Move">
            <Hand size={18} />
          </ToolBtn>
          <ToolBtn active={tool === 'pen'} onClick={() => setTool('pen')} label="Draw">
            <PenLine size={18} />
          </ToolBtn>
        </div>
        <div className="flex items-center gap-1 rounded-full bg-card p-1 pr-2 shadow-card">
          <span className="flex items-center gap-1 pl-2 text-[13px] text-ink-2">
            <StickyNote size={16} /> Note
          </span>
          {(Object.keys(NOTE_COLORS) as Sticky['color'][]).map((c) => (
            <button
              key={c}
              aria-label={`Add ${c} note`}
              onClick={() => addNote(c)}
              className="ml-1 h-7 w-7 rounded-full border border-black/10"
              style={{ background: NOTE_COLORS[c] }}
            />
          ))}
        </div>
        <div className="ml-auto flex rounded-full bg-card p-1 shadow-card">
          <ToolBtn onClick={() => edit((p) => void p.strokes.pop())} label="Undo line">
            <Undo2 size={18} />
          </ToolBtn>
          <ToolBtn onClick={() => edit((p) => void (p.strokes = []))} label="Clear drawing">
            <Trash2 size={18} />
          </ToolBtn>
        </div>
      </div>

      <div className="overflow-auto rounded-2xl bg-card shadow-card" style={{ maxHeight: '70dvh' }}>
        <div
          ref={boardRef}
          className="relative"
          style={{
            width: W,
            height: H,
            touchAction: tool === 'pen' ? 'none' : 'auto',
            backgroundImage: 'radial-gradient(#d9d9de 1.2px, transparent 1.2px)',
            backgroundSize: '22px 22px',
            cursor: tool === 'pen' ? 'crosshair' : 'default',
          }}
          onPointerDown={(e) => {
            if (tool !== 'pen') return
            ;(e.target as Element).setPointerCapture?.(e.pointerId)
            setLive([point(e)])
          }}
          onPointerMove={(e) => {
            if (tool === 'pen' && live) setLive([...live, point(e)])
            if (drag.current) {
              const [x, y] = point(e)
              const d = drag.current
              edit((p) => {
                const n = p.stickies.find((s) => s.id === d.id)!
                n.x = Math.max(0, Math.min(W - 160, x - d.dx))
                n.y = Math.max(0, Math.min(H - 120, y - d.dy))
              })
            }
          }}
          onPointerUp={() => {
            if (live && live.length > 1) {
              const pts = live
              edit((p) => p.strokes.push({ id: uid('sk'), points: pts }))
            }
            setLive(null)
            drag.current = null
          }}
        >
          <div className="pointer-events-none absolute top-3 left-4 text-[12px] font-medium text-ink-3">
            Shot plan · drag notes, draw layouts
          </div>
          <svg width={W} height={H} className="pointer-events-none absolute inset-0">
            {[...project.strokes.map((s) => s.points), ...(live ? [live] : [])].map((pts, i) => (
              <polyline
                key={i}
                points={pts.map((p) => p.join(',')).join(' ')}
                fill="none"
                stroke="#1d1d1f"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </svg>
          {project.stickies.map((n) => (
            <div
              key={n.id}
              className={cx('absolute w-[160px] rounded-md p-3 shadow-[0_2px_8px_rgba(0,0,0,0.12)]', tool === 'pen' && 'pointer-events-none')}
              style={{ left: n.x, top: n.y, background: NOTE_COLORS[n.color], minHeight: 110, touchAction: 'none' }}
              onPointerDown={(e) => {
                if (tool !== 'move' || editing === n.id) return
                e.stopPropagation()
                ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
                const [x, y] = point(e)
                drag.current = { id: n.id, dx: x - n.x, dy: y - n.y }
              }}
              onDoubleClick={() => setEditing(n.id)}
            >
              {editing === n.id ? (
                <textarea
                  autoFocus
                  defaultValue={n.text}
                  onBlur={(e) => {
                    const v = e.target.value
                    edit((p) => {
                      if (!v.trim()) p.stickies = p.stickies.filter((s) => s.id !== n.id)
                      else p.stickies.find((s) => s.id === n.id)!.text = v
                    })
                    setEditing(null)
                  }}
                  className="h-[86px] w-full resize-none bg-transparent text-[14px] leading-snug outline-none"
                  placeholder="Type a shot idea…"
                />
              ) : (
                <>
                  <div className="text-[14px] leading-snug whitespace-pre-wrap">{n.text}</div>
                  <button
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => setEditing(n.id)}
                    className="absolute right-1.5 bottom-1 text-[11px] font-medium text-black/40"
                  >
                    Edit
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
      <p className="mt-2 px-1 text-[12px] text-ink-3">Tip: choose Draw to sketch a layout, Move to drag notes. Empty notes are removed.</p>
    </div>
  )
}

function ToolBtn({ active, onClick, label, children }: { active?: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cx('flex h-8 items-center gap-1 rounded-full px-3 text-[13px] font-medium', active ? 'bg-ink text-white' : 'text-ink-2 active:bg-fill')}
    >
      {children}
      {active !== undefined && label}
    </button>
  )
}
