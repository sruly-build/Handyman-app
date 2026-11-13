import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { PublicApp, isPublicPath } from './public/PublicApp'
import { TabBar } from './components/TabBar'
import { Loading } from './components/ui'
import { useAuth } from './lib/auth'
import { ApprovalsScreen } from './screens/ApprovalsScreen'
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
import { LeadsScreen } from './screens/LeadsScreen'
import { LeadFormScreen } from './screens/LeadFormScreen'
import { ScheduleScreen } from './screens/ScheduleScreen'
import { SalesDashboardScreen } from './screens/SalesDashboardScreen'
import { ProspectsScreen } from './screens/ProspectsScreen'
import { ProspectFormScreen } from './screens/ProspectFormScreen'
import { ProspectScreen } from './screens/ProspectScreen'
import { CallListScreen } from './screens/CallListScreen'
import { FollowUpsScreen } from './screens/FollowUpsScreen'
import { PipelineScreen } from './screens/PipelineScreen'
import { OpportunityFormScreen } from './screens/OpportunityFormScreen'
import { DirectoryScreen } from './screens/DirectoryScreen'
import { ContactFormScreen } from './screens/ContactFormScreen'
import { DirectorySharingScreen } from './screens/DirectorySharingScreen'
import { TimeEntryFormScreen } from './screens/TimeEntryFormScreen'
import { PriceListScreen } from './screens/PriceListScreen'
import { RequestPosterScreen, RequestSettingsScreen } from './screens/RequestSettingsScreen'

export function App() {
  const { user, loading, recovering, finishRecovery } = useAuth()
  const { pathname } = useLocation()

  // The request page, status links and approval links need no login
  if (isPublicPath(pathname)) return <PublicApp />
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
        <Route path="/jobs/:jobId/time/new" element={<TimeEntryFormScreen key="new" />} />
        <Route path="/jobs/:jobId/time/:entryId" element={<Keyed param="entryId" Component={TimeEntryFormScreen} />} />
        <Route path="/jobs/:jobId/bill" element={<BillScreen />} />
        <Route path="/jobs/:jobId/report" element={<ReportScreen />} />
        <Route path="/orders" element={<OrdersScreen />} />
        <Route path="/leads" element={<LeadsScreen />} />
        <Route path="/leads/new" element={<LeadFormScreen />} />
        <Route path="/schedule" element={<ScheduleScreen />} />
        <Route path="/sales" element={<SalesDashboardScreen />} />
        <Route path="/sales/leads" element={<ProspectsScreen />} />
        <Route path="/sales/leads/new" element={<ProspectFormScreen key="new" />} />
        <Route path="/sales/leads/:leadId" element={<Keyed param="leadId" Component={ProspectScreen} />} />
        <Route path="/sales/leads/:leadId/edit" element={<Keyed param="leadId" Component={ProspectFormScreen} />} />
        <Route path="/sales/leads/:leadId/turnover" element={<OpportunityFormScreen />} />
        <Route path="/sales/calls" element={<CallListScreen />} />
        <Route path="/sales/follow-ups" element={<FollowUpsScreen />} />
        <Route path="/sales/pipeline" element={<PipelineScreen />} />
        <Route path="/bring" element={<BringOverviewScreen />} />
        <Route path="/more" element={<MeScreen />} />
        <Route path="/settings" element={<SettingsScreen />} />
        <Route path="/price-list" element={<PriceListScreen />} />
        <Route path="/directory" element={<DirectoryScreen />} />
        <Route path="/directory/new" element={<ContactFormScreen key="new" />} />
        <Route path="/directory/sharing" element={<DirectorySharingScreen />} />
        <Route path="/directory/:contactId" element={<Keyed param="contactId" Component={ContactFormScreen} />} />
        <Route path="/business" element={<BusinessProfileScreen />} />
        <Route path="/request-page" element={<RequestSettingsScreen />} />
        <Route path="/request-page/poster" element={<RequestPosterScreen />} />
        <Route path="/team" element={<TeamScreen />} />
        <Route path="/approvals" element={<ApprovalsScreen />} />
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
