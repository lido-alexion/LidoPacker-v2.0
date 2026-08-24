import "./styles/main.scss";
import { initDB } from "./db/database";
import { seedBaseItems } from "./services/itemService";
import { router } from "./utils/router";
import { Route } from "./utils/types";
import { renderHomeScreen } from "./screens/homeScreen";
import { renderCreateTripScreen } from "./screens/createTripScreen";
import { renderEditTripScreen } from "./screens/editTripScreen";
import { renderItemSelectionScreen } from "./screens/itemSelectionScreen";
import { renderPackingScreen, teardownPackingScreen } from "./screens/packingScreen";
import { renderCloneTripScreen } from "./screens/cloneTripScreen";
import { initNotificationRuntime } from "./services/notificationService";
import { isOnline, onConnectivityChange } from "./utils/offline";
import { assetPath } from "./utils/basePath";

const siteHeader = document.createElement("div");
siteHeader.className = "site-header";
siteHeader.innerHTML = `<a class="site-header__title" href="https://www.lidoalexion.com" target="_blank" rel="noopener noreferrer">Lido Alexion</a>`;
document.body.insertBefore(siteHeader, document.body.firstChild);

const offlineBar = document.createElement("div");
offlineBar.className = "offline-bar";
offlineBar.id = "offline-bar";
offlineBar.hidden = isOnline();
offlineBar.textContent = "You're offline — packing still works from this device.";
siteHeader.insertAdjacentElement("afterend", offlineBar);
onConnectivityChange((online) => {
  offlineBar.hidden = online;
});

const app = document.getElementById("app")!;

async function navigate(route: Route): Promise<void> {
  teardownPackingScreen();
  switch (route.name) {
    case "home":
      await renderHomeScreen(app);
      break;
    case "create-trip":
      renderCreateTripScreen(app);
      break;
    case "edit-trip":
      await renderEditTripScreen(app, route.tripId);
      break;
    case "clone-trip":
      await renderCloneTripScreen(app, route.tripId);
      break;
    case "item-selection":
      await renderItemSelectionScreen(app, route.tripId);
      break;
    case "packing":
      await renderPackingScreen(app, route.tripId);
      break;
  }
}

async function main() {
  app.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:16px">
      <div style="font-size:64px">🧳</div>
      <div style="font-size:24px;font-weight:800;color:#1e293b">LidoPacker</div>
      <div style="font-size:14px;color:#64748b">Loading…</div>
    </div>
  `;

  try {
    await initDB();
    await seedBaseItems();
  } catch (err) {
    console.error("DB init failed:", err);
    app.innerHTML = `
      <div style="padding:40px;text-align:center;color:#dc2626">
        <div style="font-size:48px">⚠️</div>
        <div style="font-size:18px;font-weight:700;margin-top:16px">Storage Error</div>
        <div style="font-size:14px;margin-top:8px">Could not initialize local storage. Please check your browser settings.</div>
      </div>
    `;
    return;
  }

  router.onNavigate(navigate);
  router.start();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register(assetPath("/sw.js"), { scope: assetPath("/") + "/" }).then(() => {
      initNotificationRuntime();
    }).catch((err) => {
      console.warn("SW registration failed:", err);
      initNotificationRuntime();
    });
  } else {
    await initNotificationRuntime();
  }
}

main();
