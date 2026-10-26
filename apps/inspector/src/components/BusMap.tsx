"use client";

import { LngLatBounds, Map as MapLibreMap, Marker, setWorkerUrl, type GeoJSONSource, type PointLike } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { arrowOpacity, createMotion, heldWithoutSignal, pushFix, sameReading, stepMotion, STOP_KMH, type MotionState, type RouteLine } from "../lib/motion";
import { routeStroke } from "../lib/route";
import Loading from "./Loading";

export type MapBus = {
  id: number;
  line: string | null;
  lng: number;
  lat: number;
  label: string;
  color: string;
  text: string;
  fresh: boolean;
  speed: number;
  course: number | null;
  moving: boolean;
  age: number;
};
// A path or a stop may carry its own color, when more than one line is on the map at once.
export type MapPath = { direction: string; coordinates: [number, number][]; color?: string };
export type MapStop = { id: string; lng: number; lat: number; color?: string };

// A labeled mark drawn over the map: where a trip starts, where to get on and off, where it ends.
export type MapMark = {
  id: string;
  lng: number;
  lat: number;
  kind: "letter" | "label";
  // "letter": a round badge (A, B). "label": a pill with a text.
  text: string;
  // Small extra under the pill, e.g. the stop name is not drawn; kept short on purpose.
  color: string;
  textColor: string;
  bus?: boolean;
};

type Props = {
  theme: "light" | "dark";
  marks?: MapMark[];
  buses: MapBus[];
  paths: MapPath[];
  activeDirection: string | null;
  color: string;
  stops: MapStop[];
  selectedStop: string | null;
  // SUBE recharge points: all the ones currently matched in the picker, shown at once.
  subePoints: MapStop[];
  selectedSube: string | null;
  me: [number, number] | null;
  // The bus the camera zooms to and keeps centered on, between readings, until dragged or zoomed by hand.
  followBusId: number | null;
  onUnfollow: () => void;
  // The start and the destination of a trip being planned.
  pins: { at: [number, number]; end: "from" | "to" }[];
  // Changes when the map should frame the current route again.
  fitKey: string;
  // Points that must stay in view together with the route: where the trip starts and ends.
  frame: [number, number][];
  focus: { lng: number; lat: number; key: string } | null;
  // Full routes the buses can follow between readings. A bus whose route is not here stays at its last reading.
  routes: RouteLine[];
  // Ida and vuelta are both on the map, so the legend is shown.
  legend: boolean;
  onBus: (id: number) => void;
  onStop: (id: string) => void;
  onSube: (id: string) => void;
  onMap: (point: [number, number]) => void;
};

// MapLibre ships its worker as a separate file; the bundler does not carry it, so it is served from public/.
const ASSET_BASE = process.env.NEXT_PUBLIC_BASE_PATH || "";
if (typeof window !== "undefined") {
  setWorkerUrl(`${ASSET_BASE}/maplibre-gl-worker.mjs`);
}

const STYLE = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
} as const;
const CENTER: [number, number] = [-65.28, -24.215];
const ME = "#2b63d9";
// Blue, same as the "Buscar puntos" button: only SUBE points use it, so they read as theirs, not ours.
const SUBE_BLUE = "#0a56a8";
// About 15 frames a second: enough for the buses to look like they roll, light on a phone.
const FRAME_MS = 66;
const STALE_S = 120;

// A small chevron pointing up, drawn as an SDF so MapLibre tints it with the line color and a white halo.
// It sits just ahead of the bus and turns with the bearing, so the direction reads at a glance.
function arrowImage(): ImageData {
  const size = 32;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext("2d");
  if (!g) return new ImageData(size, size);
  g.fillStyle = "#ffffff";
  g.beginPath();
  g.moveTo(16, 4);
  g.lineTo(27, 24);
  g.lineTo(16, 18);
  g.lineTo(5, 24);
  g.closePath();
  g.fill();
  return g.getImageData(0, 0, size, size);
}

// The dark base, toned to charcoal with fewer labels, so the white buses are what stands out.
function charcoal(m: MapLibreMap) {
  for (const layer of m.getStyle().layers ?? []) {
    const id = layer.id;
    if (layer.type === "background") m.setPaintProperty(id, "background-color", "#1b1d1f");
    else if (layer.type === "fill" && /water/.test(id)) m.setPaintProperty(id, "fill-color", "#121416");
    else if (layer.type === "fill" && /landuse|landcover|park|wood|grass/.test(id)) m.setPaintProperty(id, "fill-opacity", 0.25);
    else if (layer.type === "fill" && /building/.test(id)) m.setPaintProperty(id, "fill-color", "#232629");
    else if (layer.type === "line" && /road|highway|street|bridge|tunnel/.test(id)) m.setPaintProperty(id, "line-color", "#33373b");
    else if (layer.type === "symbol" && /poi|housenumber|aeroway|transit|water_name|waterway/.test(id)) m.setLayoutProperty(id, "visibility", "none");
    else if (layer.type === "symbol") {
      m.setPaintProperty(id, "text-color", "#8a8f94");
      m.setPaintProperty(id, "text-halo-color", "#1b1d1f");
    }
  }
}

const BUS_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3.5" width="16" height="14" rx="3"/><path d="M4 11h16M7 20.5v-3M17 20.5v-3"/></svg>';

// Light cores (white-ish lines) vanish inside a white edge on the dark map, so the edge flips to dark for them.
function isLight(hex: string): boolean {
  const h = hex.replace("#", "");
  if (h.length !== 6) return false;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return r * 0.299 + g * 0.587 + b * 0.114 > 150;
}

type Placa = { marker: Marker; root: HTMLButtonElement; num: HTMLElement };

function crearPlaca(onPick: (id: number) => void): { root: HTMLButtonElement; num: HTMLElement } {
  const root = document.createElement("button");
  root.type = "button";
  root.className = "urbano-placa";
  const marca = document.createElement("span");
  marca.className = "urbano-placa-marca";
  marca.textContent = "EL URBANO";
  const num = document.createElement("span");
  num.className = "urbano-placa-num";
  root.append(marca, num);
  root.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const id = Number(root.dataset.busId);
    if (Number.isFinite(id)) onPick(id);
  });
  return { root, num };
}

function markElement(m: MapMark): HTMLElement {
  const el = document.createElement("div");
  el.className = "mk";
  el.style.setProperty("--mk", m.color);
  el.style.setProperty("--mk-text", m.textColor);
  el.style.setProperty("--mk-edge", isLight(m.color) ? "#15181a" : "#ffffff");
  if (m.kind === "letter") {
    const b = document.createElement("div");
    b.className = "mk-letter";
    b.textContent = m.text;
    el.append(b);
  } else {
    const l = document.createElement("div");
    l.className = "mk-label";
    if (m.bus) l.insertAdjacentHTML("afterbegin", BUS_SVG);
    l.append(document.createTextNode(m.text));
    const d = document.createElement("div");
    d.className = "mk-dot";
    el.append(l, d);
  }
  return el;
}

const collection = (features: GeoJSON.Feature[]): GeoJSON.FeatureCollection => ({ type: "FeatureCollection", features });
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// The panel covers the bottom of the screen on a phone: the route is framed above it, not under it.
const fitOptions = () => ({ padding: { top: 72, left: 48, right: 48, bottom: 72 }, maxZoom: 15 });

export default function BusMap(props: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);
  const handlers = useRef(props);
  handlers.current = props;

  const markers = useRef(new globalThis.Map<string, Marker>());
  const placas = useRef(new globalThis.Map<number, Placa>());
  // The last framing, so it can be redone when the map changes size, until the person moves the map themselves.
  const framed = useRef<{ bounds: LngLatBounds; moved: boolean } | null>(null);
  const view = useRef<{ center: [number, number]; zoom: number } | null>(null);
  // While the zoom-in on a newly followed bus is still easing, the per-frame setCenter below holds
  // off: MapLibre's setCenter calls stop() first, which would cut that animation off mid-zoom.
  const followEasingUntil = useRef(0);

  const motions = useRef(new globalThis.Map<number, MotionState>());

  useEffect(() => {
    if (!container.current) return;
    setReady(false);
    const savedView = view.current;
    const m = new MapLibreMap({
      container: container.current,
      style: STYLE[props.theme],
      center: savedView?.center ?? CENTER,
      zoom: savedView?.zoom ?? 11.7,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
    });
    m.touchZoomRotate.disableRotation();
    map.current = m;

    m.on("error", (event) => {
      console.error("maplibre", event.error || event);
    });
    m.on("load", () => {
      try {
      if (props.theme === "dark") charcoal(m);
      for (const id of ["route", "stops", "sube", "pin", "buses", "me"]) m.addSource(id, { type: "geojson", data: collection([]) });
      const rgb = ["to-rgb", ["to-color", ["get", "color"]]];
      const light = [">", ["+", ["*", 0.299, ["at", 0, rgb]], ["*", 0.587, ["at", 1, rgb]], ["*", 0.114, ["at", 2, rgb]]], 150];
      const edge = (props.theme === "dark" ? ["case", light, "#15181a", "#ffffff"] : "#ffffff") as never;
      const solid = ["!=", ["get", "dashed"], true] as ["!=", ["get", string], true];
      const dashed = ["==", ["get", "dashed"], true] as ["==", ["get", string], true];
      m.addLayer({
        id: "route-edge",
        type: "line",
        source: "route",
        filter: solid,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": edge, "line-width": 8, "line-opacity": ["get", "opacity"] },
      });
      m.addLayer({
        id: "route",
        type: "line",
        source: "route",
        filter: solid,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": ["get", "color"], "line-width": 4.5, "line-opacity": ["get", "opacity"] },
      });
      // The return is the same color, broken, so the two directions can be told apart.
      m.addLayer({
        id: "route-edge-dash",
        type: "line",
        source: "route",
        filter: dashed,
        layout: { "line-cap": "butt", "line-join": "round" },
        paint: { "line-color": edge, "line-width": 8, "line-opacity": ["get", "opacity"], "line-dasharray": [1.2, 1.4] },
      });
      m.addLayer({
        id: "route-dash",
        type: "line",
        source: "route",
        filter: dashed,
        layout: { "line-cap": "butt", "line-join": "round" },
        paint: { "line-color": ["get", "color"], "line-width": 4.5, "line-opacity": ["get", "opacity"], "line-dasharray": [1.6, 1.5] },
      });
      m.addLayer({
        id: "stops",
        type: "circle",
        source: "stops",
        paint: {
          "circle-radius": ["case", ["get", "selected"], 9, 5],
          "circle-color": ["case", ["get", "selected"], ["get", "color"], "#ffffff"],
          "circle-stroke-color": ["case", ["get", "selected"], "#ffffff", ["get", "color"]],
          "circle-stroke-width": ["case", ["get", "selected"], 3, 2],
        },
      });
      m.addLayer({
        id: "sube",
        type: "circle",
        source: "sube",
        paint: {
          "circle-radius": ["case", ["get", "selected"], 8, 4.5],
          "circle-color": SUBE_BLUE,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": ["case", ["get", "selected"], 3, 1.5],
        },
      });
      m.addLayer({
        id: "pin",
        type: "circle",
        source: "pin",
        paint: {
          "circle-radius": 9,
          "circle-color": ["case", ["==", ["get", "end"], "to"], "#1c1b18", "#ffffff"],
          "circle-stroke-color": ["case", ["==", ["get", "end"], "to"], "#ffffff", "#1c1b18"],
          "circle-stroke-width": 4,
        },
      });
      m.addLayer({
        id: "bus-halo",
        type: "circle",
        source: "buses",
        filter: ["==", ["get", "selected"], true],
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 16, 15, 24, 17, 32],
          "circle-color": "rgba(229, 57, 53, 0.22)",
          "circle-stroke-color": "#e53935",
          "circle-stroke-width": 3,
        },
      });
      // El colectivo se dibuja como cartel HTML (rojo #e53935, número grande). No el PNG amarillo de ColeJUY.
      if (!m.hasImage("bus-arrow")) m.addImage("bus-arrow", arrowImage(), { sdf: true, pixelRatio: 2 });
      m.addLayer({
        id: "bus-arrow",
        type: "symbol",
        source: "buses",
        filter: [">", ["get", "arrow"], 0],
        layout: {
          "icon-image": "bus-arrow",
          "icon-size": ["interpolate", ["linear"], ["zoom"], 11, 0.75, 14, 0.95, 17, 1.2],
          "icon-rotate": ["get", "bearing"],
          "icon-rotation-alignment": "map",
          "icon-pitch-alignment": "map",
          // Offset is rotated with the icon, so this pushes the arrow out in front of the bus.
          "icon-offset": [0, -30],
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
        },
        paint: {
          "icon-color": "#e53935",
          "icon-halo-color": "#ffffff",
          "icon-halo-width": 1.5,
          "icon-opacity": ["get", "arrow"],
        },
      });
      // The person's own position is the only blue thing on the map, with a halo around it,
      // so it is never mistaken for a point they marked.
      m.addLayer({
        id: "me-halo",
        type: "circle",
        source: "me",
        paint: { "circle-radius": 20, "circle-color": ME, "circle-opacity": 0.16 },
      });
      m.addLayer({
        id: "me",
        type: "circle",
        source: "me",
        paint: { "circle-radius": 7, "circle-color": ME, "circle-stroke-color": "#ffffff", "circle-stroke-width": 3 },
      });
      // The credits start folded behind their own ⓘ button on all screens,
      // keeping the map uncluttered while remaining accessible.
      const closeCredits = () => {
        const credits = m.getContainer().querySelector(".maplibregl-ctrl-attrib");
        credits?.classList.add("maplibregl-compact");
        credits?.classList.remove("maplibregl-compact-show");
        credits?.removeAttribute("open");
      };
      closeCredits();
      m.on("resize", closeCredits);
      setReady(true);
      } catch (err) {
        console.error("urbano map load", err);
        setReady(true);
      }
    });

    m.on("click", (e) => {
      const box: [PointLike, PointLike] = [
        [e.point.x - 16, e.point.y - 16],
        [e.point.x + 16, e.point.y + 16],
      ];
      const stop = m.queryRenderedFeatures(box, { layers: ["stops"] })[0];
      if (stop) return handlers.current.onStop(String(stop.properties.id));
      const sube = m.queryRenderedFeatures(box, { layers: ["sube"] })[0];
      if (sube) return handlers.current.onSube(String(sube.properties.id));
      const bus = m.queryRenderedFeatures(box, { layers: ["bus-arrow", "bus-halo"] })[0];
      if (bus?.properties.id != null) return handlers.current.onBus(Number(bus.properties.id));
      handlers.current.onMap([e.lngLat.lng, e.lngLat.lat]);
    });

    const touched = (e: { originalEvent?: unknown }) => {
      if (!e.originalEvent) return;
      if (framed.current) framed.current.moved = true;
      // A drag or pinch by the person's own hand, not our own easeTo/setCenter, ends the follow.
      if (handlers.current.followBusId != null) handlers.current.onUnfollow();
    };
    m.on("dragstart", touched);
    m.on("zoomstart", touched);
    const resize = new ResizeObserver(() => {
      m.resize();
      const f = framed.current;
      if (f && !f.moved) m.fitBounds(f.bounds, { ...fitOptions(), duration: 0 });
    });
    resize.observe(container.current);
    return () => {
      const center = m.getCenter();
      view.current = { center: [center.lng, center.lat], zoom: m.getZoom() };
      resize.disconnect();
      for (const placa of placas.current.values()) placa.marker.remove();
      placas.current.clear();
      m.remove();
      map.current = null;
    };
  }, [props.theme]);

  const { buses, paths, activeDirection, color, stops, selectedStop, subePoints, selectedSube, me, followBusId, pins, fitKey, frame, focus, routes, legend } = props;

  // A repeated reading must not restart the extrapolation. A new one glides into place.
  useEffect(() => {
    if (!ready) return;
    const now = Date.now();
    const glide = !reducedMotion();
    const seen = new Set<number>();
    for (const b of buses) {
      seen.add(b.id);
      const fix = heldWithoutSignal({ lng: b.lng, lat: b.lat, speed: b.speed, course: b.course, moving: b.moving, age: b.age }, b.fresh);
      const mine = routes.filter((r) => r.line === b.line);
      const prev = motions.current.get(b.id);
      if (!prev) motions.current.set(b.id, createMotion(fix, mine, now));
      else if (!sameReading(prev.fix, fix)) motions.current.set(b.id, pushFix(prev, fix, mine, now, glide));
    }
    for (const id of motions.current.keys()) if (!seen.has(id)) motions.current.delete(id);
  }, [ready, buses, routes]);

  // Between readings each bus keeps rolling along its route. The frame is throttled for phones.
  useEffect(() => {
    if (!ready) return;
    const m = map.current;
    const source = m?.getSource("buses") as GeoJSONSource | undefined;
    if (!m || !source) return;
    let frameId = 0;
    let last = 0;
    const tick = (now: number) => {
      frameId = requestAnimationFrame(tick);
      if (!map.current) return;
      if (now - last < FRAME_MS) return;
      last = now;
      const wall = Date.now();
      const glide = !reducedMotion();
      const { buses: current, routes: lines, followBusId: following } = handlers.current;
      let followedAt: [number, number] | null = null;
      const features: GeoJSON.Feature[] = [];
      const vistos = new Set<number>();
      for (const b of current) {
        const state = motions.current.get(b.id);
        if (!state) continue;
        const mine = lines.filter((r) => r.line === b.line);
        const stepped = stepMotion(state, mine, wall, glide);
        motions.current.set(b.id, stepped);
        if (b.id === following) followedAt = stepped.shown.at;
        const ageNow = stepped.fix.age + (wall - stepped.movedAtMs) / 1000;
        const fresh = b.fresh && ageNow <= STALE_S;
        const rolling = stepped.fix.moving && stepped.fix.speed > STOP_KMH;
        const selected = following != null && b.id === following;
        vistos.add(b.id);
        let placa = placas.current.get(b.id);
        if (!placa) {
          const creada = crearPlaca((id) => handlers.current.onBus(id));
          creada.root.dataset.busId = String(b.id);
          placa = {
            ...creada,
            marker: new Marker({ element: creada.root, anchor: "bottom" }).setLngLat(stepped.shown.at).addTo(m),
          };
          placas.current.set(b.id, placa);
        }
        const numero = b.label || String(b.id);
        if (placa.num.textContent !== numero) placa.num.textContent = numero;
        placa.root.dataset.fresh = fresh ? "1" : "0";
        placa.root.dataset.selected = selected ? "1" : "0";
        placa.root.setAttribute("aria-label", `Colectivo ${numero}`);
        placa.marker.setLngLat(stepped.shown.at);
        features.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: stepped.shown.at },
          properties: {
            id: b.id,
            line: b.line,
            label: b.label,
            color: "#e53935",
            text: "#ffffff",
            fresh,
            bearing: stepped.shown.bearing ?? 0,
            hasBearing: stepped.shown.bearing !== null,
            arrow: arrowOpacity(rolling, fresh, stepped.shown.bearing),
            selected,
          },
        });
      }
      for (const [id, placa] of placas.current) {
        if (vistos.has(id)) continue;
        placa.marker.remove();
        placas.current.delete(id);
      }
      source.setData(collection(features));
      // Recenters every frame rather than easing: the bus itself already glides smoothly
      // (stepMotion above), so a plain jump here just rides along with it.
      if (followedAt && performance.now() >= followEasingUntil.current) m.setCenter(followedAt);
    };
    frameId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frameId);
      for (const placa of placas.current.values()) placa.marker.remove();
      placas.current.clear();
    };
  }, [ready]);

  useEffect(() => {
    const source = map.current?.getSource("route") as GeoJSONSource | undefined;
    if (!ready || !source) return;
    source.setData(
      collection(
        paths.map((p) => ({
          type: "Feature",
          geometry: { type: "LineString", coordinates: p.coordinates },
          properties: {
            color: p.color ?? color,
            opacity: activeDirection === null || p.direction === activeDirection ? 1 : 0.3,
            dashed: routeStroke(p.direction) === "dashed",
          },
        })),
      ),
    );
  }, [ready, paths, activeDirection, color]);

  useEffect(() => {
    const source = map.current?.getSource("stops") as GeoJSONSource | undefined;
    if (!ready || !source) return;
    source.setData(
      collection(
        stops.map((s) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [s.lng, s.lat] },
          properties: { id: s.id, color: s.color ?? color, selected: s.id === selectedStop },
        })),
      ),
    );
  }, [ready, stops, selectedStop, color]);

  useEffect(() => {
    const source = map.current?.getSource("sube") as GeoJSONSource | undefined;
    if (!ready || !source) return;
    source.setData(
      collection(
        subePoints.map((p) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [p.lng, p.lat] },
          properties: { id: p.id, selected: p.id === selectedSube },
        })),
      ),
    );
  }, [ready, subePoints, selectedSube]);

  useEffect(() => {
    const source = map.current?.getSource("me") as GeoJSONSource | undefined;
    if (!ready || !source) return;
    source.setData(collection(me ? [{ type: "Feature", geometry: { type: "Point", coordinates: me }, properties: {} }] : []));
  }, [ready, me]);

  useEffect(() => {
    const source = map.current?.getSource("pin") as GeoJSONSource | undefined;
    if (!ready || !source) return;
    source.setData(collection(pins.map((p) => ({ type: "Feature", geometry: { type: "Point", coordinates: p.at }, properties: { end: p.end } }))));
  }, [ready, pins]);

  useEffect(() => {
    const m = map.current;
    if (!ready || !m || paths.length === 0) return;
    const bounds = new LngLatBounds();
    for (const p of paths) for (const c of p.coordinates) bounds.extend(c);
    for (const c of frame) bounds.extend(c);
    for (const k of props.marks ?? []) bounds.extend([k.lng, k.lat]);
    framed.current = { bounds, moved: false };
    m.fitBounds(bounds, { ...fitOptions(), duration: reducedMotion() ? 0 : 600 });
    // Framing follows the line, not every refresh of its geometry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, fitKey]);

  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    const wanted = new globalThis.Map((props.marks ?? []).map((k) => [k.id, k]));
    for (const [id, marker] of markers.current) {
      if (!wanted.has(id)) {
        marker.remove();
        markers.current.delete(id);
      }
    }
    for (const k of wanted.values()) {
      const old = markers.current.get(k.id);
      old?.remove();
      markers.current.set(k.id, new Marker({ element: markElement(k), anchor: k.kind === "letter" ? "center" : "bottom" }).setLngLat([k.lng, k.lat]).addTo(m));
    }
  }, [ready, props.marks]);

  useEffect(() => {
    const m = map.current;
    if (!ready || !m || !focus) return;
    m.easeTo({ center: [focus.lng, focus.lat], zoom: Math.max(m.getZoom(), 15), duration: reducedMotion() ? 0 : 500 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, focus?.key]);

  // The moment a bus is picked to follow, zoom in close on its last known spot. After that, the
  // frame loop below keeps nudging the center to wherever it's rolled to since.
  useEffect(() => {
    const m = map.current;
    if (!ready || !m || followBusId == null) return;
    // Otherwise a resize right after this (the eta card appearing changes the stage's layout)
    // would re-fit to the whole route and undo the zoom-in below.
    if (framed.current) framed.current.moved = true;
    const b = buses.find((x) => x.id === followBusId);
    // Closer than a plain "center on a point" (focus, below): a followed bus is the one thing
    // on screen that matters, so it can fill more of it.
    if (b) {
      const duration = reducedMotion() ? 0 : 600;
      m.easeTo({ center: [b.lng, b.lat], zoom: Math.max(m.getZoom(), 16.5), duration });
      followEasingUntil.current = performance.now() + duration;
    }
    // Only the start of a follow zooms in; once it's going, the per-frame loop takes over.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, followBusId]);

  return (
    <>
      <div ref={container} className="map" role="application" aria-label="Mapa de colectivos" />
      {legend && (
        <div className="route-legend" style={{ "--line": color } as React.CSSProperties}>
          <span>
            <i /> ida
          </span>
          <span>
            <i className="dashed" /> vuelta
          </span>
        </div>
      )}
      {!ready && <Loading className="map-wait">Cargando mapa…</Loading>}
    </>
  );
}
