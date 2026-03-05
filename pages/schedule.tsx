"use client";

import React, { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, QueryDocumentSnapshot } from "firebase/firestore";
import { db } from "@/firebase/clientApp";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export type EventType = "MANDATORY" | "FOOD" | "FUN" | "WORKSHOP" | "SUPPORT";

export type ScheduleEvent = {
  id: string;
  name: string;
  location: string;
  time: string;
  tag: EventType;
  day: "saturday" | "sunday";
  order: number;
};

type EventTypeConfig = { id: EventType; label: string; tagImagePath: string };

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const EVENT_TYPES: EventTypeConfig[] = [
  { id: "MANDATORY", label: "MANDATORY", tagImagePath: "/schedule/tags/mandatory.png" },
  { id: "FOOD", label: "FOOD", tagImagePath: "/schedule/tags/food.png" },
  { id: "FUN", label: "FUN", tagImagePath: "/schedule/tags/fun.png" },
  { id: "WORKSHOP", label: "WORKSHOP", tagImagePath: "/schedule/tags/workshop.png" },
  { id: "SUPPORT", label: "SUPPORT", tagImagePath: "/schedule/tags/support.png" },
];

const VALID_TAGS: EventType[] = ["MANDATORY", "FOOD", "FUN", "WORKSHOP", "SUPPORT"];

const FONT_OCTIN = { fontFamily: "Octin Spraypaint" as const };
const FONT_STREET = { fontFamily: "Street Flow NYC" as const };

const CARD_STYLE =
  "rounded-[28px] border-2 border-white/25 bg-black/25 shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_18px_55px_rgba(0,0,0,0.65)] overflow-hidden min-h-[260px]";
const CARD_HEADER_STYLE =
  "px-6 py-4 border-b border-white/15 text-white text-lg tracking-widest uppercase bg-white/5 drop-shadow-[0_2px_0_rgba(0,0,0,0.9)]";
const EVENT_ROW_STYLE =
  "px-6 py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-[linear-gradient(180deg,rgba(255,255,255,0.035),rgba(255,255,255,0.0))]";
const EMPTY_STATE_STYLE =
  "px-6 py-8 text-white/70 text-sm tracking-widest uppercase text-center drop-shadow-[0_2px_0_rgba(0,0,0,0.9)]";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function getTagImagePath(tag: EventType): string {
  const config = EVENT_TYPES.find((e) => e.id === tag);
  return config ? config.tagImagePath : EVENT_TYPES[3].tagImagePath;
}

/**
 * Parse time string (e.g. "7:30 AM", "12:00 AM", "10:00 AM CST") to minutes since midnight for sorting.
 */
function parseTimeToMinutes(timeStr: string): number {
  const normalized = String(timeStr ?? "").trim().replace(/\s+(CST|CDT|EST|PST)$/i, "").trim();
  const match = normalized.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) return 9999;

  let hour = parseInt(match[1], 10);
  const min = parseInt(match[2] ?? "0", 10);
  const ampm = (match[3] ?? "").toUpperCase();

  if (ampm === "PM" && hour !== 12) hour += 12;
  if (ampm === "AM" && hour === 12) hour = 24; // 12:00 AM = end of day

  return hour * 60 + min;
}

/** Get first non-empty string from possible Firebase field names (tries exact + case variants). */
function pickField(data: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = data[key];
    if (value != null && String(value).trim() !== "") return String(value).trim();
  }
  const lowerKeys = keys.map((k) => k.toLowerCase());
  for (const [key, value] of Object.entries(data)) {
    if (lowerKeys.includes(key.toLowerCase()) && value != null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return "";
}

function mapDocToEvent(doc: QueryDocumentSnapshot): ScheduleEvent | null {
  const data = doc.data() as Record<string, unknown>;
  const name = String(data.name ?? "").trim();
  if (!name) return null;

  const location = pickField(data, "location", "room", "Room", "Location");
  const time = pickField(data, "time", "Time");
  const rawTag = String(data.tag ?? data.eventType ?? "").trim().toUpperCase() as EventType;
  const tag = VALID_TAGS.includes(rawTag) ? rawTag : "WORKSHOP";
  const rawDay = (data.day as string) ?? "saturday";
  const day = rawDay === "sunday" ? "sunday" : "saturday";
  const rawOrder = data.order != null ? Number(data.order) : 0;
  const order = Number.isFinite(rawOrder) ? rawOrder : 0;

  return {
    id: doc.id,
    name,
    location,
    time,
    tag,
    day,
    order,
  };
}

function sortByTimeThenOrder(a: ScheduleEvent, b: ScheduleEvent): number {
  const minA = parseTimeToMinutes(a.time);
  const minB = parseTimeToMinutes(b.time);
  return minA - minB || a.order - b.order;
}

// -----------------------------------------------------------------------------
// Subcomponents
// -----------------------------------------------------------------------------

function ScheduleEventRow({ event }: { event: ScheduleEvent }) {
  return (
    <div className={EVENT_ROW_STYLE}>
      <div className="flex-1 min-w-0">
        <div
          className="text-white font-semibold tracking-widest uppercase text-base md:text-lg drop-shadow-[0_3px_0_rgba(0,0,0,0.9)]"
          style={FONT_OCTIN}
        >
          {event.name}
        </div>
        <div
          className="text-white/90 text-xs md:text-sm mt-1 tracking-wide drop-shadow-[0_2px_0_rgba(0,0,0,0.9)]"
          style={FONT_OCTIN}
        >
          {event.location}
        </div>
      </div>
      <div className="flex items-center gap-4 shrink-0">
        <span
          className="text-white text-base md:text-lg tracking-widest whitespace-nowrap drop-shadow-[0_2px_0_rgba(0,0,0,0.9)]"
          style={FONT_OCTIN}
        >
          {event.time}
        </span>
        <span className="inline-flex items-center shrink-0">
          <img
            src={getTagImagePath(event.tag)}
            alt={event.tag}
            className="h-8 md:h-10 w-auto object-contain"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        </span>
      </div>
    </div>
  );
}

function ScheduleDayColumn({
  dayLabel,
  events,
  emptyMessage = "No events for this filter",
}: {
  dayLabel: string;
  events: ScheduleEvent[];
  emptyMessage?: string;
}) {
  return (
    <div className={CARD_STYLE}>
      <div className={CARD_HEADER_STYLE} style={FONT_OCTIN}>
        {dayLabel}
      </div>
      <div className="divide-y divide-white/15 h-full">
        {events.length === 0 ? (
          <div className={EMPTY_STATE_STYLE} style={FONT_OCTIN}>
            {emptyMessage}
          </div>
        ) : (
          events.map((event) => <ScheduleEventRow key={event.id} event={event} />)
        )}
      </div>
    </div>
  );
}

function FilterBar({
  activeFilter,
  onFilterChange,
}: {
  activeFilter: EventType | null;
  onFilterChange: (tag: EventType | null) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-4 justify-center mb-10">
      <span
        className="text-white text-sm md:text-base tracking-widest uppercase drop-shadow-[0_2px_0_rgba(0,0,0,0.9)]"
        style={FONT_OCTIN}
      >
        FILTER BY EVENT TYPE:
      </span>
      <div className="flex flex-wrap gap-3 justify-center">
        {EVENT_TYPES.map(({ id, tagImagePath }) => (
          <button
            key={id}
            type="button"
            onClick={() => onFilterChange(activeFilter === id ? null : id)}
            className={
              activeFilter === id
                ? "inline-flex items-center justify-center rounded-xl p-2 min-w-[56px] min-h-[56px] md:min-w-[64px] md:min-h-[64px] transition-all duration-150 border-2 border-transparent ring-2 ring-white/60 ring-offset-2 ring-offset-black opacity-100"
                : "inline-flex items-center justify-center rounded-xl p-2 min-w-[56px] min-h-[56px] md:min-w-[64px] md:min-h-[64px] transition-all duration-150 border-2 border-transparent opacity-70 hover:opacity-90"
            }
          >
            <img
              src={tagImagePath}
              alt={id}
              className="h-12 md:h-14 w-auto object-contain"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Main component
// -----------------------------------------------------------------------------

export default function ScheduleSection() {
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<EventType | null>(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "schedule"),
      (snapshot) => {
        setError(null);
        const parsed = snapshot.docs
          .map((doc) => mapDocToEvent(doc))
          .filter((e): e is ScheduleEvent => e != null);
        setEvents(parsed);
        setLoading(false);
      },
      (err) => {
        console.error("Schedule snapshot error", err);
        setError(err?.message ?? "Failed to load schedule");
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  const { saturday, sunday } = useMemo(() => {
    const sat = events.filter((e) => e.day === "saturday").sort(sortByTimeThenOrder);
    const sun = events.filter((e) => e.day === "sunday").sort(sortByTimeThenOrder);
    return { saturday: sat, sunday: sun };
  }, [events]);

  const filteredSaturday = useMemo(
    () => (activeFilter ? saturday.filter((e) => e.tag === activeFilter) : saturday),
    [saturday, activeFilter]
  );
  const filteredSunday = useMemo(
    () => (activeFilter ? sunday.filter((e) => e.tag === activeFilter) : sunday),
    [sunday, activeFilter]
  );

  if (loading) {
    return (
      <div className="w-full py-24 px-4 md:px-6 flex justify-center">
        <div
          className="text-white font-bold text-xs md:text-sm tracking-widest uppercase"
          style={FONT_OCTIN}
        >
          LOADING...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full py-24 px-4 md:px-6 flex justify-center">
        <div className="text-red-300 tracking-widest uppercase" style={FONT_OCTIN}>
          SCHEDULE ERROR: {error}
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative w-full min-h-[180vh] pt-16 pb-40 px-4 md:px-6"
      style={{
        backgroundImage: "url('/schedule/bg.svg')",
        backgroundSize: "100% auto",
        backgroundPosition: "center center",
        backgroundRepeat: "no-repeat",
        overflowX: "hidden",
      }}
    >
      <img
        src="/schedule/doodles/guitar.png"
        alt=""
        aria-hidden
        draggable={false}
        className="pointer-events-none select-none object-contain absolute bottom-[20%] left-[40%] w-40 h-40 md:w-52 md:h-52 lg:w-64 lg:h-64 opacity-90"
      />

      <div className="relative z-10 w-full max-w-[90vw] mx-auto">
        <div className="flex justify-center mb-10">
          <h2
            className="text-white text-5xl md:text-6xl tracking-widest uppercase drop-shadow-[0_4px_0_rgba(0,0,0,0.9)]"
            style={{ ...FONT_STREET, WebkitTextStroke: "2px black" }}
          >
            Schedule
          </h2>
        </div>

        <FilterBar activeFilter={activeFilter} onFilterChange={setActiveFilter} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-10">
          <ScheduleDayColumn dayLabel="Saturday" events={filteredSaturday} />
          <ScheduleDayColumn dayLabel="Sunday" events={filteredSunday} />
        </div>
      </div>
    </div>
  );
}
