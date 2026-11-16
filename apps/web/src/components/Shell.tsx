import { NavLink, Outlet } from "react-router";
import { AvatarStage } from "../avatar/AvatarStage";

const LINKS = [
  ["/", "Kreu"],
  ["/alphabet", "Alfabeti"],
  ["/fingerspell", "Gërmëzim"],
  ["/keyboard", "Tastiera"],
  ["/dictionary", "Fjalori"],
  ["/translate", "Përkthe"],
  ["/studio", "Studio"],
  ["/lab/rig", "Prova"],
  ["/lab/mirror", "Pasqyra"],
  ["/lab/clip", "Klipet"],
] as const;

export function Shell() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <p className="font-semibold">GjShSh Avatar</p>
          <nav className="flex flex-wrap gap-1 text-sm">
            {LINKS.map(([to, label]) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({ isActive }) =>
                  `rounded-full px-3 py-1 ${isActive ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"}`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto grid max-w-6xl gap-4 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="h-[68vh] min-h-80 overflow-hidden rounded-3xl border border-slate-200 bg-slate-100">
          <AvatarStage />
        </section>
        <section className="min-w-0">
          <Outlet />
        </section>
      </main>
    </div>
  );
}
