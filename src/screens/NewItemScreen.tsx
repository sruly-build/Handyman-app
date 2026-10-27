import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Screen } from '../components/Screen'
import { Button, Card, Divider, ErrorNote, Field } from '../components/ui'
import { backend } from '../data/backend'
import { keys } from '../data/queries'

/** Quick first step: name the item, then everything else is added on the item screen. */
export function NewItemScreen() {
  const { jobId = '' } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [title, setTitle] = useState('')
  const [location, setLocation] = useState('')

  const create = useMutation({
    mutationFn: () => backend.createItem(jobId, title.trim(), location.trim()),
    onSuccess: (item) => {
      qc.invalidateQueries({ queryKey: keys.items(jobId) })
      qc.invalidateQueries({ queryKey: keys.jobs })
      qc.setQueryData(keys.item(item.id), item)
      navigate(`/jobs/${jobId}/items/${item.id}`, { replace: true })
    },
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    create.mutate()
  }

  return (
    <Screen title="New item" back={{ to: `/jobs/${jobId}`, label: 'Job' }}>
      <form onSubmit={submit} className="space-y-4">
        <Card>
          <Field
            label="What needs doing?"
            required
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Fix leaky faucet"
          />
          <Divider />
          <Field
            label="Where? (room or area)"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Upstairs bathroom"
          />
        </Card>
        {create.error && <ErrorNote error={create.error} />}
        <Button type="submit" disabled={create.isPending || !title.trim()}>
          {create.isPending ? 'Adding…' : 'Add item'}
        </Button>
        <p className="px-2 text-center text-[14px] text-muted">
          Next you can add photos, measurements and notes.
        </p>
      </form>
    </Screen>
  )
}
