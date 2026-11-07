import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import { Link, Navigate, useLocation, useParams } from "react-router-dom";
import { api } from "./api";
const Context = createContext(null);
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [organizationId, setOrganizationId] = useState(
    () => localStorage.getItem("acquire.organization") || "",
  );
  const sessionRequest = useRef(0);
  const loggingOut = useRef(false);
  const refresh = useCallback(async () => {
    if (loggingOut.current) return null;
    const requestId = ++sessionRequest.current;
    try {
      const data = await api("/bootstrap");
      if (requestId !== sessionRequest.current) return null;
      setSession(data);
      setError("");
      return data;
    } catch (e) {
      if (requestId !== sessionRequest.current) return null;
      if (e.status === 401) {
        setSession(null);
        setError("");
        return null;
      }
      setError(e.message);
      throw e;
    } finally {
      if (requestId === sessionRequest.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    refresh().catch(() => {});
    return () => {
      sessionRequest.current += 1;
    };
  }, [refresh]);
  const organizations = (session?.memberships || [])
    .filter((membership) => membership.organizations)
    .map((membership) => ({ ...membership.organizations, role: membership.role }));
  const organization =
    organizations.find((o) => o.id === organizationId) ||
    organizations[0] ||
    null;
  useEffect(() => {
    if (organization?.id && organization.id !== organizationId) {
      setOrganizationId(organization.id);
      localStorage.setItem("acquire.organization", organization.id);
    }
  }, [organization?.id, organizationId]);
  const selectOrganization = (id) => {
    setOrganizationId(id);
    localStorage.setItem("acquire.organization", id);
  };
  const logout = async () => {
    if (loggingOut.current) return;
    loggingOut.current = true;
    // A bootstrap started before logout must never restore the old session.
    sessionRequest.current += 1;
    try {
      await api("/auth/logout", { method: "POST", body: {} });
      setSession(null);
      setError("");
      localStorage.removeItem("acquire.organization");
      setOrganizationId("");
    } finally {
      loggingOut.current = false;
      setLoading(false);
    }
  };
  return (
    <Context.Provider
      value={{
        session,
        loading,
        error,
        refresh,
        organizations,
        organization,
        workspaceBase: "/app",
        selectOrganization,
        logout,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useAuth = () => useContext(Context);
export function SupportScope({ children }) {
  const auth = useAuth();
  const { organizationId } = useParams();
  const support = auth.session.supportSessions?.find(
    (item) => item.organization_id === organizationId,
  );
  const expiresAt = Date.parse(support?.expires_at);
  const [expiredId, setExpiredId] = useState(null);
  useEffect(() => {
    if (!support?.id || !Number.isFinite(expiresAt)) return;
    const timer = setTimeout(() => setExpiredId(support.id), Math.max(0, expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [expiresAt, support?.id]);

  if (!auth.session.platformOwner) return <Navigate to="/platform" replace />;
  if (
    !support?.id || !support.organizations || expiredId === support.id ||
    !(expiresAt > Date.now()) || auth.organizations.some((org) => org.id === organizationId)
  )
    return (
      <main className="liveState">
        <h1>Support session unavailable</h1>
        <p>Open the platform console to start a new session or switch to your own workspace.</p>
        <Link className="btn secondary" to="/platform">Platform console</Link>
      </main>
    );

  return (
    <Context.Provider value={{
      ...auth,
      workspaceBase: "/support/" + organizationId,
      organization: { ...support.organizations, role: "platform_support", support },
    }}>
      {children}
    </Context.Provider>
  );
}

export function RequireAuth({ children }) {
  const { session, loading, error, refresh } = useAuth();
  const location = useLocation();
  if (loading)
    return (
      <div className="liveState" role="status">
        Opening your workspace…
      </div>
    );
  if (error)
    return (
      <div className="liveState" role="alert">
        <h1>Unable to connect</h1>
        <p>{error}</p>
        <button
          className="btn primary"
          onClick={() => refresh().catch(() => {})}
        >
          Try again
        </button>
      </div>
    );
  return session ? (
    children
  ) : (
    <Navigate to="/login" state={{ from: location.pathname }} replace />
  );
}
