import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

export default function PasswordField({
  label = "Password",
  value,
  onChange,
  autoComplete = "new-password",
}) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return (
    <div className="field passwordField">
      <label htmlFor={id}>{label}</label>
      <div className="passwordInput">
        <input
          id={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          required
          minLength={6}
          maxLength={128}
          value={value}
          onChange={onChange}
          aria-describedby={id + "-hint"}
        />
        <button
          type="button"
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          aria-controls={id}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? (
            <EyeOff size={20} aria-hidden="true" />
          ) : (
            <Eye size={20} aria-hidden="true" />
          )}
        </button>
      </div>
      <small id={id + "-hint"}>Use at least 6 characters.</small>
    </div>
  );
}
