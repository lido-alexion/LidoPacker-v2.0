import { Route } from "./types";
import { isKnownPath, normalizePath, pathFor, routeFromPath } from "./routes";

export type NavigateOptions = { replace?: boolean };

type RouteHandler = (route: Route) => void;

class Router {
  private handlers: RouteHandler[] = [];
  private current: Route = { name: "home" };
  private started = false;

  navigate(route: Route, options: NavigateOptions = {}): void {
    this.current = route;
    const nextPath = pathFor(route);
    const currentPath = normalizePath(window.location.pathname);

    if (options.replace || nextPath !== currentPath) {
      const state = { route };
      if (options.replace) {
        history.replaceState(state, "", nextPath);
      } else {
        history.pushState(state, "", nextPath);
      }
    }

    this.emit(route);
  }

  /** Read the current URL and begin listening for back/forward. */
  start(): void {
    if (this.started) {
      this.syncFromLocation();
      return;
    }
    this.started = true;
    window.addEventListener("popstate", () => this.syncFromLocation());

    const path = window.location.pathname;
    const route = routeFromPath(path);
    this.current = route;

    if (!isKnownPath(path) || pathFor(route) !== normalizePath(path)) {
      history.replaceState({ route }, "", pathFor(route));
    }

    this.emit(route);
  }

  onNavigate(handler: RouteHandler): void {
    this.handlers.push(handler);
  }

  getCurrentRoute(): Route {
    return this.current;
  }

  private syncFromLocation(): void {
    const route = routeFromPath(window.location.pathname);
    this.current = route;
    this.emit(route);
  }

  private emit(route: Route): void {
    this.handlers.forEach((h) => h(route));
  }
}

export const router = new Router();
export { pathFor, routeFromPath };
