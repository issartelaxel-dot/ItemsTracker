import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import earthDots from "../data/earth-dots.json";
import type { GeoPoint } from "../lib/admin-api";
import { countryName } from "../lib/admin-api";
const radians = Math.PI / 180;
function project(
  lat: number,
  lon: number,
  rotation: number,
  tilt: number,
  scale: number,
) {
  const a = lat * radians,
    b = (lon - rotation) * radians,
    t = tilt * radians;
  const x = Math.cos(a) * Math.sin(b),
    y = Math.sin(a) * Math.cos(t) - Math.cos(a) * Math.cos(b) * Math.sin(t),
    z = Math.sin(a) * Math.sin(t) + Math.cos(a) * Math.cos(b) * Math.cos(t);
  return { x: 250 + x * scale, y: 250 - y * scale, z };
}
export function AdminGlobe({
  points,
  onSelect,
  selected,
}: {
  points: GeoPoint[];
  onSelect: (point: GeoPoint) => void;
  selected: GeoPoint | null;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [rotation, setRotation] = useState(15),
    [tilt, setTilt] = useState(20),
    [zoom, setZoom] = useState(1);
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((z) => Math.max(0.8, Math.min(1.8, z - e.deltaY * 0.001)));
    };
    svg.addEventListener("wheel", wheel, { passive: false });
    return () => svg.removeEventListener("wheel", wheel);
  }, []);
  const id = useId().replaceAll(":", ""),
    gesture = useRef<{
      x: number;
      y: number;
      rotation: number;
      tilt: number;
      distance?: number;
      moved: boolean;
    } | null>(null),
    pointers = useRef(new Map<number, { x: number; y: number }>());
  const scale = 185 * zoom;
  const land = useMemo(
    () =>
      earthDots
        .map(([lat, lon]) => project(lat, lon, rotation, tilt, scale))
        .filter((p) => p.z > 0),
    [rotation, tilt, scale],
  );
  const grid = useMemo(() => {
    const paths: string[] = [];
    const line = (coords: number[][]) => {
      let path = "",
        visible = false;
      for (const [lat, lon] of coords) {
        const p = project(lat, lon, rotation, tilt, scale);
        if (p.z > 0) {
          path += `${visible ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`;
          visible = true;
        } else visible = false;
      }
      paths.push(path);
    };
    for (let lat = -60; lat <= 60; lat += 30)
      line(Array.from({ length: 181 }, (_, i) => [lat, -180 + i * 2]));
    for (let lon = -180; lon < 180; lon += 30)
      line(Array.from({ length: 91 }, (_, i) => [-90 + i * 2, lon]));
    return paths;
  }, [rotation, tilt, scale]);
  const cities = points
    .filter((p) => p.latitude !== null && p.longitude !== null)
    .map((p) => ({
      ...p,
      ...project(p.latitude!, p.longitude!, rotation, tilt, scale),
    }))
    .filter((p) => p.z > 0.04);
  const down = (e: PointerEvent<SVGSVGElement>) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture(e.pointerId);
    gesture.current = {
      x: e.clientX,
      y: e.clientY,
      rotation,
      tilt,
      moved: false,
    };
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current.distance = Math.hypot(a.x - b.x, a.y - b.y);
    }
  };
  const move = (e: PointerEvent<SVGSVGElement>) => {
    const g = gesture.current;
    if (!g) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()],
        distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (g.distance) {
        const previousDistance = g.distance;
        setZoom((z) =>
          Math.max(0.8, Math.min(1.8, (z * distance) / previousDistance)),
        );
        g.distance = distance;
      }
      g.moved = true;
      return;
    }
    const dx = e.clientX - g.x,
      dy = e.clientY - g.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) g.moved = true;
    setRotation(g.rotation - dx * 0.35);
    setTilt(Math.max(-70, Math.min(70, g.tilt + dy * 0.25)));
  };
  const end = (e: PointerEvent<SVGSVGElement>) => {
    const g = gesture.current;
    if (g && !g.moved && e.type === "pointerup") {
      const rect = e.currentTarget.getBoundingClientRect(),
        x = ((e.clientX - rect.left) / rect.width) * 500,
        y = ((e.clientY - rect.top) / rect.height) * 500;
      const nearest = [...cities].sort(
        (a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y),
      )[0];
      if (nearest && Math.hypot(nearest.x - x, nearest.y - y) < 22)
        onSelect(nearest);
    }
    pointers.current.delete(e.pointerId);
    gesture.current = null;
  };
  return (
    <div className="admin-globe-wrap">
      <svg
        ref={svgRef}
        className="admin-globe"
        viewBox="0 0 500 500"
        role="img"
        aria-label="Globe interactif : faites glisser pour tourner, utilisez les boutons pour zoomer et la liste des villes pour filtrer."
        tabIndex={0}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onKeyDown={(e) => {
          if (
            [
              "ArrowLeft",
              "ArrowRight",
              "ArrowUp",
              "ArrowDown",
              "+",
              "-",
              "Home",
            ].includes(e.key)
          ) {
            e.preventDefault();
            if (e.key === "ArrowLeft") setRotation((r) => r - 10);
            if (e.key === "ArrowRight") setRotation((r) => r + 10);
            if (e.key === "ArrowUp") setTilt((t) => Math.min(70, t + 10));
            if (e.key === "ArrowDown") setTilt((t) => Math.max(-70, t - 10));
            if (e.key === "+") setZoom((z) => Math.min(1.8, z + 0.1));
            if (e.key === "-") setZoom((z) => Math.max(0.8, z - 0.1));
            if (e.key === "Home") {
              setRotation(15);
              setTilt(20);
              setZoom(1);
            }
          }
        }}
      >
        <defs>
          <radialGradient id={id + "ocean"} cx="35%" cy="25%">
            <stop stopColor="#174dcc" />
            <stop offset=".65" stopColor="#082b80" />
            <stop offset="1" stopColor="#04153f" />
          </radialGradient>
          <radialGradient id={id + "aura"}>
            <stop offset=".65" stopColor="#2167ff" stopOpacity="0" />
            <stop offset=".84" stopColor="#2167ff" stopOpacity=".22" />
            <stop offset="1" stopColor="#2167ff" stopOpacity="0" />
          </radialGradient>
          <clipPath id={id + "clip"}>
            <circle cx="250" cy="250" r="205" />
          </clipPath>
        </defs>
        <circle cx="250" cy="250" r="238" fill={`url(#${id}aura)`} />
        <circle
          cx="250"
          cy="250"
          r="226"
          fill="none"
          stroke="#3d70e0"
          strokeOpacity=".45"
        />
        {Array.from({ length: 120 }, (_, i) => {
          const a = i * 3 * radians,
            r = i % 5 === 0 ? 219 : 223;
          return (
            <line
              key={i}
              x1={250 + Math.sin(a) * r}
              y1={250 + Math.cos(a) * r}
              x2={250 + Math.sin(a) * 228}
              y2={250 + Math.cos(a) * 228}
              stroke="#7fa3ff"
              strokeOpacity={i % 5 === 0 ? 0.8 : 0.3}
            />
          );
        })}
        <path d="M245 20 L255 20 L250 28Z" fill="#c9dcff" />
        <g clipPath={`url(#${id}clip)`}>
          <circle
            cx="250"
            cy="250"
            r={scale}
            fill={`url(#${id}ocean)`}
            stroke="#3d8bff"
            strokeWidth="1.5"
          />
          {grid.map((path, i) => (
            <path
              key={i}
              d={path}
              fill="none"
              stroke="#528af0"
              strokeOpacity=".25"
              strokeWidth=".8"
            />
          ))}
          {land.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={0.9 + zoom * 0.25}
              fill="#9bc6ff"
              opacity={0.25 + p.z * 0.65}
            />
          ))}
          {cities.map((p) => (
            <g
              key={`${p.country}:${p.city}:${p.latitude}`}
              data-location={`${p.country}:${p.city}`}
            >
              <title>
                {p.city || countryName(p.country)} : {p.users} utilisateurs,{" "}
                {p.visitors} visiteurs
              </title>
              <circle cx={p.x} cy={p.y} r={13} fill="#15dcdd" opacity=".15" />
              <circle
                cx={p.x}
                cy={p.y}
                r={7}
                fill="none"
                stroke={
                  selected?.country === p.country && selected?.city === p.city
                    ? "#f7dd52"
                    : "#36eced"
                }
                strokeWidth="1.5"
              />
              <circle cx={p.x} cy={p.y} r={3} fill="#b6ffff" />
            </g>
          ))}
        </g>
      </svg>
      <div className="admin-globe-controls">
        <button
          aria-label="Tourner vers l’ouest"
          onClick={() => setRotation((r) => r - 20)}
        >
          ←
        </button>
        <button
          aria-label="Tourner vers l’est"
          onClick={() => setRotation((r) => r + 20)}
        >
          →
        </button>
        <button
          aria-label="Dézoomer"
          onClick={() => setZoom((z) => Math.max(0.8, z - 0.15))}
        >
          −
        </button>
        <button
          aria-label="Zoomer"
          onClick={() => setZoom((z) => Math.min(1.8, z + 0.15))}
        >
          +
        </button>
        <button
          onClick={() => {
            setRotation(15);
            setTilt(20);
            setZoom(1);
          }}
        >
          Recentrer
        </button>
      </div>
      <small>Glisser pour tourner · sélectionner un point pour filtrer</small>
    </div>
  );
}
