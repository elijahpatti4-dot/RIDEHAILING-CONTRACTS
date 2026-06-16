import { NavLink } from "react-router-dom";
import { ConnectButton } from "@rainbow-me/rainbowkit";

const links = [
  { to: "/ride",    label: "🚗 Request Ride"   },
  { to: "/driver",  label: "🏎  Driver"          },
  { to: "/licence", label: "📋 Licences"        },
  { to: "/token",   label: "🪙 Token & Gov"     },
];

export default function Navbar() {
  return (
    <header className="border-b border-gray-800 bg-gray-950 sticky top-0 z-50">
      <div className="container mx-auto px-4 max-w-5xl flex items-center justify-between h-14">
        {/* Logo */}
        <span className="font-bold text-brand-500 text-lg tracking-tight">
          RideChain
        </span>

        {/* Nav links */}
        <nav className="hidden md:flex gap-1">
          {links.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-gray-800 text-white"
                    : "text-gray-400 hover:text-white hover:bg-gray-800"
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Wallet */}
        <ConnectButton
          accountStatus="avatar"
          chainStatus="icon"
          showBalance={false}
        />
      </div>

      {/* Mobile nav */}
      <nav className="md:hidden flex gap-1 px-4 pb-2 overflow-x-auto">
        {links.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `whitespace-nowrap px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-gray-800 text-white"
                  : "text-gray-400 hover:text-white hover:bg-gray-800"
              }`
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>
    </header>
  );
}
