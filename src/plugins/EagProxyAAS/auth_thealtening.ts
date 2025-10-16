import mc from "minecraft-protocol";
import { Enums } from "../../proxy/Enums.js";

interface TheAlteningResponse {
  error?: string;
  selectedProfile?: {
    name?: string;
    id?: string;
  };
  [key: string]: any; // for other fields
}

export async function getTokenProfileTheAltening(token: string): Promise<object> {
  const fetchOptions = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: token,
      password: "anything",
    }),
  };

  let resJson: TheAlteningResponse;

  try {
    const res = await fetch("http://authserver.thealtening.com/authenticate", fetchOptions);
    resJson = (await res.json()) as TheAlteningResponse; // <-- cast here
  } catch (err: unknown) {
    // Cast err to Error to safely access .message
    const e = err as Error;
    throw new Error(`Failed to fetch from TheAltening: ${e.message}`);
  }

  if (resJson.error) throw new Error(Enums.ChatColor.RED + resJson.error);
  if (!resJson.selectedProfile?.name || resJson.selectedProfile.name.length < 3) {
    throw new Error(Enums.ChatColor.RED + "Invalid response from TheAltening received!");
  }

  return {
    auth: "mojang",
    sessionServer: "http://sessionserver.thealtening.com",
    username: resJson.selectedProfile.name,
    haveCredentials: true,
    session: resJson,
  };
}
