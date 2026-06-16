import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { polygon, polygonAmoy } from "wagmi/chains";

// Get a free project ID from https://cloud.walletconnect.com
const WALLET_CONNECT_PROJECT_ID = "578ded113d78d360225a59c31b0c72d8";

export const wagmiConfig = getDefaultConfig({
  appName: "RideChain",
  projectId: WALLET_CONNECT_PROJECT_ID,
  chains: [polygonAmoy, polygon],
  ssr: false,
});
