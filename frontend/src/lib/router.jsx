import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const RouterContext = createContext(null);
const ParamsContext = createContext({});

function currentLocation() {
  return {
    pathname: window.location.pathname || '/',
    search: window.location.search || '',
    hash: window.location.hash || ''
  };
}

function normalizeTo(to) {
  if (typeof to !== 'string') {
    return '/';
  }

  if (/^(https?:|mailto:|tel:)/i.test(to)) {
    return to;
  }

  return to.startsWith('/') ? to : `/${to}`;
}

export function RouterProvider({ children }) {
  const [location, setLocation] = useState(currentLocation);

  useEffect(() => {
    const handlePopState = () => setLocation(currentLocation());
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = useCallback((to, options = {}) => {
    const nextPath = normalizeTo(to);
    const sameOriginUrl = new URL(nextPath, window.location.origin);

    if (sameOriginUrl.origin !== window.location.origin) {
      window.location.assign(sameOriginUrl.href);
      return;
    }

    const next = `${sameOriginUrl.pathname}${sameOriginUrl.search}${sameOriginUrl.hash}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;

    if (next === current) {
      return;
    }

    if (options.replace) {
      window.history.replaceState(null, '', next);
    } else {
      window.history.pushState(null, '', next);
    }

    setLocation(currentLocation());
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  const value = useMemo(() => ({ location, navigate }), [location, navigate]);

  return (
    <RouterContext.Provider value={value}>
      {children}
    </RouterContext.Provider>
  );
}

export function RouteParamsProvider({ params, children }) {
  const value = useMemo(() => params || {}, [params]);
  return <ParamsContext.Provider value={value}>{children}</ParamsContext.Provider>;
}

export function Link({ to, replace = false, onClick, children, ...props }) {
  const router = useContext(RouterContext);
  const href = normalizeTo(to);

  function handleClick(event) {
    onClick?.(event);

    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.altKey ||
      event.ctrlKey ||
      event.shiftKey ||
      props.target
    ) {
      return;
    }

    event.preventDefault();
    router?.navigate(href, { replace });
  }

  return (
    <a href={href} onClick={handleClick} {...props}>
      {children}
    </a>
  );
}

export function useNavigate() {
  const router = useContext(RouterContext);
  return router?.navigate || ((to) => window.location.assign(normalizeTo(to)));
}

export function useSearchParams() {
  const router = useContext(RouterContext);
  return useMemo(
    () => [new URLSearchParams(router?.location?.search || window.location.search)],
    [router?.location?.search]
  );
}

export function useParams() {
  return useContext(ParamsContext);
}

export function useLocation() {
  const router = useContext(RouterContext);
  return router?.location || currentLocation();
}

export function matchPath(pattern, pathname) {
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = pathname.split('/').filter(Boolean);

  if (patternParts.length !== pathParts.length) {
    return null;
  }

  const params = {};

  for (let index = 0; index < patternParts.length; index += 1) {
    const patternPart = patternParts[index];
    const pathPart = pathParts[index];

    if (patternPart.startsWith(':')) {
      params[patternPart.slice(1)] = decodeURIComponent(pathPart);
    } else if (patternPart !== pathPart) {
      return null;
    }
  }

  return { params };
}
