import React, { useEffect, useState } from "react";
import Console from "./pages/console/Console";
import TransparencyPage from "./pages/public/TransparencyPage";
import { session } from "./lib/api";
import FarmerApp, { FarmerConnect } from "./pages/farmer/FarmerApp";
import FunderApp from "./pages/funder/FunderApp";
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

// Three surfaces around one Celerity backend, as in the original:
//   #/funder      the Funder app (cash in through PayPal, follow the money)
//   #/farmer      the Farmer app ("Is this you?"), #/r/<token> one farmer's app
//   #/console/... Celerity operations: coordinators approve what AI drafted
// plus the public record at #/public and the landing page.
export default function App() {
  const hash = useHash();
  const farmer = hash.match(/^#\/r\/([\w-]+)/);
  if (farmer) return <FarmerApp token={farmer[1]} />;
  if (hash.startsWith("#/farmer")) return <FarmerConnect />;
  if (hash.startsWith("#/funder")) return <FunderApp query={hash.split("?")[1] || ""} />;
  if (hash.startsWith("#/public")) return <TransparencyPage />;

  // Visitors without a coordinator key land on the landing page; #/home shows
  // it to signed-in coordinators too.
  const bare = hash === "" || hash === "#" || hash === "#/";
  if (hash.startsWith("#/home") || (bare && !session.key)) return <LandingPage />;
  return <Console route={hash.replace(/^#\/?/, "").replace(/^console\/?/, "")} />;
}
