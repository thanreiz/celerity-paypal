import React, { useEffect, useState } from "react";
import Console from "./pages/console/Console";
import TransparencyPage from "./pages/public/TransparencyPage";

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
  if (hash.startsWith("#/public")) return <TransparencyPage />;
  return <Console route={hash.replace(/^#\/?/, "")} />;
}
