import type {
  Container,
  ContainerStats,
  DockerImage,
  DockerImageDetail,
  DockerNetwork,
  DockerVolume,
  DockerSystemInfo,
  Project,
  ProjectService,
  NetworkContainer,
} from "@/types";

// Deterministic IDs — stable across restarts so URLs are predictable
const IDS = {
  // Containers
  webappNginx:   "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
  webappApi:     "b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3",
  webappPostgres:"c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
  webappRedis:   "d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5",
  monProm:       "e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6",
  monGrafana:    "f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1",
  legacyWeb:     "1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b",
  legacyDb:      "2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c",
  devMailpit:    "3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d",
  compoza:       "4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e",
  syncthing:     "5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f",

  // Images
  imgNginx:    "sha256:aa1122334455667788990011223344556677889900112233445566778899001122",
  imgNode:     "sha256:bb1122334455667788990011223344556677889900112233445566778899001122",
  imgPostgres: "sha256:cc1122334455667788990011223344556677889900112233445566778899001122",
  imgRedis:    "sha256:dd1122334455667788990011223344556677889900112233445566778899001122",
  imgProm:     "sha256:ee1122334455667788990011223344556677889900112233445566778899001122",
  imgGrafana:  "sha256:ff1122334455667788990011223344556677889900112233445566778899001122",
  imgPhp:      "sha256:1a1122334455667788990011223344556677889900112233445566778899001122",
  imgMariadb:  "sha256:2b1122334455667788990011223344556677889900112233445566778899001122",
  imgMailpit:  "sha256:3c1122334455667788990011223344556677889900112233445566778899001122",
  imgCompoza:    "sha256:4d1122334455667788990011223344556677889900112233445566778899001122",
  imgSyncthing:  "sha256:5e1122334455667788990011223344556677889900112233445566778899001122",

  // Networks
  netBridge:     "net0000000000000000000000000000000000000000000000000000000000000001",
  netHost:       "net0000000000000000000000000000000000000000000000000000000000000006",
  netNone:       "net0000000000000000000000000000000000000000000000000000000000000007",
  netWebapp:     "net0000000000000000000000000000000000000000000000000000000000000002",
  netMonitoring: "net0000000000000000000000000000000000000000000000000000000000000003",
  netLegacy:     "net0000000000000000000000000000000000000000000000000000000000000004",
  netCompoza:    "net0000000000000000000000000000000000000000000000000000000000000005",
} as const;

const NOW = Math.floor(Date.now() / 1000);
const HOUR = 3600;

function containerActions(state: Container["state"]): Container["actions"] {
  const running = state === "running" || state === "restarting";
  return {
    canStart: !running,
    canStop: running,
    canRestart: running,
    canUpdate: true,
    canViewLogs: true,
    canExec: state === "running",
  };
}

function makeContainer(opts: {
  id: string;
  name: string;
  image: string;
  imageId: string;
  state: Container["state"];
  status: string;
  created: number;
  startedAt: number;
  project?: string;
  service?: string;
  ports?: Container["ports"];
  env?: Record<string, string>;
  mounts?: Container["mounts"];
  networks?: Container["networks"];
  health?: Container["health"];
  restartCount?: number;
  exitCode?: number;
}): Container {
  return {
    id: opts.id,
    name: opts.name,
    image: opts.image,
    imageId: opts.imageId,
    state: opts.state,
    status: opts.status,
    created: opts.created,
    startedAt: opts.startedAt,
    ports: opts.ports ?? [],
    labels: opts.project
      ? {
          "com.docker.compose.project": opts.project,
          "com.docker.compose.service": opts.service!,
          "com.docker.compose.oneoff": "False",
          "com.docker.compose.project.working_dir": `/home/user/docker/${opts.project}`,
          "com.docker.compose.project.config_files": `/home/user/docker/${opts.project}/compose.yaml`,
        }
      : {},
    projectName: opts.project,
    serviceName: opts.service,
    updateStrategy: opts.project ? "compose" : "standalone",
    actions: containerActions(opts.state),
    restartCount: opts.restartCount,
    health: opts.health,
    exitCode: opts.exitCode,
    env: opts.env ?? {},
    mounts: opts.mounts ?? [],
    networks: opts.networks ?? [],
  };
}

export function createContainers(): Map<string, Container> {
  const containers: Container[] = [
    makeContainer({
      id: IDS.webappNginx,
      name: "webapp-nginx-1",
      image: "nginx:1.25-alpine",
      imageId: IDS.imgNginx,
      state: "running",
      status: "Up 6 hours",
      created: NOW - 6 * HOUR,
      startedAt: NOW - 6 * HOUR,
      project: "webapp",
      service: "nginx",
      ports: [
        { container: 80, host: 8080, protocol: "tcp" },
        { container: 443, host: 8443, protocol: "tcp" },
      ],
      networks: [{ name: "webapp_default", ipAddress: "172.18.0.2", gateway: "172.18.0.1", macAddress: "02:42:ac:12:00:02" }],
      health: { status: "healthy", failingStreak: 0 },
    }),
    makeContainer({
      id: IDS.webappApi,
      name: "webapp-api-1",
      image: "node:20-alpine",
      imageId: IDS.imgNode,
      state: "running",
      status: "Up 6 hours",
      created: NOW - 6 * HOUR,
      startedAt: NOW - 6 * HOUR,
      project: "webapp",
      service: "api",
      ports: [{ container: 3000, host: 3000, protocol: "tcp" }],
      networks: [{ name: "webapp_default", ipAddress: "172.18.0.3", gateway: "172.18.0.1", macAddress: "02:42:ac:12:00:03" }],
      env: { NODE_ENV: "production", DATABASE_URL: "postgres://user:pass@postgres:5432/webapp", REDIS_URL: "redis://redis:6379", PORT: "3000" },
      health: { status: "healthy", failingStreak: 0 },
    }),
    makeContainer({
      id: IDS.webappPostgres,
      name: "webapp-postgres-1",
      image: "postgres:16-alpine",
      imageId: IDS.imgPostgres,
      state: "running",
      status: "Up 6 hours",
      created: NOW - 6 * HOUR,
      startedAt: NOW - 6 * HOUR,
      project: "webapp",
      service: "postgres",
      ports: [{ container: 5432, protocol: "tcp" }],
      networks: [{ name: "webapp_default", ipAddress: "172.18.0.4", gateway: "172.18.0.1", macAddress: "02:42:ac:12:00:04" }],
      mounts: [{ type: "volume", name: "webapp_postgres_data", source: "/var/lib/docker/volumes/webapp_postgres_data/_data", destination: "/var/lib/postgresql/data", mode: "rw", rw: true }],
      env: { POSTGRES_USER: "user", POSTGRES_PASSWORD: "pass", POSTGRES_DB: "webapp" },
      health: { status: "healthy", failingStreak: 0 },
    }),
    makeContainer({
      id: IDS.webappRedis,
      name: "webapp-redis-1",
      image: "redis:7-alpine",
      imageId: IDS.imgRedis,
      state: "running",
      status: "Up 6 hours",
      created: NOW - 6 * HOUR,
      startedAt: NOW - 6 * HOUR,
      project: "webapp",
      service: "redis",
      ports: [{ container: 6379, protocol: "tcp" }],
      networks: [{ name: "webapp_default", ipAddress: "172.18.0.5", gateway: "172.18.0.1", macAddress: "02:42:ac:12:00:05" }],
      mounts: [{ type: "volume", name: "webapp_redis_data", source: "/var/lib/docker/volumes/webapp_redis_data/_data", destination: "/data", mode: "rw", rw: true }],
    }),
    makeContainer({
      id: IDS.monProm,
      name: "monitoring-prometheus-1",
      image: "prom/prometheus:v2.48.1",
      imageId: IDS.imgProm,
      state: "running",
      status: "Up 2 days",
      created: NOW - 48 * HOUR,
      startedAt: NOW - 48 * HOUR,
      project: "monitoring",
      service: "prometheus",
      ports: [{ container: 9090, host: 9090, protocol: "tcp" }],
      networks: [{ name: "monitoring_default", ipAddress: "172.19.0.2", gateway: "172.19.0.1", macAddress: "02:42:ac:13:00:02" }],
      mounts: [{ type: "volume", name: "monitoring_prometheus_data", source: "/var/lib/docker/volumes/monitoring_prometheus_data/_data", destination: "/prometheus", mode: "rw", rw: true }],
    }),
    makeContainer({
      id: IDS.monGrafana,
      name: "monitoring-grafana-1",
      image: "grafana/grafana:10.2.3",
      imageId: IDS.imgGrafana,
      state: "running",
      status: "Up 2 days",
      created: NOW - 48 * HOUR,
      startedAt: NOW - 48 * HOUR,
      project: "monitoring",
      service: "grafana",
      ports: [{ container: 3000, host: 3001, protocol: "tcp" }],
      networks: [{ name: "monitoring_default", ipAddress: "172.19.0.3", gateway: "172.19.0.1", macAddress: "02:42:ac:13:00:03" }],
      mounts: [{ type: "volume", name: "monitoring_grafana_data", source: "/var/lib/docker/volumes/monitoring_grafana_data/_data", destination: "/var/lib/grafana", mode: "rw", rw: true }],
      env: { GF_SECURITY_ADMIN_PASSWORD: "admin", GF_USERS_ALLOW_SIGN_UP: "false" },
    }),
    makeContainer({
      id: IDS.legacyWeb,
      name: "legacy-app-web-1",
      image: "php:8.2-apache",
      imageId: IDS.imgPhp,
      state: "restarting",
      status: "Restarting (1) 30 seconds ago",
      created: NOW - 7 * 24 * HOUR,
      startedAt: NOW - 300,
      project: "legacy-app",
      service: "web",
      ports: [{ container: 80, host: 8081, protocol: "tcp" }],
      networks: [{ name: "legacy-app_default", ipAddress: "172.20.0.2", gateway: "172.20.0.1", macAddress: "02:42:ac:14:00:02" }],
      restartCount: 15,
      exitCode: 1,
    }),
    makeContainer({
      id: IDS.legacyDb,
      name: "legacy-app-db-1",
      image: "mariadb:11.2",
      imageId: IDS.imgMariadb,
      state: "exited",
      status: "Exited (137) 2 hours ago",
      created: NOW - 7 * 24 * HOUR,
      startedAt: NOW - 3 * 24 * HOUR,
      project: "legacy-app",
      service: "db",
      ports: [{ container: 3306, protocol: "tcp" }],
      networks: [{ name: "legacy-app_default", ipAddress: "172.20.0.3", gateway: "172.20.0.1", macAddress: "02:42:ac:14:00:03" }],
      mounts: [{ type: "volume", name: "legacy-app_db_data", source: "/var/lib/docker/volumes/legacy-app_db_data/_data", destination: "/var/lib/mysql", mode: "rw", rw: true }],
      env: { MARIADB_ROOT_PASSWORD: "secret", MARIADB_DATABASE: "legacy" },
      exitCode: 137,
    }),
    makeContainer({
      id: IDS.devMailpit,
      name: "dev-mailpit",
      image: "axllent/mailpit:v1.12",
      imageId: IDS.imgMailpit,
      state: "running",
      status: "Up 12 hours",
      created: NOW - 12 * HOUR,
      startedAt: NOW - 12 * HOUR,
      ports: [
        { container: 1025, host: 1025, protocol: "tcp" },
        { container: 8025, host: 8025, protocol: "tcp" },
      ],
      networks: [{ name: "bridge", ipAddress: "172.17.0.2", gateway: "172.17.0.1", macAddress: "02:42:ac:11:00:02" }],
    }),
    makeContainer({
      id: IDS.compoza,
      name: "compoza-compoza-1",
      image: "ghcr.io/lyallcooper/compoza:latest",
      imageId: IDS.imgCompoza,
      state: "running",
      status: "Up 6 hours",
      created: NOW - 6 * HOUR,
      startedAt: NOW - 6 * HOUR,
      project: "compoza",
      service: "compoza",
      ports: [{ container: 3000, host: 3000, protocol: "tcp" }],
      networks: [{ name: "compoza_default", ipAddress: "172.21.0.2", gateway: "172.21.0.1", macAddress: "02:42:ac:15:00:02" }],
      mounts: [
        { type: "bind", source: "/var/run/docker.sock", destination: "/var/run/docker.sock", mode: "rw", rw: true },
        { type: "bind", source: "/home/user/docker", destination: "/home/user/docker", mode: "rw", rw: true },
      ],
      env: { PROJECTS_DIR: "/home/user/docker" },
    }),
    makeContainer({
      id: IDS.syncthing,
      name: "syncthing-syncthing-1",
      image: "syncthing/syncthing:latest",
      imageId: IDS.imgSyncthing,
      state: "running",
      status: "Up 3 days",
      created: NOW - 72 * HOUR,
      startedAt: NOW - 72 * HOUR,
      project: "syncthing",
      service: "syncthing",
      ports: [],
      networks: [{ name: "host", ipAddress: "", gateway: "", macAddress: "" }],
      mounts: [
        { type: "bind", source: "/home/user/syncthing", destination: "/var/syncthing", mode: "rw", rw: true },
      ],
      env: { PUID: "1000", PGID: "1000" },
    }),
  ];

  const map = new Map<string, Container>();
  for (const c of containers) map.set(c.id, c);
  return map;
}

// Base stats per container (used for jitter)
const BASE_STATS: Record<string, Omit<ContainerStats, "cpuPercent">> = {
  [IDS.webappNginx]: { memoryUsage: 31_457_280, memoryLimit: 1_073_741_824, memoryPercent: 2.9, networkRx: 524_288, networkTx: 1_048_576, blockRead: 0, blockWrite: 0 },
  [IDS.webappApi]: { memoryUsage: 157_286_400, memoryLimit: 1_073_741_824, memoryPercent: 14.6, networkRx: 2_097_152, networkTx: 4_194_304, blockRead: 0, blockWrite: 0 },
  [IDS.webappPostgres]: { memoryUsage: 83_886_080, memoryLimit: 1_073_741_824, memoryPercent: 7.8, networkRx: 1_048_576, networkTx: 524_288, blockRead: 8_388_608, blockWrite: 16_777_216 },
  [IDS.webappRedis]: { memoryUsage: 10_485_760, memoryLimit: 1_073_741_824, memoryPercent: 1.0, networkRx: 262_144, networkTx: 131_072, blockRead: 0, blockWrite: 0 },
  [IDS.monProm]: { memoryUsage: 209_715_200, memoryLimit: 2_147_483_648, memoryPercent: 9.8, networkRx: 4_194_304, networkTx: 1_048_576, blockRead: 33_554_432, blockWrite: 67_108_864 },
  [IDS.monGrafana]: { memoryUsage: 125_829_120, memoryLimit: 2_147_483_648, memoryPercent: 5.9, networkRx: 1_048_576, networkTx: 2_097_152, blockRead: 0, blockWrite: 0 },
  [IDS.devMailpit]: { memoryUsage: 20_971_520, memoryLimit: 1_073_741_824, memoryPercent: 2.0, networkRx: 65_536, networkTx: 32_768, blockRead: 0, blockWrite: 0 },
  [IDS.compoza]: { memoryUsage: 125_829_120, memoryLimit: 1_073_741_824, memoryPercent: 11.7, networkRx: 2_097_152, networkTx: 4_194_304, blockRead: 0, blockWrite: 0 },
};

export function getContainerStats(id: string): ContainerStats | null {
  const base = BASE_STATS[id];
  if (!base) return null;

  const jitter = (v: number, pct = 0.1) => Math.round(v * (1 + (Math.random() - 0.5) * 2 * pct));

  return {
    cpuPercent: Math.round((Math.random() * 15 + 0.5) * 100) / 100,
    memoryUsage: jitter(base.memoryUsage),
    memoryLimit: base.memoryLimit,
    memoryPercent: Math.round((jitter(base.memoryUsage) / base.memoryLimit) * 10000) / 100,
    networkRx: jitter(base.networkRx, 0.05),
    networkTx: jitter(base.networkTx, 0.05),
    blockRead: jitter(base.blockRead, 0.02),
    blockWrite: jitter(base.blockWrite, 0.02),
  };
}

export const CONTAINER_LOGS: Record<string, string[]> = {
  nginx: [
    `2024-01-15T10:00:01Z 172.18.0.1 - - [15/Jan/2024:10:00:01 +0000] "GET / HTTP/1.1" 200 612 "-" "Mozilla/5.0"`,
    `2024-01-15T10:00:02Z 172.18.0.1 - - [15/Jan/2024:10:00:02 +0000] "GET /api/health HTTP/1.1" 200 15 "-" "curl/8.1"`,
    `2024-01-15T10:00:03Z 172.18.0.1 - - [15/Jan/2024:10:00:03 +0000] "GET /static/app.js HTTP/1.1" 304 0 "-" "Mozilla/5.0"`,
  ],
  api: [
    `2024-01-15T10:00:01Z [info] Server listening on port 3000`,
    `2024-01-15T10:00:02Z [info] Connected to PostgreSQL at postgres:5432`,
    `2024-01-15T10:00:02Z [info] Redis connection established`,
    `2024-01-15T10:00:05Z [info] GET /api/health 200 2ms`,
  ],
  postgres: [
    `2024-01-15T10:00:00Z LOG:  database system is ready to accept connections`,
    `2024-01-15T10:00:01Z LOG:  autovacuum launcher started`,
  ],
  redis: [
    `2024-01-15T10:00:00Z 1:M 15 Jan 2024 10:00:00.000 * Ready to accept connections tcp`,
  ],
  prometheus: [
    `2024-01-15T10:00:00Z ts=2024-01-15T10:00:00.000Z caller=main.go:524 level=info msg="Server is ready to receive web requests."`,
    `2024-01-15T10:00:05Z ts=2024-01-15T10:00:05.000Z caller=scrape.go:150 level=info msg="Scrape discovery manager stopped"`,
  ],
  grafana: [
    `2024-01-15T10:00:00Z logger=settings t=2024-01-15T10:00:00Z level=info msg="Starting Grafana" version=10.2.3`,
    `2024-01-15T10:00:01Z logger=http.server t=2024-01-15T10:00:01Z level=info msg="HTTP Server Listen" address=0.0.0.0:3000`,
  ],
  mailpit: [
    `2024-01-15T10:00:00Z [info] Mailpit v1.12.0 starting`,
    `2024-01-15T10:00:00Z [info] SMTP server listening on 0.0.0.0:1025`,
    `2024-01-15T10:00:00Z [info] HTTP server listening on 0.0.0.0:8025`,
  ],
  compoza: [
    `2024-01-15T10:00:00Z Compoza server listening on http://0.0.0.0:3000`,
    `2024-01-15T10:00:01Z Scanning projects in /home/user/docker`,
    `2024-01-15T10:00:01Z Found 4 compose projects`,
    `2024-01-15T10:00:02Z Docker engine connected (v24.0.7)`,
  ],
  syncthing: [
    `2024-01-15T10:00:00Z [start] Starting syncthing`,
    `2024-01-15T10:00:01Z [IYFSJ] INFO: My ID: IYFSJ77-ABCDEFG-HIJKLMN-OPQRSTU-VWXYZ12-3456789-ABCDEFG-HIJKLMN`,
    `2024-01-15T10:00:01Z [IYFSJ] INFO: Completed initial scan of sendreceive folder "Default" (abcde-12345)`,
    `2024-01-15T10:00:02Z [IYFSJ] INFO: GUI and API listening on 0.0.0.0:8384`,
    `2024-01-15T10:00:02Z [IYFSJ] INFO: TCP listener ([::]:22000) starting`,
    `2024-01-15T10:00:02Z [IYFSJ] INFO: Relay listener (dynamic+https://relays.syncthing.net/endpoint) starting`,
  ],
};

/** Map from container name to log key */
function getLogKey(containerName: string): string {
  const map: Record<string, string> = {
    "webapp-nginx-1": "nginx",
    "webapp-api-1": "api",
    "webapp-postgres-1": "postgres",
    "webapp-redis-1": "redis",
    "monitoring-prometheus-1": "prometheus",
    "monitoring-grafana-1": "grafana",
    "legacy-app-web-1": "nginx",
    "legacy-app-db-1": "postgres",
    "dev-mailpit": "mailpit",
    "compoza-compoza-1": "compoza",
    "syncthing-syncthing-1": "syncthing",
  };
  return map[containerName] ?? "nginx";
}

export function getContainerLogs(containerName: string): string[] {
  return CONTAINER_LOGS[getLogKey(containerName)] ?? [];
}

export function createImages(): Map<string, DockerImage> {
  const images: DockerImage[] = [
    { id: IDS.imgNginx, name: "nginx:1.25-alpine", tags: ["nginx:1.25-alpine"], size: 42_000_000, created: NOW - 30 * 24 * HOUR, digest: "sha256:aaa111222333444555666777888999000aaabbbccc" },
    { id: IDS.imgNode, name: "node:20-alpine", tags: ["node:20-alpine"], size: 180_000_000, created: NOW - 14 * 24 * HOUR, digest: "sha256:bbb111222333444555666777888999000aaabbbccc" },
    { id: IDS.imgPostgres, name: "postgres:16-alpine", tags: ["postgres:16-alpine"], size: 230_000_000, created: NOW - 21 * 24 * HOUR, digest: "sha256:ccc111222333444555666777888999000aaabbbccc" },
    { id: IDS.imgRedis, name: "redis:7-alpine", tags: ["redis:7-alpine"], size: 32_000_000, created: NOW - 10 * 24 * HOUR, digest: "sha256:ddd111222333444555666777888999000aaabbbccc" },
    { id: IDS.imgProm, name: "prom/prometheus:v2.48.1", tags: ["prom/prometheus:v2.48.1"], size: 245_000_000, created: NOW - 45 * 24 * HOUR, digest: "sha256:eee111222333444555666777888999000aaabbbccc" },
    { id: IDS.imgGrafana, name: "grafana/grafana:10.2.3", tags: ["grafana/grafana:10.2.3"], size: 380_000_000, created: NOW - 20 * 24 * HOUR, digest: "sha256:fff111222333444555666777888999000aaabbbccc", updateAvailable: true },
    { id: IDS.imgPhp, name: "php:8.2-apache", tags: ["php:8.2-apache"], size: 490_000_000, created: NOW - 60 * 24 * HOUR, digest: "sha256:111222333444555666777888999000aaabbbcccddd" },
    { id: IDS.imgMariadb, name: "mariadb:11.2", tags: ["mariadb:11.2"], size: 400_000_000, created: NOW - 35 * 24 * HOUR, digest: "sha256:222333444555666777888999000aaabbbcccdddee" },
    { id: IDS.imgMailpit, name: "axllent/mailpit:v1.12", tags: ["axllent/mailpit:v1.12"], size: 18_000_000, created: NOW - 7 * 24 * HOUR, digest: "sha256:333444555666777888999000aaabbbcccdddeee" },
    { id: IDS.imgCompoza, name: "ghcr.io/lyallcooper/compoza:latest", tags: ["ghcr.io/lyallcooper/compoza:latest"], size: 210_000_000, created: NOW - 2 * 24 * HOUR, digest: "sha256:444555666777888999000aaabbbcccdddeee111" },
    { id: IDS.imgSyncthing, name: "syncthing/syncthing:latest", tags: ["syncthing/syncthing:latest"], size: 65_000_000, created: NOW - 10 * 24 * HOUR, digest: "sha256:555666777888999000aaabbbcccdddeee111222" },
  ];

  // Mark nginx as having update available too
  images[0].updateAvailable = true;

  const map = new Map<string, DockerImage>();
  for (const img of images) map.set(img.id, img);
  return map;
}

export function getImageDetail(image: DockerImage, containers: Map<string, Container>): DockerImageDetail {
  const using = [...containers.values()].filter((c) => c.imageId === image.id).map((c) => ({ id: c.id, name: c.name }));
  return {
    ...image,
    architecture: "amd64",
    os: "linux",
    config: {
      workingDir: "/",
      env: {},
      labels: {},
    },
    containers: using,
  };
}

export function createNetworks(): Map<string, DockerNetwork> {
  const nets: DockerNetwork[] = [
    {
      id: IDS.netBridge, name: "bridge", driver: "bridge", scope: "local", internal: false, attachable: false,
      ipam: { subnet: "172.17.0.0/16", gateway: "172.17.0.1" },
      containerCount: 1, containers: [],
      options: { "com.docker.network.bridge.default_bridge": "true" }, labels: {},
      created: new Date((NOW - 90 * 24 * HOUR) * 1000).toISOString(),
      actions: { canDelete: false },
    },
    {
      id: IDS.netHost, name: "host", driver: "host", scope: "local", internal: false, attachable: false,
      ipam: null,
      containerCount: 0, containers: [],
      options: {}, labels: {},
      created: new Date((NOW - 90 * 24 * HOUR) * 1000).toISOString(),
      actions: { canDelete: false },
    },
    {
      id: IDS.netNone, name: "none", driver: "null", scope: "local", internal: false, attachable: false,
      ipam: null,
      containerCount: 0, containers: [],
      options: {}, labels: {},
      created: new Date((NOW - 90 * 24 * HOUR) * 1000).toISOString(),
      actions: { canDelete: false },
    },
    {
      id: IDS.netWebapp, name: "webapp_default", driver: "bridge", scope: "local", internal: false, attachable: false,
      ipam: { subnet: "172.18.0.0/16", gateway: "172.18.0.1" },
      containerCount: 4, containers: [],
      options: {}, labels: { "com.docker.compose.project": "webapp", "com.docker.compose.network": "default" },
      created: new Date((NOW - 7 * 24 * HOUR) * 1000).toISOString(),
      actions: { canDelete: false },
    },
    {
      id: IDS.netMonitoring, name: "monitoring_default", driver: "bridge", scope: "local", internal: false, attachable: false,
      ipam: { subnet: "172.19.0.0/16", gateway: "172.19.0.1" },
      containerCount: 2, containers: [],
      options: {}, labels: { "com.docker.compose.project": "monitoring", "com.docker.compose.network": "default" },
      created: new Date((NOW - 30 * 24 * HOUR) * 1000).toISOString(),
      actions: { canDelete: false },
    },
    {
      id: IDS.netLegacy, name: "legacy-app_default", driver: "bridge", scope: "local", internal: false, attachable: false,
      ipam: { subnet: "172.20.0.0/16", gateway: "172.20.0.1" },
      containerCount: 2, containers: [],
      options: {}, labels: { "com.docker.compose.project": "legacy-app", "com.docker.compose.network": "default" },
      created: new Date((NOW - 60 * 24 * HOUR) * 1000).toISOString(),
      actions: { canDelete: false },
    },
    {
      id: IDS.netCompoza, name: "compoza_default", driver: "bridge", scope: "local", internal: false, attachable: false,
      ipam: { subnet: "172.21.0.0/16", gateway: "172.21.0.1" },
      containerCount: 1, containers: [],
      options: {}, labels: { "com.docker.compose.project": "compoza", "com.docker.compose.network": "default" },
      created: new Date((NOW - 6 * HOUR) * 1000).toISOString(),
      actions: { canDelete: false },
    },
  ];
  const map = new Map<string, DockerNetwork>();
  for (const n of nets) map.set(n.id, n);
  return map;
}

export function getNetworkContainers(network: DockerNetwork, containers: Map<string, Container>): NetworkContainer[] {
  return [...containers.values()]
    .filter((c) => c.networks.some((n) => n.name === network.name))
    .map((c) => {
      const net = c.networks.find((n) => n.name === network.name)!;
      return { id: c.id, name: c.name, ipv4Address: net.ipAddress + "/16", macAddress: net.macAddress };
    });
}

export function createVolumes(): Map<string, DockerVolume> {
  const vols: DockerVolume[] = [
    { name: "webapp_postgres_data", driver: "local", mountpoint: "/var/lib/docker/volumes/webapp_postgres_data/_data", scope: "local", labels: { "com.docker.compose.project": "webapp", "com.docker.compose.volume": "postgres_data" }, options: null, created: new Date((NOW - 7 * 24 * HOUR) * 1000).toISOString(), size: 60_000_000, containerCount: 1, containers: [], actions: { canDelete: false } },
    { name: "webapp_redis_data", driver: "local", mountpoint: "/var/lib/docker/volumes/webapp_redis_data/_data", scope: "local", labels: { "com.docker.compose.project": "webapp", "com.docker.compose.volume": "redis_data" }, options: null, created: new Date((NOW - 7 * 24 * HOUR) * 1000).toISOString(), size: 110_000_000, containerCount: 1, containers: [], actions: { canDelete: false } },
    { name: "monitoring_prometheus_data", driver: "local", mountpoint: "/var/lib/docker/volumes/monitoring_prometheus_data/_data", scope: "local", labels: { "com.docker.compose.project": "monitoring", "com.docker.compose.volume": "prometheus_data" }, options: null, created: new Date((NOW - 30 * 24 * HOUR) * 1000).toISOString(), size: 160_000_000, containerCount: 1, containers: [], actions: { canDelete: false } },
    { name: "monitoring_grafana_data", driver: "local", mountpoint: "/var/lib/docker/volumes/monitoring_grafana_data/_data", scope: "local", labels: { "com.docker.compose.project": "monitoring", "com.docker.compose.volume": "grafana_data" }, options: null, created: new Date((NOW - 30 * 24 * HOUR) * 1000).toISOString(), size: 210_000_000, containerCount: 1, containers: [], actions: { canDelete: false } },
    { name: "legacy-app_db_data", driver: "local", mountpoint: "/var/lib/docker/volumes/legacy-app_db_data/_data", scope: "local", labels: { "com.docker.compose.project": "legacy-app", "com.docker.compose.volume": "db_data" }, options: null, created: new Date((NOW - 60 * 24 * HOUR) * 1000).toISOString(), size: 260_000_000, containerCount: 1, containers: [], actions: { canDelete: false } },

  ];
  const map = new Map<string, DockerVolume>();
  for (const v of vols) map.set(v.name, v);
  return map;
}

export function getVolumeContainers(volume: DockerVolume, containers: Map<string, Container>) {
  return [...containers.values()]
    .filter((c) => c.mounts.some((m) => m.name === volume.name))
    .map((c) => ({ id: c.id, name: c.name }));
}

export function createSystemInfo(): DockerSystemInfo {
  return {
    version: "24.0.7",
    os: "Docker Desktop",
    arch: "x86_64",
    kernelVersion: "6.6.12-linuxkit",
    storageDriver: "overlay2",
    rootDir: "/var/lib/docker",
    containers: { total: 10, running: 8, paused: 0, stopped: 2 },
    images: 10,
    memoryLimit: 8_589_934_592,
    cpus: 4,
    warnings: [],
    compoza: {
      version: process.env.COMPOZA_VERSION ?? "0.1.0",
      projectsDir: "/home/user/docker",
      hostProjectsDir: "/home/user/docker",
      dockerHost: "/var/run/docker.sock",
      registries: { dockerHub: true, ghcr: true },
    },
  };
}


// Demo image updates
export const DEMO_UPDATES: Record<string, { currentVersion: string; latestVersion: string }> = {
  "nginx:1.25-alpine": { currentVersion: "1.25.3", latestVersion: "1.25.4" },
  "grafana/grafana:10.2.3": { currentVersion: "10.2.3", latestVersion: "10.4.1" },
};

// Compose files
export const COMPOSE_FILES: Record<string, string> = {
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
    image: ghcr.io/lyallcooper/compoza:latest
    ports:
      - "3000:3000"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - /home/user/docker:/home/user/docker
    environment:
      - PROJECTS_DIR=/home/user/docker
    restart: unless-stopped
`,
  syncthing: `services:
  syncthing:
    image: syncthing/syncthing:latest
    network_mode: host
    volumes:
      - /home/user/syncthing:/var/syncthing
    environment:
      - PUID=1000
      - PGID=1000
    restart: unless-stopped
`,
};

export const ENV_FILES: Record<string, string> = {
  webapp: `# Database credentials
POSTGRES_USER=user
POSTGRES_PASSWORD=pass
POSTGRES_DB=webapp

# API settings
NODE_ENV=production
PORT=3000
REDIS_URL=redis://redis:6379
`,
  monitoring: `# Grafana
GF_SECURITY_ADMIN_PASSWORD=admin
GF_USERS_ALLOW_SIGN_UP=false
GF_SERVER_ROOT_URL=http://localhost:3001

# Prometheus
PROMETHEUS_RETENTION=30d
`,
  "legacy-app": `# MariaDB
MARIADB_ROOT_PASSWORD=secret
MARIADB_DATABASE=legacy
`,
  syncthing: `# Syncthing user/group
PUID=1000
PGID=1000
`,
};

/** Build a Project object from containers and compose file */
export function buildProject(name: string, containers: Map<string, Container>): Project | null {
  const yaml = COMPOSE_FILES[name];
  if (!yaml) return null;

  const projectContainers = [...containers.values()].filter((c) => c.projectName === name);
  const serviceInfos = extractServices(yaml);

  const services: ProjectService[] = serviceInfos.map((svcInfo) => {
    const container = projectContainers.find((c) => c.serviceName === svcInfo.name);
    return {
      name: svcInfo.name,
      image: container?.image ?? svcInfo.image,
      imageId: container?.imageId,
      containerId: container?.id,
      containerName: container?.name,
      status: container?.state === "running" ? "running"
        : container?.state === "restarting" ? "restarting"
        : container ? "exited" : "unknown",
      ports: container?.ports,
    };
  });

  const runningCount = services.filter((s) => s.status === "running" || s.status === "restarting").length;
  let status: Project["status"] = "unknown";
  if (services.length > 0) {
    if (runningCount === services.length) status = "running";
    else if (runningCount > 0) status = "partial";
    else status = "stopped";
  }

  return {
    name,
    path: `/home/user/docker/${name}`,
    composeFile: `/home/user/docker/${name}/compose.yaml`,
    status,
    services,
  };
}

/** Extract service definitions (name + image) from compose YAML */
export function extractServices(yaml: string): { name: string; image?: string }[] {
  const services: { name: string; image?: string }[] = [];
  let inServices = false;
  let current: { name: string; image?: string } | null = null;

  for (const line of yaml.split("\n")) {
    if (line === "services:") {
      inServices = true;
      continue;
    }
    if (inServices) {
      const nameMatch = line.match(/^  ([a-zA-Z0-9_-]+):$/);
      if (nameMatch) {
        if (current) services.push(current);
        current = { name: nameMatch[1] };
        continue;
      }
      if (current) {
        const imageMatch = line.match(/^\s+image:\s*(.+)$/);
        if (imageMatch) current.image = imageMatch[1].trim();
      }
      if (line.match(/^[a-zA-Z]/) && line !== "") break;
    }
  }
  if (current) services.push(current);
  return services;
}
