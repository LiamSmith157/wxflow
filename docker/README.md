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
