import React, { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Navbar from "@/components/Navbar";
import { auth } from "@/firebase/clientApp";
import { isAdminEmail } from "@/utils/adminAccess";

type MealType = "Breakfast" | "Lunch" | "Dinner" | "Snacks" | "Drinks";

type FoodItem = {
  id: string;
  name: string;
  meal: MealType;
  notes: string;
};

const STORAGE_KEY = "hackai_food_menu_items_v1";

const DEFAULT_ITEMS: FoodItem[] = [
  { id: "d1", name: "Pizza", meal: "Dinner", notes: "Vegetarian option included" },
  { id: "l1", name: "Sandwiches", meal: "Lunch", notes: "Chicken + veggie" },
  { id: "b1", name: "Bagels", meal: "Breakfast", notes: "Cream cheese + fruit" },
];

const MEAL_ORDER: MealType[] = ["Breakfast", "Lunch", "Dinner", "Snacks", "Drinks"];

export default function MenuPage() {
  const [items, setItems] = useState<FoodItem[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [foodName, setFoodName] = useState("");
  const [meal, setMeal] = useState<MealType>("Lunch");
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
    const grouped = new Map<MealType, FoodItem[]>();
    for (const mealType of MEAL_ORDER) grouped.set(mealType, []);
    for (const item of items) {
      grouped.get(item.meal)?.push(item);
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
      meal,
      notes: notes.trim(),
    };
    setItems((prev) => [newItem, ...prev]);
    setFoodName("");
    setMeal("Lunch");
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
      <div
        className="fixed inset-0 -z-10"
        style={{
          backgroundColor: "black",
          backgroundImage: "url(/mainbg.svg)",
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
      />

      <main className="mx-auto w-[min(980px,calc(100%-2rem))] pt-36 pb-16">
        <section
          className="rounded-3xl p-6 md:p-8"
          style={{
            background: "linear-gradient(120deg, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0.1) 100%)",
            boxShadow: "0 8px 32px 0 rgba(31, 38, 135, 0.18)",
            backdropFilter: "blur(18px) saturate(180%)",
            WebkitBackdropFilter: "blur(18px) saturate(180%)",
            border: "0.5px solid rgba(255,255,255,0.35)",
            outline: "1.5px solid rgba(255,255,255,0.18)",
          }}
        >
          <h1
            className="text-white text-3xl md:text-5xl text-center tracking-widest"
            style={{ fontFamily: "Street Flow NYC", WebkitTextStroke: "3px black", paintOrder: "stroke" }}
          >
            FOOD MENU
          </h1>

          <p className="mt-3 text-center text-white/85 text-sm md:text-base">
            {isAdmin ? "Add and update food items here." : "Current hackathon food lineup."}
          </p>

          {isAdmin && (
            <div className="mt-6 rounded-2xl border border-white/20 bg-black/35 p-4 md:p-5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input
                  type="text"
                  value={foodName}
                  onChange={(e) => setFoodName(e.target.value)}
                  placeholder="Food item"
                  className="rounded-xl border border-white/25 bg-black/40 px-4 py-3 text-white outline-none"
                />
                <select
                  value={meal}
                  onChange={(e) => setMeal(e.target.value as MealType)}
                  className="rounded-xl border border-white/25 bg-black/40 px-4 py-3 text-white outline-none"
                >
                  {MEAL_ORDER.map((mealType) => (
                    <option key={mealType} value={mealType} className="text-black">
                      {mealType}
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

          <div className="mt-7 space-y-4">
            {MEAL_ORDER.map((mealType) => {
              const mealItems = groupedItems.get(mealType) || [];
              if (mealItems.length === 0) return null;
              return (
                <div key={mealType} className="rounded-2xl border border-white/20 bg-black/35 p-4 md:p-5">
                  <h2 className="text-[#DDD059] text-xl tracking-widest" style={{ fontFamily: "Street Flow NYC" }}>
                    {mealType}
                  </h2>
                  <div className="mt-3 space-y-2">
                    {mealItems.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-xl border border-white/15 bg-black/40 px-4 py-3 flex items-start justify-between gap-3"
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
              <div className="rounded-2xl border border-white/20 bg-black/30 p-5 text-white/75">
                No food items yet.
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
