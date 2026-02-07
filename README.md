# Compoza

Docker management for the discerning individual.

Compoza's thoughtfully designed and polished interface has just the features you need to quickly and simply do everything docker on your personal server.

Create and manage:
- Compose projects
- Containers
- Images
- Networks
- Volumes

Easily:
- Update images with one click
- View logs
- Exec into containers
- Clean up anything unused
- Update compoza itself like any other project from the web interface

## Quick Start

```yaml
# docker-compose.yaml
services:
  compoza:
    image: ghcr.io/lyallcooper/compoza:latest
    container_name: compoza
    ports:
      - 3000:3000
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - /path/to/your/projects:/path/to/your/projects:rw
    environment:
      - PROJECTS_DIR=/path/to/your/projects
    restart: unless-stopped
```

```bash
docker compose up -d
# Open http://localhost:3000
```

`PROJECTS_DIR` should point to a directory containing your Docker Compose projects (each in its own subdirectory with a `compose.yaml` or `docker-compose.yaml`). The volume mount path must match `PROJECTS_DIR` so compose file paths resolve correctly unless you are using the path mapping feature via setting `HOST_PROJECTS_DIR` (see below).

## Security

**Compoza has no built-in authentication.** Any client that can reach the application has full access to manage your Docker environment.

You **must** restrict access to compoza by deploying it behind an authentication service (e.g. tinyauth, Cloudflare Access, Authelia) or by restricting network access to trusted clients only (e.g. VPN, tailscale).

> [!CAUTION]
> Never expose compoza directly to the internet without authentication.

For additional security, consider using a [Docker socket proxy](https://github.com/Tecnativa/docker-socket-proxy) to limit Docker API access instead of the raw docker socket. For full feature support, the required permissions are: `CONTAINERS`, `IMAGES`, `NETWORKS`, `VOLUMES`, `INFO`, `DISTRIBUTION`, `POST`, `DELETE`, `EXEC`, `BUILD`.

## Configuration

All configuration is via environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `PROJECTS_DIR` | Path to projects inside the container | `/home/user/docker` |
| `HOST_PROJECTS_DIR` | Path to projects on the Docker host (see below) | Same as `PROJECTS_DIR` |
| `DOCKER_HOST` | Docker socket or TCP endpoint | `/var/run/docker.sock` |
| `PORT` | Port to listen on | `3000` |

### Registry Authentication

Compoza queries container registries to check for image updates. For best performance we recommend providing Docker Hub and GitHub credentials. Without authentication, Docker Hub limits requests to 100 per 6 hours per IP and GitHub restricts access to some APIs. To authenticate:

| Variable | Description |
|----------|-------------|
| `DOCKERHUB_USERNAME` | Docker Hub username |
| `DOCKERHUB_TOKEN` | Docker Hub access token  |
| `GHCR_TOKEN` | GitHub classic PAT with `read:packages` scope |

Authenticated Docker Hub users get 200 requests per 6 hours. GHCR has no rate limits for authenticated users.

### Host Path Mapping

While not needed in most cases, it's possible to change the projects directory path mapping via setting `HOST_PROJECTS_DIR`. `PROJECTS_DIR` controls where compoza looks inside its own container for compose files and `HOST_PROJECTS_DIR` controls the path that is sent to the host docker daemon with commands.

By default, `HOST_PROJECTS_DIR` is set to equal `PROJECTS_DIR`, so it's not necessary to specify a value unless you need to enable path mapping.

```yaml
environment:
  - HOST_PROJECTS_DIR=/home/user/docker
  - PROJECTS_DIR=/projects
volumes:
  - /home/user/docker:/projects
```

#### Remote Docker Host

To manage a remote Docker host, mount or access the projects directory from the remote machine and set `HOST_PROJECTS_DIR` to the path on the remote host:

```env
PROJECTS_DIR=/mnt/server/docker
HOST_PROJECTS_DIR=/home/user/docker
DOCKER_HOST=tcp://your-server:2375
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `?` | Show keyboard shortcuts |
| `g h` | Go to Dashboard |
| `g p` | Go to Projects |
| `g c` | Go to Containers |
| `g i` | Go to Images |
| `g n` | Go to Networks |
| `g v` | Go to Volumes |
| `g s` | Go to System |
| `Esc` | Close modal |
| `Cmd/Ctrl + S` | Save (in editor) |

## Development

```bash
pnpm install
pnpm dev        # Serves at http://localhost:3000
```

Set `PROJECTS_DIR` in a `.env`/`.env.local` file or your environment to point at a directory of Docker Compose projects.

## AI Usage Disclosure

AI tools are used as part of the compoza development process. Nonetheless, we hold ourselves and the project to a high standard. We strive to ensure that every feature is well tested, every design choice well considered, and every pixel well placed. Our goal is to use AI tools where appropriate to achieve a previously unreasonable level of quality and polish. Constructive feedback is always welcome.
