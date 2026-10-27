import { Screen } from '../components/Screen'
import { Card } from '../components/ui'

interface Props {
  title: string
  stage: number
  points: string[]
}

/** Placeholder for screens planned in a later build stage */
export function ComingSoonScreen({ title, stage, points }: Props) {
  return (
    <Screen title={title}>
      <Card className="p-6">
        <span className="rounded-full bg-progress-soft px-3 py-1 text-[13px] font-semibold text-[#c26a00]">
          Coming in Stage {stage}
        </span>
        <ul className="mt-4 space-y-2 text-[17px]">
          {points.map((p) => (
            <li key={p} className="flex gap-2">
              <span className="text-brand">•</span>
              {p}
            </li>
          ))}
        </ul>
      </Card>
    </Screen>
  )
}
