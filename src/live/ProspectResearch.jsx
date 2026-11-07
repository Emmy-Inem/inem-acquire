import {
  ArrowRight,
  BookmarkPlus,
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Globe2,
  LoaderCircle,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useEffect, useId, useRef, useState } from "react";
import { industries } from "../../shared/research";
import { api } from "./api";
import { useAuth } from "./AuthContext";

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

async function streamEnrichment(organization, websites, signal, onRow) {
  const response = await fetch("/api/prospects/enrich", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "x-organization-id": organization.id,
      ...(organization.support
        ? { "x-support-session-id": organization.support.id }
        : {}),
    },
    body: JSON.stringify({ websites }),
    signal,
  });
  if (!response.ok || !response.body) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error || "Website research could not start.");
  }
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines) if (line) onRow(JSON.parse(line));
    }
    if (buffer.trim()) onRow(JSON.parse(buffer));
  } finally {
    reader.releaseLock();
  }
}

function rowKey(row) {
  return row.id || row.source_url;
}

function contactInfo(row, checked) {
  const pages = checked?.contacts || [];
  return {
    emails: unique([row.email, ...pages.flatMap((page) => page.emails)]),
    phones: unique([row.phone, ...pages.flatMap((page) => page.phones)]),
    address:
      pages.find((page) => page.details?.address)?.details.address ||
      row.address,
    employees: pages.find((page) => page.details?.employees)?.details.employees,
    linkedin: pages.find((page) => page.details?.linkedin)?.details.linkedin,
    pages,
  };
}

function displayWebsite(row, result) {
  if (result?.websiteStatus === "verified") return result.website;
  if (result && row.catalog) return null;
  if (row.websiteStatus === "verified" || (!row.directory && !row.catalog))
    return row.website;
  return null;
}

function companyName(row, info) {
  return row.directory || row.catalog
    ? row.name
    : info.pages.find((page) => page.details?.name)?.details.name || row.name;
}

function SiteCheck({ row, result, busy, disabled, onCheck }) {
  const website = displayWebsite(row, result);
  const host = website
    ? new URL(website).hostname.replace(/^www\./, "")
    : row.websiteHost;
  const checked = !!result;
  const confirmed = result?.websiteStatus === "verified";
  const failed = checked && !confirmed && (result.error || row.catalog);
  const unavailable =
    result?.websiteStatus === "unavailable" ||
    row.websiteStatus === "unavailable";
  const contacts = contactInfo(row, result);
  return (
    <div className="leadSiteCheck">
      <div className="leadSiteLine">
        {website ? (
          <a
            href={website}
            target="_blank"
            rel="noreferrer"
            className="leadDomain"
          >
            <Globe2 size={13} /> {host}
          </a>
        ) : host ? (
          <span className="leadDomain leadMuted">
            <Globe2 size={13} /> {host}
          </span>
        ) : null}
        {(row.hasWebsite || row.website || row.catalog) && (
          <button
            type="button"
            className="leadInlineAction"
            disabled={disabled && !busy}
            aria-label={
              (busy ? "Cancel website check for " : "Check website for ") +
              row.name
            }
            onClick={onCheck}
          >
            {busy ? (
              <>
                <LoaderCircle size={13} className="workspaceSpinner" />{" "}
                Checking… <X size={12} />
              </>
            ) : (
              <>
                <Search size={13} />{" "}
                {failed
                  ? "Find correct site"
                  : checked
                    ? "Recheck site"
                    : !row.hasWebsite && row.catalog
                      ? "Find website"
                      : "Check site"}
              </>
            )}
          </button>
        )}
      </div>
      {busy ? (
        <p className="leadCheckOutcome" role="status">
          Checking the site and looking for a confirmed business website…
        </p>
      ) : confirmed ? (
        <p className="leadCheckOutcome success" role="status">
          <Check size={13} />{" "}
          {result.recovered ? "Correct website found" : "Site confirmed"}
          {contacts.pages.length
            ? " · " +
              contacts.emails.length +
              " email" +
              (contacts.emails.length === 1 ? "" : "s") +
              ", " +
              contacts.phones.length +
              " phone" +
              (contacts.phones.length === 1 ? "" : "s")
            : ""}
        </p>
      ) : !failed && !unavailable && result?.contacts?.length ? (
        <p className="leadCheckOutcome" role="status">
          <Check size={13} /> Website checked ·{" "}
          {contacts.emails.length || contacts.phones.length
            ? "Published contact details found"
            : "No published contacts found"}
        </p>
      ) : failed || unavailable ? (
        <p className="leadCheckOutcome warning" role="status">
          <CircleAlert size={13} />
          {result?.error ||
            "This website could not be reached. Try again later."}
        </p>
      ) : !website && (row.hasWebsite || row.website) ? (
        <p className="leadCheckHint">
          Check the site to confirm the link and find more contacts.
        </p>
      ) : !website ? (
        <span className="leadCheckHint">No website listed</span>
      ) : null}
    </div>
  );
}

function ContactColumn({ values, type, status }) {
  if (!values.length) return <span className="leadMuted">{status}</span>;
  return (
    <ul className="leadContactList">
      {values.map((value) => (
        <li key={value}>
          <a href={type + ":" + value}>{value}</a>
        </li>
      ))}
    </ul>
  );
}

const countFormat = new Intl.NumberFormat();

function CatalogPager({ query, hasMore, busy, onPage, placement }) {
  return (
    <nav
      className="leadCatalogPager"
      aria-label={placement + " catalog pagination"}
    >
      <button
        type="button"
        className="btn secondary"
        disabled={busy || query.page <= 1}
        onClick={() => onPage(query.page - 1)}
      >
        <ChevronLeft size={15} /> Previous
      </button>
      <span>Page {countFormat.format(query.page)}</span>
      <button
        type="button"
        className="btn secondary"
        disabled={busy || !hasMore}
        onClick={() => onPage(query.page + 1)}
      >
        Next <ChevronRight size={15} />
      </button>
    </nav>
  );
}

export default function ProspectResearch({ onSaved }) {
  const { organization } = useAuth();
  const websiteLabel = useId();
  const [mode, setMode] = useState("companies");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("NG");
  const [industry, setIndustry] = useState("all");
  const [keyword, setKeyword] = useState("");
  const [pageSize, setPageSize] = useState(50);
  const [contact, setContact] = useState("any");
  const [catalogPage, setCatalogPage] = useState(null);
  const [websites, setWebsites] = useState("");
  const [rows, setRows] = useState([]);
  const [checked, setChecked] = useState({});
  const [checking, setChecking] = useState([]);
  const [saved, setSaved] = useState({});
  const [saving, setSaving] = useState("");
  const [phase, setPhase] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [contactsOnly, setContactsOnly] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const controller = useRef(null);
  const resultTop = useRef(null);
  const scrollAfterPage = useRef(false);
  useEffect(() => () => controller.current?.abort(), []);

  function request(path, body, signal) {
    return api(path, {
      method: "POST",
      body,
      signal,
      organizationId: organization.id,
      supportSessionId: organization.support?.id,
    });
  }

  async function enrich(companies, job, defaultCountry) {
    const targets = companies.filter((row) => row.website).slice(0, 50);
    if (!targets.length) return;
    setPhase("checking");
    setChecking(targets.map(rowKey));
    const report = (key, result) => {
      if (controller.current === job && !job.signal.aborted)
        setChecked((current) => ({ ...current, [key]: result }));
    };
    const remaining = new Set(targets.map(rowKey));
    try {
      await streamEnrichment(
        organization,
        targets.map((row) => ({
          website: row.website,
          ...(row.directory ? { name: row.name } : {}),
          ...(row.directory === "Web research"
            ? { city: row.city || city, require_location: true }
            : {}),
          country: row.country || defaultCountry,
        })),
        job.signal,
        (result) => {
          const target = targets[result.index];
          const key = target && rowKey(target);
          if (!key) return;
          remaining.delete(key);
          report(key, result);
        },
      );
      for (const key of remaining)
        report(key, { error: "Website check interrupted." });
    } catch (error) {
      if (!job.signal.aborted) {
        for (const key of remaining)
          report(key, { error: "Website check unavailable." });
        throw error;
      }
    } finally {
      if (controller.current === job) setChecking([]);
    }
  }

  async function start(
    load,
    defaultCountry,
    catalogQuery,
    keepCurrent = false,
  ) {
    if (controller.current) return;
    const job = new AbortController();
    controller.current = job;
    setPhase("searching");
    setError("");
    setNotice("");
    setAttempted(true);
    if (!keepCurrent) {
      setRows([]);
      setCatalogPage(null);
    }
    setChecked({});
    setContactsOnly(false);
    try {
      const result = await load(job.signal);
      if (job.signal.aborted) return;
      setRows(result.companies);
      if (catalogQuery && typeof result.hasMore === "boolean")
        setCatalogPage({ query: catalogQuery, hasMore: result.hasMore });
      setNotice(
        result.outside
          ? result.companies.length
            ? (result.geminiUsed ? "Expanded your search. " : "") +
              (result.snapshot
                ? "Showing additional business websites."
                : "Showing new matches from public directories.") +
              (result.partial ? " Some live sources were unavailable. Live web search may be limited by the search provider; available public directory results are shown." : "") +
              (result.availability ? " " + result.availability : "")
            : "No additional matches from the available directories. Try another business keyword or location."
          : result.companies.length
            ? result.ranked
              ? "Matching categories prioritized."
              : ""
            : "No companies matched. Try a nearby city or another industry.",
      );
      await enrich(
        result.companies.filter((row) => !row.catalog),
        job,
        defaultCountry,
      );
    } catch (error) {
      if (!job.signal.aborted) setError(error.message);
    } finally {
      if (controller.current === job) {
        controller.current = null;
        setPhase("");
        setChecking([]);
      }
    }
  }

  function searchDirectory(query, keepCurrent = false) {
    start(
      async (signal) => {
        const result = await request(
          "/prospects/public-directory",
          query,
          signal,
        );
        return {
          ...result,
          companies: result.companies.map((row) => ({
            ...row,
            city: row.city || (!row.catalog ? query.city : null),
          })),
        };
      },
      query.country,
      query,
      keepCurrent,
    );
  }

  function searchBeyondCatalog() {
    const location = city.trim();
    if (
      location.length < 2 ||
      (industry === "all" && keyword.trim().length < 2)
    ) {
      setError(
        "Enter a city or state and choose an industry or add a business keyword to search beyond the catalog.",
      );
      return;
    }
    start(async (signal) => {
      const result = await request(
        "/prospects/search-beyond-catalog",
        { city: location, country, industry, keyword },
        signal,
      );
      return { ...result, outside: true };
    }, country);
  }

  function goToPage(page) {
    scrollAfterPage.current = true;
    searchDirectory({ ...catalogPage.query, page }, true);
  }

  function checkLinks(event) {
    event.preventDefault();
    const lines = unique(websites.split(/[\n,]+/).map((value) => value.trim()));
    if (lines.length < 1 || lines.length > 12) {
      setError("Enter 1 to 12 business websites.");
      return;
    }
    try {
      const companies = lines.map((line) => {
        const url = new URL(
          /^https?:\/\//i.test(line) ? line : "https://" + line,
        );
        if (
          !["http:", "https:"].includes(url.protocol) ||
          !url.hostname.includes(".") ||
          url.username ||
          url.password
        )
          throw new Error("Enter valid public website addresses.");
        url.hash = "";
        return {
          name: url.hostname.replace(/^www\./, ""),
          website: url.href,
          source_url: url.href,
        };
      });
      start(
        () => ({
          companies: [
            ...new Map(companies.map((row) => [row.source_url, row])).values(),
          ],
        }),
        country,
      );
    } catch {
      setError("Enter valid public website addresses.");
    }
  }

  useEffect(() => {
    if (phase || !scrollAfterPage.current) return;
    scrollAfterPage.current = false;
    if (error) return;
    resultTop.current?.focus({ preventScroll: true });
    const frame = requestAnimationFrame(() =>
      window.scrollTo({
        top: 0,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      }),
    );
    return () => cancelAnimationFrame(frame);
  }, [phase, error, catalogPage?.query.page]);

  function changeMode(next) {
    if (next === mode) return;
    controller.current?.abort();
    controller.current = null;
    setMode(next);
    setPhase("");
    setRows([]);
    setChecked({});
    setChecking([]);
    setCatalogPage(null);
    setError("");
    setNotice("");
    setAttempted(false);
  }

  async function checkCompanySite(row) {
    const key = rowKey(row);
    if (checking.includes(key)) {
      controller.current?.abort();
      return;
    }
    if (controller.current) return;
    const job = new AbortController();
    controller.current = job;
    setPhase("checking");
    setChecking([key]);
    setChecked((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    try {
      if (row.catalog) {
        const result = await request(
          "/prospects/verify-catalog-website",
          { id: row.id },
          job.signal,
        );
        if (!job.signal.aborted)
          setChecked((current) => ({ ...current, [key]: result }));
      } else {
        await enrich([row], job, country);
      }
    } catch (error) {
      if (!job.signal.aborted)
        setChecked((current) => ({
          ...current,
          [key]: { error: error.message },
        }));
    } finally {
      if (controller.current === job) {
        if (job.signal.aborted)
          setChecked((current) => ({
            ...current,
            [key]: { error: "Website check cancelled. You can try again." },
          }));
        controller.current = null;
        setPhase("");
        setChecking([]);
      }
    }
  }

  async function saveProspect(row) {
    const key = rowKey(row);
    if (saving || saved[key]) return;
    const info = contactInfo(row, checked[key]);
    setSaving(key);
    setError("");
    try {
      const notes = [
        row.directory === "OpenStreetMap" &&
          "© OpenStreetMap contributors · ODbL · https://www.openstreetmap.org/copyright",
        row.release &&
          [row.directory, row.release, row.id, row.source_url].join(" · "),
        row.emailEvidence && "Published email source: " + row.emailEvidence,
        row.phoneEvidence && "Published phone source: " + row.phoneEvidence,
        row.needsReview && "Business category needs review",
        info.address && "Address: " + info.address,
        info.employees && "Employees: " + info.employees,
        info.linkedin,
        ...info.pages.map((page) =>
          [page.source, ...page.emails, ...page.phones].join(" · "),
        ),
        ...[row.email, row.phone].filter(Boolean),
      ]
        .filter(Boolean)
        .join("\n");
      await request("/resources/prospects", {
        name: companyName(row, info),
        website: displayWebsite(row, checked[key]),
        industry: row.industry,
        country: row.country,
        email: info.emails[0] || null,
        phone: info.phones[0] || null,
        source_url: row.source_url,
        notes,
      });
      setSaved((current) => ({ ...current, [key]: true }));
      onSaved();
    } catch (error) {
      setError(error.message);
    } finally {
      setSaving("");
    }
  }

  const complete = rows.filter((row) => checked[rowKey(row)]).length;
  const withContacts = rows.filter((row) => {
    const info = contactInfo(row, checked[rowKey(row)]);
    return info.emails.length || info.phones.length;
  });
  const shown = contactsOnly ? withContacts : rows;
  const firstMatch = catalogPage
    ? (catalogPage.query.page - 1) * catalogPage.query.pageSize + 1
    : 0;

  return (
    <section className="leadWorkbench" aria-labelledby="lead-finder-title">
      <div
        className="discoveryModes"
        role="group"
        aria-label="Discovery method"
      >
        <button
          type="button"
          aria-pressed={mode === "companies"}
          onClick={() => changeMode("companies")}
        >
          <Building2 size={19} />
          <span>
            <strong>Find companies</strong>
            <small>Search by industry and location</small>
          </span>
          <ArrowRight size={16} />
        </button>
        <button
          type="button"
          aria-pressed={mode === "websites"}
          onClick={() => changeMode("websites")}
        >
          <Globe2 size={19} />
          <span>
            <strong>Search by website</strong>
            <small>Turn a website into business contacts</small>
          </span>
          <ArrowRight size={16} />
        </button>
      </div>

      <div className="discoverySearchSurface">
        <header className="leadSearchHeader">
          <h2 id="lead-finder-title">
            {mode === "websites"
              ? "Research business websites"
              : "Find your next customer"}
          </h2>
          <p>
            {mode === "websites"
              ? "Paste a company website to find its published emails, phone numbers and business details."
              : "Look for companies by name, industry or location."}
          </p>
        </header>
        {mode === "companies" ? (
          <>
            <form
              className="researchForm companyResearchForm"
              onSubmit={(event) => {
                event.preventDefault();
                searchDirectory({
                  city,
                  country,
                  industry,
                  keyword: country === "NG" ? keyword : "",
                  page: 1,
                  pageSize,
                  contact: country === "NG" ? contact : "any",
                });
              }}
            >
              <label className="field discoveryKeyword">
                <span>Company or keyword</span>
                <input
                  value={keyword}
                  maxLength={100}
                  onChange={(event) => setKeyword(event.target.value)}
                  placeholder="Company name, bakery, software…"
                />
              </label>
              <label className="field">
                <span>Industry</span>
                <select
                  value={industry}
                  onChange={(event) => setIndustry(event.target.value)}
                >
                  {country === "NG" && (
                    <option value="all">All industries</option>
                  )}
                  {Object.entries(industries).map(([id, item]) => (
                    <option key={id} value={id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>City or state</span>
                <input
                  value={city}
                  maxLength={75}
                  minLength={country === "NG" ? undefined : 2}
                  required={country !== "NG"}
                  onChange={(event) => setCity(event.target.value)}
                  placeholder="e.g. Lagos"
                />
              </label>
              <label className="field leadCountry">
                <span>Country</span>
                <input
                  value={country}
                  required
                  pattern="[A-Za-z]{2}"
                  maxLength={2}
                  onChange={(event) => {
                    const code = event.target.value.toUpperCase();
                    setCountry(code);
                    if (code !== "NG" && industry === "all")
                      setIndustry("technology");
                  }}
                />
              </label>
              <button className="btn primary" disabled={!!phase}>
                {phase === "searching" ? (
                  <LoaderCircle size={15} className="workspaceSpinner" />
                ) : (
                  <Search size={15} />
                )}
                {phase === "searching" ? "Searching…" : "Find companies"}
              </button>
            </form>
            <div className="leadBeyondCatalog">
              <button
                type="button"
                className="leadInlineAction"
                disabled={!!phase}
                onClick={searchBeyondCatalog}
              >
                <Sparkles size={14} /> Search beyond catalog
              </button>
              <span>Find additional matches in public directories.</span>
            </div>
          </>
        ) : (
          <form className="websiteResearchForm" onSubmit={checkLinks}>
            <label className="field">
              <span id={websiteLabel}>Company websites</span>
              <textarea
                aria-labelledby={websiteLabel}
                required
                maxLength={6200}
                rows={3}
                value={websites}
                onChange={(event) => setWebsites(event.target.value)}
                placeholder="company.com, anothercompany.com"
              />
            </label>
            <div className="websiteResearchActions">
              <p>
                Up to 12 websites, one per line. Only publicly listed contact
                details are collected.
              </p>
              <button className="btn primary" disabled={!!phase}>
                {phase ? (
                  <LoaderCircle size={15} className="workspaceSpinner" />
                ) : (
                  <Globe2 size={15} />
                )}
                {phase ? "Researching…" : "Research websites"}
              </button>
            </div>
          </form>
        )}
      </div>

      {error && (
        <p className="liveError" role="alert">
          {error}
        </p>
      )}
      {!attempted && !rows.length ? (
        <div className="discoveryWelcome">
          {mode === "websites" ? <Globe2 size={28} /> : <Search size={28} />}
          <h3>
            {mode === "websites"
              ? "Start with a website. Leave with contacts."
              : "The right companies are a search away."}
          </h3>
          <p>
            {mode === "websites"
              ? "Research results appear here as each business website is checked."
              : "Enter a name or filter by industry and location to build your prospect list."}
          </p>
        </div>
      ) : (
        <>
          <div
            ref={resultTop}
            tabIndex={-1}
            className="leadResultToolbar leadResultsStart"
          >
            <div className="leadResultSummary" role="status">
              <strong>
                {catalogPage
                  ? rows.length
                    ? "Matches " +
                      countFormat.format(firstMatch) +
                      "–" +
                      countFormat.format(firstMatch + rows.length - 1)
                    : "No matches on this page"
                  : rows.length
                    ? rows.length +
                      (rows.length === 1 ? " company" : " companies")
                    : phase
                      ? "Looking for companies…"
                      : "No results yet"}
              </strong>
              {!catalogPage && !!rows.length && (
                <span>
                  {withContacts.length} with contacts · {complete} websites
                  checked
                </span>
              )}
            </div>
            {phase && (
              <button
                type="button"
                className="leadInlineAction"
                onClick={() => controller.current?.abort()}
              >
                <X size={14} /> Stop research
              </button>
            )}
            {!catalogPage && !!rows.length && (
              <label className="leadContactsToggle">
                <input
                  type="checkbox"
                  checked={contactsOnly}
                  onChange={(event) => setContactsOnly(event.target.checked)}
                />{" "}
                With contact details
              </label>
            )}
            {catalogPage && (
              <div className="leadResultFilters">
                <label>
                  <span>Show</span>
                  <select
                    aria-label="Results per page"
                    value={catalogPage.query.pageSize}
                    disabled={!!phase}
                    onChange={(event) => {
                      const size = Number(event.target.value);
                      setPageSize(size);
                      searchDirectory(
                        { ...catalogPage.query, page: 1, pageSize: size },
                        true,
                      );
                    }}
                  >
                    {[20, 50, 100].map((size) => (
                      <option value={size} key={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Contacts</span>
                  <select
                    aria-label="Contact details"
                    value={catalogPage.query.contact}
                    disabled={!!phase}
                    onChange={(event) => {
                      const value = event.target.value;
                      setContact(value);
                      searchDirectory(
                        { ...catalogPage.query, page: 1, contact: value },
                        true,
                      );
                    }}
                  >
                    <option value="any">Any contact</option>
                    <option value="email">Has email</option>
                    <option value="phone">Has phone</option>
                    <option value="both">Email and phone</option>
                  </select>
                </label>
                <CatalogPager
                  {...catalogPage}
                  busy={!!phase}
                  onPage={goToPage}
                  placement="Top"
                />
              </div>
            )}
          </div>
          {notice && <p className="discoveryNotice">{notice}</p>}
          {shown.length ? (
            <div
              className="tableScroll leadTableScroll"
              role="region"
              aria-label="Lead results"
              tabIndex={0}
            >
              <table className="leadTable">
                <thead>
                  <tr>
                    <th scope="col">Company</th>
                    <th scope="col">Email</th>
                    <th scope="col">Phone</th>
                    <th scope="col">
                      <span className="screenReaderOnly">Save prospect</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((row) => {
                    const key = rowKey(row);
                    const result = checked[key];
                    const info = contactInfo(row, result);
                    const waiting = checking.includes(key);
                    const emptyContact = waiting
                      ? "Checking…"
                      : result
                        ? "Not published"
                        : "Not listed";
                    return (
                      <tr key={key}>
                        <td className="leadCompany">
                          <strong className="leadCompanyName">
                            {companyName(row, info)}
                          </strong>
                          <p className="leadCompanyMeta">
                            {[row.industry, row.city || row.region, row.country]
                              .filter(Boolean)
                              .join(" · ") || "Website research"}
                          </p>
                          <SiteCheck
                            row={row}
                            result={result}
                            busy={waiting}
                            disabled={!!phase}
                            onCheck={() => checkCompanySite(row)}
                          />
                          {info.address && (
                            <p className="leadAddress" title={info.address}>
                              {info.address}
                            </p>
                          )}
                          {row.needsReview && (
                            <small className="leadMuted">
                              Business category needs review
                            </small>
                          )}
                        </td>
                        <td data-label="Email">
                          <ContactColumn
                            values={info.emails}
                            type="mailto"
                            status={emptyContact}
                          />
                        </td>
                        <td data-label="Phone">
                          <ContactColumn
                            values={info.phones}
                            type="tel"
                            status={emptyContact}
                          />
                        </td>
                        <td className="leadSaveCell">
                          <button
                            type="button"
                            className={
                              "leadSaveButton" + (saved[key] ? " saved" : "")
                            }
                            aria-label={
                              (saved[key] ? "Saved " : "Save prospect ") +
                              row.name
                            }
                            disabled={waiting || !!saving || !!saved[key]}
                            onClick={() => saveProspect(row)}
                          >
                            {saved[key] ? (
                              <Check size={15} />
                            ) : saving === key ? (
                              <LoaderCircle
                                size={15}
                                className="workspaceSpinner"
                              />
                            ) : (
                              <BookmarkPlus size={15} />
                            )}
                            {saved[key]
                              ? "Saved"
                              : saving === key
                                ? "Saving…"
                                : "Save"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : !phase ? (
            <p className="leadEmpty">
              No matching contacts. Try another search or research a company
              website.
            </p>
          ) : null}
          {catalogPage && (
            <CatalogPager
              {...catalogPage}
              busy={!!phase}
              onPage={goToPage}
              placement="Bottom"
            />
          )}
          {!!rows.length && (
            <p className="leadCredit">
              <Link to="/data-sources">Data licenses and terms</Link>
            </p>
          )}
        </>
      )}
    </section>
  );
}
