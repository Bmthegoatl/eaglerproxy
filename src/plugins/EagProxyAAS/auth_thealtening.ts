import mc from "minecraft-protocol";
import { Enums } from "../../proxy/Enums.js";

interface AlteningAuthResponse {
  error?: string;
  selectedProfile?: {
    name: string;
    id: string;
  };
  // You can expand this interface if there are more fields you need
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

  const res = await fetch("http://authserver.thealtening.com/authenticate", fetchOptions);
  const resJson = (await res.json()) as AlteningAuthResponse;

  // Properly check for error
  if (resJson.error) {
    throw new Error(Enums.ChatColor.RED + resJson.error);
  }

  // Validate selectedProfile exists
  const profile = resJson.selectedProfile;
  if (!profile || !profile.name || profile.name.length < 3) {
    throw new Error(Enums.ChatColor.RED + "Invalid response from TheAltening received!");
  }

  return {
    auth: "mojang",
    sessionServer: "http://sessionserver.thealtening.com",
    username: profile.name,
    haveCredentials: true,
    session: resJson,
  };
}
