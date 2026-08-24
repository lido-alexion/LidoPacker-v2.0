import { Route } from "./types";
import { BASE_PATH } from "./basePath";

export function normalizePath(pathname: string): string {
  if (!pathname) return "/";
  let path = pathname.split("?")[0].split("#")[0];
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  if (path === "/index.html") return "/";
  return path || "/";
}

function stripBase(pathname: string): string {
  const path = normalizePath(pathname);
  if (path === BASE_PATH) return "/";
  if (path.startsWith(`${BASE_PATH}/`)) return path.slice(BASE_PATH.length) || "/";
  return path;
}

function withBase(appPath: string): string {
  if (appPath === "/") return BASE_PATH;
  return `${BASE_PATH}${appPath}`;
}

function appPathFor(route: Route): string {
  switch (route.name) {
    case "home":
      return "/";
    case "create-trip":
      return "/new";
    case "packing":
      return `/trips/${encodeURIComponent(route.tripId)}`;
    case "item-selection":
      return `/trips/${encodeURIComponent(route.tripId)}/items`;
    case "edit-trip":
      return `/trips/${encodeURIComponent(route.tripId)}/edit`;
    case "clone-trip":
      return `/trips/${encodeURIComponent(route.tripId)}/clone`;
  }
}

export function pathFor(route: Route): string {
  return withBase(appPathFor(route));
}

export function routeFromPath(pathname: string): Route {
  const path = stripBase(pathname);

  if (path === "/") return { name: "home" };
  if (path === "/new") return { name: "create-trip" };

  const clone = path.match(/^\/trips\/([^/]+)\/clone$/);
  if (clone) return { name: "clone-trip", tripId: decodeURIComponent(clone[1]) };

  const edit = path.match(/^\/trips\/([^/]+)\/edit$/);
  if (edit) return { name: "edit-trip", tripId: decodeURIComponent(edit[1]) };

  const items = path.match(/^\/trips\/([^/]+)\/items$/);
  if (items) return { name: "item-selection", tripId: decodeURIComponent(items[1]) };

  const pack = path.match(/^\/trips\/([^/]+)$/);
  if (pack) return { name: "packing", tripId: decodeURIComponent(pack[1]) };

  return { name: "home" };
}

export function isKnownPath(pathname: string): boolean {
  const raw = normalizePath(pathname);
  if (raw !== BASE_PATH && !raw.startsWith(`${BASE_PATH}/`)) return false;
  const path = stripBase(pathname);
  if (path === "/" || path === "/new") return true;
  return (
    /^\/trips\/[^/]+$/.test(path) ||
    /^\/trips\/[^/]+\/items$/.test(path) ||
    /^\/trips\/[^/]+\/edit$/.test(path) ||
    /^\/trips\/[^/]+\/clone$/.test(path)
  );
}
