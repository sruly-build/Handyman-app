import { Route, Routes } from 'react-router-dom'
import { ApprovalPage } from './ApprovalPage'
import { RequestPage } from './RequestPage'
import { StatusPage } from './StatusPage'

/** Pages anyone can open without logging in */
export const isPublicPath = (path: string) => /^\/(r|s|a)\/[^/]+/.test(path)

export function PublicApp() {
  return (
    <Routes>
      <Route path="/r/:slug" element={<RequestPage />} />
      <Route path="/s/:token" element={<StatusPage />} />
      <Route path="/a/:token" element={<ApprovalPage />} />
    </Routes>
  )
}
