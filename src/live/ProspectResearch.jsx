import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "./api";
import { useAuth } from "./AuthContext";

export default function ProspectResearch({ onSaved }) {
  const { organization } = useAuth();
  const [available, setAvailable] = useState(null),
    [query, setQuery] = useState(""),
    [rows, setRows] = useState([]),
    [pending, setPending] = useState(false),
    [saving, setSaving] = useState(null),
    [saved, setSaved] = useState([]),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  const request = (path, options = {}) =>
    api(path, { ...options, organizationId: organization.id });
  useEffect(() => {
    let active = true;
    setError("");
    request("/integrations")
      .then((r) => {
        if (active)
          setAvailable(
            r.providers.some((p) => p.provider === "apollo" && p.configured),
          );
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [organization.id, connectionAttempt]);
  return (
    <details className="researchPanel">
      <summary>Research new companies</summary>
      {error && (
        <p className="liveError" role="alert">
          {error}
        </p>
      )}
      {available === null ? (
        error ? (
          <button
            className="btn secondary"
            onClick={() => setConnectionAttempt((v) => v + 1)}
          >
            Retry connection check
          </button>
        ) : (
          <p>Checking research connection…</p>
        )
      ) : !available ? (
        <p>
          External research needs an Apollo connection. You can add companies or
          import a CSV now. <Link to="/app/integrations">View connections</Link>
        </p>
      ) : (
        <>
          <form
            className="liveSearch"
            onSubmit={async (e) => {
              e.preventDefault();
              setPending(true);
              setError("");
              setRows([]);
              setSaved([]);
              try {
                const r = await request("/prospects/discover", {
                  method: "POST",
                  body: { query: query.trim() },
                });
                setRows(r.companies);
                setNotice(
                  r.companies.length
                    ? r.notice
                    : "No companies found. Try a different keyword.",
                );
              } catch (e) {
                setError(e.message);
              } finally {
                setPending(false);
              }
            }}
          >
            <label className="field">
              <span>Industry or company keyword</span>
              <input
                required
                minLength={2}
                maxLength={200}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. logistics"
              />
            </label>
            <button
              className="btn secondary"
              disabled={pending || saving !== null}
            >
              {pending ? "Researching…" : "Find companies"}
            </button>
          </form>
          {notice && <p role="status">{notice}</p>}
          <div className="researchResults">
            {rows.map((row, index) => (
              <article key={index}>
                <div>
                  <strong>{row.name}</strong>
                  <p>
                    {[row.industry, row.country].filter(Boolean).join(" · ") ||
                      row.website ||
                      "Review company details before saving."}
                  </p>
                </div>
                <button
                  className="btn secondary"
                  disabled={saving !== null || saved.includes(index)}
                  onClick={async () => {
                    setSaving(index);
                    setError("");
                    try {
                      await request("/resources/prospects", {
                        method: "POST",
                        body: row,
                      });
                      setSaved((v) => [...v, index]);
                      onSaved();
                    } catch (e) {
                      setError(e.message);
                    } finally {
                      setSaving(null);
                    }
                  }}
                >
                  {saved.includes(index)
                    ? "Saved"
                    : saving === index
                      ? "Saving…"
                      : "Save company"}
                </button>
              </article>
            ))}
          </div>
        </>
      )}
    </details>
  );
}
