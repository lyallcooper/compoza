import type { Project, ComposeConfig } from "@/types";
import { parse as parseYaml } from "yaml";
import { listContainers } from "@/lib/docker";
import { buildServicesFromConfig } from "@/lib/projects/scanner";

// Fixture compose files for each demo project
const COMPOSE_FILES: Record<string, string> = {
  webapp: `services:
  nginx:
    image: nginx:1.25-alpine
    ports:
      - "8080:80"
      - "8443:443"
    depends_on:
      - api
    restart: unless-stopped
  api:
    image: node:20-alpine
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgres://user:pass@postgres:5432/webapp
      - REDIS_URL=redis://redis:6379
    depends_on:
      - postgres
      - redis
    restart: unless-stopped
  postgres:
    image: postgres:16-alpine
    environment:
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
      - POSTGRES_DB=webapp
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped
  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
`,

  monitoring: `services:
  prometheus:
    image: prom/prometheus:v2.48.1
    ports:
      - "9090:9090"
    volumes:
      - prometheus_data:/prometheus
    restart: unless-stopped
  grafana:
    image: grafana/grafana:10.2.3
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
      - GF_USERS_ALLOW_SIGN_UP=false
    volumes:
      - grafana_data:/var/lib/grafana
    restart: unless-stopped

volumes:
  prometheus_data:
  grafana_data:
`,

  "legacy-app": `services:
  web:
    image: php:8.2-apache
    ports:
      - "8081:80"
    restart: unless-stopped
  db:
    image: mariadb:11.2
    environment:
      - MARIADB_ROOT_PASSWORD=secret
      - MARIADB_DATABASE=legacy
    volumes:
      - db_data:/var/lib/mysql
    restart: unless-stopped

volumes:
  db_data:
`,

  compoza: `services:
  compoza:
    image: ghcr.io/compoza/compoza:latest
    ports:
      - "3000:3000"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - /home/user/docker:/home/user/docker
    environment:
      - PROJECTS_DIR=/home/user/docker
    restart: unless-stopped
`,
};

const ENV_FILES: Record<string, string> = {
  webapp: `# Database credentials
POSTGRES_USER=user
POSTGRES_PASSWORD=pass
POSTGRES_DB=webapp
`,
};

async function buildMockProject(name: string, composeYaml: string): Promise<Project> {
  const config = parseYaml(composeYaml) as ComposeConfig;
  const containers = await listContainers({ all: true });
  const projectContainers = containers.filter((c) => c.projectName === name);
  const { services, status } = buildServicesFromConfig(config, projectContainers);

  return {
    name,
    path: `/home/user/docker/${name}`,
    composeFile: `/home/user/docker/${name}/compose.yaml`,
    status,
    services,
  };
}

export async function scanMockProjects(): Promise<Project[]> {
  const projects = await Promise.all(
    Object.entries(COMPOSE_FILES).map(([name, yaml]) => buildMockProject(name, yaml))
  );
  return projects.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getMockProject(name: string): Promise<Project | null> {
  const yaml = COMPOSE_FILES[name];
  if (!yaml) return null;
  return buildMockProject(name, yaml);
}

export function readMockComposeFile(projectName: string): string | null {
  return COMPOSE_FILES[projectName] ?? null;
}

export function readMockEnvFile(projectName: string): string | null {
  return ENV_FILES[projectName] ?? null;
}
