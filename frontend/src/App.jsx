import { Routes, Route, Navigate } from "react-router-dom";
import Navbar from "./components/Navbar";
import RequestRide from "./pages/RequestRide";
import DriverDashboard from "./pages/DriverDashboard";
import LicenceRegistry from "./pages/LicenceRegistry";
import TokenGovernance from "./pages/TokenGovernance";

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 container mx-auto px-4 py-8 max-w-5xl">
        <Routes>
          <Route path="/"              element={<Navigate to="/ride" replace />} />
          <Route path="/ride"          element={<RequestRide />} />
          <Route path="/driver"        element={<DriverDashboard />} />
          <Route path="/licence"       element={<LicenceRegistry />} />
          <Route path="/token"         element={<TokenGovernance />} />
        </Routes>
      </main>
      <footer className="border-t border-gray-800 text-center text-gray-600 text-sm py-4">
        RideChain &mdash; Decentralised Ride-Hailing on Polygon &mdash; No Central Server
      </footer>
    </div>
  );
}
