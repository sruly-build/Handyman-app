import { useParams } from 'react-router-dom'
import { BeforeAfterList, DocHeader, Paper, PrintButton } from '../components/Documents'
import { Screen } from '../components/Screen'
import { ErrorNote, Loading } from '../components/ui'
import { useItems, useJob, useJobPhotos, useSettings } from '../data/queries'
import { friendlyDate } from '../lib/dates'

/** Before and after photos side by side, to show the client what was fixed */
export function ReportScreen() {
  const { jobId = '' } = useParams()
  const { data: job, error } = useJob(jobId)
  const { data: items } = useItems(jobId)
  const { data: photos } = useJobPhotos(jobId)
  const { data: settings } = useSettings()

  const back = { to: `/jobs/${jobId}`, label: 'Job' }
  if (error || !job || !items || !photos || !settings) {
    return (
      <Screen title="Report" back={back}>
        {error ? <ErrorNote error={error} /> : <Loading />}
      </Screen>
    )
  }

  const done = items.filter((i) => i.status === 'done').length
  return (
    <Screen title="Before and after" eyebrow={job.customer_name} back={back}>
      <div className="space-y-4">
        <Paper>
          <DocHeader title="Job report" subtitle={friendlyDate(job.job_date)} job={job} settings={settings} />
          <p className="my-4 text-[15px]">
            {done} of {items.length} {items.length === 1 ? 'item' : 'items'} completed.
          </p>
          <BeforeAfterList items={items} photos={photos} showEmpty />
        </Paper>
        <PrintButton />
        <p className="px-2 text-center text-[13px] text-muted print:hidden">
          Save as a PDF to text or email it to the client.
        </p>
      </div>
    </Screen>
  )
}
