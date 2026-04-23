const CACHE = 'venvis-v2'
const ASSETS = ['/', '/index.html', '/style.css', '/app.js', '/manifest.json', '/icon.svg']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)))
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return
  if (e.request.url.includes('/api/') || e.request.url.includes('socket.io')) return
  e.respondWith(caches.match(e.request).then(cached => cached || fetch(e.request)))
})

self.addEventListener('push', (e) => {
  const data = e.data?.json() || {}
  e.waitUntil(
    self.registration.showNotification(data.title || 'VENVIS', {
      body: data.body || '',
      icon: '/icon.svg',
      badge: '/icon.svg',
      data: { url: data.url || 'https://venvis.orvexautomation.com' }
    })
  )
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      for (const client of windowClients) {
        if (client.url === e.notification.data?.url && 'focus' in client) return client.focus()
      }
      return clients.openWindow(e.notification.data?.url || 'https://venvis.orvexautomation.com')
    })
  )
})
