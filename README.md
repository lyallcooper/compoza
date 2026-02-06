# Compoza

A web-based Docker Compose manager with a terminal aesthetic. Manage your projects, containers, images, networks, and volumes from a single clean interface — designed for homelab and NAS users who want Portainer-like convenience without the complexity.

## Quick Start

```yaml
# docker-compose.yaml
services:
  compoza:
    image: ghcr.io/lyallcooper/compoza:latest
    container_name: compoza
    ports:
      - "3000:3000"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - /path/to/your/projects:/path/to/your/projects:rw
    environment:
      - PROJECTS_DIR=/path/to/your/projects
    user: root
    restart: unless-stopped
```

```bash
docker compose up -d
# Open http://localhost:3000
```

`PROJECTS_DIR` should point to a directory containing your Docker Compose projects (each in its own subdirectory with a `compose.yaml` or `docker-compose.yaml`). The volume mount path must match `PROJECTS_DIR` so compose file paths resolve correctly.

## Features

**Projects** — Create, edit, start, stop, and update Docker Compose projects. Edit `compose.yaml` and `.env` files with syntax-highlighted editors. Stream project logs. Check for image updates across Docker Hub and GHCR, and pull new versions with one click.

**Containers** — View all containers with status, ports, and resource usage. Start, stop, restart, or remove containers. See real-time CPU/memory stats, inspect mounts, networks, environment variables, and labels. Stream logs or open an interactive terminal session.

**Images, Networks, Volumes** — Browse, create, and delete Docker resources. Prune unused resources with a preview of what will be removed and how much space you'll reclaim.

**Dashboard** — At-a-glance overview of projects, running containers, available updates, and storage usage. Flags containers that need attention (unhealthy, restarting, failed exits).

**System** — Docker host info, disk usage breakdown, and a system prune tool with granular control over what gets cleaned (containers, networks, images, volumes, build cache).

**Self-Update** — Compoza can pull its own latest image and restart itself when running as a Docker Compose service.

## Security

**Compoza has no built-in authentication.** Any client that can reach the application has full access to manage your Docker environment.

Deploy Compoza behind an authenticating reverse proxy (e.g., Traefik with Authelia, Nginx with basic auth, Cloudflare Access) or restrict network access to trusted clients only. Never expose it directly to the internet without authentication.

For additional security, consider using a [Docker socket proxy](https://github.com/Tecnativa/docker-socket-proxy) to limit Docker API access.

## Configuration

All configuration is via environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `PROJECTS_DIR` | Path to projects inside the container | `/home/user/docker` |
| `HOST_PROJECTS_DIR` | Path to projects on the Docker host (see below) | Same as `PROJECTS_DIR` |
| `DOCKER_HOST` | Docker socket or TCP endpoint | `/var/run/docker.sock` |
| `PORT` | Port to listen on | `3000` |
| `COMPOZA_IMAGE` | Image name for self-update | `compoza:latest` |

### Registry Authentication

Compoza queries container registries to check for image updates. Without authentication, Docker Hub limits requests to 100 per 6 hours per IP. To authenticate:

| Variable | Description |
|----------|-------------|
| `DOCKERHUB_USERNAME` | Docker Hub username |
| `DOCKERHUB_TOKEN` | Docker Hub access token ([create one here](https://hub.docker.com/settings/security)) |
| `GHCR_TOKEN` | GitHub classic PAT with `read:packages` scope |

Authenticated Docker Hub users get 200 requests per 6 hours. GHCR has no rate limits for authenticated users.

### Host Path Mapping

If the path inside the container differs from the host path, set `HOST_PROJECTS_DIR`. Compoza reads files from `PROJECTS_DIR` and translates paths to `HOST_PROJECTS_DIR` when running compose commands on the Docker daemon.

```yaml
environment:
  - HOST_PROJECTS_DIR=/home/user/docker
  - PROJECTS_DIR=/projects
volumes:
  - /home/user/docker:/projects:rw
```

### Remote Docker Host

To manage a remote Docker host, mount or access the projects directory from the remote machine and set `HOST_PROJECTS_DIR` to the path on the remote host:

```env
PROJECTS_DIR=/Volumes/server/docker
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
| `g s` | Go to System |
| `Esc` | Close modal |
| `Cmd/Ctrl + S` | Save (in editor) |

## Development

```bash
pnpm install
pnpm dev        # http://localhost:3000
```

Set `PROJECTS_DIR` in a `.env` file or your environment to point at a directory of Docker Compose projects.

## Tech Stack

Next.js 16, React 19, Tailwind CSS 4, React Query, Socket.io, CodeMirror 6, xterm.js, dockerode.