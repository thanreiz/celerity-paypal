import React, { useEffect, useState } from "react";
import Console from "./pages/console/Console";
import TransparencyPage from "./pages/public/TransparencyPage";
import FarmerApp, { FarmerConnect } from "./pages/farmer/FarmerApp";
import FunderApp from "./pages/funder/FunderApp";
import LandingPage from "./pages/landing/LandingPage";
import DemoGuide from "./pages/DemoGuide";

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
// plus the public record at #/public, the demo walk-through at #/demo and
// the landing page.
// Console pages, by first path segment. Anything else unknown is the landing page.
const CONSOLE = new Set(["console", "overview", "funds", "respond", "payouts", "families", "evidence"]);

export default function App() {
  const hash = useHash();
  // First path segment of "#/segment/rest?query".
  const seg = (hash.startsWith("#/") ? hash.slice(2) : "").split(/[/?]/)[0];
  const farmer = hash.match(/^#\/r\/([\w-]+)/);
  if (farmer) return <FarmerApp token={farmer[1]} />;
  if (seg === "farmer") return <FarmerConnect />;
  if (seg === "funder") return <FunderApp query={hash.split("?")[1] || ""} />;
  if (seg === "public") return <TransparencyPage />;
  if (seg === "demo") return <DemoGuide />;
  if (CONSOLE.has(seg)) return <Console route={hash.replace(/^#\/?/, "").replace(/^console\/?/, "")} />;

  // Everything else is the landing page, signed in or not: "#/", "#/home",
  // unknown routes, "#/r/" with no token, and bare anchors such as "#how"
  // (the landing page scrolls to the section itself). Coordinators reach the
  // console through "Coordinator sign in" (#/console).
  return <LandingPage />;
}
