import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { loadBoardByToken } from '@/lib/tvBoard'
import { BoardView } from './TvBoard'

/** A wall monitor's private page: /tv/<link>. No login. It only shows the board, and refreshes itself every 20 seconds. */
export default function TvScreenPage() {
  const { token } = useParams<{ token: string }>()
  const { data, error, isError } = useQuery({
    queryKey: ['tv-screen', token],
    queryFn: () => loadBoardByToken(token!),
    refetchInterval: 20_000,
    refetchIntervalInBackground: true,
    retry: false,
  })
  const status = (error as { status?: number } | null)?.status
  // A bad or switched-off link says so; a network or server hiccup keeps the last board on screen and tries again.
  if (isError && !data && status === 404) {
    return <div className="h-screen bg-[#1f2a1c] text-white flex items-center justify-center text-center p-8"><div><div className="text-2xl font-semibold">This screen link is not valid</div><div className="mt-2 text-slate-300">It may have been turned off or replaced. Ask an administrator for the new link.</div></div></div>
  }
  if (!data) return <div className="h-screen bg-[#1f2a1c] text-slate-300 flex items-center justify-center">{isError ? 'Reconnecting…' : 'Loading…'}</div>
  // ?safe=5 pulls the board in from the edges (a percent) for a TV that crops the picture; the default is a small margin.
  const sp = Number(new URLSearchParams(window.location.search).get('safe'))
  return <BoardView data={data} safe={isFinite(sp) && sp > 0 && sp <= 12 ? sp : 2} />
}
