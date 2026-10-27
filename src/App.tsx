import { Navigate, Route, Routes, useParams } from 'react-router-dom'
import { TabBar } from './components/TabBar'
import { Loading } from './components/ui'
import { useAuth } from './lib/auth'
import { ComingSoonScreen } from './screens/ComingSoonScreen'
import { HomeScreen } from './screens/HomeScreen'
import { ItemScreen } from './screens/ItemScreen'
import { JobDetailScreen } from './screens/JobDetailScreen'
import { JobFormScreen } from './screens/JobFormScreen'
import { JobsScreen } from './screens/JobsScreen'
import { LoginScreen } from './screens/LoginScreen'
import { MeScreen } from './screens/MeScreen'
import { NewItemScreen } from './screens/NewItemScreen'

export function App() {
  const { user, loading } = useAuth()

  if (loading) return <Loading />
  if (!user) return <LoginScreen />

  return (
    <>
      <Routes>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/jobs" element={<JobsScreen />} />
        <Route path="/jobs/new" element={<JobFormScreen key="new" />} />
        <Route path="/jobs/:jobId" element={<Keyed param="jobId" Component={JobDetailScreen} />} />
        <Route path="/jobs/:jobId/edit" element={<Keyed param="jobId" Component={JobFormScreen} />} />
        <Route path="/jobs/:jobId/items/new" element={<NewItemScreen />} />
        <Route path="/jobs/:jobId/items/:itemId" element={<Keyed param="itemId" Component={ItemScreen} />} />
        <Route
          path="/orders"
          element={
            <ComingSoonScreen
              title="Orders"
              stage={2}
              points={[
                'One list of every part across all jobs',
                'Each part moves from needed → ordered → received',
                'Cost paid and supplier for each part',
              ]}
            />
          }
        />
        <Route
          path="/bring"
          element={
            <ComingSoonScreen
              title="Bring list"
              stage={2}
              points={[
                'Every tool and material for the job in one checklist',
                'Built from the punch list items, no duplicates',
                'Check items off while loading the van',
              ]}
            />
          }
        />
        <Route path="/more" element={<MeScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <TabBar />
    </>
  )
}

/** Gives a screen a fresh start when its id changes (e.g. moving between two items) */
function Keyed({ param, Component }: { param: string; Component: () => React.ReactNode }) {
  const params = useParams()
  return <Component key={params[param]} />
}
