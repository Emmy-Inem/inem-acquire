import { CompanyPhoto, CompanyDocuments } from "./CompanyAssets";
import { useDialogFocus } from "./useDialogFocus";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useMediaQuery } from "../useMediaQuery";
import {
  Link,
  NavLink,
  Navigate,
  useNavigate,
  useLocation,
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
import WorkspaceSearch from "./WorkspaceSearch";
import AccountSettings from "./AccountSettings";
import WorkspaceGuide from "./WorkspaceGuide";
import { toLocalDateTime } from "./dateTime";
import { assignableRoles, canManageMember } from "../../shared/permissions";

const SalesAdvisor = React.lazy(() => import("./SalesAdvisor"));
const ProspectResearch = React.lazy(() => import("./ProspectResearch"));

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
      ["status", "Offer status", "select", ["active", "archived"]],
      ["currency", "Currency", "currency"],
    ],
    columns: ["name", "description", "price", "currency", "status"],
  },
  icps: {
    title: "Ideal customers",
    description:
      "Describe your target industries, locations and buyer roles. These profiles guide research; contacts are the actual people or business inboxes you save.",
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
      ["email", "Business email", "email"],
      ["phone", "Business phone", "tel"],
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
      "People and business inboxes you can contact. Link each contact to a saved business, then organize it into outreach lists.",
    fields: [
      ["full_name", "Full name or business inbox", "text", true],
      ["phone", "Phone number", "tel"],
      ["email", "Email", "email"],
      ["job_title", "Job title", "text"],
      ["notes", "Notes", "textarea"],
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
    description:
      "Group saved contacts into an outreach audience. Add a list, then choose Contacts to select its members.",
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
      ["assigned_to", "Assigned to", "team"],
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
      [
        "report_module",
        "Report data",
        "select",
        ["prospects", "contacts", "deals", "tasks"],
      ],
      ["report_columns", "Columns to include", "report_columns"],
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
      api(path, {
        ...options,
        organizationId: organization?.id,
        supportSessionId: organization?.support?.id,
      }),
    [organization?.id, organization?.support?.id],
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
    workspaceBase,
    logout,
    refresh,
  } = useAuth();
  const params = useParams(),
    navigate = useNavigate();
  const section = (params["*"] || "dashboard").split("/")[0];
  const routeLocation = useLocation();
  const [mobile, setMobile] = useState(false);
  const [shellError, setShellError] = useState("");
  const [endingSupport, setEndingSupport] = useState(false);
  const compact = useMediaQuery("(max-width: 820px)");
  const navigationRef = useRef(null);
  useDialogFocus(mobile && compact, () => setMobile(false), navigationRef);
  useEffect(() => {
    setMobile(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [section, compact, organization?.id]);
  const role = organization?.role;
  const support = organization?.support;
  const write = !!support || canRole(role, "write"),
    approve = canRole(role, "approve"),
    manage = canRole(role, "manage");
  if (section === "admin") return <Navigate to="/platform" replace />;
  if (
    support &&
    ["settings", "team", "integrations", "billing", "audit"].includes(section)
  )
    return <Navigate to={workspaceBase + "/dashboard"} replace />;
  if (!organization)
    return session.platformOwner ? (
      <Navigate to="/platform" replace />
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
        {support ? (
          <div className="workspace liveWorkspaceSelect">
            <Building2 size={20} />
            <strong>{organization.name}</strong>
          </div>
        ) : (
          <>
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
            <Link className="createWorkspaceLink" to="/onboarding/welcome">
              <Plus size={16} />
              Create organization
            </Link>
          </>
        )}
        {session.platformOwner && (
          <Link className="createWorkspaceLink platformShortcut" to="/platform">
            <ShieldCheck size={16} />
            Platform console
          </Link>
        )}
        <nav>
          {navigation.map(([group, items]) => (
            <div className="navGroup" key={group}>
              <small>{group}</small>
              {items.map(([label, path, Icon]) => (
                <NavLink
                  key={path}
                  to={workspaceBase + "/" + path}
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
            {manage && (
              <NavLink to="/app/audit">
                <ShieldCheck />
                Audit trail
              </NavLink>
            )}
            {!support && (
              <>
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
              </>
            )}
            <NavLink to={workspaceBase + "/guide"}>
              <Lightbulb />
              Workspace guide
            </NavLink>
          </div>
        </nav>
        <div className="sideBottom">
          {!support && (
            <NavLink to="/app/settings">
              <Settings /> Settings
            </NavLink>
          )}
          <Link className="workspaceLegalLink" to="/data-sources">
            Legal and data terms
          </Link>
          <div className="userChip">
            <span className="avatar">{initials}</span>
            <span>
              <b>{session.profile.full_name || session.user.email}</b>
              <small>
                {support ? "Support access" : "Organization " + titleCase(role)}
              </small>
            </span>
            <button
              aria-label="Sign out"
              onClick={() =>
                logout()
                  .then(() => navigate("/login"))
                  .catch((e) => setShellError(e.message))
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
          <WorkspaceSearch />
          <div className="workspaceTopActions">
            <Link className="workspaceHelp" to={workspaceBase + "/guide"}>
              <Lightbulb size={18} />
              <span>Guide</span>
            </Link>
            {!support && (
              <Link
                className="workspaceAccount"
                to="/app/settings"
                aria-label="Your account and settings"
              >
                <span className="avatar">{initials}</span>
              </Link>
            )}
          </div>
        </header>
        {shellError && (
          <p className="liveError" role="alert">
            {shellError}
          </p>
        )}
        {organization?.support && (
          <div className="supportBanner" role="status">
            <ShieldCheck size={17} />
            <span>
              Support workspace · {organization.name} · expires{" "}
              {new Date(organization.support.expires_at).toLocaleTimeString()}
              <small>
                {organization.support.reason} · Organization administration and
                approvals are restricted.
              </small>
            </span>
            <button
              disabled={endingSupport}
              onClick={async () => {
                setEndingSupport(true);
                setShellError("");
                try {
                  await api("/platform/support/" + organization.id, {
                    method: "DELETE",
                    body: {},
                  });
                  await refresh();
                  navigate("/platform");
                } catch (e) {
                  setShellError(e.message);
                } finally {
                  setEndingSupport(false);
                }
              }}
            >
              End support session
            </button>
          </div>
        )}
        <main
          className="appMain"
          key={section + organization?.id + routeLocation.search}
        >
          {section === "dashboard" || section === "analytics" ? (
            <Overview analytics={section === "analytics"} {...props} />
          ) : section === "tasks" ? (
            <TasksPage {...props} />
          ) : section === "diagnosis" ? (
            <DiagnosisPage {...props} />
          ) : section === "pipeline" ? (
            <PipelinePage {...props} />
          ) : section === "settings" ? (
            <>
              <Header
                title="Settings"
                description="Your account and organization preferences."
              />
              <AccountSettings />
              <CompanyPage {...props} embedded />
            </>
          ) : section === "guide" ? (
            <WorkspaceGuide />
          ) : section === "company" ? (
            <CompanyPage {...props} />
          ) : section === "audit" ? (
            <AuditView />
          ) : section === "team" ? (
            <TeamPage {...props} />
          ) : section === "integrations" || section === "billing" ? (
            <ConnectionsPage section={section} {...props} />
          ) : section === "inbox" ? (
            <InboxView />
          ) : section === "ai-advisor" ? (
            <React.Suspense
              fallback={
                <p className="liveState" role="status">
                  Opening Sales advisor…
                </p>
              }
            >
              <SalesAdvisor />
            </React.Suspense>
          ) : modules[section === "ideal-customers" ? "icps" : section] ? (
            <ResourcePage
              resource={section === "ideal-customers" ? "icps" : section}
              {...props}
            />
          ) : (
            <div className="liveState">
              <h1>Page not found</h1>
              <Link to={workspaceBase + "/dashboard"}>Return to overview</Link>
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
function RecordForm({ resource, record, initialValues, onClose, onSaved }) {
  const config = modules[resource],
    request = useOrgApi();
  const [values, setValues] = useState(() => {
      const v = { ...(record || initialValues) };
      if (resource === "icps") Object.assign(v, record?.criteria || {});
      if (resource === "reports")
        v.description = record?.definition?.description || "";
      if (resource === "reports") {
        v.report_module = record?.definition?.resource || "prospects";
        v.report_columns = record?.definition?.columns || "";
      }
      if (v.due_at) v.due_at = toLocalDateTime(v.due_at);
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
            .filter((f) =>
              ["offers", "prospects", "deals", "team"].includes(f[2]),
            )
            .map((f) => f[2]),
        ),
      ].map(async (table) => [
        table,
        table === "team"
          ? (await request("/team", { signal: controller.signal })).members.map(
              (m) => ({
                id: m.user_id,
                name: m.profiles?.full_name || "Team member",
              }),
            )
          : await readAllRecords(request, table, { signal: controller.signal }),
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
            {record ? "Edit" : "Add"}{" "}
            {resource === "icps"
              ? "ideal customer profile"
              : resource.slice(0, -1)}
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
                    "team",
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
                data.definition = {
                  description: data.description || "",
                  resource: data.report_module || "prospects",
                  columns: data.report_columns || "",
                };
                delete data.report_module;
                delete data.report_columns;
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
              {type === "report_columns" ? (
                <select
                  multiple
                  size={5}
                  aria-label={label}
                  value={
                    values.report_columns
                      ? values.report_columns.split(",")
                      : {
                          prospects: [
                            "name",
                            "email",
                            "phone",
                            "industry",
                            "country",
                          ],
                          contacts: [
                            "full_name",
                            "email",
                            "phone",
                            "job_title",
                            "consent_status",
                          ],
                          deals: [
                            "title",
                            "value",
                            "currency",
                            "stage",
                            "expected_close",
                          ],
                          tasks: ["title", "status", "priority", "due_at"],
                        }[values.report_module || "prospects"]
                  }
                  onChange={(e) =>
                    setValues({
                      ...values,
                      report_columns: [...e.target.selectedOptions]
                        .map((o) => o.value)
                        .join(","),
                    })
                  }
                >
                  {{
                    prospects: [
                      "name",
                      "email",
                      "phone",
                      "industry",
                      "country",
                    ],
                    contacts: [
                      "full_name",
                      "email",
                      "phone",
                      "job_title",
                      "consent_status",
                    ],
                    deals: [
                      "title",
                      "value",
                      "currency",
                      "stage",
                      "expected_close",
                    ],
                    tasks: ["title", "status", "priority", "due_at"],
                  }[values.report_module || "prospects"].map((field) => (
                    <option key={field} value={field}>
                      {titleCase(field)}
                    </option>
                  ))}
                </select>
              ) : type === "textarea" ? (
                <textarea
                  autoFocus={key === config.fields[0][0]}
                  required={requiredOrOptions === true}
                  maxLength={20000}
                  value={values[key] || ""}
                  onChange={(e) =>
                    setValues({
                      ...values,
                      [key]: e.target.value,
                      ...(key === "report_module"
                        ? { report_columns: "" }
                        : {}),
                    })
                  }
                />
              ) : type === "select" ? (
                <select
                  aria-label={label}
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
              ) : ["offers", "prospects", "deals", "team"].includes(type) ? (
                <select
                  aria-label={label}
                  disabled={!references[type]}
                  value={values[key] || ""}
                  onChange={(e) =>
                    setValues({ ...values, [key]: e.target.value })
                  }
                >
                  <option value="">
                    {references[type] ? "Not linked" : "Loading choices…"}
                  </option>
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
  const canResearch = resource === "prospects" && write;
  const [prospectView, setProspectView] = useState(() =>
    new URLSearchParams(window.location.search).has("search")
      ? "saved"
      : "research",
  );
  const showRecords = !canResearch || prospectView === "saved";
  const [rows, setRows] = useState([]),
    [count, setCount] = useState(0),
    [offset, setOffset] = useState(0),
    [search, setSearch] = useState(
      () => new URLSearchParams(window.location.search).get("search") || "",
    ),
    [query, setQuery] = useState(
      () => new URLSearchParams(window.location.search).get("search") || "",
    ),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [editing, setEditing] = useState(null),
    [relatedDraft, setRelatedDraft] = useState(null),
    [notice, setNotice] = useState(""),
    [deleting, setDeleting] = useState(""),
    [selected, setSelected] = useState(""),
    [actionPending, setActionPending] = useState(false);
  const loadVersion = useRef(0);
  const load = useCallback(async () => {
    const version = ++loadVersion.current;
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
      if (version === loadVersion.current) {
        setRows(r.data);
        setCount(r.count);
      }
    } catch (e) {
      if (version === loadVersion.current) setError(e.message);
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  }, [request, resource, offset, query]);
  useEffect(() => {
    load();
    return () => {
      loadVersion.current++;
    };
  }, [load]);
  const action = async (id, type) => {
    if (actionPending) return;
    setActionPending(true);
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
    } finally {
      setActionPending(false);
    }
  };
  const exportData = async (report) => {
    const target = report?.definition?.resource || resource;
    const fields = report?.definition?.columns;
    try {
      const response = await fetch(
        "/api/export/" +
          target +
          (fields ? "?fields=" + encodeURIComponent(fields) : ""),
        {
          credentials: "same-origin",
          headers: {
            "x-organization-id": organization.id,
            ...(organization.support
              ? { "x-support-session-id": organization.support.id }
              : {}),
          },
        },
      );
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error);
      }
      const objectUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = (report?.name || target) + ".csv";
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
              {resource === "prospects" ? "Export saved" : "Export"}
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
      {canResearch && (
        <>
          <div
            className="leadViewSwitch"
            aria-label="Prospect views"
            role="group"
          >
            <button
              aria-pressed={prospectView === "research"}
              onClick={() => setProspectView("research")}
            >
              Discover leads
            </button>
            <button
              aria-pressed={prospectView === "saved"}
              onClick={() => setProspectView("saved")}
            >
              Saved prospects <span>{count}</span>
            </button>
          </div>
          <div hidden={showRecords}>
            <React.Suspense
              fallback={
                <p className="liveState" role="status">
                  Opening Discovery…
                </p>
              }
            >
              <ProspectResearch onSaved={load} />
            </React.Suspense>
          </div>
        </>
      )}
      <div className="workflowHelp">
        <p>
          {
            {
              icps: "Customer profiles describe the businesses and buyer roles you want to target. They guide Discovery; they are not a list of people.",
              contacts:
                "Contacts are people or business inboxes. Lists organize those contacts into an audience; deals track a qualified sales opportunity.",
              lists:
                "A list is a reusable audience of contacts. Open Contacts on a list to add or remove people, then use it when preparing outreach.",
              deals:
                "A deal is a qualified sales opportunity with a value and stage. Link it to a saved business, then schedule a task for its next step.",
              prospects:
                "Discovery finds businesses. Save a business, then create its contact or a qualified deal from Saved prospects.",
              offers:
                "An offer describes the result you sell and its price. Link a customer profile to the offer to focus your research.",
              campaigns:
                "Prepare a message, select opted-in contacts, then request approval. Sending requires a connected email service.",
            }[resource]
          }
        </p>
      </div>
      <div hidden={!showRecords}>
        {canResearch && (
          <div className="resourceTools">
            <details>
              <summary>Import companies from CSV</summary>
              <CsvImport onImported={load} />
            </details>
          </div>
        )}
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
            <p className="tableHint resourceTableHint">
              Swipe across to see all details and actions.
            </p>
            <div
              className="tableScroll resourceTableScroll"
              role="region"
              aria-label={config.title + " records"}
              tabIndex={0}
            >
              <table className="resourceTable">
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
                        <td key={column} data-label={titleCase(column)}>
                          {display(row[column], column)}
                        </td>
                      ))}
                      <td className="resourceActionCell">
                        <div className="liveRowActions">
                          {write && (
                            <button onClick={() => setEditing(row)}>
                              Edit
                            </button>
                          )}
                          {approve &&
                            (resource !== "campaigns" ||
                              row.status === "draft") && (
                              <button onClick={() => setDeleting(row.id)}>
                                Delete
                              </button>
                            )}
                          {resource === "reports" && approve && (
                            <button onClick={() => exportData(row)}>
                              Download report
                            </button>
                          )}
                          {resource === "prospects" && write && (
                            <>
                              <button
                                onClick={() =>
                                  setRelatedDraft({
                                    resource: "contacts",
                                    values: {
                                      full_name: row.name + " team",
                                      prospect_id: row.id,
                                      email: row.email || null,
                                      phone: row.phone || null,
                                      consent_status: "unknown",
                                    },
                                  })
                                }
                              >
                                Create contact
                              </button>
                              <button
                                onClick={() =>
                                  setRelatedDraft({
                                    resource: "deals",
                                    values: {
                                      title: row.name + " opportunity",
                                      prospect_id: row.id,
                                      value: 0,
                                      currency: "NGN",
                                      stage: "qualified",
                                    },
                                  })
                                }
                              >
                                Create deal
                              </button>
                            </>
                          )}
                          {resource === "campaigns" && (
                            <>
                              {
                                <button onClick={() => setSelected(row.id)}>
                                  Recipients
                                </button>
                              }
                              {approve && row.status === "draft" && (
                                <button
                                  disabled={actionPending}
                                  onClick={() => action(row.id, "approve")}
                                >
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
                          {resource === "lists" && (
                            <button onClick={() => setSelected(row.id)}>
                              Contacts
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
            <span>
              {count} {count === 1 ? "record" : "records"}
            </span>
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
      </div>
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
      {relatedDraft && (
        <RecordForm
          resource={relatedDraft.resource}
          initialValues={relatedDraft.values}
          onClose={() => setRelatedDraft(null)}
          onSaved={() => {
            setNotice(
              relatedDraft.resource === "contacts"
                ? "Contact saved. Find it on the Contacts page, then add it to an outreach list."
                : "Deal created. Find it in Deals or Pipeline and schedule its next follow-up.",
            );
            setRelatedDraft(null);
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
              if (rows.length === 1 && offset > 0)
                setOffset(Math.max(0, offset - 25));
              else load();
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
            editable={
              write &&
              (resource === "lists" ||
                rows.find((row) => row.id === selected)?.status === "draft")
            }
            canRemove={resource === "campaigns" ? write : approve}
            onClose={() => setSelected("")}
            onSaved={() => setNotice("Contact list updated.")}
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
async function readAllRecords(request, resource, options = {}) {
  let rows = [],
    offset = 0;
  while (true) {
    const page = await request(
      `/resources/${resource}?limit=100&offset=${offset}`,
      options,
    );
    rows = rows.concat(page.data);
    if (rows.length >= page.count || !page.data.length) return rows;
    offset += 100;
  }
}
function ContactPicker({
  resource,
  parentId,
  editable,
  canRemove,
  onClose,
  onSaved,
}) {
  useDialogFocus(true, onClose);
  const request = useOrgApi();
  const [contacts, setContacts] = useState([]),
    [id, setId] = useState(""),
    [error, setError] = useState(""),
    [members, setMembers] = useState([]),
    [search, setSearch] = useState(""),
    [pending, setPending] = useState(false),
    [loading, setLoading] = useState(true);
  const child = resource === "lists" ? "list_contacts" : "campaign_recipients";
  const parentField = resource === "lists" ? "list_id" : "campaign_id";
  const load = useCallback(async () => {
    const [people, membership] = await Promise.all([
      readAllRecords(request, "contacts"),
      readAllRecords(request, child),
    ]);
    setContacts(people);
    setMembers(membership.filter((row) => row[parentField] === parentId));
    setError("");
  }, [request, child, parentField, parentId]);
  useEffect(() => {
    load()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [load]);
  return (
    <div className="liveModalBackdrop">
      <section
        className="panel liveModal"
        role="dialog"
        aria-modal="true"
        aria-label={
          resource === "lists" ? "List contacts" : "Campaign recipients"
        }
      >
        <header>
          <h2>
            {resource === "lists" ? "List contacts" : "Campaign recipients"}
          </h2>
          <button onClick={onClose} aria-label="Close">
            <X />
          </button>
        </header>
        {error && (
          <p className="liveError" role="alert">
            {error}
          </p>
        )}
        {loading ? (
          <p role="status">Loading contacts…</p>
        ) : (
          <div className="recipientReview">
            {!members.length ? (
              <p>No contacts added yet.</p>
            ) : (
              members.map((member) => {
                const person = contacts.find((c) => c.id === member.contact_id);
                return (
                  <article key={member.id}>
                    <div>
                      <strong>
                        {person?.full_name || "Contact unavailable"}
                      </strong>
                      <p>
                        {person?.email || "No email"} ·{" "}
                        {titleCase(
                          member.status || person?.consent_status || "unknown",
                        )}
                      </p>
                    </div>
                    {editable && canRemove && (
                      <button
                        className="btn secondary"
                        disabled={pending}
                        onClick={async () => {
                          setPending(true);
                          setError("");
                          try {
                            await request(
                              "/resources/" + child + "/" + member.id,
                              { method: "DELETE" },
                            );
                            await load();
                            onSaved();
                          } catch (e) {
                            setError(e.message);
                          } finally {
                            setPending(false);
                          }
                        }}
                      >
                        Remove
                      </button>
                    )}
                  </article>
                );
              })
            )}
          </div>
        )}
        {editable && !loading && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setPending(true);
              setError("");
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
                setId("");
                await load();
              } catch (e) {
                setError(e.message);
              } finally {
                setPending(false);
              }
            }}
          >
            <label className="field">
              <span>Find a contact</span>
              <input
                type="search"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setId("");
                }}
                placeholder="Search name or email"
              />
            </label>
            <label className="field">
              <span>Contact</span>
              <select
                required
                aria-label="Contact"
                value={id}
                onChange={(e) => setId(e.target.value)}
              >
                <option value="">Select a contact</option>
                {contacts
                  .filter(
                    (c) =>
                      !members.some((m) => m.contact_id === c.id) &&
                      (!search ||
                        [c.full_name, c.email]
                          .join(" ")
                          .toLowerCase()
                          .includes(search.toLowerCase())),
                  )
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name} · {c.email || "No email"} ·{" "}
                      {titleCase(c.consent_status)}
                    </option>
                  ))}
              </select>
            </label>
            <button className="btn primary" disabled={pending || !id}>
              {pending ? "Saving…" : "Add contact"}
            </button>
          </form>
        )}
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
  const { workspaceBase } = useAuth();
  const request = useOrgApi();
  const [data, setData] = useState(null),
    [error, setError] = useState("");
  const load = useCallback(
    () =>
      request("/dashboard")
        .then((result) => {
          setData(result);
          setError("");
        })
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
        <Link className="btn primary" to={workspaceBase + "/ai-advisor"}>
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
            <Link to={workspaceBase + "/pipeline"}>
              View pipeline <ArrowRight size={14} />
            </Link>
          </article>
          <article className="panel livePanel">
            <h2>Next actions</h2>
            {!(r.tasks || []).some((t) => t.status === "open") ? (
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
                          try {
                            await request("/resources/tasks/" + t.id, {
                              method: "PATCH",
                              body: { status: "done" },
                            });
                            load();
                          } catch (e) {
                            setError(e.message);
                          }
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
            <Link to={workspaceBase + "/tasks"}>
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
  const { workspaceBase } = useAuth();
  const request = useOrgApi(),
    [rows, setRows] = useState(null),
    [error, setError] = useState("");
  const load = useCallback(
    () =>
      readAllRecords(request, "deals")
        .then((rows) => {
          setRows(rows);
          setError("");
        })
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
        <Link className="btn primary" to={workspaceBase + "/deals"}>
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
  const { workspaceBase } = useAuth();
  const request = useOrgApi(),
    [rows, setRows] = useState(null),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const load = useCallback(
    () =>
      request("/resources/diagnoses")
        .then((r) => {
          setRows(r.data);
          setError("");
        })
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
                      workspaceBase +
                      "/" +
                      (f.source === "icps" ? "ideal-customers" : f.source)
                    }
                  >
                    Review {f.source === "icps" ? "ideal customers" : f.source}
                    <ArrowRight size={14} />
                  </Link>
                </article>
              ))}
            </section>
            {!!latest.evidence?.gemini_steps?.length && (
              <article className="panel livePanel">
                <h2>Suggested next steps</h2>
                <p>Suggestions based on the types of findings above.</p>
                <ol>
                  {latest.evidence.gemini_steps.map((step, index) => (
                    <li key={index}>{step}</li>
                  ))}
                </ol>
              </article>
            )}
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
function TasksPage({ write, approve }) {
  const request = useOrgApi(),
    { workspaceBase } = useAuth();
  const [rows, setRows] = useState([]),
    [deals, setDeals] = useState([]),
    [filter, setFilter] = useState("open"),
    [search, setSearch] = useState(""),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [editing, setEditing] = useState(null),
    [busy, setBusy] = useState(""),
    [deleting, setDeleting] = useState(null);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tasks, opportunities] = await Promise.all([
        readAllRecords(request, "tasks"),
        readAllRecords(request, "deals"),
      ]);
      setRows(tasks);
      setDeals(opportunities);
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [request]);
  useEffect(() => {
    load();
  }, [load]);
  const today = new Date().toDateString(),
    now = Date.now();
  const matches = {
    all: () => true,
    open: (t) => t.status !== "done",
    overdue: (t) =>
      t.status !== "done" && t.due_at && new Date(t.due_at).getTime() < now,
    today: (t) =>
      t.status !== "done" &&
      t.due_at &&
      new Date(t.due_at).toDateString() === today,
    done: (t) => t.status === "done",
  };
  const shown = rows
    .filter(matches[filter])
    .filter((t) => t.title.toLowerCase().includes(search.toLowerCase()))
    .sort(
      (a, b) =>
        Number(a.status === "done") - Number(b.status === "done") ||
        new Date(a.due_at || "2099-01-01") - new Date(b.due_at || "2099-01-01"),
    );
  return (
    <>
      <Header
        title="Tasks & follow-ups"
        description="Every opportunity needs a next step. Set a due date, assign an owner and keep follow-ups moving."
      >
        {write && (
          <button
            className="btn primary"
            onClick={() => setEditing({ new: true })}
          >
            <Plus size={16} />
            Add task
          </button>
        )}
      </Header>
      <div className="taskFilters" role="group" aria-label="Task views">
        {[
          ["open", "Open"],
          ["today", "Due today"],
          ["overdue", "Overdue"],
          ["done", "Completed"],
          ["all", "All tasks"],
        ].map(([id, label]) => (
          <button
            key={id}
            aria-pressed={filter === id}
            onClick={() => setFilter(id)}
          >
            {label}
            <span>{rows.filter(matches[id]).length}</span>
          </button>
        ))}
      </div>
      <label className="field taskSearch">
        <span>Find a task</span>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search follow-ups…"
        />
      </label>
      {error && (
        <p role="alert" className="liveError">
          {error}
        </p>
      )}
      <State loading={loading} error={error} retry={load}>
        {shown.length ? (
          <div className="taskBoard">
            {shown.map((task) => {
              const deal = deals.find((d) => d.id === task.deal_id),
                overdue = matches.overdue(task);
              return (
                <article
                  className={
                    "panel taskItem " +
                    (task.status === "done" ? "completed" : "")
                  }
                  key={task.id}
                >
                  {write && (
                    <button
                      className="taskComplete"
                      disabled={!!busy}
                      aria-label={
                        (task.status === "done" ? "Reopen " : "Complete ") +
                        task.title
                      }
                      onClick={async () => {
                        setBusy(task.id);
                        try {
                          await request("/resources/tasks/" + task.id, {
                            method: "PATCH",
                            body: {
                              status: task.status === "done" ? "open" : "done",
                            },
                          });
                          await load();
                        } catch (e) {
                          setError(e.message);
                        } finally {
                          setBusy("");
                        }
                      }}
                    >
                      {task.status === "done" ? <Check size={19} /> : <span />}
                    </button>
                  )}
                  <div className="taskBody">
                    <h2>{task.title}</h2>
                    <p className={overdue ? "taskOverdue" : ""}>
                      {task.due_at
                        ? (overdue ? "Overdue · " : "Due ") +
                          new Date(task.due_at).toLocaleString([], {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })
                        : "No due date — add one to keep this follow-up visible."}
                    </p>
                    <small>
                      {titleCase(task.priority)} priority
                      {deal ? " · " + deal.title : ""}
                    </small>
                  </div>
                  <div className="assetActions">
                    {write && (
                      <button
                        className="btn secondary"
                        onClick={() => setEditing(task)}
                      >
                        Edit
                      </button>
                    )}
                    {approve && (
                      <button
                        className="btn secondary"
                        onClick={() => setDeleting(task)}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <section className="panel livePanel taskEmpty">
            <h2>
              {filter === "overdue"
                ? "No overdue follow-ups"
                : filter === "today"
                  ? "Nothing due today"
                  : filter === "done"
                    ? "No completed tasks yet"
                    : "Your next step starts here"}
            </h2>
            <p>
              {filter === "overdue"
                ? "Keep your open tasks dated so opportunities stay on track."
                : "Try a different view, or add a specific action such as calling a prospect or sending a proposal."}
            </p>
            {write && (
              <button
                className="btn primary"
                onClick={() => setEditing({ new: true })}
              >
                Add a follow-up
              </button>
            )}
            <Link to={workspaceBase + "/deals"}>
              Review deals <ArrowRight size={14} />
            </Link>
          </section>
        )}
      </State>
      {editing && (
        <RecordForm
          resource="tasks"
          record={editing.new ? null : editing}
          initialValues={
            editing.new ? { priority: "medium", status: "open" } : undefined
          }
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
      {deleting && (
        <Confirm
          title="Delete this task?"
          detail={deleting.title}
          onCancel={() => setDeleting(null)}
          onConfirm={async () => {
            try {
              await request("/resources/tasks/" + deleting.id, {
                method: "DELETE",
              });
              setDeleting(null);
              load();
            } catch (e) {
              setError(e.message);
              setDeleting(null);
            }
          }}
        />
      )}
    </>
  );
}

function CompanyPage({ manage, write, embedded = false }) {
  const { organization, refresh } = useAuth();
  const request = useOrgApi(),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [pending, setPending] = useState(false);
  return (
    <>
      {!embedded && (
        <Header
          title="Company settings"
          description="Keep the company context behind your acquisition process accurate."
        />
      )}
      <CompanyPhoto manage={manage} />
      <form
        className="panel settingsForm"
        onSubmit={async (e) => {
          e.preventDefault();
          setPending(true);
          setError("");
          setNotice("");
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
          } finally {
            setPending(false);
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
        {manage && (
          <button className="btn primary" disabled={pending}>
            {pending ? "Saving…" : "Save company"}
          </button>
        )}
      </form>
      <CompanyDocuments manage={write} />
    </>
  );
}
function TeamPage({ manage }) {
  const { organization } = useAuth();
  const memberManagement = assignableRoles(organization?.role).length > 0;
  const roles = assignableRoles(organization?.role);
  const request = useOrgApi(),
    [data, setData] = useState(null),
    [error, setError] = useState(""),
    [invite, setInvite] = useState(""),
    [pending, setPending] = useState(false);
  const load = useCallback(
    () =>
      request("/team")
        .then((result) => {
          setData(result);
          setError("");
        })
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
              {memberManagement &&
              canManageMember(organization?.role, m.role) ? (
                <select
                  aria-label={
                    "Role for " + (m.profiles?.full_name || m.user_id)
                  }
                  value={m.role}
                  disabled={pending}
                  onChange={async (e) => {
                    setPending(true);
                    setError("");
                    try {
                      await request("/team/" + m.user_id, {
                        method: "PATCH",
                        body: { role: e.target.value },
                      });
                      load();
                    } catch (e) {
                      setError(e.message);
                    } finally {
                      setPending(false);
                    }
                  }}
                >
                  {roles.map((r) => (
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
      {memberManagement &&
        !!data?.invitations?.filter(
          (i) => !i.accepted_at && new Date(i.expires_at) > new Date(),
        ).length && (
          <section className="panel livePanel">
            <h2>Pending invitations</h2>
            {data.invitations
              .filter(
                (i) => !i.accepted_at && new Date(i.expires_at) > new Date(),
              )
              .map((i) => (
                <div className="companyFile" key={i.id}>
                  <span>
                    {i.email} · {titleCase(i.role)}
                  </span>
                  {(i.role !== "admin" || organization.role === "owner") && (
                    <button
                      className="btn secondary"
                      disabled={pending}
                      onClick={async () => {
                        setPending(true);
                        try {
                          await request("/invitations/" + i.id, {
                            method: "DELETE",
                          });
                          await load();
                        } catch (e) {
                          setError(e.message);
                        } finally {
                          setPending(false);
                        }
                      }}
                    >
                      Revoke invitation
                    </button>
                  )}
                </div>
              ))}
          </section>
        )}
      {memberManagement && (
        <form
          className="panel livePanel"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setPending(true);
            setError("");
            setInvite("");
            try {
              const result = await request("/invitations", {
                method: "POST",
                body: Object.fromEntries(f),
              });
              setInvite(result.inviteUrl);
              load();
            } catch (e) {
              setError(e.message);
            } finally {
              setPending(false);
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
              {roles
                .slice()
                .reverse()
                .map((r) => (
                  <option key={r} value={r}>
                    {titleCase(r)}
                  </option>
                ))}
            </select>
          </label>
          <button className="btn primary" disabled={pending}>
            {pending ? "Saving…" : "Create invitation link"}
          </button>
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
function ConnectionsPage({ section, manage }) {
  const request = useOrgApi(),
    [data, setData] = useState(null),
    [error, setError] = useState("");
  const load = useCallback(
    () =>
      Promise.all([
        request("/integrations"),
        section === "billing"
          ? request("/resources/billing_accounts")
          : Promise.resolve(null),
        request("/research-usage"),
      ])
        .then(([providers, accounts, usage]) => {
          setData({ ...providers, accounts: accounts?.data, usage });
          setError("");
        })
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
              <h2>{titleCase(data?.accounts?.[0]?.plan || "Starter")}</h2>
              <p>
                <strong>{data?.usage?.remaining ?? "—"}</strong> of{" "}
                {data?.usage?.limit ?? "—"} research credits remaining this
                month.
              </p>
              <p>
                One credit researches one business website. Browsing the shared
                catalog is free of research charges. Credits reset each calendar
                month.
              </p>
              <p>
                Status:{" "}
                {titleCase(data?.accounts?.[0]?.status || "Not configured")}
              </p>
              <p>
                {data?.providers.find((p) => p.provider === "stripe")
                  ?.configured
                  ? "Manage your subscription securely with Stripe."
                  : "Online billing is not connected yet. Your workspace records are available; no payment will be taken here."}
              </p>
              {manage &&
                data?.providers.find((p) => p.provider === "stripe")
                  ?.configured && (
                  <button
                    className="btn primary"
                    onClick={async () => {
                      try {
                        const existing = !!data?.accounts?.[0]?.customer_id;
                        const r = await request(
                          existing ? "/billing/portal" : "/billing/checkout",
                          {
                            method: "POST",
                            body: existing ? {} : { plan: "growth" },
                          },
                        );
                        window.location.assign(r.url);
                      } catch (e) {
                        setError(e.message);
                      }
                    }}
                  >
                    {data?.accounts?.[0]?.customer_id
                      ? "Manage subscription"
                      : "Upgrade to Growth"}
                  </button>
                )}
            </>
          ) : (
            data?.providers.map((p) => (
              <div className="liveMetric" key={p.provider}>
                <span>
                  <b>{p.name}</b>
                  <small>
                    {p.provider === "gemini"
                      ? p.configured
                        ? "AI assistance is connected for public business research, website recovery and workspace advice. Only files you attach are included in an advisor answer."
                        : "Add a Gemini API key to enable prospect ranking and sales suggestions."
                      : p.configured
                        ? "Connected and available to your workspace"
                        : p.provider === "apollo"
                          ? "Connect Apollo to search for new companies. Manual records and CSV import work now."
                          : p.provider === "resend"
                            ? "Campaign delivery needs a verified sender. This is separate from account verification emails."
                            : "Connect Stripe to activate online subscriptions."}
                  </small>
                </span>
                <strong>
                  {p.configured
                    ? p.provider === "gemini"
                      ? "Key configured"
                      : "Available"
                    : "Not connected"}
                </strong>
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
        .then((r) => {
          setRows(r.data);
          setError("");
        })
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

function AuditView() {
  const request = useOrgApi();
  const [rows, setRows] = useState(null),
    [error, setError] = useState("");
  const load = useCallback(
    () =>
      request("/resources/audit_events?limit=100")
        .then((r) => {
          setRows(r.data);
          setError("");
        })
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
