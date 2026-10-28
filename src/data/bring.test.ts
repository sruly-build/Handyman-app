import { describe, expect, it } from 'vitest'
import { buildBringList } from './bring'
import type { Part, PunchItem } from './types'

const item = (title: string, tools: string[]): PunchItem => ({
  id: title,
  job_id: 'j',
  title,
  location: '',
  notes: '',
  status: 'todo',
  measurements: [],
  tools,
  estimated_hours: null,
  position: 0,
  created_at: '',
})
const part = (name: string, status: Part['status'], quantity = 1): Part => ({
  id: name,
  job_id: 'j',
  item_id: 'Faucet',
  name,
  quantity,
  cost: null,
  supplier: '',
  status,
  created_at: '',
  ordered_at: null,
  received_at: null,
})

describe('buildBringList', () => {
  it('combines tools from all items without duplicates and remembers which items need them', () => {
    const list = buildBringList(
      [item('Faucet', ['Wrench', 'Plumber tape']), item('Shelf', ['drill', ' wrench ', 'Wall anchors x8'])],
      [],
      ['Drill', 'Ladder'],
    )
    expect(list.map((e) => e.label)).toEqual(['drill', 'Ladder', 'Plumber tape', 'Wall anchors x8', 'Wrench'])
    expect(list.find((e) => e.label === 'Wrench')!.sources).toEqual(['Faucet', 'Shelf'])
  })

  it('adds parts that were ordered or received, but not ones still needed', () => {
    const list = buildBringList([item('Faucet', [])], [part('Cartridge', 'ordered', 2), part('Valve', 'needed')], [])
    expect(list).toEqual([{ key: 'part:Cartridge', label: 'Cartridge × 2', sources: ['Faucet'], kind: 'part' }])
  })
})
