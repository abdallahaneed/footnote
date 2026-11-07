import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import { App } from "./app/App";
import { DesignPage } from "./design/DesignPage";

// #/design keeps the component check page from /replica-design reachable.
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>{location.hash === "#/design" ? <DesignPage /> : <App />}</React.StrictMode>,
);
