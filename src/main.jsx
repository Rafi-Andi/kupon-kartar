import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx"; // Pastikan path ini benar ke App.jsx Anda
import "./index.css"; // Opsional, jika Anda memiliki file CSS global

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
