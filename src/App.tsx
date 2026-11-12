import prague from "../data/cities/prague.json";
import { parseCity } from "./catalogue";
import { AppShell } from "./ui/AppShell";

const city = parseCity(prague);

export function App() {
  return (
    <AppShell>
      <section aria-labelledby="city-heading" className="space-y-2">
        <h2 id="city-heading" className="text-2xl font-semibold">
          {city.name}
        </h2>
        <p className="text-stone-700">{city.places.length} places in the catalogue</p>
      </section>
    </AppShell>
  );
}
