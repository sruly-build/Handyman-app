import { Navigate, Route, Routes, useParams } from 'react-router-dom'
import { TabBar } from './components/TabBar'
import { Loading } from './components/ui'
import { useAuth } from './lib/auth'
import { BillScreen } from './screens/BillScreen'
import { BusinessProfileScreen } from './screens/BusinessProfileScreen'
import { SetPasswordScreen } from './screens/SetPasswordScreen'
import { ShareJobScreen } from './screens/ShareJobScreen'
import { TeamScreen } from './screens/TeamScreen'
import { BringListScreen } from './screens/BringListScreen'
import { BringOverviewScreen } from './screens/BringOverviewScreen'
import { HomeScreen } from './screens/HomeScreen'
import { ItemScreen } from './screens/ItemScreen'
import { JobDetailScreen } from './screens/JobDetailScreen'
import { JobFormScreen } from './screens/JobFormScreen'
import { JobPartsScreen } from './screens/JobPartsScreen'
import { JobsScreen } from './screens/JobsScreen'
import { LoginScreen } from './screens/LoginScreen'
import { MeScreen } from './screens/MeScreen'
import { NewItemScreen } from './screens/NewItemScreen'
import { OrdersScreen } from './screens/OrdersScreen'
import { PartFormScreen } from './screens/PartFormScreen'
import { ReportScreen } from './screens/ReportScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { SketchScreen } from './screens/SketchScreen'
import { TimeScreen } from './screens/TimeScreen'

export function App() {
  const { user, loading, recovering, finishRecovery } = useAuth()

  if (loading) return <Loading />
  if (recovering) return <SetPasswordScreen onDone={finishRecovery} />
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
        <Route path="/jobs/:jobId/items/:itemId/sketch" element={<SketchScreen />} />
        <Route path="/jobs/:jobId/parts" element={<JobPartsScreen />} />
        <Route path="/jobs/:jobId/parts/new" element={<PartFormScreen key="new" />} />
        <Route path="/parts/:partId" element={<Keyed param="partId" Component={PartFormScreen} />} />
        <Route path="/jobs/:jobId/bring" element={<BringListScreen />} />
        <Route path="/jobs/:jobId/time" element={<TimeScreen />} />
        <Route path="/jobs/:jobId/bill" element={<BillScreen />} />
        <Route path="/jobs/:jobId/report" element={<ReportScreen />} />
        <Route path="/orders" element={<OrdersScreen />} />
        <Route path="/bring" element={<BringOverviewScreen />} />
        <Route path="/more" element={<MeScreen />} />
        <Route path="/settings" element={<SettingsScreen />} />
        <Route path="/business" element={<BusinessProfileScreen />} />
        <Route path="/team" element={<TeamScreen />} />
        <Route path="/jobs/:jobId/share" element={<ShareJobScreen />} />
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
