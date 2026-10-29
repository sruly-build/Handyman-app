import { useEffect } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { Layout } from './components/Layout'
import { HomeScreen } from './screens/HomeScreen'
import { ProjectsScreen } from './screens/ProjectsScreen'
import { ProjectScreen } from './screens/ProjectScreen'
import { ClientsScreen } from './screens/ClientsScreen'
import { ClientScreen } from './screens/ClientScreen'
import { CalendarScreen } from './screens/CalendarScreen'
import { InvoicesScreen } from './screens/InvoicesScreen'
import { InvoiceScreen } from './screens/InvoiceScreen'
import { InvoiceEditScreen } from './screens/InvoiceEditScreen'
import { ReportScreen } from './screens/ReportScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { ClientGalleryScreen } from './screens/ClientGalleryScreen'
import { Empty, Page } from './components/ui'

export default function App() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return (
    <Routes>
      <Route path="/g/:id" element={<ClientGalleryScreen />} />
      <Route element={<Layout />}>
        <Route index element={<HomeScreen />} />
        <Route path="projects" element={<ProjectsScreen />} />
        <Route path="projects/:id" element={<ProjectScreen />} />
        <Route path="projects/:id/:tab" element={<ProjectScreen />} />
        <Route path="clients" element={<ClientsScreen />} />
        <Route path="clients/leads" element={<ClientsScreen leads />} />
        <Route path="clients/:id" element={<ClientScreen />} />
        <Route path="calendar" element={<CalendarScreen />} />
        <Route path="invoices" element={<InvoicesScreen />} />
        <Route path="invoices/report" element={<ReportScreen />} />
        <Route path="invoices/:id" element={<InvoiceScreen />} />
        <Route path="invoices/:id/edit" element={<InvoiceEditScreen />} />
        <Route path="settings" element={<SettingsScreen />} />
        <Route
          path="*"
          element={
            <Page>
              <Empty title="Nothing here" text="This page doesn’t exist in the preview." />
            </Page>
          }
        />
      </Route>
    </Routes>
  )
}
