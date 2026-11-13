import { Route, Routes } from 'react-router-dom'
import { RequestPage } from './RequestPage'

/** Pages anyone can open without logging in */
export const isPublicPath = (path: string) => /^\/(r|s|a)\/[^/]+/.test(path)

export function PublicApp() {
  return (
    <Routes>
      <Route path="/r/:slug" element={<RequestPage />} />
    </Routes>
  )
}
