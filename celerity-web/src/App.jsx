import React, { useEffect, useState } from "react";
import Console from "./pages/console/Console";
import TransparencyPage from "./pages/public/TransparencyPage";
import { session } from "./lib/api";
import FarmerPage from "./pages/farmer/FarmerPage";
import LandingPage from "./pages/landing/LandingPage";

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
  // A farmer's private link from their SMS: #/r/<token>.
  const farmer = hash.match(/^#\/r\/([\w-]+)/);
  if (farmer) return <FarmerPage token={farmer[1]} />;

  // Visitors without a coordinator key land on the landing page; #/home shows
  // it to signed-in coordinators too. The public record lives at #/public.
  const bare = hash === "" || hash === "#" || hash === "#/";
  if (hash.startsWith("#/home") || (bare && !session.key)) return <LandingPage />;
  if (hash.startsWith("#/public")) return <TransparencyPage />;
  return <Console route={hash.replace(/^#\/?/, "")} />;
}
