import { Route, Routes } from 'react-router-dom'
import { ApprovalPage } from './ApprovalPage'
import { BillPage } from './BillPage'
import { LandlordJoinPage } from './LandlordJoinPage'
import { RequestPage } from './RequestPage'
import { StatusPage } from './StatusPage'

/** Pages anyone can open without logging in */
export const isPublicPath = (path: string) => /^\/(r|s|a|l|b)\/[^/]+/.test(path)

export function PublicApp() {
  return (
    <Routes>
      <Route path="/r/:slug" element={<RequestPage />} />
      <Route path="/s/:token" element={<StatusPage />} />
      <Route path="/a/:token" element={<ApprovalPage />} />
      <Route path="/l/:slug" element={<LandlordJoinPage />} />
      <Route path="/b/:token" element={<BillPage />} />
    </Routes>
  )
}
