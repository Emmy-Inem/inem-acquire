import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { api } from "./api";
import { useAuth } from "./AuthContext";
import PasswordField from "./PasswordField";
export function LiveBrand() {
  return (
    <Link className="brand" to="/" aria-label="Inem Acquire home">
      <img
        className="brandLogo colorLogo"
        src="/brand/color.svg"
        alt="Inem Acquire"
      />
      <img
        className="brandLogo whiteLogo"
        src="/brand/white.svg"
        alt=""
        aria-hidden="true"
      />
    </Link>
  );
}
export function AuthPage({ mode }) {
  const { refresh, selectOrganization } = useAuth(),
    navigate = useNavigate(),
    location = useLocation(),
    { token } = useParams();
  const [email, setEmail] = useState(
      () => new URLSearchParams(location.search).get("email") || "",
    ),
    [name, setName] = useState(""),
    [password, setPassword] = useState(""),
    [pending, setPending] = useState(false),
    [checkingLink, setCheckingLink] = useState(
      ["callback", "reset-password"].includes(mode),
    ),
    [resetReady, setResetReady] = useState(false),
    [error, setError] = useState(""),
    [errorCode, setErrorCode] = useState(""),
    [verificationSent, setVerificationSent] = useState(false),
    [notice, setNotice] = useState("");
  const title = {
    login: "Welcome back",
    signup: "Create your workspace",
    "forgot-password": "Reset your password",
    "reset-password": "Choose a new password",
    "verify-email": "Check your inbox",
    invite: "Join your team",
    callback: "Confirming your email",
  }[mode];
  useEffect(() => {
    if (!["callback", "reset-password"].includes(mode)) return;
    let active = true;
    setCheckingLink(true);
    setResetReady(false);
    const exchange = async () => {
      const fragment = new URLSearchParams(window.location.hash.slice(1)),
        query = new URLSearchParams(location.search);
      const recovery =
        mode === "reset-password" ||
        fragment.get("type") === "recovery" ||
        query.get("type") === "recovery";
      if (window.location.hash || query.has("token_hash") || query.has("error"))
        window.history.replaceState(
          window.history.state,
          "",
          location.pathname,
        );
      if (fragment.has("error") || query.has("error"))
        throw new Error(
          "This link has expired or is invalid. Request a new link and open the latest email.",
        );
      if (fragment.get("access_token")) {
        await api("/auth/session", {
          method: "POST",
          body: {
            access_token: fragment.get("access_token"),
            refresh_token: fragment.get("refresh_token"),
          },
        });
        await refresh();
        if (active) {
          setResetReady(recovery);
          if (mode === "callback")
            navigate(recovery ? "/reset-password" : "/app/dashboard", {
              replace: true,
            });
        }
      } else if (query.get("token_hash")) {
        await api("/auth/exchange", {
          method: "POST",
          body: {
            token_hash: query.get("token_hash"),
            type: query.get("type") || (recovery ? "recovery" : "email"),
          },
        });
        await refresh();
        if (active) {
          setResetReady(recovery);
          navigate(recovery ? "/reset-password" : "/app/dashboard", {
            replace: true,
          });
        }
      } else if (mode === "callback")
        throw new Error(
          "This link is incomplete. Open the latest verification email or sign in.",
        );
      else {
        const session = await refresh();
        if (!session)
          throw new Error(
            "Open the reset link in your email to choose a new password.",
          );
        if (active) setResetReady(true);
      }
    };
    exchange()
      .catch((e) => active && setError(e.message))
      .finally(() => active && setCheckingLink(false));
    return () => {
      active = false;
    };
  }, [mode]);
  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setErrorCode("");
    setPending(true);
    try {
      if (mode === "signup") {
        const response = await api("/auth/signup", {
          method: "POST",
          body: {
            email: email.trim().toLowerCase(),
            password,
            full_name: name,
          },
        });
        if (response.needsVerification) {
          setNotice(
            "Check your email and confirm your address before signing in.",
          );
          return;
        }
        await refresh();
        navigate("/onboarding/welcome");
      }
      if (mode === "login") {
        await api("/auth/login", {
          method: "POST",
          body: { email: email.trim().toLowerCase(), password },
        });
        await refresh();
        navigate(location.state?.from || "/app/dashboard");
      }
      if (mode === "forgot-password") {
        await api("/auth/forgot-password", { method: "POST", body: { email } });
        setNotice(
          "If an account exists, a password reset link will be sent to that address.",
        );
      }
      if (mode === "reset-password") {
        if (!resetReady)
          throw new Error("Open a valid password reset link first.");
        await api("/auth/password", { method: "POST", body: { password } });
        setNotice("Password updated. You can return to your workspace.");
      }
      if (mode === "invite") {
        const response = await api("/invitations/accept", {
          method: "POST",
          body: { token },
        });
        await refresh();
        selectOrganization(response.organization_id);
        navigate("/app/dashboard");
      }
    } catch (e) {
      setError(e.message);
      setErrorCode(e.code || "");
    } finally {
      setPending(false);
    }
  };
  return (
    <main className="authPage">
      <section className="authStory">
        <LiveBrand />
        <div>
          <h1>A clearer way to grow.</h1>
          <p>
            Bring your company, research, conversations and opportunities into
            one connected workspace.
          </p>
        </div>
        <small>© 2026 Inem Acquire</small>
      </section>
      <section className="authForm">
        <div className="mobileBrand">
          <LiveBrand />
        </div>
        <form onSubmit={submit}>
          <h1>{title}</h1>
          {mode === "signup" && (
            <p>
              Start with a verified email. Your organization’s data stays
              separate from other workspaces.
            </p>
          )}
          {error && (
            <div className="liveError" role="alert">
              {error}
            </div>
          )}
          {notice ? (
            <div className="liveNotice" role="status">
              <CheckCircle2 />
              <p>{notice}</p>
              <Link
                to={mode === "reset-password" ? "/app/dashboard" : "/login"}
              >
                Continue <ArrowRight size={15} />
              </Link>
            </div>
          ) : (
            <>
              {mode === "signup" && (
                <label className="field">
                  <span>Full name</span>
                  <input
                    autoComplete="name"
                    required
                    minLength={2}
                    maxLength={120}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
              )}
              {["signup", "login", "forgot-password"].includes(mode) && (
                <label className="field">
                  <span>Email address</span>
                  <input
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>
              )}
              {["signup", "login", "reset-password"].includes(mode) && (
                <PasswordField
                  label={
                    mode === "reset-password" ? "New password" : "Password"
                  }
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              )}
              {mode === "invite" && (
                <p>
                  Sign in with the verified email that received this invitation,
                  then accept it to join the organization.{" "}
                  <Link to="/login" state={{ from: location.pathname }}>
                    Sign in to accept
                  </Link>
                </p>
              )}
              {!["verify-email", "callback"].includes(mode) && (
                <button
                  className="btn primary"
                  disabled={
                    pending ||
                    (mode === "reset-password" && (!resetReady || checkingLink))
                  }
                >
                  {pending
                    ? "Please wait…"
                    : {
                        login: "Sign in",
                        signup: "Create account",
                        "forgot-password": "Send reset link",
                        "reset-password": "Update password",
                        invite: "Accept invitation",
                      }[mode]}
                  <ArrowRight size={16} />
                </button>
              )}
            </>
          )}
          {mode === "login" && (
            <>
              <Link className="authSecondary" to="/forgot-password">
                Forgot password?
              </Link>
              <p className="switch">
                New to Inem Acquire? <Link to="/signup">Create an account</Link>
              </p>
            </>
          )}
          {(errorCode === "email_not_confirmed" ||
            (mode === "signup" && notice)) && (
            <button
              type="button"
              className="authResend"
              disabled={pending}
              onClick={async () => {
                setPending(true);
                setError("");
                try {
                  await api("/auth/resend-verification", {
                    method: "POST",
                    body: { email: email.trim().toLowerCase() },
                  });
                  setVerificationSent(true);
                } catch (e) {
                  setError(e.message);
                } finally {
                  setPending(false);
                }
              }}
            >
              {pending ? "Sending…" : "Resend confirmation email"}
            </button>
          )}
          {verificationSent && (
            <p className="liveNotice" role="status">
              If this account needs confirmation, a new verification link has
              been sent. Open the latest email.
            </p>
          )}
          {mode === "signup" && (
            <p className="switch">
              Already have an account? <Link to="/login">Sign in</Link>
            </p>
          )}
          {mode === "verify-email" && (
            <p>
              Use the confirmation link in your email, then{" "}
              <Link to="/login">sign in</Link>.
            </p>
          )}
          {mode === "callback" && !error && (
            <p role="status">Completing your sign-in…</p>
          )}
          {mode === "reset-password" && checkingLink && (
            <p role="status">Checking your reset link…</p>
          )}
          {mode === "reset-password" && error && !resetReady && (
            <Link className="authSecondary" to="/forgot-password">
              Request a new reset link
            </Link>
          )}
        </form>
      </section>
    </main>
  );
}
export function SetupPage() {
  const { refresh, selectOrganization } = useAuth(),
    navigate = useNavigate();
  const [name, setName] = useState(""),
    [website, setWebsite] = useState(""),
    [industry, setIndustry] = useState(""),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
  return (
    <main className="liveSetup">
      <LiveBrand />
      <form
        className="panel"
        onSubmit={async (e) => {
          e.preventDefault();
          setPending(true);
          setError("");
          try {
            const data = await api("/organizations", {
              method: "POST",
              body: {
                name,
                website: website || null,
                industry: industry || null,
              },
            });
            selectOrganization(data.id);
            await refresh();
            navigate("/app/dashboard");
          } catch (e) {
            setError(e.message);
          } finally {
            setPending(false);
          }
        }}
      >
        <span className="blueKicker">Your organization</span>
        <h1>Let’s build your workspace.</h1>
        <p>
          Create your organization, then add your offer, ideal customers and
          sales records at your own pace.
        </p>
        {error && (
          <div className="liveError" role="alert">
            {error}
          </div>
        )}
        <label className="field">
          <span>Organization name</span>
          <input
            required
            minLength={2}
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Website</span>
          <input
            type="url"
            placeholder="https://company.com"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Industry</span>
          <input
            maxLength={120}
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
          />
        </label>
        <button className="btn primary" disabled={pending}>
          {pending ? "Creating…" : "Create workspace"}
          <ArrowRight size={16} />
        </button>
      </form>
    </main>
  );
}
export function LiveDemoForm() {
  const [pending, setPending] = useState(false),
    [done, setDone] = useState(false),
    [error, setError] = useState("");
  return done ? (
    <div className="demoSuccess" role="status">
      <CheckCircle2 />
      <h3>Your request has been received.</h3>
      <p>Your details have been saved for the team to review.</p>
      <button onClick={() => setDone(false)}>Send another request</button>
    </div>
  ) : (
    <form
      className="demoForm"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setError("");
        const f = new FormData(e.currentTarget);
        try {
          await api("/demo", { method: "POST", body: Object.fromEntries(f) });
          setDone(true);
        } catch (e) {
          setError(e.message);
        } finally {
          setPending(false);
        }
      }}
    >
      {error && (
        <div className="liveError" role="alert">
          {error}
        </div>
      )}
      {[
        ["name", "Full name", "text"],
        ["email", "Work email", "email"],
        ["company", "Company", "text"],
      ].map(([name, label, type]) => (
        <label className="field" key={name}>
          <span>{label}</span>
          <input
            name={name}
            type={type}
            required
            minLength={type === "text" ? 2 : undefined}
            maxLength={200}
          />
        </label>
      ))}
      <label className="field">
        <span>What would you like to improve?</span>
        <textarea name="message" maxLength={5000} />
      </label>
      <button className="btn primary" disabled={pending}>
        {pending ? "Sending…" : "Request my demo"}
        <ArrowRight size={16} />
      </button>
      <small>
        By submitting, you agree that Inem Acquire may contact you about this
        request.
      </small>
    </form>
  );
}
