import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { App } from "./App.js";
import { EmployeeHome } from "./routes/EmployeeHome.js";
import { AdminPage } from "./routes/AdminPage.js";
import "./styles.css";

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <EmployeeHome /> },
      { path: "report", element: <EmployeeHome /> },
      { path: "status", element: <EmployeeHome /> },
      { path: "admin", element: <AdminPage /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
