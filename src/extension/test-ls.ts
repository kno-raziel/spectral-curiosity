import { AntigravitySDK } from "antigravity-sdk";
import { discoverLsConnection } from "./sdk/connection";

async function run() {
  const sdk = new AntigravitySDK({
    logLevel: "debug",
    onStatusChange: () => {},
  });

  console.log("Starting SDK...");
  await sdk.start();

  if (process.platform === "darwin") {
    // Need to pass workspaceFolders, using [] for now since connection.ts doesn't strictly need it to find the port
    const conn = discoverLsConnection([], console.log);
    if (!conn) throw new Error("Could not find LS");
    sdk.ls.setConnectionDetails({ port: conn.port, csrfToken: conn.csrfToken });
  }

  // Allow time for HTTP handshake
  await new Promise((r) => setTimeout(r, 1000));

  console.log("\n--- Calling GetAllCascadeTrajectories with limit 1000 ---");
  try {
    const res = (await sdk.ls.rawRPC("GetAllCascadeTrajectories", { limit: 1000 })) as Record<
      string,
      unknown
    >;
    const keys = Object.keys(res || {});
    console.log(`Found ${keys.length} cascades`);
  } catch (e: unknown) {
    console.error("Error:", e instanceof Error ? e.message : String(e));
  }

  console.log("\n--- Calling listCascades (SDK default method) ---");
  try {
    const res2 = (await sdk.ls.listCascades()) as Record<string, unknown>;
    const keys2 = Object.keys(res2 || {});
    console.log(`Found ${keys2.length} cascades`);
  } catch (e: unknown) {
    console.error("Error:", e instanceof Error ? e.message : String(e));
  }

  process.exit(0);
}

run();
