# LedgerIQ Frontend Guide (React + Vite + Tailwind CSS)

The live React SPA frontend runs via Vite from the workspace root (`index.html` + `src/`) so AI Studio preview and Capacitor Android builds work without path remapping.

## Key Frontend Files & Folders
- `index.html` — HTML entry point, Google Fonts (`Inter`, `Plus Jakarta Sans`, `JetBrains Mono`), and dark-mode bootstrap
- `src/main.tsx` — React DOM mount
- `src/App.tsx` — Top-level providers (`MotionConfig`, `ThemeProvider`, `ToastProvider`, `AuthProvider`) and animated page router
- `src/index.css` — Tailwind CSS v4 theme, Obsidian Dark & Frosted Light glassmorphism utilities, scan beam & shimmer animations
- `src/components/`:
  - `AppShell.tsx` — Collapsible frosted sidebar, glass top header, live notifications popover, profile dropdown, mobile bottom nav & FAB
  - `ConfirmDialog.tsx` — Animated confirmation modal
  - `MotionPrimitives.tsx` — `AnimatedNumber`, `AnimatedProgressBar`, `EmptyStateCard`, `ErrorStateCard`, `DashboardSkeleton`
- `src/context/`:
  - `AuthContext.tsx` — Session login, registration, logout, and JWT token storage
  - `ThemeContext.tsx` — Dark/Light theme switcher + Recharts dark/light color palette
  - `ToastContext.tsx` — Toast notification stack
- `src/pages/` — All 15 screens (`LandingPage`, `AuthPages`, `DashboardPage`, `TransactionsPage`, `TransactionFormPage`, `ReceiptScannerPage`, `ForecastPage`, `AnalyticsPage`, `AssistantPage`, `BudgetPlannerPage`, `SimulatorPage`, `RecommendationsPage`, `RecurringPage`, `ReportsPage`, `ProfilePage`)
- `src/services/api.ts` — Typed REST API client (`VITE_API_BASE_URL`)

## Connecting Frontend to Another Backend
By default, `src/services/api.ts` calls `/api/*` on the same origin (Node/Express on port `3000`). To point the frontend at the Python/Flask backend on port `5000`, set:
```env
VITE_API_BASE_URL="http://localhost:5000"
```
and run:
```bash
npm run build
```
