import { Component, type ReactNode } from 'react'

/** If a page crashes, show what went wrong instead of a blank white screen (so staff can screenshot it). */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error) { console.error('Page crashed:', error) }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50 p-6">
        <div className="max-w-lg space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-xl font-semibold text-slate-900">This page ran into a problem</div>
          <p className="text-sm text-slate-600">Nothing was lost. Please send a screenshot of this to Satish, then go back to the dashboard.</p>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-100 p-3 text-xs text-red-700">{this.state.error.message}</pre>
          <a href="/" className="inline-block rounded-lg bg-[#3b4a35] px-5 py-2.5 text-sm font-semibold text-white">Back to the dashboard</a>
        </div>
      </div>
    )
  }
}
