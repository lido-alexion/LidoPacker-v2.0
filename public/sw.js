const CACHE_NAME = "lidopacker-v2-cache-v9";
const DB_NAME = "LidoPackerDB";
const BASE = "/packer";
const STATIC_ASSETS = [
  `${BASE}/`,
  `${BASE}/index.html`,
  `${BASE}/manifest.json`,
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn("Cache addAll partial failure:", err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => fireDueNotifications())
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  // PHP endpoints and the admin page must hit the network (never Cache Storage).
  if (url.pathname.includes("/admin/") || url.pathname.includes("/api/") || url.pathname.endsWith(".php")) {
    return;
  }

  // Always revalidate the master item list so last_updated can take effect.
  if (url.pathname === `${BASE}/catalog.json`) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const type = (res.headers.get("content-type") || "").toLowerCase();
          if (res.ok && type.includes("json")) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(request, clone));
          }
          return res;
        })
        .catch(() => caches.match(request).then((r) => r || Promise.reject(new Error("catalog offline"))))
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, clone));
          return res;
        })
        .catch(() => caches.match(`${BASE}/index.html`).then((r) => r || caches.match(`${BASE}/`)))
    );
  } else {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, clone));
          return res;
        });
      })
    );
  }
});

self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : { title: "LidoPacker", body: "Time to pack!" };
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: `${BASE}/icons/icon-192.png`,
      badge: `${BASE}/icons/icon-72.png`,
      vibrate: [200, 100, 200],
      tag: "lidopacker-notification",
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window" }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(`${BASE}/`);
    })
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "CHECK_DUE") {
    event.waitUntil(fireDueNotifications());
  }
  if (event.data && event.data.type === "SHOW_NOTIFICATION") {
    const { title, body, tag } = event.data;
    event.waitUntil(
      self.registration.showNotification(title, {
        body,
        icon: `${BASE}/icons/icon-192.png`,
        badge: `${BASE}/icons/icon-72.png`,
        tag: tag || "lidopacker-notification",
      })
    );
  }
});

self.addEventListener("periodicsync", (event) => {
  if (event.tag === "pack-reminders") {
    event.waitUntil(fireDueNotifications());
  }
});

function openPackerDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function fireDueNotifications() {
  try {
    const db = await openPackerDB();
    if (!db.objectStoreNames.contains("scheduledNotifications")) {
      db.close();
      return;
    }
    const rows = await new Promise((resolve, reject) => {
      const tx = db.transaction("scheduledNotifications", "readonly");
      const req = tx.objectStore("scheduledNotifications").getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    const now = Date.now();
    for (const row of rows) {
      if (row.fired || row.fireAt > now) continue;
      const claimed = await claimNotification(db, row.id);
      if (!claimed) continue;
      await self.registration.showNotification(row.title, {
        body: row.body,
        icon: `${BASE}/icons/icon-192.png`,
        badge: `${BASE}/icons/icon-72.png`,
        tag: row.id,
      });
    }
    db.close();
  } catch (err) {
    console.warn("SW due-notification check failed:", err);
  }
}

function claimNotification(db, id) {
  return new Promise((resolve) => {
    let claimed = false;
    const tx = db.transaction("scheduledNotifications", "readwrite");
    const store = tx.objectStore("scheduledNotifications");
    const get = store.get(id);
    get.onsuccess = () => {
      const cur = get.result;
      if (!cur || cur.fired || cur.fireAt > Date.now()) return;
      cur.fired = true;
      store.put(cur);
      claimed = true;
    };
    tx.oncomplete = () => resolve(claimed);
    tx.onerror = () => resolve(false);
  });
}
