import { NotificationPermissionState, ScheduledNotification, Trip } from "../utils/types";
import { notificationsDB, tripsDB } from "../db/database";
import { assetPath } from "../utils/basePath";
import { getPhase, parseTripInstant } from "../utils/timeEngine";

/** Set a VAPID public key to enable FCM / Web Push subscription. Empty = local reminders only. */
export const VAPID_PUBLIC_KEY = "";

const MAX_TIMEOUT = 2147483647; // ~24.8 days — setTimeout 32-bit cap
const armedTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function getNotificationPermissionState(): NotificationPermissionState {
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission as "granted" | "denied" | "default";
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!("Notification" in window) || typeof Notification.requestPermission !== "function") {
    return false;
  }
  const current = Notification.permission;
  if (current === "granted") {
    await registerPushSubscription();
    return true;
  }
  if (current === "denied") return false;

  try {
    const permission: NotificationPermission = await Promise.race([
      Notification.requestPermission(),
      new Promise<NotificationPermission>((resolve) => {
        setTimeout(() => resolve("default"), 12000);
      }),
    ]);
    if (permission === "granted") {
      await registerPushSubscription();
      return true;
    }
    return false;
  } catch (err) {
    console.warn("Notification permission failed:", err);
    return Notification.permission === "granted";
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

/** Prompt 13: FCM / Web Push token registration. No-ops until VAPID_PUBLIC_KEY is set. */
export async function registerPushSubscription(): Promise<PushSubscription | null> {
  if (!VAPID_PUBLIC_KEY) return null;
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
  if (getNotificationPermissionState() !== "granted") return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    if (existing) return existing;
    return await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
    });
  } catch (err) {
    console.warn("Push subscription failed:", err);
    return null;
  }
}

export async function showNotification(title: string, body: string, tag?: string): Promise<void> {
  if (getNotificationPermissionState() !== "granted") return;
  try {
    if ("serviceWorker" in navigator) {
      const ready = Promise.race([
        navigator.serviceWorker.ready,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
      ]);
      const reg = await ready;
      if (reg) {
        await reg.showNotification(title, {
          body,
          icon: assetPath("/icons/icon-192.png"),
          badge: assetPath("/icons/icon-72.png"),
          tag: tag || "lidopacker-notification",
        });
        return;
      }
    }
  } catch {
    // fall through to page Notification
  }
  try {
    new Notification(title, {
      body,
      icon: assetPath("/icons/icon-192.png"),
    });
  } catch (err) {
    console.warn("Notification failed:", err);
  }
}

function buildSchedule(trip: Trip): ScheduledNotification[] {
  const startTime = parseTripInstant(trip.startTime);
  const rows: ScheduledNotification[] = [
    {
      id: `${trip.id}:pre48`,
      tripId: trip.id,
      kind: "pre48",
      fireAt: startTime - 48 * 60 * 60 * 1000,
      title: `${trip.name} is in 48 hours!`,
      body: "Time to start packing your early items.",
      fired: false,
    },
    {
      id: `${trip.id}:pre6`,
      tripId: trip.id,
      kind: "pre6",
      fireAt: startTime - 6 * 60 * 60 * 1000,
      title: `${trip.name} is in 6 hours!`,
      body: "Check your mid-stage items and pack last-minute essentials.",
      fired: false,
    },
    {
      id: `${trip.id}:departure`,
      tripId: trip.id,
      kind: "departure",
      fireAt: startTime,
      title: `${trip.name} starts NOW!`,
      body: "Don't forget anything — bon voyage!",
      fired: false,
    },
  ];
  return rows.filter((r) => r.fireAt > Date.now() - 60 * 1000);
}

function clearArmedForTrip(tripId: string): void {
  for (const [id, timer] of armedTimers) {
    if (id.startsWith(`${tripId}:`)) {
      clearTimeout(timer);
      armedTimers.delete(id);
    }
  }
}

function armTimer(row: ScheduledNotification): void {
  if (row.fired) return;
  const delay = row.fireAt - Date.now();
  if (delay <= 0 || delay > MAX_TIMEOUT) return;
  const existing = armedTimers.get(row.id);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    armedTimers.delete(row.id);
    processDueNotifications();
  }, delay);
  armedTimers.set(row.id, timer);
}

export async function cancelNotificationsForTrip(tripId: string): Promise<void> {
  clearArmedForTrip(tripId);
  await notificationsDB.deleteByTrip(tripId);
}

export async function scheduleNotifications(trip: Trip): Promise<void> {
  await cancelNotificationsForTrip(trip.id);
  if (getNotificationPermissionState() !== "granted") return;

  const rows = buildSchedule(trip);
  if (rows.length) await notificationsDB.putMany(rows);
  rows.forEach(armTimer);

  navigator.serviceWorker?.controller?.postMessage({ type: "CHECK_DUE" });
}

export async function processDueNotifications(): Promise<void> {
  if (getNotificationPermissionState() !== "granted") return;
  const rows = await notificationsDB.getAll();
  const now = Date.now();
  for (const row of rows) {
    if (row.fired) continue;
    if (row.fireAt > now) {
      armTimer(row);
      continue;
    }
    row.fired = true;
    await notificationsDB.put(row);
    await showNotification(row.title, row.body, row.id);
  }
}

export async function checkMissedItems(
  trip: Trip,
  packedCount: number,
  totalCount: number
): Promise<void> {
  const phase = getPhase(parseTripInstant(trip.startTime));
  if (phase !== "POST" || packedCount >= totalCount) return;
  if (getNotificationPermissionState() !== "granted") return;

  const id = `${trip.id}:forgot`;
  const existing = (await notificationsDB.getByTrip(trip.id)).find((r) => r.id === id);
  if (existing?.fired) return;

  const missed = totalCount - packedCount;
  const row: ScheduledNotification = {
    id,
    tripId: trip.id,
    kind: "forgot",
    fireAt: Date.now(),
    title: `You forgot ${missed} item${missed !== 1 ? "s" : ""}!`,
    body: `Open LidoPacker to see what you missed for ${trip.name}.`,
    fired: true,
  };
  await notificationsDB.put(row);
  await showNotification(row.title, row.body, id);
}

export async function rescheduleAllUpcomingTrips(): Promise<void> {
  if (getNotificationPermissionState() !== "granted") return;
  const trips = await tripsDB.getAll();
  const now = Date.now();
  for (const trip of trips) {
    if (trip.isArchived) continue;
    if (parseTripInstant(trip.startTime) <= now) continue;
    const existing = await notificationsDB.getByTrip(trip.id);
    const hasPending = existing.some((r) => !r.fired && r.kind !== "forgot");
    if (!hasPending) await scheduleNotifications(trip);
  }
}

export async function initNotificationRuntime(): Promise<void> {
  await processDueNotifications();
  await rescheduleAllUpcomingTrips();
  if (getNotificationPermissionState() === "granted") {
    await registerPushSubscription();
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") processDueNotifications();
  });
  window.addEventListener("focus", () => { processDueNotifications(); });

  if ("serviceWorker" in navigator) {
    try {
      const ready = Promise.race([
        navigator.serviceWorker.ready,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000)),
      ]);
      const reg = await ready;
      if (!reg) return;
      const periodic = (reg as ServiceWorkerRegistration & {
        periodicSync?: { register: (tag: string, opts: { minInterval: number }) => Promise<void> };
      }).periodicSync;
      if (periodic) {
        await periodic.register("pack-reminders", { minInterval: 15 * 60 * 1000 });
      }
      navigator.serviceWorker.addEventListener("message", (event) => {
        if (event.data?.type === "CHECK_DUE") processDueNotifications();
      });
    } catch {
      // periodic sync is optional
    }
  }
}
