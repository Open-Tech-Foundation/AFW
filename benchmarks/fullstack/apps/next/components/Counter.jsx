"use client";
import { useState } from "react";

export default function Counter() {
  const [count, setCount] = useState(0);
  return (
    <button id="counter" className="rounded bg-sky-600 px-3 py-1 text-white" onClick={() => setCount(count + 1)}>
      Count: {count}
    </button>
  );
}
