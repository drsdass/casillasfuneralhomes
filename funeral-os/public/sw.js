// Service worker: lets the phone show lock-screen notifications even when the app is closed.
// It does NOT cache anything, so the app always loads the newest version.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let d = {}
  try { d = event.data ? event.data.json() : {} } catch { d = { title: 'New notification', body: event.data ? event.data.text() : '' } }
  event.waitUntil((async () => {
    // If the app is open and in front on a computer, the in-app pop-up already covers it (iPhones always need the banner).
    const isApple = /iPhone|iPad|iPod|Macintosh/.test(self.navigator.userAgent) && 'ontouchend' in self
    if (!isApple) {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      if (all.some((c) => c.visibilityState === 'visible' && c.focused)) return
    }
    await self.registration.showNotification(d.title || 'Casillas OS', {
    body: d.body || '',
    icon: d.icon || '/icon-casillas-192.png',
    badge: '/icon-casillas-192.png',
    tag: d.tag || undefined,
    renotify: !!d.tag,
    data: { url: d.url || '/' },
    })
  })())
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of all) {
      if ('focus' in c) {
        try { await c.focus(); if ('navigate' in c) await c.navigate(url); return } catch { /* fall through */ }
      }
    }
    await self.clients.openWindow(url)
  })())
})
