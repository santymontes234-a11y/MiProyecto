"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { ApiError, map as mapTokens, type Place, type Position } from "@ecomove/shared";
import { api } from "@/lib/api";
import { getAccessToken, refreshSession } from "@/lib/session";
import { cn } from "@/lib/cn";

const DEBOUNCE_MS = 350;
const MIN_CHARS = 2;
const MAX_CHARS = 120;

type Status = "idle" | "loading" | "ready" | "error" | "login";

/**
 * Búsqueda de lugares por nombre (contrato 1.2 §12.1, observación O2). Usa solo `api.geocode.search`
 * (la API consulta POIs propios y Nominatim; el cliente nunca llama a Nominatim). Combobox ARIA con
 * debounce, navegación con flechas y Enter/Escape.
 */
export function PlaceSearch({ label, placeholder = "Busca un lugar, p. ej. UPQ", near, onSelect, value, className }: {
  label: string;
  placeholder?: string;
  /** Sesga los resultados hacia este punto [lng, lat]. */
  near?: Position | null;
  onSelect: (place: Place) => void;
  /** Texto mostrado tras elegir (p. ej. el nombre del lugar elegido). */
  value?: string;
  className?: string;
}) {
  const id = useId();
  const listId = `${id}-list`;
  const [query, setQuery] = useState(value ?? "");
  const [items, setItems] = useState<Place[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const seq = useRef(0);
  const touched = useRef(false);

  useEffect(() => {
    if (value !== undefined) setQuery(value);
  }, [value]);

  useEffect(() => {
    if (!touched.current) return;
    const q = query.trim();
    if (q.length < MIN_CHARS) {
      setItems([]);
      setStatus("idle");
      return;
    }
    const mine = ++seq.current;
    const t = window.setTimeout(async () => {
      setStatus("loading");
      try {
        // El endpoint es de rol USER: en páginas públicas se intenta recuperar la sesión primero.
        if (!getAccessToken() && !(await refreshSession())) {
          if (mine === seq.current) setStatus("login");
          return;
        }
        const res = await api.geocode.search({ q: q.slice(0, MAX_CHARS), limit: 6, near: near ?? mapTokens.defaultCenter });
        if (mine !== seq.current) return;
        setItems(res.items);
        setActive(res.items.length ? 0 : -1);
        setStatus("ready");
        setOpen(true);
      } catch (e) {
        if (mine !== seq.current) return;
        setItems([]);
        setStatus("error");
        setMessage(
          e instanceof ApiError
            ? e.code === "RATE_LIMITED"
              ? "Demasiadas búsquedas seguidas. Espera unos segundos."
              : e.code === "GEOCODING_UNAVAILABLE"
                ? "La búsqueda de lugares no está disponible ahora. Puedes tocar el mapa."
                : e.status === 401
                  ? "Inicia sesión para buscar lugares."
                  : "No se pudo buscar el lugar."
            : "Sin conexión con la API.",
        );
      }
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [query, near]);

  function choose(p: Place) {
    onSelect(p);
    setQuery(p.name);
    setOpen(false);
    setItems([]);
    touched.current = false;
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" && items.length) {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (a + 1) % items.length);
    } else if (e.key === "ArrowUp" && items.length) {
      e.preventDefault();
      setActive((a) => (a <= 0 ? items.length - 1 : a - 1));
    } else if (e.key === "Enter" && open && active >= 0 && items[active]) {
      e.preventDefault();
      choose(items[active]!);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const showList = open && status === "ready";

  return (
    <div className={cn("relative space-y-1.5", className)}>
      <label htmlFor={id} className="block text-sm font-medium text-ink">{label}</label>
      <div className="relative">
        <svg className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="2" />
          <path d="m14 14 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input
          id={id}
          type="search"
          role="combobox"
          autoComplete="off"
          maxLength={MAX_CHARS}
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            touched.current = true;
            setQuery(e.target.value);
          }}
          onFocus={() => items.length && setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKeyDown}
          className="h-11 w-full rounded-full border border-line bg-panel pl-9 pr-4 text-sm text-ink shadow-sm placeholder:text-ink-muted/70 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
        />
        {status === "loading" && <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-ink-muted">Buscando…</span>}
      </div>
      <div aria-live="polite" className="text-xs">
        {status === "error" && <p className="text-alert">{message}</p>}
        {status === "login" && (
          <p className="text-ink-muted">
            <Link href="/login?next=/mapa" className="font-medium text-brand underline">Inicia sesión</Link> para buscar lugares por nombre.
          </p>
        )}
        {status === "ready" && items.length === 0 && <p className="text-ink-muted">Sin resultados en el área de servicio.</p>}
      </div>
      {showList && items.length > 0 && (
        <ul id={listId} role="listbox" aria-label={`Resultados para ${label}`} className="absolute inset-x-0 top-[4.75rem] z-[1000] max-h-72 overflow-auto rounded-lg border border-line bg-panel py-1 shadow-lg">
          {items.map((p, i) => (
            <li
              key={`${p.source}-${p.position.join(",")}-${i}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(p);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn("flex min-h-11 cursor-pointer items-start gap-3 px-3 py-2 text-sm", i === active && "bg-subtle")}
            >
              <span aria-hidden="true" className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-brand-soft text-[11px] font-bold text-brand">
                {p.source === "poi" ? "E" : "•"}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-medium text-ink">{p.name}</span>
                <span className="block truncate text-xs text-ink-muted">{p.label}{p.source === "poi" ? " · EcoMove" : ""}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
