import { useDialogFocus } from "./useDialogFocus";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useMediaQuery } from "../useMediaQuery";
import {
  Link,
  NavLink,
  Navigate,
  useNavigate,
  useParams,
} from "react-router-dom";
import {
  Activity,
  ArrowRight,
  BarChart3,
  BriefcaseBusiness,
  Building2,
  Check,
  ChevronDown,
  ClipboardCheck,
  ContactRound,
  Download,
  FileText,
  Inbox,
  LayoutDashboard,
  Lightbulb,
  LogOut,
  Menu,
  Plus,
  RefreshCcw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Target,
  Upload,
  Users,
  X,
} from "lucide-react";
import { api } from "./api";
import { useAuth } from "./AuthContext";
import { LiveBrand } from "./AuthPages";
import { canRole } from "../../shared/permissions";
import { AnimatedPreview } from "../PlatformMotion";

const navigation = [
  [
    "Workspace",
    [
      ["Overview", "dashboard", LayoutDashboard],
      ["Company", "company", Building2],
      ["Offers", "offers", FileText],
      ["Diagnosis", "diagnosis", Lightbulb],
      ["Ideal customers", "ideal-customers", Target],
      ["Discover prospects", "prospects", Search],
    ],
  ],
  [
    "Engage",
    [
      ["Contacts", "contacts", ContactRound],
      ["Lists", "lists", Users],
      ["Campaigns", "campaigns", Send],
      ["Inbox", "inbox", Inbox],
    ],
  ],
  [
    "Convert",
    [
      ["Pipeline", "pipeline", BriefcaseBusiness],
      ["Deals", "deals", BriefcaseBusiness],
      ["Tasks", "tasks", ClipboardCheck],
    ],
  ],
  [
    "Measure",
    [
      ["Analytics", "analytics", BarChart3],
      ["Reports", "reports", FileText],
    ],
  ],
];
const modules = {
  offers: {
    title: "Offers",
    description: "Keep your products and services clear and distinct.",
    fields: [
      ["name", "Offer name", "text", true],
      ["description", "Description", "textarea"],
      ["price", "Price", "number"],
      ["currency", "Currency", "currency"],
    ],
    columns: ["name", "description", "price", "currency"],
  },
  icps: {
    title: "Ideal customers",
    description: "Define who gets the most value from your offer.",
    fields: [
      ["name", "Profile name", "text", true],
      ["offer_id", "Offer", "offers"],
      ["industries", "Industries", "text"],
      ["countries", "Countries", "text"],
      ["job_titles", "Decision-maker roles", "text"],
      ["status", "Status", "select", ["draft", "active", "archived"]],
    ],
    columns: ["name", "criteria", "status"],
  },
  prospects: {
    title: "Prospect discovery",
    description:
      "Research companies, record your sources and build a focused prospect list.",
    fields: [
      ["name", "Company name", "text", true],
      ["website", "Website", "url"],
      ["industry", "Industry", "text"],
      ["country", "Country", "text"],
      ["source_url", "Research source URL", "url"],
      ["fit_score", "Fit score (0–100)", "number"],
      ["notes", "Research notes", "textarea"],
    ],
    columns: [
      "name",
      "industry",
      "country",
      "fit_score",
      "verification_status",
    ],
  },
  contacts: {
    title: "Contacts",
    description:
      "Keep people and permission to contact them connected to your research.",
    fields: [
      ["full_name", "Full name", "text", true],
      ["email", "Email", "email"],
      ["job_title", "Job title", "text"],
      ["prospect_id", "Company", "prospects"],
      [
        "consent_status",
        "Permission to email",
        "select",
        ["unknown", "opted_in", "legitimate_interest", "opted_out"],
      ],
    ],
    columns: ["full_name", "email", "job_title", "consent_status"],
  },
  lists: {
    title: "Lists",
    description: "Organize contacts into focused working sets.",
    fields: [
      ["name", "List name", "text", true],
      ["description", "Description", "textarea"],
    ],
    columns: ["name", "description"],
  },
  campaigns: {
    title: "Campaigns",
    description:
      "Draft your message, select opted-in recipients, then request approval before sending.",
    fields: [
      ["name", "Campaign name", "text", true],
      ["subject", "Email subject", "text", true],
      ["body", "Email message", "textarea", true],
    ],
    columns: ["name", "subject", "status", "approved_at"],
  },
  deals: {
    title: "Deals",
    description: "Track value, progress and the next conversation.",
    fields: [
      ["title", "Deal title", "text", true],
      ["prospect_id", "Company", "prospects"],
      ["value", "Value", "number", true],
      ["currency", "Currency", "currency"],
      [
        "stage",
        "Stage",
        "select",
        ["qualified", "meeting", "proposal", "negotiation", "won", "lost"],
      ],
      ["expected_close", "Expected close", "date"],
      ["notes", "Notes", "textarea"],
    ],
    columns: ["title", "value", "currency", "stage", "expected_close"],
  },
  tasks: {
    title: "Tasks & follow-ups",
    description: "Give every important opportunity a clear next action.",
    fields: [
      ["title", "Task", "text", true],
      ["deal_id", "Related deal", "deals"],
      ["priority", "Priority", "select", ["low", "medium", "high"]],
      ["due_at", "Due date", "datetime-local"],
      ["status", "Status", "select", ["open", "done"]],
    ],
    columns: ["title", "priority", "status", "due_at"],
  },
  reports: {
    title: "Reports",
    description: "Save report definitions and export your workspace data.",
    fields: [
      ["name", "Report name", "text", true],
      ["description", "What should this report show?", "textarea"],
    ],
    columns: ["name", "definition", "created_at"],
  },
};
const titleCase = (value) =>
  String(value ?? "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
const amount = (value, currency = "NGN") =>
  new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
const display = (value, key) =>
  value == null
    ? "—"
    : typeof value === "object"
      ? Object.values(value).filter(Boolean).join(" · ") || "—"
      : /_at$/.test(key)
        ? new Date(value).toLocaleString()
        : [
              "status",
              "stage",
              "priority",
              "verification_status",
              "consent_status",
              "role",
            ].includes(key)
          ? titleCase(value)
          : String(value);
function useOrgApi() {
  const { organization } = useAuth();
  return useCallback(
    (path, options = {}) =>
      api(path, { ...options, organizationId: organization?.id }),
    [organization?.id],
  );
}
function State({ loading, error, retry, empty, children }) {
  if (loading)
    return (
      <div className="liveState" role="status">
        Loading your records…
      </div>
    );
  if (error)
    return (
      <div className="liveState liveError" role="alert">
        <p>{error}</p>
        <button className="btn secondary" onClick={retry}>
          Try again
        </button>
      </div>
    );
  if (empty)
    return (
      <div className="liveState">
        <h2>No records yet.</h2>
        <p>{empty}</p>
      </div>
    );
  return children;
}
export function LiveWorkspace() {
  const {
    session,
    organization,
    organizations,
    selectOrganization,
    logout,
    refresh,
  } = useAuth();
  const params = useParams(),
    navigate = useNavigate();
  const section = (params["*"] || "dashboard").split("/")[0];
  const [mobile, setMobile] = useState(false);
  const compact = useMediaQuery("(max-width: 820px)");
  const navigationRef = useRef(null);
  useDialogFocus(mobile && compact, () => setMobile(false), navigationRef);
  useEffect(() => {
    setMobile(false);
  }, [section, compact]);
  const role = organization?.role;
  const write = role === "platform_support" || canRole(role, "write"),
    approve = role === "platform_support" || canRole(role, "approve"),
    manage = role === "platform_support" || canRole(role, "manage");
  if (!organization && section !== "admin")
    return session.platformOwner ? (
      <Navigate to="/app/admin" replace />
    ) : (
      <Navigate to="/onboarding/welcome" replace />
    );
  const props = { write, approve, manage };
  const initials = (session.profile.full_name || session.user.email)
    .split(/[\s@]+/)
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div className="appShell">
      <aside
        ref={navigationRef}
        id="workspace-navigation"
        className={"appSide " + (mobile ? "open" : "")}
        role={compact && mobile ? "dialog" : undefined}
        aria-modal={compact && mobile ? true : undefined}
        aria-label="Workspace navigation"
        inert={compact && !mobile}
        onClick={(event) => {
          if (event.target.closest("a[href]")) setMobile(false);
        }}
      >
        <div className="sideTop">
          <LiveBrand />
          <button aria-label="Close menu" onClick={() => setMobile(false)}>
            <X />
          </button>
        </div>
        <label className="workspace liveWorkspaceSelect">
          <Building2 size={20} />
          <select
            aria-label="Organization"
            value={organization?.id || ""}
            onChange={(e) => {
              selectOrganization(e.target.value);
              setMobile(false);
            }}
          >
            {!organization && <option value="">Select organization</option>}
            {organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        <nav>
          {navigation.map(([group, items]) => (
            <div className="navGroup" key={group}>
              <small>{group}</small>
              {items.map(([label, path, Icon]) => (
                <NavLink
                  key={path}
                  to={"/app/" + path}
                  onClick={() => setMobile(false)}
                >
                  <Icon />
                  {label}
                </NavLink>
              ))}
            </div>
          ))}
          <div className="navGroup">
            <small>Manage</small>
            <NavLink to="/app/audit">
              <ShieldCheck />
              Audit trail
            </NavLink>
            <NavLink to="/app/team">
              <Users />
              Team & roles
            </NavLink>
            <NavLink to="/app/integrations">
              <Settings />
              Integrations
            </NavLink>
            <NavLink to="/app/billing">
              <BriefcaseBusiness />
              Billing
            </NavLink>
            {session.platformOwner && (
              <NavLink to="/app/admin">
                <ShieldCheck />
                Platform owner
              </NavLink>
            )}
          </div>
        </nav>
        <div className="sideBottom">
          <NavLink to="/app/settings">
            <Settings /> Settings
          </NavLink>
          <div className="userChip">
            <span className="avatar">{initials}</span>
            <span>
              <b>{session.profile.full_name || session.user.email}</b>
              <small>
                {session.platformOwner ? "Platform owner" : titleCase(role)}
              </small>
            </span>
            <button
              aria-label="Sign out"
              onClick={() =>
                logout()
                  .then(() => navigate("/login"))
                  .catch(() => {})
              }
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="appBody" inert={compact && mobile}>
        <header className="appTop">
          <button
            className="menuBtn"
            aria-label="Open menu"
            aria-expanded={mobile}
            aria-controls="workspace-navigation"
            onClick={() => setMobile(true)}
          >
            <Menu />
          </button>
          <div className="liveBreadcrumb">
            {organization?.name || "Platform administration"}
            <span>{titleCase(section)}</span>
          </div>
          <Link className="btn secondary" to="/onboarding/welcome">
            <Plus size={16} />
            New organization
          </Link>
        </header>
        {organization?.support && (
          <div className="supportBanner" role="status">
            <ShieldCheck size={17} />
            <span>
              Support access · {organization.name} · expires{" "}
              {new Date(organization.support.expires_at).toLocaleTimeString()}
              <small>{organization.support.reason}</small>
            </span>
            <button
              onClick={async () => {
                await api("/platform/support/" + organization.id, {
                  method: "DELETE",
                  body: {},
                });
                await refresh();
                navigate("/app/admin");
              }}
            >
              End support session
            </button>
          </div>
        )}
        <main className="appMain" key={section + organization?.id}>
          {section === "dashboard" || section === "analytics" ? (
            <Overview analytics={section === "analytics"} {...props} />
          ) : section === "diagnosis" ? (
            <DiagnosisPage {...props} />
          ) : section === "pipeline" ? (
            <PipelinePage {...props} />
          ) : section === "company" || section === "settings" ? (
            <CompanyPage {...props} />
          ) : section === "audit" ? (
            <AuditView />
          ) : section === "team" ? (
            <TeamPage {...props} />
          ) : section === "admin" ? (
            <PlatformPage />
          ) : section === "integrations" || section === "billing" ? (
            <ConnectionsPage section={section} {...props} />
          ) : section === "inbox" ? (
            <InboxView />
          ) : section === "ai-advisor" ? (
            <AdvisorPage />
          ) : modules[section === "ideal-customers" ? "icps" : section] ? (
            <ResourcePage
              resource={section === "ideal-customers" ? "icps" : section}
              {...props}
            />
          ) : (
            <div className="liveState">
              <h1>Page not found</h1>
              <Link to="/app/dashboard">Return to overview</Link>
            </div>
          )}
        </main>
      </div>
      {mobile && (
        <button
          className="scrim"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
    </div>
  );
}
function Header({ title, description, children }) {
  return (
    <div className="pageHeader">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="headerActions">{children}</div>
    </div>
  );
}
function RecordForm({ resource, record, onClose, onSaved }) {
  const config = modules[resource],
    request = useOrgApi();
  const [values, setValues] = useState(() => {
      const v = { ...record };
      if (resource === "icps") Object.assign(v, record?.criteria || {});
      if (resource === "reports")
        v.description = record?.definition?.description || "";
      if (v.due_at) v.due_at = new Date(v.due_at).toISOString().slice(0, 16);
      return v;
    }),
    [references, setReferences] = useState({}),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
  useDialogFocus(true, () => {
    if (!pending) onClose();
  });
  useEffect(() => {
    const controller = new AbortController();
    Promise.all(
      [
        ...new Set(
          config.fields
            .filter((f) => ["offers", "prospects", "deals"].includes(f[2]))
            .map((f) => f[2]),
        ),
      ].map(async (table) => [
        table,
        (await request("/resources/" + table, { signal: controller.signal }))
          .data,
      ]),
    )
      .then((entries) => setReferences(Object.fromEntries(entries)))
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, [resource, request]);
  return (
    <div className="liveModalBackdrop">
      <section
        className="liveModal panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="record-form-title"
      >
        <header>
          <h2 id="record-form-title">
            {record ? "Edit" : "Add"} {config.title.toLowerCase()}
          </h2>
          <button
            aria-label="Close dialog"
            disabled={pending}
            onClick={onClose}
          >
            <X />
          </button>
        </header>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setPending(true);
            setError("");
            try {
              const data = {};
              for (const [key, , type, requiredOrOptions] of config.fields) {
                let value = values[key];
                if (type === "number")
                  value = value === "" || value == null ? null : Number(value);
                if (type === "currency") value = (value || "NGN").toUpperCase();
                if (type === "select") value = value || requiredOrOptions[0];
                if (type === "datetime-local")
                  value = value ? new Date(value).toISOString() : null;
                if (
                  [
                    "offers",
                    "prospects",
                    "deals",
                    "url",
                    "date",
                    "email",
                  ].includes(type)
                )
                  value = value || null;
                data[key] = value ?? (type === "textarea" ? "" : null);
              }
              if (resource === "icps") {
                data.criteria = {
                  industries: data.industries || "",
                  countries: data.countries || "",
                  job_titles: data.job_titles || "",
                };
                delete data.industries;
                delete data.countries;
                delete data.job_titles;
              }
              if (resource === "reports") {
                data.definition = { description: data.description || "" };
                delete data.description;
              }
              if (resource === "prospects")
                data.verification_status =
                  record?.verification_status || "unverified";
              await request(
                "/resources/" + resource + (record ? "/" + record.id : ""),
                { method: record ? "PATCH" : "POST", body: data },
              );
              onSaved();
            } catch (e) {
              setError(e.message);
            } finally {
              setPending(false);
            }
          }}
        >
          {error && (
            <div role="alert" className="liveError">
              {error}
            </div>
          )}
          {config.fields.map(([key, label, type, requiredOrOptions]) => (
            <label className="field" key={key}>
              <span>{label}</span>
              {type === "textarea" ? (
                <textarea
                  autoFocus={key === config.fields[0][0]}
                  required={requiredOrOptions === true}
                  maxLength={20000}
                  value={values[key] || ""}
                  onChange={(e) =>
                    setValues({ ...values, [key]: e.target.value })
                  }
                />
              ) : type === "select" ? (
                <select
                  value={values[key] || requiredOrOptions[0]}
                  onChange={(e) =>
                    setValues({ ...values, [key]: e.target.value })
                  }
                >
                  {requiredOrOptions.map((v) => (
                    <option key={v} value={v}>
                      {titleCase(v)}
                    </option>
                  ))}
                </select>
              ) : ["offers", "prospects", "deals"].includes(type) ? (
                <select
                  value={values[key] || ""}
                  onChange={(e) =>
                    setValues({ ...values, [key]: e.target.value })
                  }
                >
                  <option value="">Not linked</option>
                  {(references[type] || []).map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name || r.title}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  autoFocus={key === config.fields[0][0]}
                  type={type === "currency" ? "text" : type}
                  required={requiredOrOptions === true}
                  min={type === "number" ? 0 : undefined}
                  max={key === "fit_score" ? 100 : undefined}
                  step={type === "number" ? "any" : undefined}
                  maxLength={type === "currency" ? 3 : 500}
                  value={values[key] ?? ""}
                  onChange={(e) =>
                    setValues({ ...values, [key]: e.target.value })
                  }
                />
              )}
            </label>
          ))}
          <div className="liveFormActions">
            <button
              type="button"
              className="btn secondary"
              disabled={pending}
              onClick={onClose}
            >
              Cancel
            </button>
            <button className="btn primary" disabled={pending}>
              {pending ? "Saving…" : "Save record"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
function ResourcePage({ resource, write, approve }) {
  const config = modules[resource],
    request = useOrgApi(),
    { organization } = useAuth();
  const [rows, setRows] = useState([]),
    [count, setCount] = useState(0),
    [offset, setOffset] = useState(0),
    [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [editing, setEditing] = useState(null),
    [notice, setNotice] = useState(""),
    [deleting, setDeleting] = useState(""),
    [selected, setSelected] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await request(
        "/resources/" +
          resource +
          "?limit=25&offset=" +
          offset +
          "&search=" +
          encodeURIComponent(query),
      );
      setRows(r.data);
      setCount(r.count);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [request, resource, offset, query]);
  useEffect(() => {
    load();
  }, [load]);
  const action = async (id, type) => {
    setError("");
    try {
      const r = await request("/campaigns/" + id + "/" + type, {
        method: "POST",
        body: {},
      });
      setNotice(
        type === "approve"
          ? "Campaign approved."
          : `Delivery completed: ${r.sent} sent, ${r.failed} need review.`,
      );
      await load();
    } catch (e) {
      setError(e.message);
    }
  };
  const exportData = async () => {
    try {
      const response = await fetch("/api/export/" + resource, {
        credentials: "same-origin",
        headers: { "x-organization-id": organization.id },
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error);
      }
      const objectUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = resource + ".csv";
      link.click();
      URL.revokeObjectURL(objectUrl);
    } catch (e) {
      setError(e.message);
    }
  };
  return (
    <>
      <Header title={config.title} description={config.description}>
        {approve &&
          ["prospects", "contacts", "deals", "tasks"].includes(resource) && (
            <button className="btn secondary" onClick={exportData}>
              <Download size={16} />
              Export
            </button>
          )}
        {write && (
          <button
            className="btn primary"
            onClick={() => setEditing({ new: true })}
          >
            <Plus size={16} />
            Add {resource === "icps" ? "profile" : resource.slice(0, -1)}
          </button>
        )}
      </Header>
      {notice && (
        <div className="liveNotice" role="status">
          {notice}
        </div>
      )}
      {resource === "prospects" && write && <CsvImport onImported={load} />}
      <form
        className="liveSearch"
        onSubmit={(e) => {
          e.preventDefault();
          setOffset(0);
          setQuery(search);
        }}
      >
        <Search size={17} />
        <input
          aria-label={"Search " + config.title}
          placeholder={"Search " + config.title.toLowerCase()}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="btn secondary">Search</button>
      </form>
      <section className="panel liveRecords">
        <State
          loading={loading}
          error={error}
          retry={load}
          empty={
            !rows.length
              ? "Add your first record, or adjust your search."
              : false
          }
        >
          <p className="tableHint">
            Swipe across to see all details and actions.
          </p>
          <div
            className="tableScroll"
            role="region"
            aria-label={config.title + " records"}
            tabIndex={0}
          >
            <table>
              <thead>
                <tr>
                  {config.columns.map((c) => (
                    <th key={c}>{titleCase(c)}</th>
                  ))}
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    {config.columns.map((column) => (
                      <td key={column}>{display(row[column], column)}</td>
                    ))}
                    <td>
                      <div className="liveRowActions">
                        {write && (
                          <button onClick={() => setEditing(row)}>Edit</button>
                        )}
                        {approve && (
                          <button onClick={() => setDeleting(row.id)}>
                            Delete
                          </button>
                        )}
                        {resource === "campaigns" && (
                          <>
                            {write && row.status === "draft" && (
                              <button onClick={() => setSelected(row.id)}>
                                Recipients
                              </button>
                            )}
                            {approve && row.status === "draft" && (
                              <button onClick={() => action(row.id, "approve")}>
                                Approve
                              </button>
                            )}
                            {approve && row.status === "approved" && (
                              <button
                                onClick={() => {
                                  setSelected("send:" + row.id);
                                }}
                              >
                                Send
                              </button>
                            )}
                          </>
                        )}
                        {resource === "lists" && write && (
                          <button onClick={() => setSelected(row.id)}>
                            Add contact
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </State>
        <div className="pagination">
          <span>{count} records</span>
          <div>
            <button
              disabled={!offset || loading}
              onClick={() => setOffset(Math.max(0, offset - 25))}
            >
              Previous
            </button>
            <button
              disabled={offset + 25 >= count || loading}
              onClick={() => setOffset(offset + 25)}
            >
              Next
            </button>
          </div>
        </div>
      </section>
      {editing && (
        <RecordForm
          resource={resource}
          record={editing.new ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setNotice("Record saved.");
            load();
          }}
        />
      )}
      {deleting && (
        <Confirm
          title="Delete this record?"
          detail="Related records may prevent deletion. This action removes the record from your organization."
          onCancel={() => setDeleting("")}
          onConfirm={async () => {
            try {
              await request("/resources/" + resource + "/" + deleting, {
                method: "DELETE",
              });
              setDeleting("");
              load();
            } catch (e) {
              setDeleting("");
              setError(e.message);
            }
          }}
        />
      )}
      {selected.startsWith("send:") ? (
        <Confirm
          title="Send this approved campaign?"
          detail="This sends real email to the campaign’s opted-in recipients. Check the message and recipient list before continuing."
          onCancel={() => setSelected("")}
          onConfirm={async () => {
            const id = selected.slice(5);
            setSelected("");
            await action(id, "send");
          }}
        />
      ) : (
        selected && (
          <ContactPicker
            resource={resource}
            parentId={selected}
            onClose={() => setSelected("")}
            onSaved={() => setNotice("Contact added.")}
          />
        )
      )}
    </>
  );
}
function Confirm({ title, detail, onCancel, onConfirm }) {
  const [pending, setPending] = useState(false);
  useDialogFocus(true, () => {
    if (!pending) onCancel();
  });
  return (
    <div className="liveModalBackdrop">
      <section
        className="panel liveModal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <h2>{title}</h2>
        <p>{detail}</p>
        <div className="liveFormActions">
          <button
            className="btn secondary"
            disabled={pending}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={pending}
            onClick={async () => {
              setPending(true);
              try {
                await onConfirm();
              } finally {
                setPending(false);
              }
            }}
          >
            {pending ? "Please wait…" : "Confirm"}
          </button>
        </div>
      </section>
    </div>
  );
}
function ContactPicker({ resource, parentId, onClose, onSaved }) {
  useDialogFocus(true, onClose);
  const request = useOrgApi();
  const [contacts, setContacts] = useState([]),
    [id, setId] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    request("/resources/contacts?limit=100")
      .then((r) => setContacts(r.data))
      .catch((e) => setError(e.message));
  }, [request]);
  return (
    <div className="liveModalBackdrop">
      <section
        className="panel liveModal"
        role="dialog"
        aria-modal="true"
        aria-label="Add contact"
      >
        <header>
          <h2>Add contact</h2>
          <button onClick={onClose} aria-label="Close">
            <X />
          </button>
        </header>
        {error && (
          <p className="liveError" role="alert">
            {error}
          </p>
        )}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await request(
                "/resources/" +
                  (resource === "lists"
                    ? "list_contacts"
                    : "campaign_recipients"),
                {
                  method: "POST",
                  body: {
                    [resource === "lists" ? "list_id" : "campaign_id"]:
                      parentId,
                    contact_id: id,
                  },
                },
              );
              onSaved();
              onClose();
            } catch (e) {
              setError(e.message);
            }
          }}
        >
          <label className="field">
            <span>Contact</span>
            <select required value={id} onChange={(e) => setId(e.target.value)}>
              <option value="">Select a contact</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name} · {c.email || "No email"} ·{" "}
                  {titleCase(c.consent_status)}
                </option>
              ))}
            </select>
          </label>
          <button className="btn primary">Add contact</button>
        </form>
      </section>
    </div>
  );
}
function CsvImport({ onImported }) {
  const request = useOrgApi(),
    [pending, setPending] = useState(false),
    [message, setMessage] = useState("");
  return (
    <div className="liveImport">
      <label className="btn secondary">
        <Upload size={16} />
        {pending ? "Importing…" : "Import company CSV"}
        <input
          type="file"
          accept=".csv,text/csv"
          disabled={pending}
          hidden
          onChange={async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            if (file.size > 500000) {
              setMessage("Choose a CSV smaller than 500 KB.");
              return;
            }
            setPending(true);
            try {
              const r = await request("/import/prospects", {
                method: "POST",
                body: { csv: await file.text() },
              });
              setMessage(`${r.imported} companies imported.`);
              onImported();
            } catch (e) {
              setMessage(e.message);
            } finally {
              setPending(false);
              e.target.value = "";
            }
          }}
        />
      </label>
      <small>
        Headers: name, website, industry, country, source_url, notes. Up to 500
        companies.
      </small>
      {message && <p role="status">{message}</p>}
    </div>
  );
}
function Overview({ analytics, write }) {
  const request = useOrgApi();
  const [data, setData] = useState(null),
    [error, setError] = useState("");
  const load = useCallback(
    () =>
      request("/dashboard")
        .then(setData)
        .catch((e) => setError(e.message)),
    [request],
  );
  useEffect(() => {
    load();
  }, [load]);
  const r = data?.records || {},
    open = (r.deals || []).filter((d) => !["won", "lost"].includes(d.stage));
  const total = (stage) =>
    (r.deals || [])
      .filter((d) =>
        stage ? d.stage === stage : !["won", "lost"].includes(d.stage),
      )
      .reduce((sum, d) => sum + Number(d.value), 0);
  const currencies = [...new Set((r.deals || []).map((d) => d.currency))];
  return (
    <>
      <Header
        title={analytics ? "Sales analytics" : "Your acquisition overview"}
        description="Your organization’s actual records, with the next actions in view."
      >
        <Link className="btn primary" to="/app/ai-advisor">
          <Lightbulb size={16} />
          Ask advisor
        </Link>
      </Header>
      <State loading={!data && !error} error={error} retry={load}>
        {currencies.length > 1 && (
          <p className="liveNotice">
            Deal totals below use NGN only. Other currencies remain visible on
            each deal.
          </p>
        )}
        <section className="stats">
          {[
            ["Prospects", (r.prospects || []).length],
            ["Open opportunities", open.length],
            [
              "Open tasks",
              (r.tasks || []).filter((t) => t.status === "open").length,
            ],
            [
              "Opted-in contacts",
              (r.contacts || []).filter((c) => c.consent_status === "opted_in")
                .length,
            ],
          ].map(([label, value]) => (
            <article className="stat" key={label}>
              <div>
                <small>{label}</small>
                <b>{value}</b>
              </div>
            </article>
          ))}
        </section>
        <section className="liveTwoColumns">
          <article className="panel livePanel">
            <h2>Pipeline by stage</h2>
            {[
              "qualified",
              "meeting",
              "proposal",
              "negotiation",
              "won",
              "lost",
            ].map((stage) => (
              <div className="liveMetric" key={stage}>
                <span>{titleCase(stage)}</span>
                <b>{(r.deals || []).filter((d) => d.stage === stage).length}</b>
                <small>
                  {amount(
                    (r.deals || [])
                      .filter((d) => d.stage === stage && d.currency === "NGN")
                      .reduce((s, d) => s + Number(d.value), 0),
                  )}
                </small>
              </div>
            ))}
            <Link to="/app/pipeline">
              View pipeline <ArrowRight size={14} />
            </Link>
          </article>
          <article className="panel livePanel">
            <h2>Next actions</h2>
            {!(r.tasks || []).length ? (
              <p>
                No tasks yet. Add a follow-up to keep your next opportunity
                moving.
              </p>
            ) : (
              (r.tasks || [])
                .filter((t) => t.status === "open")
                .slice(0, 6)
                .map((t) => (
                  <div className="liveTask" key={t.id}>
                    {write && (
                      <button
                        aria-label={"Complete " + t.title}
                        onClick={async () => {
                          await request("/resources/tasks/" + t.id, {
                            method: "PATCH",
                            body: { status: "done" },
                          });
                          load();
                        }}
                      >
                        <Check size={15} />
                      </button>
                    )}
                    <span>
                      <b>{t.title}</b>
                      <small>
                        {t.due_at
                          ? new Date(t.due_at).toLocaleDateString()
                          : "No due date"}{" "}
                        · {titleCase(t.priority)}
                      </small>
                    </span>
                  </div>
                ))
            )}
            <Link to="/app/tasks">
              Manage tasks <ArrowRight size={14} />
            </Link>
          </article>
        </section>
        <p className="liveScope">
          {data?.scope}. Values are based on saved records.
        </p>
      </State>
    </>
  );
}
function PipelinePage({ write }) {
  const request = useOrgApi(),
    [rows, setRows] = useState(null),
    [error, setError] = useState("");
  const load = useCallback(
    () =>
      request("/resources/deals?limit=100")
        .then((r) => setRows(r.data))
        .catch((e) => setError(e.message)),
    [request],
  );
  useEffect(() => {
    load();
  }, [load]);
  return (
    <>
      <Header
        title="Pipeline"
        description="Move opportunities forward while keeping their value and next action visible."
      >
        <Link className="btn primary" to="/app/deals">
          <Plus size={16} />
          Manage deals
        </Link>
      </Header>
      <State loading={!rows && !error} error={error} retry={load}>
        <section
          className="kanban liveKanban"
          role="region"
          aria-label="Sales pipeline"
          tabIndex={0}
        >
          {[
            "qualified",
            "meeting",
            "proposal",
            "negotiation",
            "won",
            "lost",
          ].map((stage) => (
            <div className="kanbanCol" key={stage}>
              <header>
                <b>{titleCase(stage)}</b>
                <span>
                  {(rows || []).filter((d) => d.stage === stage).length}
                </span>
              </header>
              {(rows || [])
                .filter((d) => d.stage === stage)
                .map((d) => (
                  <article key={d.id}>
                    <h3>{d.title}</h3>
                    <b>{amount(d.value, d.currency)}</b>
                    {write && (
                      <label className="field">
                        <span>Stage</span>
                        <select
                          aria-label={"Stage for " + d.title}
                          value={d.stage}
                          onChange={async (e) => {
                            try {
                              await request("/resources/deals/" + d.id, {
                                method: "PATCH",
                                body: { stage: e.target.value },
                              });
                              load();
                            } catch (e) {
                              setError(e.message);
                            }
                          }}
                        >
                          {[
                            "qualified",
                            "meeting",
                            "proposal",
                            "negotiation",
                            "won",
                            "lost",
                          ].map((s) => (
                            <option key={s} value={s}>
                              {titleCase(s)}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  </article>
                ))}
            </div>
          ))}
        </section>
      </State>
    </>
  );
}
function DiagnosisPage({ write }) {
  const request = useOrgApi(),
    [rows, setRows] = useState(null),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const load = useCallback(
    () =>
      request("/resources/diagnoses")
        .then((r) => setRows(r.data))
        .catch((e) => setError(e.message)),
    [request],
  );
  useEffect(() => {
    load();
  }, [load]);
  const latest = rows?.[0];
  return (
    <>
      <Header
        title="Sales diagnosis"
        description="Find constraints using your saved offers, customers, deals and tasks."
      >
        {write && (
          <button
            className="btn primary"
            disabled={pending}
            onClick={async () => {
              setPending(true);
              setError("");
              try {
                await request("/diagnosis", { method: "POST", body: {} });
                await load();
              } catch (e) {
                setError(e.message);
              } finally {
                setPending(false);
              }
            }}
          >
            <RefreshCcw size={16} />
            {pending ? "Reviewing evidence…" : "Run diagnosis"}
          </button>
        )}
      </Header>
      <State
        loading={!rows && !error}
        error={error}
        retry={load}
        empty={
          !rows?.length
            ? "Add company context and sales records, then run your first diagnosis."
            : false
        }
      >
        {latest && (
          <>
            <section className="diagnosisHero">
              <div>
                <span>
                  Latest diagnosis ·{" "}
                  {new Date(latest.created_at).toLocaleDateString()}
                </span>
                <h2>
                  {latest.findings[0]?.title ||
                    "Build evidence for your next decision."}
                </h2>
                <p>
                  Based on your workspace records. This score measures
                  completeness and follow-up discipline, not predicted revenue.
                </p>
              </div>
              <div className="liveScore">
                <strong>{latest.score}</strong>
                <small>of 100</small>
              </div>
            </section>
            <section className="findingGrid">
              {latest.findings.map((f, i) => (
                <article className="panel finding" key={i}>
                  <span>Finding {i + 1}</span>
                  <h2>{f.title}</h2>
                  <p>{f.detail}</p>
                  <Link
                    to={
                      "/app/" +
                      (f.source === "icps" ? "ideal-customers" : f.source)
                    }
                  >
                    Review {f.source}
                    <ArrowRight size={14} />
                  </Link>
                </article>
              ))}
            </section>
            <article className="panel livePanel">
              <h2>Evidence used</h2>
              <p>{latest.evidence.scope}</p>
              <div className="liveEvidence">
                {Object.entries(latest.evidence.records || {}).map(
                  ([table, count]) => (
                    <span key={table}>
                      {titleCase(table)} <b>{count}</b>
                    </span>
                  ),
                )}
              </div>
            </article>
          </>
        )}
      </State>
    </>
  );
}
function CompanyPage({ manage }) {
  const { organization, refresh } = useAuth();
  const request = useOrgApi(),
    [notice, setNotice] = useState(""),
    [error, setError] = useState("");
  return (
    <>
      <Header
        title="Company settings"
        description="Keep the company context behind your acquisition process accurate."
      />
      <form
        className="panel settingsForm"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const f = new FormData(e.currentTarget);
            await request("/organization", {
              method: "PATCH",
              body: {
                ...Object.fromEntries(f),
                website: f.get("website") || null,
              },
            });
            await refresh();
            setNotice("Company details saved.");
          } catch (e) {
            setError(e.message);
          }
        }}
      >
        {error && (
          <p className="liveError" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="liveNotice" role="status">
            {notice}
          </p>
        )}
        {[
          ["name", "Organization name", "text"],
          ["website", "Website", "url"],
          ["industry", "Industry", "text"],
        ].map(([name, label, type]) => (
          <label className="field" key={name}>
            <span>{label}</span>
            <input
              name={name}
              type={type}
              disabled={!manage}
              required={name === "name"}
              defaultValue={organization[name] || ""}
            />
          </label>
        ))}
        <label className="field">
          <span>Description</span>
          <textarea
            name="description"
            defaultValue={organization.description || ""}
            disabled={!manage}
          />
        </label>
        {manage && <button className="btn primary">Save company</button>}
      </form>
      <DocumentPanel manage={manage} />
    </>
  );
}
function TeamPage({ manage }) {
  const request = useOrgApi(),
    [data, setData] = useState(null),
    [error, setError] = useState(""),
    [invite, setInvite] = useState("");
  const load = useCallback(
    () =>
      request("/team")
        .then(setData)
        .catch((e) => setError(e.message)),
    [request],
  );
  useEffect(() => {
    load();
  }, [load]);
  return (
    <>
      <Header
        title="Team & roles"
        description="Keep organization permissions separate from platform ownership."
      />
      <State loading={!data && !error} error={error} retry={load}>
        <section className="panel livePanel">
          {data?.members.map((m) => (
            <div className="liveMetric" key={m.user_id}>
              <span>{m.profiles?.full_name || m.user_id}</span>
              {manage && m.role !== "owner" ? (
                <select
                  aria-label={
                    "Role for " + (m.profiles?.full_name || m.user_id)
                  }
                  value={m.role}
                  onChange={async (e) => {
                    try {
                      await request("/team/" + m.user_id, {
                        method: "PATCH",
                        body: { role: e.target.value },
                      });
                      load();
                    } catch (e) {
                      setError(e.message);
                    }
                  }}
                >
                  {["admin", "manager", "member", "viewer"].map((r) => (
                    <option key={r} value={r}>
                      {titleCase(r)}
                    </option>
                  ))}
                </select>
              ) : (
                <b>{titleCase(m.role)}</b>
              )}
            </div>
          ))}
        </section>
      </State>
      {manage && (
        <form
          className="panel livePanel"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            try {
              const result = await request("/invitations", {
                method: "POST",
                body: Object.fromEntries(f),
              });
              setInvite(result.inviteUrl);
              load();
            } catch (e) {
              setError(e.message);
            }
          }}
        >
          <h2>Invite a teammate</h2>
          <label className="field">
            <span>Email address</span>
            <input type="email" name="email" required />
          </label>
          <label className="field">
            <span>Role</span>
            <select name="role">
              {["member", "viewer", "manager", "admin"].map((r) => (
                <option key={r} value={r}>
                  {titleCase(r)}
                </option>
              ))}
            </select>
          </label>
          <button className="btn primary">Create invitation link</button>
          {invite && (
            <div className="liveNotice" role="status">
              <p>
                Share this link with the teammate. They must verify the invited
                email.
              </p>
              <input aria-label="Invitation link" readOnly value={invite} />
            </div>
          )}
        </form>
      )}
    </>
  );
}
function PlatformPage() {
  const { session, refresh, selectOrganization } = useAuth(),
    navigate = useNavigate();
  const [rows, setRows] = useState(null),
    [error, setError] = useState(""),
    [selected, setSelected] = useState(null),
    [reason, setReason] = useState("");
  const load = useCallback(
    () =>
      api("/platform/organizations")
        .then((r) => setRows(r.organizations))
        .catch((e) => setError(e.message)),
    [],
  );
  useEffect(() => {
    if (session.platformOwner) load();
  }, [session.platformOwner, load]);
  if (!session.platformOwner)
    return (
      <div className="liveState">
        <ShieldCheck />
        <h1>Platform owner access required</h1>
        <p>
          Your organization role does not grant access to other organizations.
        </p>
      </div>
    );
  return (
    <>
      <Header
        title="Platform owner"
        description="Manage the platform and help organizations through time-limited, audited support sessions."
      />
      <State
        loading={!rows && !error}
        error={error}
        retry={load}
        empty={
          !rows?.length
            ? "Organizations will appear here after their owners create a workspace."
            : false
        }
      >
        <section className="panel livePanel">
          {rows?.map((o) => (
            <div className="liveMetric" key={o.id}>
              <span>
                <b>{o.name}</b>
                <small>{o.industry || "Industry not set"}</small>
              </span>
              <button
                className="btn secondary"
                onClick={() => {
                  setSelected(o);
                  setReason("");
                }}
              >
                Manage organization <ArrowRight size={15} />
              </button>
            </div>
          ))}
        </section>
      </State>
      <PlatformRequests />
      <Link className="btn primary" to="/onboarding/welcome">
        <Plus size={16} />
        Create an organization
      </Link>
      {selected && (
        <div className="liveModalBackdrop">
          <section
            className="panel liveModal"
            role="dialog"
            aria-modal="true"
            aria-label="Start support session"
          >
            <header>
              <h2>Support {selected.name}</h2>
              <button aria-label="Close" onClick={() => setSelected(null)}>
                <X />
              </button>
            </header>
            <p>
              This gives you access for one hour. The reason and your changes
              are recorded in the organization’s audit trail.
            </p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await api("/platform/support", {
                    method: "POST",
                    body: { organization_id: selected.id, reason },
                  });
                  await refresh();
                  selectOrganization(selected.id);
                  navigate("/app/dashboard");
                } catch (e) {
                  setError(e.message);
                  setSelected(null);
                }
              }}
            >
              <label className="field">
                <span>Reason for access</span>
                <textarea
                  minLength={10}
                  maxLength={500}
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <button className="btn primary">Start support session</button>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
function ConnectionsPage({ section, manage }) {
  const request = useOrgApi(),
    [data, setData] = useState(null),
    [error, setError] = useState("");
  const load = useCallback(
    () =>
      request(
        section === "billing" ? "/resources/billing_accounts" : "/integrations",
      )
        .then(setData)
        .catch((e) => setError(e.message)),
    [request, section],
  );
  useEffect(() => {
    load();
  }, [load]);
  return (
    <>
      <Header
        title={section === "billing" ? "Plans & billing" : "Integrations"}
        description={
          section === "billing"
            ? "Your recorded subscription and billing status."
            : "Connection status is checked on the server. Credentials are never shown in the browser."
        }
      />
      <State loading={!data && !error} error={error} retry={load}>
        <section className="panel livePanel">
          {section === "billing" ? (
            <>
              <h2>{titleCase(data?.data[0]?.plan || "Starter")}</h2>
              <p>
                Status: {titleCase(data?.data[0]?.status || "Not configured")}
              </p>
              <p>Billing changes require a configured payment provider.</p>
              {manage && (
                <button
                  className="btn primary"
                  onClick={async () => {
                    try {
                      const r = await request("/billing/checkout", {
                        method: "POST",
                        body: { plan: "growth" },
                      });
                      window.location.assign(r.url);
                    } catch (e) {
                      setError(e.message);
                    }
                  }}
                >
                  Upgrade to Growth
                </button>
              )}
            </>
          ) : (
            data?.providers.map((p) => (
              <div className="liveMetric" key={p.provider}>
                <span>
                  <b>{p.name}</b>
                  <small>
                    {p.configured
                      ? "Server credentials configured"
                      : "Provider setup required"}
                  </small>
                </span>
                <strong>{p.configured ? "Available" : "Not connected"}</strong>
              </div>
            ))
          )}
        </section>
      </State>
    </>
  );
}
function InboxView() {
  const request = useOrgApi(),
    [rows, setRows] = useState(null),
    [active, setActive] = useState(0),
    [error, setError] = useState("");
  const load = useCallback(
    () =>
      request("/resources/messages")
        .then((r) => setRows(r.data))
        .catch((e) => setError(e.message)),
    [request],
  );
  useEffect(() => {
    load();
  }, [load]);
  return (
    <>
      <Header
        title="Inbox"
        description="Saved inbound and outbound messages. Incoming delivery requires the email webhook to be configured."
      />
      <State
        loading={!rows && !error}
        error={error}
        retry={load}
        empty={
          !rows?.length
            ? "No messages yet. Approved campaign deliveries and connected incoming email will appear here."
            : false
        }
      >
        <section className="liveTwoColumns">
          <aside className="panel inboxList">
            {rows?.map((m, i) => (
              <button
                className={i === active ? "active" : ""}
                key={m.id}
                onClick={() => setActive(i)}
              >
                <span>
                  <b>{m.subject}</b>
                  <p>
                    {m.direction} ·{" "}
                    {new Date(m.created_at).toLocaleDateString()}
                  </p>
                </span>
              </button>
            ))}
          </aside>
          <article className="panel livePanel">
            <AnimatedPreview previewKey={active}>
              <h2>{rows?.[active]?.subject}</h2>
              <p className="liveMessageBody">{rows?.[active]?.body}</p>
            </AnimatedPreview>
          </article>
        </section>
      </State>
    </>
  );
}
function AdvisorPage() {
  const request = useOrgApi(),
    [question, setQuestion] = useState(""),
    [answer, setAnswer] = useState(null),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
  return (
    <>
      <Header
        title="Sales advisor"
        description="Get a grounded summary of the evidence in your workspace."
      />
      <form
        className="panel livePanel"
        onSubmit={async (e) => {
          e.preventDefault();
          setPending(true);
          setError("");
          try {
            setAnswer(
              await request("/advisor", { method: "POST", body: { question } }),
            );
          } catch (e) {
            setError(e.message);
          } finally {
            setPending(false);
          }
        }}
      >
        <label className="field">
          <span>What should the team focus on?</span>
          <textarea
            required
            minLength={3}
            maxLength={2000}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
        </label>
        <button className="btn primary" disabled={pending}>
          {pending ? "Reviewing evidence…" : "Review workspace evidence"}
        </button>
      </form>
      {error && (
        <p className="liveError" role="alert">
          {error}
        </p>
      )}
      {answer && (
        <article className="panel livePanel">
          <h2>Your next priorities</h2>
          <p className="liveMessageBody">{answer.answer}</p>
          <small>
            Method: {answer.mode}. This is a rules-based review, not a generated
            prediction.
          </small>
          <div className="liveEvidence">
            {answer.sources.map((s, i) => (
              <Link
                key={i}
                to={
                  "/app/" + (s.table === "icps" ? "ideal-customers" : s.table)
                }
              >
                {titleCase(s.table)} · {s.ids.length} linked records
              </Link>
            ))}
          </div>
        </article>
      )}
    </>
  );
}
function DocumentPanel({ manage }) {
  const request = useOrgApi(),
    { organization } = useAuth(),
    [rows, setRows] = useState([]),
    [message, setMessage] = useState("");
  const load = useCallback(
    () =>
      request("/documents")
        .then((r) => setRows(r.data))
        .catch((e) => setMessage(e.message)),
    [request],
  );
  useEffect(() => {
    load();
  }, [load]);
  return (
    <section className="panel livePanel">
      <h2>Company documents</h2>
      <p>Private PDF, text and CSV files, up to 5 MB.</p>
      {manage && (
        <label className="btn secondary">
          <Upload size={15} />
          Upload document
          <input
            type="file"
            accept=".pdf,.txt,.csv"
            hidden
            onChange={async (e) => {
              const file = e.target.files[0];
              if (!file) return;
              try {
                if (file.size > 5 * 1024 * 1024)
                  throw new Error("Choose a file under 5 MB");
                const response = await fetch(
                  "/api/documents?name=" + encodeURIComponent(file.name),
                  {
                    method: "POST",
                    credentials: "same-origin",
                    headers: {
                      "x-organization-id": organization.id,
                      "Content-Type": file.type || "text/plain",
                    },
                    body: file,
                  },
                );
                const result = await response.json();
                if (!response.ok) throw new Error(result.error);
                setMessage("Document saved.");
                load();
              } catch (e) {
                setMessage(e.message);
              } finally {
                e.target.value = "";
              }
            }}
          />
        </label>
      )}
      {message && <p role="status">{message}</p>}
      {rows.map((d) => (
        <div className="liveMetric" key={d.id}>
          <span>
            {d.name}
            <small>{Math.ceil(d.size_bytes / 1024)} KB</small>
          </span>
          <button
            className="btn secondary"
            onClick={async () => {
              try {
                const r = await request("/documents/" + d.id);
                window.open(r.url, "_blank", "noopener,noreferrer");
              } catch (e) {
                setMessage(e.message);
              }
            }}
          >
            Open
          </button>
        </div>
      ))}
    </section>
  );
}

function AuditView() {
  const request = useOrgApi();
  const [rows, setRows] = useState(null),
    [error, setError] = useState("");
  const load = useCallback(
    () =>
      request("/resources/audit_events?limit=100")
        .then((r) => setRows(r.data))
        .catch((e) => setError(e.message)),
    [request],
  );
  useEffect(() => {
    load();
  }, [load]);
  return (
    <>
      <Header
        title="Audit trail"
        description="Business changes and platform support access recorded for this organization."
      />
      <State
        loading={!rows && !error}
        error={error}
        retry={load}
        empty={!rows?.length ? "No changes have been recorded yet." : false}
      >
        <section className="panel livePanel">
          {rows?.map((row) => (
            <div className="liveMetric" key={row.id}>
              <span>
                <b>{row.action}</b>
                <small>
                  {row.entity_type || "Organization"} ·{" "}
                  {row.actor_id || "Server action"}
                  {row.details?.reason ? " · " + row.details.reason : ""}
                </small>
              </span>
              <small>{new Date(row.created_at).toLocaleString()}</small>
            </div>
          ))}
        </section>
      </State>
    </>
  );
}

function PlatformRequests() {
  const [rows, setRows] = useState(null),
    [error, setError] = useState("");
  useEffect(() => {
    api("/platform/demo-requests")
      .then((r) => setRows(r.requests))
      .catch((e) => setError(e.message));
  }, []);
  return (
    <section className="panel livePanel">
      <h2>Demo requests</h2>
      {error ? (
        <p className="liveError" role="alert">
          {error}
        </p>
      ) : !rows ? (
        <p role="status">Loading requests…</p>
      ) : !rows.length ? (
        <p>No demo requests yet.</p>
      ) : (
        rows.map((row) => (
          <article className="liveMetric" key={row.id}>
            <span>
              <b>
                {row.name} · {row.company}
              </b>
              <small>
                {row.email} · {new Date(row.created_at).toLocaleDateString()}
              </small>
              <p>{row.message}</p>
            </span>
          </article>
        ))
      )}
    </section>
  );
}
