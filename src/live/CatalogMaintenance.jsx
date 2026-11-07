import { useRef, useState } from "react";
export default function CatalogMaintenance() {
  const [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(null),
    [message, setMessage] = useState("");
  const job = useRef(null);
  return (
    <details className="consoleCatalogTools">
      <summary>Catalog website quality</summary>
      <p>
        Historical website addresses need current evidence. Review the next 20
        flagged businesses, look for their real websites and save confirmed
        corrections. Restricted access is kept separate from a confirmed match.
      </p>
      <button
        className="btn secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMessage("");
          setProgress({ reviewed: 0, confirmed: 0, recovered: 0 });
          job.current = new AbortController();
          try {
            const r = await fetch("/api/platform/catalog/review", {
              method: "POST",
              credentials: "same-origin",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ limit: 20 }),
              signal: job.current.signal,
            });
            if (!r.ok) {
              const e = await r.json();
              throw Error(e.error || "Review unavailable.");
            }
            const reader = r.body
              .pipeThrough(new TextDecoderStream())
              .getReader();
            let pending = "";
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              pending += value;
              const lines = pending.split("\n");
              pending = lines.pop();
              for (const line of lines.filter(Boolean)) {
                const data = JSON.parse(line);
                if (data.error) setMessage(data.error);
                if (data.reviewed != null) setProgress(data);
              }
            }
            setMessage("Batch complete. Review the next batch to continue.");
          } catch (e) {
            setMessage(
              e.name === "AbortError"
                ? "Review stopped. Completed checks were saved."
                : e.message,
            );
          } finally {
            setBusy(false);
            job.current = null;
          }
        }}
      >
        {busy ? "Reviewing websites…" : "Review next 20 websites"}
      </button>
      {busy && (
        <button className="btn secondary" onClick={() => job.current?.abort()}>
          Stop review
        </button>
      )}
      {progress && (
        <p role="status">
          {progress.reviewed} reviewed · {progress.confirmed} confirmed ·{" "}
          {progress.recovered} corrected
        </p>
      )}
      {message && <p role="status">{message}</p>}
    </details>
  );
}
