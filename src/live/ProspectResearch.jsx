import { Link } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
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
      ...(organization.support ? { "x-support-session-id": organization.support.id } : {}),
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
    <nav className="leadCatalogPager" aria-label={placement + " catalog pagination"}>
      <button type="button" className="btn secondary" disabled={busy || query.page <= 1} onClick={() => onPage(query.page - 1)}>Previous</button>
      <span>Page {countFormat.format(query.page)}</span>
      <button type="button" className="btn secondary" disabled={busy || !hasMore} onClick={() => onPage(query.page + 1)}>Next</button>
    </nav>
  );
}

export default function ProspectResearch({ onSaved }) {
  const { organization } = useAuth();
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
    const targets = companies.filter((row) => row.website).slice(0, 12);
    if (!targets.length) return;
    setPhase("checking");
    setChecking(targets.map(rowKey));
    const report = (key, result) =>
      setChecked((current) => ({ ...current, [key]: result }));
    const remaining = new Set(targets.map(rowKey));
    try {
      await streamEnrichment(
        organization,
        targets.map((row) => ({
          website: row.website,
          ...(row.directory ? { name: row.name } : {}),
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
      setChecking([]);
    }
  }

  async function start(load, defaultCountry, catalogQuery, keepCurrent = false) {
    if (controller.current) return;
    const job = new AbortController();
    controller.current = job;
    setPhase("searching");
    setError("");
    setNotice("");
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
              (result.snapshot ? "Showing additional Overture business websites." : "Showing new matches from public directories.") +
              (result.partial ? " Some live sources were unavailable." : "")
            : "No additional matches from the available directories. Try another business keyword or location."
          : result.companies.length
          ? result.ranked
            ? "Matching categories prioritized."
            : ""
          : "No companies matched. Try a nearby city or another industry.",
      );
      await enrich(result.companies.filter((row) => !row.catalog), job, defaultCountry);
    } catch (error) {
      if (!job.signal.aborted) setError(error.message);
    } finally {
      if (controller.current === job) {
        controller.current = null;
        setPhase("");
      }
    }
  }

  function searchDirectory(query, keepCurrent = false) {
    start(async (signal) => {
      const result = await request("/prospects/public-directory", query, signal);
      return {
        ...result,
        companies: result.companies.map((row) => ({
          ...row,
          city: row.city || (!row.catalog ? query.city : null),
        })),
      };
    }, query.country, query, keepCurrent);
  }

  function searchBeyondCatalog() {
    const location = city.trim();
    if (location.length < 2 || (industry === "all" && keyword.trim().length < 2)) {
      setError("Enter a city or state and choose an industry or add a business keyword to search beyond the catalog.");
      return;
    }
    start(async (signal) => {
      const result = await request("/prospects/search-beyond-catalog", { city: location, country, industry, keyword }, signal);
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
    resultTop.current?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
      block: "start",
    });
  }, [phase, error, catalogPage?.query.page]);

  const complete = rows.filter((row) => checked[rowKey(row)]).length;
  const withContacts = rows.filter((row) => {
    const info = contactInfo(row, checked[rowKey(row)]);
    return info.emails.length || info.phones.length;
  });
  const shown = contactsOnly ? withContacts : rows;
  const firstMatch = catalogPage ? (catalogPage.query.page - 1) * catalogPage.query.pageSize + 1 : 0;

  return (
    <section
      className="panel leadWorkbench"
      aria-labelledby="lead-finder-title"
    >
      <div className="leadSearchHeader">
        <div>
          <h2 id="lead-finder-title">Find companies and public contacts</h2>
          <p>
            Search the Nigerian business catalog by name, location or industry.
            Open the sources or check a business website for more details.
          </p>
        </div>
      </div>
      <form
        className="researchForm"
        onSubmit={(event) => {
          event.preventDefault();
          searchDirectory({
            city, country, industry, keyword: country === "NG" ? keyword : "",
            page: 1, pageSize, contact: country === "NG" ? contact : "any",
          });
        }}
      >
        <label className="field">
          <span>City or state</span>
          <input
            required={country !== "NG"}
            minLength={country === "NG" ? undefined : 2}
            maxLength={75}
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="e.g. Lagos"
          />
        </label>
        <label className="field leadCountry">
          <span>Country code</span>
          <input
            required
            pattern="[A-Za-z]{2}"
            maxLength={2}
            value={country}
            onChange={(e) => {
              const code = e.target.value.toUpperCase();
              setCountry(code);
              if (code !== "NG" && industry === "all") setIndustry("technology");
            }}
          />
        </label>
        <label className="field">
          <span>Industry</span>
          <select
            aria-label="Industry"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
          >
            {country === "NG" && <option value="all">All industries</option>}
            {Object.entries(industries).map(([id, item]) => (
              <option key={id} value={id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Company or keyword</span>
          <input value={keyword} maxLength={100} onChange={(e) => setKeyword(e.target.value)} placeholder="e.g. bakery" />
        </label>
        <button className="btn primary" disabled={!!phase}>
          {phase === "searching" ? "Finding companies…" : "Find companies"}
        </button>
      </form>
      <div className="leadBeyondCatalog">
        <button type="button" className="btn secondary" disabled={!!phase} onClick={searchBeyondCatalog}>
          Search beyond catalog
        </button>
        <p>Enter a location and a business keyword or industry to look in live public directories.</p>
      </div>
      <details className="leadWebsiteEntry">
        <summary>Research by website</summary>
        <form className="researchForm" onSubmit={checkLinks}>
          <label className="field">
            <span>Business websites</span>
            <textarea
              required
              maxLength={6200}
              rows={3}
              value={websites}
              onChange={(e) => setWebsites(e.target.value)}
              placeholder="Enter up to 12 websites, one per line"
            />
          </label>
          <button className="btn secondary" disabled={!!phase}>
            Check websites
          </button>
        </form>
      </details>
      {error && (
        <p className="liveError" role="alert">
          {error}
        </p>
      )}
      <div ref={resultTop} className="leadResultToolbar leadResultsStart">
        <p role="status">
          {catalogPage
            ? rows.length
              ? "Showing matches " + countFormat.format(firstMatch) + "–" + countFormat.format(firstMatch + rows.length - 1)
              : "No catalog matches on this page"
            : rows.length
            ? `${rows.length} ${rows.length === 1 ? "company" : "companies"} · ${withContacts.length} with contact details · ${complete} ${complete === 1 ? "website" : "websites"} checked`
            : notice || (phase ? "Finding matching companies…" : "")}
        </p>
        {phase && (
          <button
            className="btn secondary"
            onClick={() => controller.current?.abort()}
          >
            Stop research
          </button>
        )}
        {!catalogPage && !!rows.length && (
          <label>
            <input
              type="checkbox"
              checked={contactsOnly}
              onChange={(e) => setContactsOnly(e.target.checked)}
            />{" "}
            With contact details
          </label>
        )}
      </div>
      {catalogPage && (
        <div className="leadCatalogControls">
          <label>
            <span>Results per page</span>
            <select value={catalogPage.query.pageSize} disabled={!!phase} onChange={(event) => {
              const size = Number(event.target.value);
              setPageSize(size);
              searchDirectory({ ...catalogPage.query, page: 1, pageSize: size }, true);
            }}>
              {[20, 50, 100].map((size) => <option value={size} key={size}>{size}</option>)}
            </select>
          </label>
          <label>
            <span>Contact details</span>
            <select value={catalogPage.query.contact} disabled={!!phase} onChange={(event) => {
              const value = event.target.value;
              setContact(value);
              searchDirectory({ ...catalogPage.query, page: 1, contact: value }, true);
            }}>
              <option value="any">Any contact</option>
              <option value="email">Has email</option>
              <option value="phone">Has phone</option>
              <option value="both">Has email and phone</option>
            </select>
          </label>
          <CatalogPager {...catalogPage} busy={!!phase} onPage={goToPage} placement="Top" />
        </div>
      )}
      {rows.length > 0 && (
        <>
          {notice && <p className="leadMuted">{notice}</p>}
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
                    <th scope="col">Business email</th>
                    <th scope="col">Phone</th>
                    <th scope="col">Company details</th>
                    <th scope="col">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((row) => {
                    const key = rowKey(row);
                    const result = checked[key];
                    const info = contactInfo(row, result);
                    const displayWebsite = result?.websiteStatus === "verified" ? result.website : row.websiteStatus === "verified" || (!row.directory && !row.catalog) ? row.website : null;
                    const waiting = checking.includes(key) && !result;
                    const status = waiting
                      ? "Checking…"
                      : result?.error
                        ? "Unavailable"
                        : result
                          ? "Not published"
                          : row.catalog
                            ? "Not listed"
                          : row.website
                            ? "Not checked"
                            : "No website";
                    return (
                      <tr key={key}>
                        <td>
                          <strong>
                            {info.pages.find((page) => page.details?.name)
                              ?.details.name || row.name}
                          </strong>
                          {!displayWebsite && (row.hasWebsite || row.website) && <small className="leadWebsiteStatus">{result?.websiteStatus === "unavailable" || row.websiteStatus === "unavailable" ? "Website unavailable" : "Website needs verification"}</small>}
                          {displayWebsite && (
                            <a
                              className="leadWebsite"
                              href={displayWebsite}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {new URL(displayWebsite).hostname}
                            </a>
                          )}

                        </td>
                        <td data-label="Business email">
                          <ContactColumn
                            type="mailto"
                            values={info.emails}
                            status={status}
                          />
                        </td>
                        <td data-label="Phone">
                          <ContactColumn
                            type="tel"
                            values={info.phones}
                            status={status}
                          />
                        </td>
                        <td data-label="Company details">
                          <div className="leadCompanyFacts">
                            <span>
                              {[row.industry, row.city, row.region, row.country]
                                .filter(Boolean)
                                .join(" · ") || "Website research"}
                            </span>
                            {row.needsReview && <span className="leadMuted">Business category needs review</span>}
                            {info.address && <span>{info.address}</span>}
                            {info.employees && (
                              <span>{info.employees} employees</span>
                            )}
                            {info.linkedin && (
                              <a
                                href={info.linkedin}
                                target="_blank"
                                rel="noreferrer"
                              >
                                LinkedIn company page
                              </a>
                            )}
                            {result?.error && (
                              <span className="leadMuted">{result.error}</span>
                            )}
                          </div>
                        </td>
                        <td>
                          <div className="leadActions">
                            {(row.website || row.hasWebsite) &&
                              (!result || result.error) &&
                              !phase && (
                                <button
                                  className="btn secondary"
                                  onClick={async () => {
                                    if (controller.current) return;
                                    const job = new AbortController();
                                    controller.current = job;
                                    setError("");
                                    setChecked((current) => {
                                      const next = { ...current };
                                      delete next[key];
                                      return next;
                                    });
                                    try {
                                      if (row.catalog) {
                                        setPhase("checking");
                                        setChecking([key]);
                                        const check = await request("/prospects/verify-catalog-website", { id: row.id }, job.signal);
                                        setChecked((current) => ({ ...current, [key]: check }));
                                      } else {
                                        await enrich([row], job, country);
                                      }
                                    } catch (error) {
                                      if (!job.signal.aborted)
                                        setError(error.message);
                                    } finally {
                                      if (controller.current === job) {
                                        controller.current = null;
                                        setPhase("");
                                        setChecking([]);
                                      }
                                    }
                                  }}
                                >
                                  Verify website
                                </button>
                              )}
                            <button
                              className="btn secondary"
                              disabled={waiting || !!saving || !!saved[key]}
                              onClick={async () => {
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
                                    info.employees &&
                                      "Employees: " + info.employees,
                                    info.linkedin,
                                    ...info.pages.map((page) =>
                                      [
                                        page.source,
                                        ...page.emails,
                                        ...page.phones,
                                      ].join(" · "),
                                    ),
                                    ...[row.email, row.phone].filter(Boolean),
                                  ]
                                    .filter(Boolean)
                                    .join("\n");
                                  await request("/resources/prospects", {
                                    name:
                                      info.pages.find(
                                        (page) => page.details?.name,
                                      )?.details.name || row.name,
                                    website: displayWebsite,
                                    industry: row.industry,
                                    country: row.country,
                                    source_url: row.source_url,
                                    notes,
                                  });
                                  setSaved((current) => ({
                                    ...current,
                                    [key]: true,
                                  }));
                                  onSaved();
                                } catch (error) {
                                  setError(error.message);
                                } finally {
                                  setSaving("");
                                }
                              }}
                            >
                              {saved[key]
                                ? "Saved"
                                : saving === key
                                  ? "Saving…"
                                  : "Save prospect"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="leadEmpty">
              No results with public email or phone details yet.
            </p>
          )}
          {catalogPage && (
            <CatalogPager {...catalogPage} busy={!!phase} onPage={goToPage} placement="Bottom" />
          )}
          <p className="leadCredit"><Link to="/data-sources">Data licenses and terms</Link></p>
        </>
      )}
    </section>
  );
}
