import React, { useEffect, useState } from "react";
import Console from "./pages/console/Console";
import TransparencyPage from "./pages/public/TransparencyPage";
import { session } from "./lib/api";

function useHash() {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return hash;
}

export default function App() {
  const hash = useHash();
  // Visitors without a coordinator key land on the public page; the console
  // is one link away.
  const bare = hash === "" || hash === "#" || hash === "#/";
  if (hash.startsWith("#/public") || (bare && !session.key)) return <TransparencyPage />;
  return <Console route={hash.replace(/^#\/?/, "")} />;
}
