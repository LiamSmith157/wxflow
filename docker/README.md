# wxflow Docker Image

Starts wxflow from the `wxflow` Docker image

## Usage

1. Create `.env` file and specify the `PORT` (refer to `.env.example`)
2. `docker compose up -d`
3. Open [http://localhost:3000](http://localhost:3000)
4. You can bring the containers down by `docker compose stop`

## 🌱 Env Variables

If you like to persist your data (flows, logs, credentials, storage), set these variables in the `.env` file inside `docker` folder:

-   DATABASE_PATH=/home/node/.wxflow
-   LOG_PATH=/home/node/.wxflow/logs
-   SECRETKEY_PATH=/home/node/.wxflow
-   BLOB_STORAGE_PATH=/home/node/.wxflow/storage

wxflow also supports different environment variables to configure your instance. Read [more](https://docs.wxflowai.com/configuration/environment-variables)

> The container runs as the non-root `node` user (uid 1000), whose home directory is `/home/node`. If you bind-mount a host directory (e.g. `~/.wxflow`) for persistence, make sure it's writable by that user - on Linux hosts this may require `chown -R 1000:1000 ~/.wxflow`.

## WeChat channel (Windows + Docker Desktop)

`docker-compose.yml` is ready for the WeChat gateway when wxflow runs in Docker Desktop (WSL2, Linux containers) on the same Windows machine as WeChat:

-   **Port**: `127.0.0.1:56233:56233` publishes the gateway on the Windows loopback only, so `AIHelpLib.dll` can dial `ws://127.0.0.1:56233` and nothing else on the network can. Set `dialPort` in `AIHelpLib.json` to `56233`. If you change `WECHAT_GATEWAY_PORT`, change both numbers in the mapping.
-   **Listening address**: inside the container the gateway listens on `0.0.0.0` (`WECHAT_GATEWAY_HOST`), otherwise the port mapping cannot reach it.
-   **Exchange folder**: `C:\wxflow\exchange` on Windows is mounted at `/exchange` in the container. Images, files and videos are handed to `AIHelpLib.dll` as Windows paths, so both sides must see the same folder. Put your own media under `assets\`. Create the folder before `docker compose up`, or point `WECHAT_EXCHANGE_DIR_HOST` in `.env` at another Windows folder.
-   **Turning it off**: set `WECHAT_GATEWAY_PORT=0` (and add the variable to the `environment` list, see the commented line in the compose file).
-   The gateway only runs in the default (non-queue) mode. The queue compose files do not publish the port.

The other `WECHAT_*` variables are described in `.env.example`. Run `docker compose config` to see the resolved values.

## Queue Mode:

### Building from source:

You can build the images for worker and main from scratch with:

```
docker compose -f docker-compose-queue-source.yml up -d
```

Monitor Health:

```
docker compose -f docker-compose-queue-source.yml ps
```

### From pre-built images:

You can also use the pre-built images:

```
docker compose -f docker-compose-queue-prebuilt.yml up -d
```

Monitor Health:

```
docker compose -f docker-compose-queue-prebuilt.yml ps
```
