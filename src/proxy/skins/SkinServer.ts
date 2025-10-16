// Only changes highlighted: deleteTask type & catch block typing

private deleteTask: NodeJS.Timeout; // use Timeout instead of Timer

constructor(...) {
    ...
    if (useCache) {
        this.deleteTask = setInterval(
            async () => await this.cache.filter((ent) => Date.now() < ent.expires),
            sweepInterval
        );
    }
}

public async handleRequest(packet: CSChannelMessagePacket, caller: Player, proxy: Proxy) {
    ...
    try {
        let cacheHit: CachedSkin | null = null,
            skin: Buffer | null = null;

        if (this.usingCache) {
            cacheHit = await this.cache.get(parsedPacket_1.uuid);
            skin = cacheHit != null ? cacheHit.data : null;

            if (!skin) {
                const fetched = await EaglerSkins.safeDownloadSkin(parsedPacket_1.url, this.backoffController);
                skin = fetched;
                await this.cache.set(parsedPacket_1.uuid, {
                    uuid: parsedPacket_1.uuid,
                    expires: Date.now() + this.lifetime,
                    data: fetched,
                });
            }
        } else {
            skin = await EaglerSkins.safeDownloadSkin(parsedPacket_1.url, this.backoffController);
        }

        const processed = this.usingNative
            ? await ImageEditor.toEaglerSkin(skin)
            : await ImageEditor.toEaglerSkinJS(skin);

        const response = new SCChannelMessagePacket();
        response.channel = Constants.EAGLERCRAFT_SKIN_CHANNEL_NAME;
        response.data = EaglerSkins.writeServerFetchSkinResultCustomPacket(parsedPacket_1.uuid, processed, true);
        caller.write(response);
    } catch (err: unknown) {
        // Cast err so TypeScript knows it has a stack property
        const e = err as { stack?: string; message?: string };
        this._logger.warn(`Failed to fetch skin URL ${parsedPacket_1.url} for player ${caller.username}: ${e.stack ?? e.message ?? e}`);
    }
}
