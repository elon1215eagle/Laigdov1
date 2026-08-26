import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import { QuickCheckoutPage } from "./modules/quick-checkout/QuickCheckoutPage.jsx";
import "./styles.css";

const RootPage = window.location.pathname.startsWith("/quick-checkout") ? QuickCheckoutPage : App;

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <RootPage />
  </React.StrictMode>,
);
