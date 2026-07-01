import { Link, Outlet } from "react-router-dom";
import { Brand } from "./components/Brand.js";

export function App() {
  return (
    <div className="shell">
      <header className="topbar">
        <Link to="/" className="brand">
          <Brand subtitle="Timeclock Corrections" />
        </Link>
        <nav>
          <Link to="/">Home</Link>
          <Link to="/admin">Admin</Link>
        </nav>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
