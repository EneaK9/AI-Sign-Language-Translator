import { Link } from "react-router";

export function HomePage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Përkthyes prove i gjuhës shqipe të shenjave</h1>
      <p className="text-sm leading-6 text-slate-700">
        Avatari lëviz duke ndjekur video dhe kamerën. Kjo është një provë lokale, jo një fjalor i verifikuar nga
        persona të shurdhër. Mos e përdor për lajme, mjekësi apo ligj.
      </p>
      <div className="flex flex-wrap gap-2">
        <Link className="rounded-full bg-teal-700 px-4 py-2 text-white" to="/alphabet">
          Alfabeti
        </Link>
        <Link className="rounded-full bg-slate-900 px-4 py-2 text-white" to="/dictionary">
          Fjalori
        </Link>
        <Link className="rounded-full bg-slate-200 px-4 py-2" to="/translate">
          Përkthe
        </Link>
      </div>
    </div>
  );
}
