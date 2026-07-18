import React from "react";
import { createRoot } from "react-dom/client";
import { OptionsPage } from "./OptionsPage";

const container = document.getElementById("root");

if (container) {
    createRoot(container).render(<OptionsPage />);
}
