import { useState } from "react";
import { api } from "./api";
import { useAuth } from "./AuthContext";
export default function AccountSettings() {
  const { session, refresh } = useAuth();
  const [name, setName] = useState(session.profile.full_name || ""),
    [pending, setPending] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState("");
  return (
    <section className="panel livePanel">
      <h2>Your profile</h2>
      <p>Your personal details apply across all organizations you belong to.</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setPending(true);
          setError("");
          setNotice("");
          try {
            await api("/profile", {
              method: "PATCH",
              body: { full_name: name },
            });
            await refresh();
            setNotice("Profile saved.");
          } catch (e) {
            setError(e.message);
          } finally {
            setPending(false);
          }
        }}
      >
        <label className="field">
          <span>Full name</span>
          <input
            required
            minLength={2}
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Email address</span>
          <input type="email" value={session.user.email} readOnly />
          <small>Your verified sign-in address.</small>
        </label>
        {error && (
          <p role="alert" className="liveError">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="liveNotice">
            {notice}
          </p>
        )}
        <button className="btn primary" disabled={pending}>
          {pending ? "Saving…" : "Save profile"}
        </button>
      </form>
    </section>
  );
}
