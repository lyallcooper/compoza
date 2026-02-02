# Compoza

A TUI-inspired web application for managing Docker Compose projects, targeting homelab/NAS users.

## Features

- **Project Management**: Scan, create, edit, and delete Docker Compose projects
- **Container Management**: Start, stop, restart containers with real-time status
- **Live Logs**: Stream logs from containers and projects via SSE
- **Interactive Terminal**: Exec into running containers with xterm.js
- **Image Updates**: Check for and pull latest images
- **Self-Update**: Update the Compoza container itself
- **TUI Aesthetic**: Clean, monospace design with light/dark mode support

## Quick Start

### Docker Compose (Recommended)

Create a `.env` file:

```env
PROJECTS_DIR=/path/to/your/docker/projects
```

Then run:

```bash
docker compose up -d
```

Access the app at http://localhost:3000

### Development

```bash
# Install dependencies
pnpm install

# Run development server
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start
```

## Configuration

All configuration is via environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `PROJECTS_DIR` | Path to projects inside the Compoza container | `/home/user/docker` |
| `HOST_PROJECTS_DIR` | Path to projects on the Docker host | Same as `PROJECTS_DIR` |
| `DOCKER_HOST` | Docker socket or TCP endpoint | `/var/run/docker.sock` |
| `PORT` | Port to listen on | `3000` |
| `COMPOZA_IMAGE` | Image name for self-update feature | `compoza:latest` |

### Registry Authentication

To check for image updates, Compoza queries container registries. Without authentication, Docker Hub limits requests to 100 per 6 hours per IP. Configure these env vars to authenticate:

| Variable | Description |
|----------|-------------|
| `DOCKERHUB_USERNAME` | Docker Hub username |
| `DOCKERHUB_TOKEN` | Docker Hub access token ([create one here](https://hub.docker.com/settings/security)) |
| `GHCR_TOKEN` | GitHub Container Registry PAT with `read:packages` scope |

Authenticated Docker Hub users get 200 requests per 6 hours. GHCR has no rate limits for authenticated users accessing public images.

## Deployment Notes

### Volume Mounts

Mount the projects directory from the host into the container:

```yaml
environment:
  - HOST_PROJECTS_DIR=/home/user/docker
  - PROJECTS_DIR=/projects
volumes:
  - ${HOST_PROJECTS_DIR}:${PROJECTS_DIR}:rw
```

`HOST_PROJECTS_DIR` is the path on the Docker host, `PROJECTS_DIR` is the path inside the container. If both are the same, you only need to set `PROJECTS_DIR` (since `HOST_PROJECTS_DIR` defaults to it).

### Docker Socket Access

For Docker API access, mount the Docker socket:

```yaml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock:ro
```

For better security, consider using a Docker socket proxy like [tecnativa/docker-socket-proxy](https://github.com/Tecnativa/docker-socket-proxy).

### Remote Docker Host

When connecting to a remote Docker host, use `HOST_PROJECTS_DIR` to map between local and remote paths:

```env
PROJECTS_DIR=/Volumes/server/docker
HOST_PROJECTS_DIR=/home/user/docker
DOCKER_HOST=tcp://your-server:2375
```

Compoza reads files from `PROJECTS_DIR` and translates paths to `HOST_PROJECTS_DIR` when running compose commands on the remote Docker daemon.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `g h` / `g d` | Go to Dashboard |
| `g p` | Go to Projects |
| `g c` | Go to Containers |
| `g s` | Go to Settings |
| `?` | Show shortcuts (console) |

## Tech Stack

- Next.js 15 (App Router)
- TypeScript
- Tailwind CSS 4
- React Query
- Socket.io (for terminal)
- CodeMirror 6 (YAML editor)
- xterm.js (terminal emulator)
- dockerode (Docker API)

## License

MIT
