import { useState } from "react";
import { industries } from "../../shared/research";
import { api } from "./api";
import { useAuth } from "./AuthContext";

function ContactDetails({ rows }) {
  if (!rows?.length) return null;
  return (
    <ul className="researchContacts">
      {rows.map((row) => (
        <li key={row.source}>
          {[...row.emails, ...row.phones].join(" · ")}{" "}
          <a href={row.source} target="_blank" rel="noreferrer">
            Source
          </a>
        </li>
      ))}
    </ul>
  );
}

export default function ProspectResearch({ onSaved }) {
  const { organization } = useAuth();
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("NG");
  const [industry, setIndustry] = useState("technology");
  const [website, setWebsite] = useState("");
  const [rows, setRows] = useState([]);
  const [websiteResults, setWebsiteResults] = useState([]);
  const [checked, setChecked] = useState({});
  const [saved, setSaved] = useState({});
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [websiteNotice, setWebsiteNotice] = useState("");
  const request = (path, body) =>
    api(path, { method: "POST", body, organizationId: organization.id });
  async function run(key, action) {
    setPending(key);
    setError("");
    try {
      await action();
    } catch (error) {
      setError(error.message);
    } finally {
      setPending("");
    }
  }

  async function scan(value, key) {
    await run(key, async () => {
      const normalized = /^https?:\/\//i.test(value)
        ? value
        : "https://" + value;
      const { contacts } = await request("/prospects/check-website", {
        website: normalized,
      });
      if (key === "website") {
        setWebsiteResults(contacts);
        setWebsiteNotice(
          contacts.length
            ? ""
            : "No public business email or phone found on these pages.",
        );
      } else {
        setChecked((current) => ({ ...current, [key]: contacts }));
      }
    });
  }

  return (
    <details className="researchPanel">
      <summary>Find companies and public contacts</summary>
      <form
        className="researchForm"
        onSubmit={(event) => {
          event.preventDefault();
          run("search", async () => {
            setRows([]);
            setNotice("");
            const result = await request("/prospects/public-directory", {
              city: city.trim(),
              country,
              industry,
            });
            setRows(result.companies);
            setNotice(
              result.companies.length
                ? result.ranked
                  ? "Gemini prioritized the business categories. Review each company and source before saving."
                  : "Review each company and source before saving."
                : "No mapped businesses matched. Try a nearby city or a different industry.",
            );
          });
        }}
      >
        <label className="field">
          <span>City</span>
          <input
            required
            maxLength={75}
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="e.g. Lagos"
          />
        </label>
        <label className="field">
          <span>Country code</span>
          <input
            required
            pattern="[A-Za-z]{2}"
            maxLength={2}
            value={country}
            onChange={(e) => setCountry(e.target.value.toUpperCase())}
            placeholder="NG"
          />
        </label>
        <label className="field">
          <span>Industry</span>
          <select
            aria-label="Industry"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
          >
            {Object.entries(industries).map(([id, item]) => (
              <option key={id} value={id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <button className="btn primary" disabled={!!pending}>
          {pending === "search" ? "Finding companies…" : "Find companies"}
        </button>
      </form>
      <p className="researchAttribution">
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
        >
          © OpenStreetMap contributors · ODbL
        </a>
        {" · "}
        <a
          href="https://www.wikidata.org/wiki/Wikidata:Licensing"
          target="_blank"
          rel="noreferrer"
        >
          Wikidata · CC0
        </a>
      </p>
      {error && (
        <p className="liveError" role="alert">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <div className="researchResults">
        {rows.map((row) => {
          const key = row.source_url;
          const contacts = [
            ...(row.email || row.phone
              ? [
                  {
                    emails: row.email ? [row.email] : [],
                    phones: row.phone ? [row.phone] : [],
                    source: key,
                  },
                ]
              : []),
            ...(checked[key] || []),
          ];
          return (
            <article key={key}>
              <div>
                <strong>{row.name}</strong>
                <p>
                  {row.industry} ·{" "}
                  <a href={key} target="_blank" rel="noreferrer">
                    {row.directory || "Directory listing"}
                  </a>
                  {row.website && (
                    <>
                      {" "}
                      ·{" "}
                      <a href={row.website} target="_blank" rel="noreferrer">
                        Website
                      </a>
                    </>
                  )}
                </p>
                <ContactDetails rows={contacts} />
                {checked[key]?.length === 0 && (
                  <p>No public business contact found on the website.</p>
                )}
              </div>
              <div className="researchActions">
                {row.website && (
                  <button
                    className="btn secondary"
                    disabled={!!pending || !!checked[key]}
                    onClick={() => scan(row.website, key)}
                  >
                    {pending === key
                      ? "Checking…"
                      : checked[key]
                        ? "Checked"
                        : "Check website"}
                  </button>
                )}
                <button
                  className="btn secondary"
                  disabled={!!pending || !!saved[key]}
                  onClick={() =>
                    run("save:" + key, async () => {
                      const { name, industry, country, website, source_url } =
                        row;
                      await request("/resources/prospects", {
                        name,
                        industry,
                        country,
                        website,
                        source_url,
                        notes: [
                          row.directory === "Wikidata"
                            ? "Directory: Wikidata (CC0)"
                            : "Directory: © OpenStreetMap contributors (ODbL), https://www.openstreetmap.org/copyright",
                          ...contacts.map((contact) =>
                            [
                              contact.source,
                              ...contact.emails,
                              ...contact.phones,
                            ].join(" · "),
                          ),
                        ].join("\n"),
                      });
                      setSaved((current) => ({ ...current, [key]: true }));
                      onSaved();
                    })
                  }
                >
                  {saved[key]
                    ? "Saved"
                    : pending === "save:" + key
                      ? "Saving…"
                      : "Save prospect"}
                </button>
              </div>
            </article>
          );
        })}
      </div>
      <form
        className="researchForm researchWebsite"
        onSubmit={(event) => {
          event.preventDefault();
          setWebsiteResults([]);
          setWebsiteNotice("");
          scan(website.trim(), "website");
        }}
      >
        <label className="field">
          <span>Check any public business website</span>
          <input
            required
            maxLength={500}
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="company.com"
          />
        </label>
        <button className="btn secondary" disabled={!!pending}>
          {pending === "website" ? "Checking…" : "Find contact details"}
        </button>
      </form>
      {websiteNotice && <p role="status">{websiteNotice}</p>}
      <ContactDetails rows={websiteResults} />
    </details>
  );
}
