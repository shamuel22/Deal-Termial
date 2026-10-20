import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { ApiError, get, post } from './api';

export interface Membership {
  orgId: string;
  orgName: string;
  role: 'owner' | 'admin' | 'member';
}

interface Me {
  user: { id: string; email: string; name: string };
  memberships: Membership[];
}

interface SessionValue {
  status: 'loading' | 'anonymous' | 'authenticated';
  me: Me | null;
  org: Membership | null;
  setOrg: (orgId: string) => void;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  /** Prefijo de rutas de la organización activa: /orgs/:orgId */
  orgPath: (path: string) => string;
}

const SessionContext = createContext<SessionValue | null>(null);
const ORG_KEY = 'dt.activeOrg';

function storedOrg(): string | null {
  try {
    return localStorage.getItem(ORG_KEY);
  } catch {
    return null;
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [status, setStatus] = useState<SessionValue['status']>('loading');
  const [orgId, setOrgId] = useState<string | null>(storedOrg());

  const refresh = useCallback(async () => {
    try {
      const value = await get<Me>('/me');
      setMe(value);
      setStatus('authenticated');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setMe(null);
        setStatus('anonymous');
      } else throw e;
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const org = useMemo(() => {
    if (!me) return null;
    return me.memberships.find((m) => m.orgId === orgId) ?? me.memberships[0] ?? null;
  }, [me, orgId]);

  const setOrg = useCallback((id: string) => {
    setOrgId(id);
    try {
      localStorage.setItem(ORG_KEY, id);
    } catch {
      // almacenamiento no disponible: la selección dura la sesión
    }
  }, []);

  const logout = useCallback(async () => {
    await post('/auth/logout').catch(() => undefined);
    setMe(null);
    setStatus('anonymous');
  }, []);

  const value: SessionValue = {
    status,
    me,
    org,
    setOrg,
    refresh,
    logout,
    orgPath: (path: string) => `/orgs/${org?.orgId ?? 'none'}${path}`,
  };
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession fuera de SessionProvider');
  return value;
}
