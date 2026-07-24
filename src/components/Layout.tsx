import { Outlet, NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const navItems = [
  { to: "/", label: "Dashboard", icon: "📊" },
  { to: "/bills", label: "Bills", icon: "💵" },
  { to: "/compare", label: "Compare", icon: "📈" },
  { to: "/resources", label: "Resources", icon: "🆘" },
  { to: "/settings", label: "Settings", icon: "⚙️" },
];

export default function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="flex min-h-dvh flex-col bg-gray-50">
      <header className="bg-indigo-600 px-4 py-3 text-white shadow">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight">PayWise</h1>
          <div className="flex items-center gap-3">
            {user && (
              <span className="text-sm opacity-80 hidden sm:inline">
                {user.email}
              </span>
            )}
            <button
              onClick={logout}
              className="text-xs text-white/70 hover:text-white transition-colors border border-white/30 rounded px-2 py-0.5"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 py-6">
        <div className="mx-auto max-w-2xl">
          <Outlet />
        </div>
      </main>

      <nav className="border-t border-gray-200 bg-white px-2 pb-safe">
        <div className="mx-auto flex max-w-2xl justify-around">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 px-3 py-2 text-xs font-medium transition-colors ${
                  isActive
                    ? "text-indigo-600"
                    : "text-gray-500 hover:text-gray-700"
                }`
              }
            >
              <span className="text-lg">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
