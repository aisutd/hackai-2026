import React, { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Navbar from "@/components/Navbar";
import { auth } from "@/firebase/clientApp";
import { isAdminEmail } from "@/utils/adminAccess";

type MealSlot = "sat-lunch" | "sat-dinner" | "sun-breakfast" | "sun-lunch";

type FoodItem = {
  id: string;
  name: string;
  slot: MealSlot;
  notes: string;
};

const STORAGE_KEY = "hackai_food_menu_items_v2";

const DEFAULT_ITEMS: FoodItem[] = [
  { id: "sl1", name: "Sandwiches", slot: "sat-lunch", notes: "Chicken + veggie" },
  { id: "sd1", name: "Pizza", slot: "sat-dinner", notes: "Vegetarian option included" },
  { id: "sb1", name: "Bagels", slot: "sun-breakfast", notes: "Cream cheese + fruit" },
  { id: "ul1", name: "Wraps", slot: "sun-lunch", notes: "Assorted fillings" },
];

const MEAL_SLOTS: { id: MealSlot; label: string }[] = [
  { id: "sat-lunch", label: "Saturday Lunch" },
  { id: "sat-dinner", label: "Dinner" },
  { id: "sun-breakfast", label: "Breakfast" },
  { id: "sun-lunch", label: "Sunday Lunch" },
];

export default function MenuPage() {
  const [items, setItems] = useState<FoodItem[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [foodName, setFoodName] = useState("");
  const [slot, setSlot] = useState<MealSlot>("sat-lunch");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setIsAdmin(isAdminEmail(user?.email));
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      setItems(DEFAULT_ITEMS);
      return;
    }
    try {
      const parsed = JSON.parse(raw) as FoodItem[];
      if (!Array.isArray(parsed)) {
        setItems(DEFAULT_ITEMS);
        return;
      }
      setItems(parsed);
    } catch {
      setItems(DEFAULT_ITEMS);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  const groupedItems = useMemo(() => {
    const grouped = new Map<MealSlot, FoodItem[]>();
    for (const s of MEAL_SLOTS) grouped.set(s.id, []);
    for (const item of items) {
      grouped.get(item.slot)?.push(item);
    }
    return grouped;
  }, [items]);

  const addItem = () => {
    const trimmed = foodName.trim();
    if (!trimmed) {
      setError("Food name is required.");
      return;
    }
    const newItem: FoodItem = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      name: trimmed,
      slot,
      notes: notes.trim(),
    };
    setItems((prev) => [newItem, ...prev]);
    setFoodName("");
    setSlot("sat-lunch");
    setNotes("");
    setError("");
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  return (
    <div className="min-h-screen relative">
      <Head>
        <title>HackAI Food Menu</title>
      </Head>
      <Navbar />
      {/* Base background */}
      <div
        className="fixed inset-0 -z-20"
        style={{
          backgroundColor: "black",
          backgroundImage: "url(/mainbg.svg)",
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
      />
      {/* Menu graffiti overlay */}
      <div
        className="fixed inset-0 -z-10"
        style={{
          backgroundImage: "url(/Menu/bg.svg)",
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
      />

      <main className="mx-auto w-[min(700px,calc(100%-2rem))] pt-36 pb-16">
        <section
          className="rounded-3xl px-8 md:px-14 py-10 flex flex-col items-center"
          style={{
            background: "rgba(200, 60, 120, 0.25)",
            backdropFilter: "blur(18px) saturate(180%)",
            WebkitBackdropFilter: "blur(18px) saturate(180%)",
            border: "1px solid rgba(255, 150, 190, 0.3)",
            boxShadow: "0 8px 32px rgba(200, 60, 120, 0.15)",
          }}
        >
          <h1
            className="text-white text-3xl md:text-5xl text-center tracking-widest"
            style={{ fontFamily: "Street Flow NYC", WebkitTextStroke: "3px black", paintOrder: "stroke" }}
          >
            FOOD MENU
          </h1>

          {isAdmin && (
            <p className="mt-3 text-center text-white/85 text-sm md:text-base">
              Add and update food items here.
            </p>
          )}

          {isAdmin && (
            <div
              className="mt-6 rounded-2xl p-4 md:p-5"
              style={{
                background: "rgba(0,0,0,0.45)",
                border: "3px solid rgba(255,255,255,0.7)",
              }}
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input
                  type="text"
                  value={foodName}
                  onChange={(e) => setFoodName(e.target.value)}
                  placeholder="Food item"
                  className="rounded-xl border border-white/25 bg-black/40 px-4 py-3 text-white outline-none"
                />
                <select
                  value={slot}
                  onChange={(e) => setSlot(e.target.value as MealSlot)}
                  className="rounded-xl border border-white/25 bg-black/40 px-4 py-3 text-white outline-none"
                >
                  {MEAL_SLOTS.map((s) => (
                    <option key={s.id} value={s.id} className="text-black">
                      {s.label}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Notes (optional)"
                  className="rounded-xl border border-white/25 bg-black/40 px-4 py-3 text-white outline-none"
                />
              </div>
              {error && <div className="mt-2 text-sm text-red-300">{error}</div>}
              <button
                type="button"
                onClick={addItem}
                className="mt-4 rounded-xl bg-[#DDD059] px-4 py-3 font-semibold text-black transition hover:bg-[#f4ea83]"
                style={{ fontFamily: "Street Flow NYC" }}
              >
                Add Food Item
              </button>
            </div>
          )}

          <div className="mt-7 space-y-6 w-full max-w-[600px] mx-auto text-center">
            {MEAL_SLOTS.map((s) => {
              const slotItems = groupedItems.get(s.id) || [];
              if (slotItems.length === 0) return null;
              return (
                <div key={s.id}>
                  <h2 className="text-white text-xl md:text-2xl tracking-widest drop-shadow-[0_2px_0_rgba(0,0,0,0.8)]" style={{ fontFamily: "Street Flow NYC", WebkitTextStroke: "1px black", paintOrder: "stroke" }}>
                    {s.label}
                  </h2>
                  <div className="mt-2 space-y-1">
                    {slotItems.map((item) => (
                      <div
                        key={item.id}
                        className="px-4 py-3 flex items-start justify-between gap-3"
                      >
                        <div>
                          <div className="text-white font-semibold">{item.name}</div>
                          {item.notes && <div className="text-white/70 text-sm mt-1">{item.notes}</div>}
                        </div>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => removeItem(item.id)}
                            className="shrink-0 rounded-lg border border-red-400/40 bg-red-900/25 px-3 py-1.5 text-sm text-red-200 hover:bg-red-900/40"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {items.length === 0 && (
              <div className="p-5 text-white/75">
                No food items yet.
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
