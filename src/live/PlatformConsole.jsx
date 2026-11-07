import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Navigate, useMatch, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Building2, ChevronLeft, ChevronRight, ClipboardList, Headset, Inbox, LogOut, Plus, Search, ShieldCheck, X } from "lucide-react";
import { api } from "./api";
import { useAuth } from "./AuthContext";
import { LiveBrand } from "./AuthPages";
import { useDialogFocus } from "./useDialogFocus";
import "./platform-console.css";

const statusLabels = {
  routine: "Routine",
  attention: "Needs attention",
  monitoring: "Monitoring",
};
const date = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
const timestamp = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
const number = new Intl.NumberFormat();
const displayDate = (value, formatter = date) => value ? formatter.format(new Date(value)) : "—";
const friendly = (value) => value?.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase()) || "—";

function useConsoleData(path, revision = 0) {
  const [response, setResponse] = useState(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const job = new AbortController();
    api(path, { signal: job.signal }).then(
      (data) => {
        if (!job.signal.aborted) setResponse({ path, revision, attempt, data });
      },
      (error) => {
        if (!job.signal.aborted) setResponse({ path, revision, attempt, error: error.message });
      },
    );
    return () => job.abort();
  }, [path, revision, attempt]);
  const current = response?.path === path && response.revision === revision && response.attempt === attempt;
  return { ...(current ? response : { loading: true }), reload: () => setAttempt((value) => value + 1) };
}

function ConsoleState({ resource, pending }) {
  return resource.error ? (
    <div className="consoleFeedback" role="alert">
      <p>{resource.error}</p>
      <button type="button" className="btn secondary" onClick={resource.reload}>Try again</button>
    </div>
  ) : resource.loading ? <p className="consoleFeedback" role="status">{pending}</p> : null;
}

function StatusText({ status }) {
  return <span className={"consoleStatus " + status}>{statusLabels[status]}</span>;
}

export function PlatformConsole() {
  const { session, organization, logout } = useAuth();
  const navigate = useNavigate();
  const detailMatch = useMatch("/platform/organizations/:organizationId");
  const requestsMatch = useMatch("/platform/demo-requests");
  const rootMatch = useMatch("/platform");
  const [error, setError] = useState("");
  if (!session.platformOwner)
    return (
      <main className="liveState">
        <ShieldCheck />
        <h1>Platform owner access required</h1>
        <p>Platform administration is reserved for platform owners.</p>
        <Link className="btn secondary" to={organization ? "/app/dashboard" : "/onboarding/welcome"}>
          Return to your workspace
        </Link>
      </main>
    );
  if (!detailMatch && !requestsMatch && !rootMatch) return <Navigate to="/platform" replace />;
  return (
    <div className="platformConsole">
      <header className="consoleBar">
        <div className="consoleIdentity"><LiveBrand /><span>Platform Console</span></div>
        <div className="consoleBarActions">
          {organization && <Link to="/app/dashboard">My workspace <ArrowRight size={15} /></Link>}
          <button type="button" className="btn secondary" onClick={() => logout().then(() => navigate("/login")).catch((e) => setError(e.message))}>
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </header>
      <nav className="consoleNav" aria-label="Platform console">
        <Link to="/platform" aria-current={!requestsMatch ? "page" : undefined}><Building2 size={17} /> Organizations</Link>
        <NavLink to="/platform/demo-requests"><Inbox size={17} /> Demo requests</NavLink>
      </nav>
      <main className="consoleMain">
        {error && <p className="liveError" role="alert">{error}</p>}
        {requestsMatch ? <PlatformRequests /> : <OrganizationDirectory organizationId={detailMatch?.params.organizationId} />}
      </main>
    </div>
  );
}

function OrganizationDirectory({ organizationId }) {
  const { session } = useAuth();
  const [params, setParams] = useSearchParams();
  const [revision, setRevision] = useState(0);
  const selectedStatus = params.get("status");
  const status = Object.hasOwn(statusLabels, selectedStatus) ? selectedStatus : "all";
  const search = params.get("search")?.slice(0, 120) || "";
  const rawPage = Number(params.get("page") || 1);
  const page = Number.isInteger(rawPage) && rawPage > 0 && rawPage <= 1_000_000 ? rawPage : 1;
  const summary = useConsoleData("/platform/summary", revision);
  const directory = useConsoleData("/platform/organizations?" + new URLSearchParams({ search, status, page }), revision);
  const count = directory.data?.count || 0;
  const pageCount = Math.max(1, Math.ceil(count / (directory.data?.pageSize || 20)));
  const active = session.supportSessions.filter((item) => Date.parse(item.expires_at) > Date.now());
  const query = params.toString() ? "?" + params.toString() : "";

  function setFilters({ nextStatus = status, nextSearch = search, nextPage = 1 }) {
    const filters = new URLSearchParams();
    if (nextStatus !== "all") filters.set("status", nextStatus);
    if (nextSearch) filters.set("search", nextSearch);
    if (nextPage > 1) filters.set("page", nextPage);
    setParams(filters);
  }

  return (
    <>
      <header className="consolePageHeader">
        <div>
          <h1>Organizations</h1>
          <p>Find a workspace, review its account and manage platform follow-ups.</p>
        </div>
        <Link className="btn primary" to="/onboarding/welcome"><Plus size={16} /> New organization</Link>
      </header>
      <div className="consoleOverview" aria-label="Organization overview">
        {[
          ["Organizations", summary.data?.organizations, "all"],
          ["Needs attention", summary.data?.attention, "attention"],
          ["Monitoring", summary.data?.monitoring, "monitoring"],
        ].map(([label, total, value]) => (
          <button className="consoleMetric" type="button" key={value}
            aria-pressed={status === value} onClick={() => setFilters({ nextStatus: value, nextSearch: "" })}>
            <span>{label}</span><strong>{total == null ? "—" : number.format(total)}</strong>
          </button>
        ))}
        <div className="consoleMetric consoleSupportMetric"><span>My active support sessions</span><strong>{active.length}</strong></div>
      </div>
      {summary.error && <ConsoleState resource={summary} />}
      <div className={"consoleSplit" + (organizationId ? " consoleSelected" : "")}>
        <section className="consolePanel consoleDirectory" aria-labelledby="console-directory-heading">
          <div className="consolePanelHeader">
            <h2 id="console-directory-heading">Organization directory</h2>
            {directory.data && <p>{number.format(count)} {count === 1 ? "organization" : "organizations"}</p>}
          </div>
          <form className="consoleFilters" key={search} onSubmit={(event) => {
            event.preventDefault();
            const input = new FormData(event.currentTarget).get("search");
            setFilters({ nextSearch: input.trim() });
          }}>
            <label>
              <span>Organization name</span>
              <div className="consoleSearch"><Search size={16} /><input type="search" name="search" maxLength={120} defaultValue={search} placeholder="Search by name" /></div>
            </label>
            <label>
              <span>Follow-up status</span>
              <select value={status} onChange={(event) => setFilters({ nextStatus: event.target.value })}>
                <option value="all">All statuses</option>
                {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <button type="submit" className="btn secondary">Search</button>
          </form>
          <ConsoleState resource={directory} pending="Loading organizations…" />
          {directory.data && (
            directory.data.organizations.length ? (
              <table className="consoleTable">
                <thead><tr><th scope="col">Organization</th><th scope="col">Members</th><th scope="col">Follow-up</th><th scope="col">Created</th></tr></thead>
                <tbody>{directory.data.organizations.map((org) => (
                  <tr key={org.id} className={org.id === organizationId ? "selected" : undefined}>
                    <td><Link aria-current={org.id === organizationId ? "true" : undefined} to={"/platform/organizations/" + org.id + query}>
                      {org.name}<ArrowRight size={15} />
                    </Link><small>{org.industry || "Industry not set"}</small></td>
                    <td data-label="Members">{number.format(org.member_count)}</td>
                    <td data-label="Follow-up"><StatusText status={org.operation_status} /></td>
                    <td data-label="Created">{displayDate(org.created_at)}</td>
                  </tr>
                ))}</tbody>
              </table>
            ) : (
              <div className="consoleFeedback">
                <p>{search || status !== "all" ? "No organizations match these filters." : "No organizations on this page."}</p>
                {(search || status !== "all" || page > 1) && <button type="button" className="btn secondary" onClick={() => setFilters({ nextStatus: "all", nextSearch: "" })}>Reset directory</button>}
              </div>
            )
          )}
          {directory.data && (page > 1 || pageCount > 1) && (
            <div className="consolePager">
              <button type="button" className="btn secondary" aria-label="Previous page" disabled={page <= 1} onClick={() => setFilters({ nextPage: page - 1 })}><ChevronLeft size={17} /></button>
              <span>Page {number.format(page)} of {number.format(pageCount)}</span>
              <button type="button" className="btn secondary" aria-label="Next page" disabled={page >= pageCount} onClick={() => setFilters({ nextPage: page + 1 })}><ChevronRight size={17} /></button>
            </div>
          )}
        </section>
        {organizationId && <OrganizationDetails key={organizationId} id={organizationId} directoryQuery={query} onChange={() => setRevision((value) => value + 1)} />}
      </div>
    </>
  );
}

function OrganizationDetails({ id, directoryQuery, onChange }) {
  const { organizations, refresh, selectOrganization } = useAuth();
  const navigate = useNavigate();
  const resource = useConsoleData("/platform/organizations/" + encodeURIComponent(id));
  const [showSupport, setShowSupport] = useState(false);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const title = useRef(null);
  const dialog = useRef(null);
  const selected = resource.data;
  const org = selected?.organization;
  const own = organizations.find((row) => row.id === id);
  const active = selected?.support.find((entry) => !entry.ended_at && Date.parse(entry.expires_at) > Date.now());
  useDialogFocus(showSupport, () => { if (!pending) setShowSupport(false); }, dialog);
  useEffect(() => { title.current?.focus({ preventScroll: true }); }, [org?.id]);

  async function supportAction(start, reason) {
    setPending(true);
    setError("");
    setNotice("");
    try {
      await api(start ? "/platform/support" : "/platform/support/" + id, {
        method: start ? "POST" : "DELETE",
        body: start ? { organization_id: id, reason } : {},
      });
      await refresh();
      if (start) navigate("/support/" + id + "/dashboard");
      else {
        resource.reload();
        setNotice("Support session ended.");
      }
    } catch (error) {
      setError(error.message);
    } finally {
      setPending(false);
    }
  }

  const site = org?.website && /^https?:\/\//i.test(org.website) ? org.website : null;
  return (
    <aside className="consolePanel consoleDetails" aria-labelledby="console-details-heading">
      <div className="consolePanelHeader">
        <Link className="consoleBack" to={"/platform" + directoryQuery}><ArrowLeft size={16} /> Directory</Link>
        <h2 id="console-details-heading" tabIndex={-1} ref={title}>{org?.name || "Organization details"}</h2>
        {org && <p>{org.industry || "Industry not set"}</p>}
      </div>
      <ConsoleState resource={resource} pending="Loading organization details…" />
      {notice && <p className="consoleNotice" role="status">{notice}</p>}
      {error && !showSupport && <p className="liveError" role="alert">{error}</p>}
      {selected && (
        <>
          <dl className="consoleFacts">
            <div><dt>Members</dt><dd>{number.format(org.member_count)}</dd></div>
            <div><dt>Created</dt><dd>{displayDate(org.created_at)}</dd></div>
            <div><dt>Billing</dt><dd>{selected.billing ? [friendly(selected.billing.plan), friendly(selected.billing.status)].join(" · ") : "Unavailable"}</dd></div>
            <div><dt>Website</dt><dd>{site ? <a href={site} target="_blank" rel="noreferrer">{site}</a> : "—"}</dd></div>
          </dl>
          <div className="consoleBlock">
            <h3><Headset size={18} /> Workspace access</h3>
            {own ? <Link to="/app/dashboard" className="btn primary" onClick={() => selectOrganization(id)}>Open workspace <ArrowRight size={15} /></Link>
            : active ? (
              <>
                <p>Support access expires {displayDate(active.expires_at, timestamp)}.</p>
                <div className="consoleActionRow">
                  <Link to={"/support/" + id + "/dashboard"} className="btn primary">Resume support</Link>
                  <button type="button" className="btn secondary" disabled={pending} onClick={() => supportAction(false)}>End session</button>
                </div>
              </>
            ) : <button type="button" className="btn primary" onClick={() => { setError(""); setShowSupport(true); }}>Start support</button>}
          </div>
          <OperationsForm key={selected.operations?.updated_at || "new"} selected={selected} onSaved={() => {
            resource.reload();
            onChange();
            setNotice("Platform follow-up saved.");
          }} onReload={resource.reload} />
          <div className="consoleBlock">
            <h3><ClipboardList size={18} /> Recent activity</h3>
            <ActivityList events={selected.events} support={selected.support} />
          </div>
        </>
      )}
      {showSupport && (
        <div className="liveModalBackdrop">
          <section className="panel liveModal" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="console-support-title">
            <header>
              <h2 id="console-support-title">Support {org?.name}</h2>
              <button type="button" aria-label="Close" disabled={pending} onClick={() => setShowSupport(false)}><X /></button>
            </header>
            <p>Open an audited, one-hour support session for routine workspace help.</p>
            {error && <p className="liveError" role="alert">{error}</p>}
            <form onSubmit={(event) => {
              event.preventDefault();
              supportAction(true, new FormData(event.currentTarget).get("reason").trim());
            }}>
              <label className="field"><span>Reason for access</span><textarea name="reason" required minLength={10} maxLength={500} /></label>
              <button className="btn primary" disabled={pending}>{pending ? "Opening…" : "Open support workspace"}</button>
            </form>
          </section>
        </div>
      )}
    </aside>
  );
}

function OperationsForm({ selected, onSaved, onReload }) {
  const original = selected.operations;
  const [status, setStatus] = useState(original?.status || "routine");
  const [note, setNote] = useState(original?.internal_note || "");
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState(null);
  const changed = status !== (original?.status || "routine") || note.trim() !== (original?.internal_note || "");
  return (
    <form className="consoleBlock consoleOperations" onSubmit={async (event) => {
      event.preventDefault();
      if (!changed || pending) return;
      setPending(true);
      setFailure(null);
      try {
        await api("/platform/organizations/" + selected.organization.id + "/operations", {
          method: "PATCH",
          body: { status, note, updatedAt: original?.updated_at ?? null },
        });
        onSaved();
      } catch (error) {
        setFailure(error);
      } finally {
        setPending(false);
      }
    }}>
      <h3>Platform follow-up</h3>
      <label><span>Status</span><select value={status} onChange={(e) => setStatus(e.target.value)}>
        {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <label><span>Private platform note</span><textarea rows={4} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} /></label>
      <p>Follow-up status and notes are visible to platform owners.</p>
      {failure && <p className="liveError" role="alert">{failure.message}</p>}
      <div className="consoleActionRow">
        <button type="submit" className="btn secondary" disabled={!changed || pending}>{pending ? "Saving…" : "Save follow-up"}</button>
        {failure?.status === 409 && <button type="button" className="btn secondary" onClick={onReload}>Reload details</button>}
      </div>
    </form>
  );
}

function ActivityList({ events, support }) {
  const activity = [
    ...events.map((item) => ({
      key: "event-" + item.id, time: item.created_at,
      text: "Marked " + statusLabels[item.status].toLowerCase() + (item.note_changed ? " · Note updated" : ""),
    })),
    ...support.flatMap((item) => [
      { key: item.id, time: item.created_at, text: "Support opened", reason: item.reason },
      ...(item.ended_at ? [{ key: item.id + "-end", time: item.ended_at, text: "Support ended" }] : []),
    ]),
  ].sort((a, b) => Date.parse(b.time) - Date.parse(a.time)).slice(0, 8);
  return activity.length ? (
    <ol className="consoleActivity">
      {activity.map((item) => <li key={item.key}><strong>{item.text}</strong><time dateTime={item.time}>{displayDate(item.time, timestamp)}</time>{item.reason && <p>{item.reason}</p>}</li>)}
    </ol>
  ) : <p>No platform activity recorded yet.</p>;
}

function PlatformRequests() {
  const resource = useConsoleData("/platform/demo-requests");
  return (
    <>
      <header className="consolePageHeader"><div><h1>Demo requests</h1><p>Review the latest requests submitted from the public site.</p></div></header>
      <section className="consolePanel consoleRequests" aria-label="Recent demo requests">
        <ConsoleState resource={resource} pending="Loading demo requests…" />
        {resource.data?.requests.length === 0 && <p className="consoleFeedback">No demo requests yet.</p>}
        {resource.data?.requests.map((row) => (
          <article className="consoleBlock" key={row.id}>
            <h2>{row.company}</h2>
            <p>{row.name} · <a href={"mailto:" + row.email}>{row.email}</a> · {displayDate(row.created_at)}</p>
            {row.message && <p className="consoleRequestMessage">{row.message}</p>}
          </article>
        ))}
      </section>
    </>
  );
}
