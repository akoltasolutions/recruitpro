'use client'

import { AppContent } from '@/components/app-router'

/**
 * Catch-all route — renders the SPA for all paths.
 * 
 * This ensures that:
 * - Direct URL access works (e.g., /dashboard, /signup, /team-performance)
 * - Page refreshes work on any route (no 404s)
 * - All navigation uses clean URLs without #
 * 
 * The client-side router (usePathRouter in AppContent) reads the
 * original URL path from the browser and renders the correct component.
 */
export default function CatchAllPage() {
  return <AppContent />
}
