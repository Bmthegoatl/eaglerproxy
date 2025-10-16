import { Config } from "./launcher_types.js";

export const config: Config = {
  adapter: {
    name: "EaglerProxy",
    bindHost: "0.0.0.0",
    bindPort: process.env.PORT ? parseInt(process.env.PORT) : 26178, // <-- fixed
    maxConcurrentClients: 20,
    useNatives: true,
    skinServer: {
      skinUrlWhitelist: undefined,
      cache: {
        useCache: true,
        folderName: "skinCache",
        skinCacheLifetime: 60 * 60 * 1000,
        skinCachePruneInterval: 10 * 60 * 1000,
      },
    },
    motd: true
      ? "FORWARD"
      : {
          iconURL: "motd.png",
          l1: "yes",
          l2: "no",
        },
    ratelimits: {
      lockout: 10,
      limits: {
        http: 100,
        ws: 100,
        motd: 100,
        skins: 1000,
        skinsIp: 10000,
        connect: 100,
      },
    },
    origins: {
      allowOfflineDownloads: true,
      originWhitelist: null,
      originBlacklist: null,
    },
    server: {
      host: "la2.freeminecrafthost.com",
      port: 26178,
    },
    tls: undefined,
  },
};
