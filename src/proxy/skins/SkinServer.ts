import DiskDB from "../databases/DiskDB.js";
import crypto from "crypto";
import { Logger } from "../../logger.js";
import { Constants } from "../Constants.js";
import { Enums } from "../Enums.js";
import { Player } from "../Player.js";
import { Proxy } from "../Proxy.js";
import { Util } from "../Util.js";
import { CSChannelMessagePacket } from "../packets/channel/CSChannelMessage.js";
import { SCChannelMessagePacket } from "../packets/channel/SCChannelMessage.js";
import { EaglerSkins } from "./EaglerSkins.js";
import { ImageEditor } from "./ImageEditor.js";
import { MineProtocol } from "../Protocol.js";
import ExponentialBackoffRequestController from "../ratelimit/ExponentialBackoffRequestController.js";

export type CachedSkin = {
  uuid: string;
  expires: number;
  data: Buffer;
};

export class SkinServer {
  public allowedSkinDomains: string[];
  public cache?: DiskDB<CachedSkin>;
  public proxy: Proxy;
  public backoffController: ExponentialBackoffRequestController;
  public usingNative: boolean;
  public usingCache: boolean;
  private _logger: Logger;
  private deleteTask?: NodeJS.Timeout;
  private lifetime: number;

  constructor(
    proxy: Proxy,
    native: boolean,
    sweepInterval: number,
    cacheLifetime: number,
    cacheFolder: string = "./skinCache",
    useCache: boolean = true,
    allowedSkinDomains?: string[]
  ) {
    this.proxy = proxy;
    this.usingNative = native;
    this.usingCache = useCache;
    this.lifetime = cacheLifetime;
    this.allowedSkinDomains = allowedSkinDomains ?? ["textures.minecraft.net"];
    this.backoffController = new ExponentialBackoffRequestController();
    this._logger = new Logger("SkinServer");

    if (useCache) {
      this.cache = new DiskDB<CachedSkin>(
        cacheFolder,
        exportCachedSkin,
        readCachedSkin,
        (k) => k.replace(/-/g, "") // replaceAll fallback for older Node
      );
      this.deleteTask = setInterval(async () => {
        if (!this.cache) return;
        await this.cache.filter((ent) => Date.now() < ent.expires);
      }, sweepInterval);
    }

    this._logger.info("Started EaglercraftX skin server.");
  }

  public unload(): void {
    if (this.deleteTask) clearInterval(this.deleteTask);
  }

  public async handleRequest(packet: CSChannelMessagePacket, caller: Player, proxy: Proxy) {
    if (packet.messageType === Enums.ChannelMessageType.SERVER)
      throw new Error("Server message was passed to client message handler!");
    if (packet.channel !== Constants.EAGLERCRAFT_SKIN_CHANNEL_NAME)
      throw new Error("Cannot handle non-EaglerX skin channel messages!");

    // Rate limit check
    const rl = proxy.ratelimit.skinsConnection.consume(caller.username);
    const rlip = proxy.ratelimit.skinsIP.consume(caller.ws._socket.remoteAddress);
    if (!rl.success || !rlip.success) return;

    switch (packet.data[0] as Enums.EaglerSkinPacketId) {
      case Enums.EaglerSkinPacketId.CFetchSkinEaglerPlayerReq: {
        const parsedPacket = EaglerSkins.readClientFetchEaglerSkinPacket(packet.data);
        const player = proxy.fetchUserByUUID(parsedPacket.uuid);
        if (player) {
          const response = new SCChannelMessagePacket();
          response.channel = Constants.EAGLERCRAFT_SKIN_CHANNEL_NAME;

          if (player.skin.type === Enums.SkinType.BUILTIN) {
            response.data = EaglerSkins.writeServerFetchSkinResultBuiltInPacket(player.uuid, player.skin.builtInSkin);
            caller.write(response);
          } else if (player.skin.type === Enums.SkinType.CUSTOM) {
            response.data = EaglerSkins.writeServerFetchSkinResultCustomPacket(player.uuid, player.skin.skin, false);
            caller.write(response);
          } else {
            this._logger.warn(`Player ${caller.username} attempted to fetch player ${player.uuid}'s skin, but it hasn't loaded yet!`);
          }
        }
        break;
      }

      case Enums.EaglerSkinPacketId.CFetchSkinReq: {
        const parsedPacket = EaglerSkins.readClientDownloadSkinRequestPacket(packet.data);
        const url = new URL(parsedPacket.url).hostname;

        if (!this.allowedSkinDomains.some((domain) => Util.areDomainsEqual(domain, url))) {
          this._logger.warn(`Player ${caller.username} tried to download a skin with disallowed domain (${url})!`);
          break;
        }

        try {
          let skin: Buffer | null = null;

          if (this.usingCache && this.cache) {
            const cacheHit = await this.cache.get(parsedPacket.uuid);
            skin = cacheHit ? cacheHit.data : null;

            if (!skin) {
              skin = await EaglerSkins.safeDownloadSkin(parsedPacket.url, this.backoffController);
              await this.cache.set(parsedPacket.uuid, {
                uuid: parsedPacket.uuid,
                expires: Date.now() + this.lifetime,
                data: skin,
              });
            }
          } else {
            skin = await EaglerSkins.safeDownloadSkin(parsedPacket.url, this.backoffController);
          }

          const processed = this.usingNative ? await ImageEditor.toEaglerSkin(skin) : await ImageEditor.toEaglerSkinJS(skin);
          const response = new SCChannelMessagePacket();
          response.channel = Constants.EAGLERCRAFT_SKIN_CHANNEL_NAME;
          response.data = EaglerSkins.writeServerFetchSkinResultCustomPacket(parsedPacket.uuid, processed, true);
          caller.write(response);
        } catch (error: unknown) {
          const err = error as Error;
          this._logger.warn(`Failed to fetch skin URL ${parsedPacket.url} for player ${caller.username}: ${err.stack ?? err.message}`);
        }
        break;
      }

      default:
        throw new Error("Unknown operation!");
    }
  }
}

// Helper functions
function digestMd5Hex(data: Buffer | string): string {
  return crypto.createHash("md5").update(data).digest("hex");
}

function exportCachedSkin(skin: CachedSkin): Buffer {
  const endUuid = MineProtocol.writeString(skin.uuid);
  const encExp = MineProtocol.writeVarLong(skin.expires);
  const encSkin = MineProtocol.writeBinary(skin.data);
  return Buffer.concat([endUuid, encExp, encSkin]);
}

function readCachedSkin(data: Buffer): CachedSkin {
  const readUuid = MineProtocol.readString(data);
  const readExp = MineProtocol.readVarLong(readUuid.newBuffer);
  const readSkin = MineProtocol.readBinary(readExp.newBuffer);
  return {
    uuid: readUuid.value,
    expires: readExp.value,
    data: readSkin.value,
  };
}
