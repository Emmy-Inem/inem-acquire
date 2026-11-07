import { useCallback, useEffect, useRef, useState } from "react";
import { Upload, Building2, Trash2 } from "lucide-react";
import { api } from "./api";
import { useAuth } from "./AuthContext";
import { canRole } from "../../shared/permissions";
export async function uploadCompanyFile(
  organization,
  file,
  path = "/documents",
) {
  const type = path.includes("photo")
    ? file.type
    : /\.pdf$/i.test(file.name)
      ? "application/pdf"
      : /\.csv$/i.test(file.name)
        ? "text/csv"
        : /\.txt$/i.test(file.name)
          ? "text/plain"
          : "";
  if (!type) throw new Error("Choose a PDF, text or CSV document.");
  const response = await fetch(
    "/api" +
      path +
      (path === "/documents" ? "?name=" + encodeURIComponent(file.name) : ""),
    {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": type,
        "x-organization-id": organization.id,
        ...(organization.support
          ? { "x-support-session-id": organization.support.id }
          : {}),
      },
      body: file,
    },
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Upload failed.");
  return data;
}
export function CompanyPhoto({ manage }) {
  const { organization, refresh } = useAuth(),
    input = useRef(null);
  const [image, setImage] = useState(null),
    [loaded, setLoaded] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const load = useCallback(
    () =>
      api("/organization/photo", {
        organizationId: organization.id,
        supportSessionId: organization.support?.id,
      })
        .then((r) => setImage(r.image))
        .catch((e) => setMessage(e.message))
        .finally(() => setLoaded(true)),
    [organization.id, organization.logo_path],
  );
  useEffect(() => {
    load();
  }, [load]);
  return (
    <section className="panel livePanel companyPhotoPanel">
      <div className="companyPhoto">
        {image ? (
          <img src={image} alt={organization.name + " company photo"} />
        ) : (
          <Building2 size={28} />
        )}
      </div>
      <div>
        <h2>Company photo</h2>
        <p>
          A logo or team photo helps identify this workspace. PNG, JPEG or WebP,
          up to 2 MB.
        </p>
        {manage && (
          <div className="assetActions">
            <button
              className="btn secondary"
              disabled={busy}
              onClick={() => input.current?.click()}
            >
              <Upload size={15} />
              {busy
                ? "Saving…"
                : !loaded
                  ? "Loading photo…"
                  : image
                    ? "Change photo"
                    : "Upload photo"}
            </button>
            {image && (
              <button
                className="btn secondary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await api("/organization/photo", {
                      method: "DELETE",
                      organizationId: organization.id,
                    });
                    setImage(null);
                    await refresh();
                    setMessage("Company photo removed.");
                  } catch (e) {
                    setMessage(e.message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Remove
              </button>
            )}
            <input
              ref={input}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              aria-label="Company photo file"
              hidden
              onChange={async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                setBusy(true);
                setMessage("");
                try {
                  if (file.size > 2 * 1024 * 1024)
                    throw new Error("Choose an image under 2 MB.");
                  await uploadCompanyFile(
                    organization,
                    file,
                    "/organization/photo",
                  );
                  await refresh();
                  await load();
                  setMessage("Company photo saved.");
                } catch (error) {
                  setMessage(error.message);
                } finally {
                  setBusy(false);
                  e.target.value = "";
                }
              }}
            />
          </div>
        )}
        {message && <p role="status">{message}</p>}
      </div>
    </section>
  );
}
export function CompanyDocuments({ manage, onChanged }) {
  const { organization } = useAuth(),
    input = useRef(null),
    [rows, setRows] = useState([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [deleting, setDeleting] = useState("");
  const request = useCallback(
    (path, options = {}) =>
      api(path, {
        ...options,
        organizationId: organization.id,
        supportSessionId: organization.support?.id,
      }),
    [organization.id, organization.support?.id],
  );
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
      <div className="assetHeading">
        <div>
          <h2>Company files</h2>
          <p>
            Store proposals, company information and sales evidence. Attach a
            file in Sales advisor when you want it included in an answer.
          </p>
        </div>
        {manage && (
          <button
            className="btn secondary"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            <Upload size={15} />
            {busy ? "Uploading…" : "Upload file"}
          </button>
        )}
      </div>
      <small>Private PDF, text and CSV files, up to 5 MB each.</small>
      <input
        ref={input}
        type="file"
        hidden
        accept=".pdf,.txt,.csv"
        aria-label="Company document file"
        onChange={async (e) => {
          const file = e.target.files[0];
          if (!file) return;
          setBusy(true);
          setMessage("");
          try {
            if (file.size > 5 * 1024 * 1024)
              throw new Error("Choose a file under 5 MB.");
            await uploadCompanyFile(organization, file);
            await load();
            onChanged?.();
            setMessage("File uploaded. It is available to your organization.");
          } catch (error) {
            setMessage(error.message);
          } finally {
            setBusy(false);
            e.target.value = "";
          }
        }}
      />
      {message && <p role="status">{message}</p>}
      {!rows.length && (
        <p className="assetEmpty">
          No files yet. Start with a company overview or your offer document.
        </p>
      )}
      {rows.map((file) => (
        <div className="companyFile" key={file.id}>
          <div>
            <strong>{file.name}</strong>
            <small>
              {Math.max(1, Math.ceil(file.size_bytes / 1024))} KB ·{" "}
              {new Date(file.created_at).toLocaleDateString()}
            </small>
          </div>
          <div className="assetActions">
            <button
              className="btn secondary"
              onClick={async () => {
                const popup = window.open("about:blank", "_blank");
                if (popup) popup.opener = null;
                try {
                  const r = await request("/documents/" + file.id);
                  if (popup) popup.location.replace(r.url);
                  else location.assign(r.url);
                } catch (error) {
                  popup?.close();
                  setMessage(error.message);
                }
              }}
            >
              Open
            </button>
            {canRole(organization.role, "approve") &&
              (deleting === file.id ? (
                <>
                  <span>Delete this file?</span>
                  <button
                    className="btn secondary"
                    onClick={() => setDeleting("")}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn secondary"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await request("/documents/" + file.id, {
                          method: "DELETE",
                        });
                        await load();
                        setDeleting("");
                        onChanged?.();
                        setMessage("File deleted.");
                      } catch (error) {
                        setMessage(error.message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Delete file
                  </button>
                </>
              ) : (
                <button
                  className="btn secondary"
                  aria-label={"Delete " + file.name}
                  onClick={() => setDeleting(file.id)}
                >
                  <Trash2 size={14} />
                </button>
              ))}
          </div>
        </div>
      ))}
    </section>
  );
}
