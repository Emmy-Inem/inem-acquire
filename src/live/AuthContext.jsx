import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { Navigate, useLocation } from "react-router-dom";
import { api } from "./api";
const Context = createContext(null);
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [organizationId, setOrganizationId] = useState(
    () => localStorage.getItem("acquire.organization") || "",
  );
  const refresh = useCallback(async () => {
    try {
      const data = await api("/bootstrap");
      setSession(data);
      setError("");
      return data;
    } catch (e) {
      if (e.status === 401) {
        setSession(null);
        setError("");
        return null;
      }
      setError(e.message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh]);
  const organizations = session
    ? [
        ...session.memberships.map((m) => ({
          ...m.organizations,
          role: m.role,
        })),
        ...session.supportSessions
          .filter(
            (s) =>
              !session.memberships.some(
                (m) => m.organization_id === s.organization_id,
              ),
          )
          .map((s) => ({
            ...s.organizations,
            role: "platform_support",
            support: s,
          })),
      ]
    : [];
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
    await api("/auth/logout", { method: "POST", body: {} });
    setSession(null);
    localStorage.removeItem("acquire.organization");
    setOrganizationId("");
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
        selectOrganization,
        logout,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useAuth = () => useContext(Context);
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
