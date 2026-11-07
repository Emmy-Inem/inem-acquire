import { AuthProvider } from "./live/AuthContext";
import "./live/live.css";
import { MotionFeedback } from "./PlatformMotion";
import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles.css";
import "./responsive.css";
import "./workspace.css";
import "./live/workspace-theme.css";
createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <AuthProvider>
      <MotionFeedback>
        <App />
      </MotionFeedback>
    </AuthProvider>
  </BrowserRouter>,
);
