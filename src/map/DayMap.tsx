import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./map.css";
import type { LatLon } from "./routeTypes";

type Props = {
  start: LatLon;
  stops: { name: string; location: LatLon }[];
  selected: number;
  onSelect: (index: number) => void;
  path?: LatLon[]; // the selected leg's route; a straight dashed line is drawn when missing
};

const OSM_TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export function DayMap({ start, stops, selected, onSelect, path }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layers = useRef<L.LayerGroup | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    const m = L.map(container.current!, { zoomControl: true, attributionControl: false });
    L.control.attribution({ prefix: false }).addTo(m);
    L.tileLayer(OSM_TILES, { maxZoom: 19, attribution: OSM_ATTRIBUTION }).addTo(m);
    map.current = m;
    layers.current = L.layerGroup().addTo(m);
    return () => {
      m.remove();
      map.current = null;
    };
  }, []);

  const legFrom = selected === 0 ? start : stops[selected - 1]?.location;
  const legTo = stops[selected]?.location;

  useEffect(() => {
    const m = map.current;
    const group = layers.current;
    if (!m || !group) return;
    group.clearLayers();

    L.circleMarker(start, { radius: 7, color: "#fff", weight: 2, fillColor: "#1c1917", fillOpacity: 1, interactive: false })
      .bindTooltip("Start", { permanent: true, direction: "right", offset: [8, 0] })
      .addTo(group);

    stops.forEach((stop, i) => {
      const active = i === selected;
      L.marker(stop.location, {
        title: `${i + 1}. ${stop.name}`,
        alt: `Stop ${i + 1}: ${stop.name}`,
        zIndexOffset: active ? 1000 : 0,
        icon: L.divIcon({
          className: "",
          iconSize: [44, 44],
          html: `<span class="stop-marker${active ? " stop-marker--active" : ""}">${i + 1}</span>`,
        }),
      })
        .on("click", () => onSelectRef.current(i))
        .addTo(group);
    });

    if (legFrom && legTo) {
      if (path?.length) {
        L.polyline(path, { color: "#0f766e", weight: 6, opacity: 0.85 }).addTo(group);
      } else {
        L.polyline([legFrom, legTo], { color: "#0f766e", weight: 4, dashArray: "8 8" }).addTo(group);
      }
      m.fitBounds(L.latLngBounds([legFrom, legTo, ...(path ?? [])]), { padding: [40, 40], maxZoom: 17 });
    } else if (stops.length) {
      m.fitBounds(L.latLngBounds(stops.map((s) => s.location)), { padding: [40, 40] });
    }
  }, [start, stops, selected, path, legFrom, legTo]);

  return (
    <div
      ref={container}
      role="region"
      aria-label="Map of today's stops"
      className="h-72 w-full overflow-hidden rounded-xl border border-stone-200 bg-stone-100"
    />
  );
}
