import { useEffect, useState } from 'react';

/** Tiny hash router: works on any static host and inside AI Studio's preview */
export type Route =
  | { page: 'home' }
  | { page: 'guide' }
  | { page: 'app'; start?: 'camera' | 'quote' | 'sample'; dishId?: string };

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'guide') return { page: 'guide' };
  if (parts[0] === 'app') {
    if (parts[1] === 'quote') return { page: 'app', start: 'quote', dishId: parts[2] };
    if (parts[1] === 'sample') return { page: 'app', start: 'sample' };
    return { page: 'app', start: 'camera' };
  }
  return { page: 'home' };
}

export function routeToHash(route: Route): string {
  if (route.page === 'guide') return '#/guide';
  if (route.page === 'app') {
    if (route.start === 'quote') return route.dishId ? `#/app/quote/${route.dishId}` : '#/app/quote';
    if (route.start === 'sample') return '#/app/sample';
    return '#/app';
  }
  return '#/';
}

export function navigate(route: Route): void {
  window.location.hash = routeToHash(route);
  window.scrollTo({ top: 0 });
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
