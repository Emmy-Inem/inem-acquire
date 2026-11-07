import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Paperclip, Send, Upload } from "lucide-react";
import { api } from "./api";
import { useAuth } from "./AuthContext";
import { canRole } from "../../shared/permissions";
import { uploadCompanyFile } from "./CompanyAssets";
export default function SalesAdvisor() {
  const { organization, workspaceBase } = useAuth(),
    label = useId(),
    input = useRef(null),
    answerRef = useRef(null);
  const [question, setQuestion] = useState(""),
    [history, setHistory] = useState([]),
    [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [documents, setDocuments] = useState([]),
    [selected, setSelected] = useState([]),
    [filesOpen, setFilesOpen] = useState(false);
  const request = useCallback(
    (path, options = {}) =>
      api(path, {
        ...options,
        organizationId: organization.id,
        supportSessionId: organization.support?.id,
      }),
    [organization.id, organization.support?.id],
  );
  const loadFiles = useCallback(
    () =>
      request("/documents")
        .then((r) => setDocuments(r.data))
        .catch((e) => setError(e.message)),
    [request],
  );
  useEffect(() => {
    loadFiles();
  }, [loadFiles]);
  useEffect(() => {
    if (history.length)
      answerRef.current?.scrollIntoView({
        block: "start",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
  }, [history.length]);
  async function ask(value) {
    if (pending || value.trim().length < 3) return;
    setPending(true);
    setError("");
    try {
      const answer = await request("/advisor", {
        method: "POST",
        body: {
          question: value.trim(),
          document_ids: selected,
          history: history
            .slice(-4)
            .map(({ question, answer }) => ({
              question,
              answer: answer.answer,
            })),
        },
      });
      setHistory((old) => [...old, { question: value.trim(), answer }]);
      setQuestion("");
      setSelected([]);
    } catch (e) {
      setError(e.message);
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <div className="pageHeader">
        <div>
          <h1>Sales advisor</h1>
          <p>
            Ask about your next move. Answers use this company’s offers,
            customer profiles, deals and follow-ups.
          </p>
        </div>
        <div className="headerActions">
          <Link className="btn secondary" to={workspaceBase + "/company"}>
            Company & files
          </Link>
        </div>
      </div>
      <div className="advisorLayout">
        <section className="advisorConversation" aria-live="polite">
          {!history.length && (
            <div className="panel livePanel advisorWelcome">
              <h2>What would move sales forward today?</h2>
              <p>
                Get a practical answer based on your workspace. Attach a file to
                include a proposal, company overview or sales evidence.
              </p>
              <div className="advisorPrompts">
                {[
                  "What should I follow up on today?",
                  "Who should we target for our offers?",
                  "How can I improve our pipeline?",
                  "Help me prepare a relevant outreach plan.",
                ].map((prompt) => (
                  <button
                    key={prompt}
                    disabled={pending}
                    onClick={() => ask(prompt)}
                  >
                    {prompt}
                    <ArrowRight size={15} />
                  </button>
                ))}
              </div>
            </div>
          )}
          {history.map((turn, i) => (
            <article
              ref={i === history.length - 1 ? answerRef : undefined}
              className="panel livePanel advisorTurn"
              key={i}
            >
              <h2>{turn.question}</h2>
              <p className="liveMessageBody">{turn.answer.answer}</p>
              {turn.answer.notice && (
                <p className="advisorNotice">{turn.answer.notice}</p>
              )}
              <div className="advisorPriorities">
                {turn.answer.priorities?.map((p, j) => (
                  <div key={j}>
                    <strong>{p.title}</strong>
                    <p>{p.detail}</p>
                    <Link to={workspaceBase + "/" + p.page}>
                      Open {p.page.replaceAll("-", " ")}{" "}
                      <ArrowRight size={14} />
                    </Link>
                  </div>
                ))}
              </div>
              {!!turn.answer.documents?.length && (
                <small>
                  Files used:{" "}
                  {turn.answer.documents.map((d) => d.name).join(", ")}
                </small>
              )}
              <small className="advisorScope">
                {turn.answer.mode} · {turn.answer.scope}
              </small>
            </article>
          ))}
          {pending && (
            <p className="liveState" role="status">
              Reviewing your question and workspace evidence…
            </p>
          )}
        </section>
        <form
          className="panel livePanel salesAdvisorComposer"
          onSubmit={(e) => {
            e.preventDefault();
            ask(question);
          }}
        >
          <label className="field">
            <span id={label}>Ask your sales question</span>
            <textarea
              aria-labelledby={label}
              required
              minLength={3}
              maxLength={2000}
              rows={3}
              placeholder="For example: which deals need attention, and what should I do next?"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              disabled={pending}
            />
          </label>
          <div className="assetActions">
            <button
              type="button"
              className="btn secondary"
              onClick={() => setFilesOpen((v) => !v)}
              disabled={pending}
            >
              <Paperclip size={15} />
              {selected.length
                ? selected.length + " files attached"
                : "Attach files"}
            </button>
            <button
              className="btn primary"
              disabled={pending || question.trim().length < 3}
            >
              <Send size={15} />
              {pending ? "Thinking…" : "Ask advisor"}
            </button>
          </div>
          {filesOpen && (
            <div className="advisorFiles">
              <p>
                Select up to 3 files, totaling 2 MB. Only selected files are
                included in this answer.
              </p>
              {documents.map((doc) => (
                <label key={doc.id}>
                  <input
                    type="checkbox"
                    checked={selected.includes(doc.id)}
                    disabled={
                      pending ||
                      (!selected.includes(doc.id) && selected.length >= 3)
                    }
                    onChange={(e) =>
                      setSelected((ids) =>
                        e.target.checked
                          ? [...ids, doc.id]
                          : ids.filter((id) => id !== doc.id),
                      )
                    }
                  />
                  <span>
                    {doc.name}{" "}
                    <small>{Math.ceil(doc.size_bytes / 1024)} KB</small>
                  </span>
                </label>
              ))}
              {!documents.length && <p>No files uploaded yet.</p>}
              {canRole(organization.role, "write") && (
                <>
                  <button
                    type="button"
                    className="btn secondary"
                    disabled={pending}
                    onClick={() => input.current?.click()}
                  >
                    <Upload size={15} />
                    Upload a file
                  </button>
                  <input
                    ref={input}
                    hidden
                    type="file"
                    accept=".pdf,.txt,.csv"
                    aria-label="Advisor attachment file"
                    onChange={async (e) => {
                      const file = e.target.files[0];
                      if (!file) return;
                      setPending(true);
                      try {
                        if (file.size > 2 * 1024 * 1024)
                          throw new Error(
                            "Choose a file under 2 MB for the advisor.",
                          );
                        const result = await uploadCompanyFile(
                          organization,
                          file,
                        );
                        await loadFiles();
                        setSelected((ids) =>
                          [...ids, result.data.id].slice(-3),
                        );
                      } catch (error) {
                        setError(error.message);
                      } finally {
                        setPending(false);
                        e.target.value = "";
                      }
                    }}
                  />
                </>
              )}
            </div>
          )}
          {error && (
            <p className="liveError" role="alert">
              {error}
            </p>
          )}
        </form>
      </div>
    </>
  );
}
