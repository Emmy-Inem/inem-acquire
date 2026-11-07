import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Search, X, ArrowUpRight } from "lucide-react";
import { api } from "./api";
import { useAuth } from "./AuthContext";
import { useDialogFocus } from "./useDialogFocus";
const groups = [
  ["prospects", "Companies", "name", "prospects"],
  ["contacts", "Contacts", "full_name", "contacts"],
  ["deals", "Deals", "title", "deals"],
  ["tasks", "Tasks", "title", "tasks"],
];
export default function WorkspaceSearch() {
  const { organization, workspaceBase } = useAuth();
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [results, setResults] = useState([]),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const input = useRef(null);
  useDialogFocus(open, () => setOpen(false));
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        const modal = document.querySelector(
          '[role="dialog"][aria-modal="true"]',
        );
        if (modal && !modal.classList.contains("workspaceSearchDialog")) return;
        setOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);
  useEffect(() => {
    setOpen(false);
    setQuery("");
    setResults([]);
  }, [organization?.id]);
  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const controller = new AbortController();
    if (query.trim().length < 2) {
      setResults([]);
      setPending(false);
      return () => controller.abort();
    }
    setPending(true);
    const timer = setTimeout(async () => {
      try {
        setError("");
        const rows = await Promise.all(
          groups.map(async ([resource, label, field, path]) => {
            const r = await api(
              "/resources/" +
                resource +
                "?limit=5&search=" +
                encodeURIComponent(query.trim()),
              { organizationId: organization?.id, supportSessionId: organization?.support?.id, signal: controller.signal },
            );
            return { label, path, field, rows: r.data };
          }),
        );
        if (!controller.signal.aborted) setResults(rows);
      } catch (e) {
        if (!controller.signal.aborted) setError(e.message);
      } finally {
        if (!controller.signal.aborted) setPending(false);
      }
    }, 220);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, open, organization?.id]);
  return (
    <>
      <button
        className="workspaceSearchTrigger"
        onClick={() => setOpen(true)}
        aria-label="Search workspace"
        disabled={!organization}
      >
        <Search size={18} />
        <span>Search workspace</span>
        <kbd>Ctrl K</kbd>
      </button>
      {open && (
        <div
          className="liveModalBackdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <section
            className="panel liveModal workspaceSearchDialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="workspace-search-title"
          >
            <header>
              <h2 id="workspace-search-title">Search your workspace</h2>
              <button onClick={() => setOpen(false)} aria-label="Close search">
                <X size={20} />
              </button>
            </header>
            <label className="field">
              <span>Company, contact, deal or task</span>
              <input
                ref={input}
                autoFocus
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Type at least 2 characters"
              />
            </label>
            {error && (
              <p className="liveError" role="alert">
                {error}
              </p>
            )}
            <div aria-live="polite">
              {pending ? (
                <p role="status">Searching…</p>
              ) : query.trim().length < 2 ? (
                <p className="searchHint">
                  Search saved records in this organization.
                </p>
              ) : results.every((g) => !g.rows.length) ? (
                <p>No matching records. Try a different name.</p>
              ) : (
                results
                  .filter((g) => g.rows.length)
                  .map((g) => (
                    <div className="searchGroup" key={g.path}>
                      <h3>{g.label}</h3>
                      {g.rows.map((row) => (
                        <Link
                          key={row.id}
                          to={
                            workspaceBase + "/" +
                            g.path +
                            "?search=" +
                            encodeURIComponent(row[g.field])
                          }
                          onClick={() => setOpen(false)}
                        >
                          <span>{row[g.field]}</span>
                          <ArrowUpRight size={16} />
                        </Link>
                      ))}
                    </div>
                  ))
              )}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
