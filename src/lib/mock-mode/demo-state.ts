import type { DockerState, DfData } from "@/test/mock-docker/state";
import {
  createContainerState,
  createImageState,
  createNetworkState,
  createVolumeState,
  createDockerState,
} from "@/test/mock-docker/factories";

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
  imgCompoza:  "sha256:4d1122334455667788990011223344556677889900112233445566778899001122",

  // Networks
  netBridge:     "net0000000000000000000000000000000000000000000000000000000000000001",
  netWebapp:     "net0000000000000000000000000000000000000000000000000000000000000002",
  netMonitoring: "net0000000000000000000000000000000000000000000000000000000000000003",
  netLegacy:     "net0000000000000000000000000000000000000000000000000000000000000004",
  netCompoza:    "net0000000000000000000000000000000000000000000000000000000000000005",
} as const;

function composeLabels(project: string, service: string) {
  return {
    "com.docker.compose.project": project,
    "com.docker.compose.service": service,
    "com.docker.compose.oneoff": "False",
    "com.docker.compose.project.working_dir": `/home/user/docker/${project}`,
    "com.docker.compose.project.config_files": `/home/user/docker/${project}/compose.yaml`,
  };
}

function networkEntry(networkId: string, networkName: string, ip: string) {
  return {
    [networkName]: {
      IPAMConfig: null,
      Links: null,
      Aliases: null,
      NetworkID: networkId,
      EndpointID: `ep-${ip.replace(/\./g, "")}`,
      Gateway: ip.replace(/\.\d+$/, ".1"),
      IPAddress: ip,
      IPPrefixLen: 16,
      IPv6Gateway: "",
      GlobalIPv6Address: "",
      GlobalIPv6PrefixLen: 0,
      MacAddress: `02:42:ac:${ip.split(".").slice(2).map(o => parseInt(o).toString(16).padStart(2, "0")).join(":")}`,
    },
  };
}

const NOW = Math.floor(Date.now() / 1000);
const HOUR = 3600;

function containerLogs(service: string): string[] {
  const logs: Record<string, string[]> = {
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
  };
  return logs[service] ?? [];
}

export function createDemoState(): DockerState {
  // --- Containers ---

  const containers = [
    // webapp project — 4 services, all running
    createContainerState({
      id: IDS.webappNginx,
      name: "webapp-nginx-1",
      image: "nginx:1.25-alpine",
      imageId: IDS.imgNginx,
      state: "running",
      status: "Up 6 hours",
      created: NOW - 6 * HOUR,
      startedAt: new Date((NOW - 6 * HOUR) * 1000).toISOString(),
      labels: composeLabels("webapp", "nginx"),
      ports: [
        { IP: "0.0.0.0", PrivatePort: 80, PublicPort: 8080, Type: "tcp" },
        { IP: "0.0.0.0", PrivatePort: 443, PublicPort: 8443, Type: "tcp" },
      ],
      networks: networkEntry(IDS.netWebapp, "webapp_default", "172.18.0.2"),
      health: { Status: "healthy", FailingStreak: 0 },
      logs: containerLogs("nginx"),
      stats: {
        memory_stats: { usage: 31457280, limit: 1073741824, max_usage: 52428800, stats: {} },
        networks: { eth0: { rx_bytes: 524288, tx_bytes: 1048576, rx_packets: 500, tx_packets: 800, rx_errors: 0, tx_errors: 0, rx_dropped: 0, tx_dropped: 0 } },
      },
    }),
    createContainerState({
      id: IDS.webappApi,
      name: "webapp-api-1",
      image: "node:20-alpine",
      imageId: IDS.imgNode,
      state: "running",
      status: "Up 6 hours",
      created: NOW - 6 * HOUR,
      startedAt: new Date((NOW - 6 * HOUR) * 1000).toISOString(),
      labels: composeLabels("webapp", "api"),
      ports: [{ IP: "0.0.0.0", PrivatePort: 3000, PublicPort: 3000, Type: "tcp" }],
      networks: networkEntry(IDS.netWebapp, "webapp_default", "172.18.0.3"),
      env: [
        "NODE_ENV=production",
        "DATABASE_URL=postgres://user:pass@postgres:5432/webapp",
        "REDIS_URL=redis://redis:6379",
        "PORT=3000",
      ],
      health: { Status: "healthy", FailingStreak: 0 },
      logs: containerLogs("api"),
      stats: {
        memory_stats: { usage: 157286400, limit: 1073741824, max_usage: 209715200, stats: {} },
        cpu_stats: { cpu_usage: { total_usage: 800000000, percpu_usage: [800000000], usage_in_kernelmode: 200000000, usage_in_usermode: 600000000 }, system_cpu_usage: 10000000000, online_cpus: 4, throttling_data: { periods: 0, throttled_periods: 0, throttled_time: 0 } },
        precpu_stats: { cpu_usage: { total_usage: 700000000, percpu_usage: [700000000], usage_in_kernelmode: 180000000, usage_in_usermode: 520000000 }, system_cpu_usage: 9000000000, online_cpus: 4, throttling_data: { periods: 0, throttled_periods: 0, throttled_time: 0 } },
      },
    }),
    createContainerState({
      id: IDS.webappPostgres,
      name: "webapp-postgres-1",
      image: "postgres:16-alpine",
      imageId: IDS.imgPostgres,
      state: "running",
      status: "Up 6 hours",
      created: NOW - 6 * HOUR,
      startedAt: new Date((NOW - 6 * HOUR) * 1000).toISOString(),
      labels: composeLabels("webapp", "postgres"),
      ports: [{ PrivatePort: 5432, Type: "tcp" }],
      networks: networkEntry(IDS.netWebapp, "webapp_default", "172.18.0.4"),
      mounts: [{
        Type: "volume",
        Name: "webapp_postgres_data",
        Source: "/var/lib/docker/volumes/webapp_postgres_data/_data",
        Destination: "/var/lib/postgresql/data",
        Driver: "local",
        Mode: "rw",
        RW: true,
        Propagation: "",
      }] as unknown as import("dockerode").MountSettings[],
      env: ["POSTGRES_USER=user", "POSTGRES_PASSWORD=pass", "POSTGRES_DB=webapp"],
      health: { Status: "healthy", FailingStreak: 0 },
      logs: containerLogs("postgres"),
      stats: {
        memory_stats: { usage: 83886080, limit: 1073741824, max_usage: 104857600, stats: {} },
      },
    }),
    createContainerState({
      id: IDS.webappRedis,
      name: "webapp-redis-1",
      image: "redis:7-alpine",
      imageId: IDS.imgRedis,
      state: "running",
      status: "Up 6 hours",
      created: NOW - 6 * HOUR,
      startedAt: new Date((NOW - 6 * HOUR) * 1000).toISOString(),
      labels: composeLabels("webapp", "redis"),
      ports: [{ PrivatePort: 6379, Type: "tcp" }],
      networks: networkEntry(IDS.netWebapp, "webapp_default", "172.18.0.5"),
      mounts: [{
        Type: "volume",
        Name: "webapp_redis_data",
        Source: "/var/lib/docker/volumes/webapp_redis_data/_data",
        Destination: "/data",
        Driver: "local",
        Mode: "rw",
        RW: true,
        Propagation: "",
      }] as unknown as import("dockerode").MountSettings[],
      logs: containerLogs("redis"),
      stats: {
        memory_stats: { usage: 10485760, limit: 1073741824, max_usage: 15728640, stats: {} },
      },
    }),

    // monitoring project — 2 services, all running
    createContainerState({
      id: IDS.monProm,
      name: "monitoring-prometheus-1",
      image: "prom/prometheus:v2.48.1",
      imageId: IDS.imgProm,
      state: "running",
      status: "Up 2 days",
      created: NOW - 48 * HOUR,
      startedAt: new Date((NOW - 48 * HOUR) * 1000).toISOString(),
      labels: composeLabels("monitoring", "prometheus"),
      ports: [{ IP: "0.0.0.0", PrivatePort: 9090, PublicPort: 9090, Type: "tcp" }],
      networks: networkEntry(IDS.netMonitoring, "monitoring_default", "172.19.0.2"),
      mounts: [{
        Type: "volume",
        Name: "monitoring_prometheus_data",
        Source: "/var/lib/docker/volumes/monitoring_prometheus_data/_data",
        Destination: "/prometheus",
        Driver: "local",
        Mode: "rw",
        RW: true,
        Propagation: "",
      }] as unknown as import("dockerode").MountSettings[],
      logs: containerLogs("prometheus"),
      stats: {
        memory_stats: { usage: 209715200, limit: 2147483648, max_usage: 314572800, stats: {} },
      },
    }),
    createContainerState({
      id: IDS.monGrafana,
      name: "monitoring-grafana-1",
      image: "grafana/grafana:10.2.3",
      imageId: IDS.imgGrafana,
      state: "running",
      status: "Up 2 days",
      created: NOW - 48 * HOUR,
      startedAt: new Date((NOW - 48 * HOUR) * 1000).toISOString(),
      labels: composeLabels("monitoring", "grafana"),
      ports: [{ IP: "0.0.0.0", PrivatePort: 3000, PublicPort: 3001, Type: "tcp" }],
      networks: networkEntry(IDS.netMonitoring, "monitoring_default", "172.19.0.3"),
      mounts: [{
        Type: "volume",
        Name: "monitoring_grafana_data",
        Source: "/var/lib/docker/volumes/monitoring_grafana_data/_data",
        Destination: "/var/lib/grafana",
        Driver: "local",
        Mode: "rw",
        RW: true,
        Propagation: "",
      }] as unknown as import("dockerode").MountSettings[],
      env: ["GF_SECURITY_ADMIN_PASSWORD=admin", "GF_USERS_ALLOW_SIGN_UP=false"],
      logs: containerLogs("grafana"),
      stats: {
        memory_stats: { usage: 125829120, limit: 2147483648, max_usage: 167772160, stats: {} },
      },
    }),

    // legacy-app project — needs attention: web in restart loop, db exited with error
    createContainerState({
      id: IDS.legacyWeb,
      name: "legacy-app-web-1",
      image: "php:8.2-apache",
      imageId: IDS.imgPhp,
      state: "restarting",
      status: "Restarting (1) 30 seconds ago",
      created: NOW - 7 * 24 * HOUR,
      startedAt: new Date((NOW - 300) * 1000).toISOString(),
      labels: composeLabels("legacy-app", "web"),
      ports: [{ IP: "0.0.0.0", PrivatePort: 80, PublicPort: 8081, Type: "tcp" }],
      networks: networkEntry(IDS.netLegacy, "legacy-app_default", "172.20.0.2"),
      restartCount: 15,
      exitCode: 1,
    }),
    createContainerState({
      id: IDS.legacyDb,
      name: "legacy-app-db-1",
      image: "mariadb:11.2",
      imageId: IDS.imgMariadb,
      state: "exited",
      status: "Exited (137) 2 hours ago",
      created: NOW - 7 * 24 * HOUR,
      startedAt: new Date((NOW - 3 * 24 * HOUR) * 1000).toISOString(),
      labels: composeLabels("legacy-app", "db"),
      ports: [{ PrivatePort: 3306, Type: "tcp" }],
      networks: networkEntry(IDS.netLegacy, "legacy-app_default", "172.20.0.3"),
      mounts: [{
        Type: "volume",
        Name: "legacy-app_db_data",
        Source: "/var/lib/docker/volumes/legacy-app_db_data/_data",
        Destination: "/var/lib/mysql",
        Driver: "local",
        Mode: "rw",
        RW: true,
        Propagation: "",
      }] as unknown as import("dockerode").MountSettings[],
      env: ["MARIADB_ROOT_PASSWORD=secret", "MARIADB_DATABASE=legacy"],
      exitCode: 137,
    }),

    // dev-mailpit — standalone, running
    createContainerState({
      id: IDS.devMailpit,
      name: "dev-mailpit",
      image: "axllent/mailpit:v1.12",
      imageId: IDS.imgMailpit,
      state: "running",
      status: "Up 12 hours",
      created: NOW - 12 * HOUR,
      startedAt: new Date((NOW - 12 * HOUR) * 1000).toISOString(),
      labels: {},
      ports: [
        { IP: "0.0.0.0", PrivatePort: 1025, PublicPort: 1025, Type: "tcp" },
        { IP: "0.0.0.0", PrivatePort: 8025, PublicPort: 8025, Type: "tcp" },
      ],
      networks: networkEntry(IDS.netBridge, "bridge", "172.17.0.2"),
      logs: containerLogs("mailpit"),
      stats: {
        memory_stats: { usage: 20971520, limit: 1073741824, max_usage: 31457280, stats: {} },
      },
    }),

    // compoza project — self, running
    createContainerState({
      id: IDS.compoza,
      name: "compoza-compoza-1",
      image: "ghcr.io/compoza/compoza:latest",
      imageId: IDS.imgCompoza,
      state: "running",
      status: "Up 6 hours",
      created: NOW - 6 * HOUR,
      startedAt: new Date((NOW - 6 * HOUR) * 1000).toISOString(),
      labels: composeLabels("compoza", "compoza"),
      ports: [{ IP: "0.0.0.0", PrivatePort: 3000, PublicPort: 3000, Type: "tcp" }],
      networks: networkEntry(IDS.netCompoza, "compoza_default", "172.21.0.2"),
      mounts: [
        {
          Type: "bind",
          Name: "",
          Source: "/var/run/docker.sock",
          Destination: "/var/run/docker.sock",
          Driver: "",
          Mode: "rw",
          RW: true,
          Propagation: "rprivate",
        },
        {
          Type: "bind",
          Name: "",
          Source: "/home/user/docker",
          Destination: "/home/user/docker",
          Driver: "",
          Mode: "rw",
          RW: true,
          Propagation: "rprivate",
        },
      ] as unknown as import("dockerode").MountSettings[],
      env: ["PROJECTS_DIR=/home/user/docker"],
      logs: containerLogs("compoza"),
      stats: {
        memory_stats: { usage: 125829120, limit: 1073741824, max_usage: 167772160, stats: {} },
      },
    }),
  ];

  // --- Images ---

  const images = [
    createImageState({
      id: IDS.imgNginx,
      repoTags: ["nginx:1.25-alpine"],
      repoDigests: ["nginx@sha256:aaa111222333444555666777888999000aaabbbcccdddeeefff000111222333"],
      size: 42_000_000,
      created: NOW - 30 * 24 * HOUR,
    }),
    createImageState({
      id: IDS.imgNode,
      repoTags: ["node:20-alpine"],
      repoDigests: ["node@sha256:bbb111222333444555666777888999000aaabbbcccdddeeefff000111222333"],
      size: 180_000_000,
      created: NOW - 14 * 24 * HOUR,
    }),
    createImageState({
      id: IDS.imgPostgres,
      repoTags: ["postgres:16-alpine"],
      repoDigests: ["postgres@sha256:ccc111222333444555666777888999000aaabbbcccdddeeefff000111222333"],
      size: 230_000_000,
      created: NOW - 21 * 24 * HOUR,
    }),
    createImageState({
      id: IDS.imgRedis,
      repoTags: ["redis:7-alpine"],
      repoDigests: ["redis@sha256:ddd111222333444555666777888999000aaabbbcccdddeeefff000111222333"],
      size: 32_000_000,
      created: NOW - 10 * 24 * HOUR,
    }),
    createImageState({
      id: IDS.imgProm,
      repoTags: ["prom/prometheus:v2.48.1"],
      repoDigests: ["prom/prometheus@sha256:eee111222333444555666777888999000aaabbbcccdddeeefff000111222333"],
      size: 245_000_000,
      created: NOW - 45 * 24 * HOUR,
    }),
    createImageState({
      id: IDS.imgGrafana,
      repoTags: ["grafana/grafana:10.2.3"],
      repoDigests: ["grafana/grafana@sha256:fff111222333444555666777888999000aaabbbcccdddeeefff000111222333"],
      size: 380_000_000,
      created: NOW - 20 * 24 * HOUR,
    }),
    createImageState({
      id: IDS.imgPhp,
      repoTags: ["php:8.2-apache"],
      repoDigests: ["php@sha256:111222333444555666777888999000aaabbbcccdddeeefff000111222333444555"],
      size: 490_000_000,
      created: NOW - 60 * 24 * HOUR,
    }),
    createImageState({
      id: IDS.imgMariadb,
      repoTags: ["mariadb:11.2"],
      repoDigests: ["mariadb@sha256:222333444555666777888999000aaabbbcccdddeeefff000111222333444555666"],
      size: 400_000_000,
      created: NOW - 35 * 24 * HOUR,
    }),
    createImageState({
      id: IDS.imgMailpit,
      repoTags: ["axllent/mailpit:v1.12"],
      repoDigests: ["axllent/mailpit@sha256:333444555666777888999000aaabbbcccdddeeefff000111222333444555666777"],
      size: 18_000_000,
      created: NOW - 7 * 24 * HOUR,
    }),
    createImageState({
      id: IDS.imgCompoza,
      repoTags: ["ghcr.io/compoza/compoza:latest"],
      repoDigests: ["ghcr.io/compoza/compoza@sha256:444555666777888999000aaabbbcccdddeeefff000111222333444555666777888"],
      size: 210_000_000,
      created: NOW - 2 * 24 * HOUR,
    }),
  ];

  // --- Networks ---

  const networks = [
    createNetworkState({
      id: IDS.netBridge,
      name: "bridge",
      driver: "bridge",
      scope: "local",
      ipamConfig: [{ Subnet: "172.17.0.0/16", Gateway: "172.17.0.1" }],
    }),
    createNetworkState({
      id: IDS.netWebapp,
      name: "webapp_default",
      driver: "bridge",
      scope: "local",
      labels: { "com.docker.compose.project": "webapp", "com.docker.compose.network": "default" },
      ipamConfig: [{ Subnet: "172.18.0.0/16", Gateway: "172.18.0.1" }],
      containers: {
        [IDS.webappNginx]: { Name: "webapp-nginx-1", IPv4Address: "172.18.0.2/16", MacAddress: "02:42:ac:12:00:02" },
        [IDS.webappApi]: { Name: "webapp-api-1", IPv4Address: "172.18.0.3/16", MacAddress: "02:42:ac:12:00:03" },
        [IDS.webappPostgres]: { Name: "webapp-postgres-1", IPv4Address: "172.18.0.4/16", MacAddress: "02:42:ac:12:00:04" },
        [IDS.webappRedis]: { Name: "webapp-redis-1", IPv4Address: "172.18.0.5/16", MacAddress: "02:42:ac:12:00:05" },
      },
    }),
    createNetworkState({
      id: IDS.netMonitoring,
      name: "monitoring_default",
      driver: "bridge",
      scope: "local",
      labels: { "com.docker.compose.project": "monitoring", "com.docker.compose.network": "default" },
      ipamConfig: [{ Subnet: "172.19.0.0/16", Gateway: "172.19.0.1" }],
      containers: {
        [IDS.monProm]: { Name: "monitoring-prometheus-1", IPv4Address: "172.19.0.2/16", MacAddress: "02:42:ac:13:00:02" },
        [IDS.monGrafana]: { Name: "monitoring-grafana-1", IPv4Address: "172.19.0.3/16", MacAddress: "02:42:ac:13:00:03" },
      },
    }),
    createNetworkState({
      id: IDS.netLegacy,
      name: "legacy-app_default",
      driver: "bridge",
      scope: "local",
      labels: { "com.docker.compose.project": "legacy-app", "com.docker.compose.network": "default" },
      ipamConfig: [{ Subnet: "172.20.0.0/16", Gateway: "172.20.0.1" }],
      containers: {
        [IDS.legacyWeb]: { Name: "legacy-app-web-1", IPv4Address: "172.20.0.2/16", MacAddress: "02:42:ac:14:00:02" },
        [IDS.legacyDb]: { Name: "legacy-app-db-1", IPv4Address: "172.20.0.3/16", MacAddress: "02:42:ac:14:00:03" },
      },
    }),
    createNetworkState({
      id: IDS.netCompoza,
      name: "compoza_default",
      driver: "bridge",
      scope: "local",
      labels: { "com.docker.compose.project": "compoza", "com.docker.compose.network": "default" },
      ipamConfig: [{ Subnet: "172.21.0.0/16", Gateway: "172.21.0.1" }],
      containers: {
        [IDS.compoza]: { Name: "compoza-compoza-1", IPv4Address: "172.21.0.2/16", MacAddress: "02:42:ac:15:00:02" },
      },
    }),
  ];

  // --- Volumes ---

  const volumes = [
    createVolumeState({
      name: "webapp_postgres_data",
      labels: { "com.docker.compose.project": "webapp", "com.docker.compose.volume": "postgres_data" },
      createdAt: new Date((NOW - 7 * 24 * HOUR) * 1000).toISOString(),
    }),
    createVolumeState({
      name: "webapp_redis_data",
      labels: { "com.docker.compose.project": "webapp", "com.docker.compose.volume": "redis_data" },
      createdAt: new Date((NOW - 7 * 24 * HOUR) * 1000).toISOString(),
    }),
    createVolumeState({
      name: "monitoring_prometheus_data",
      labels: { "com.docker.compose.project": "monitoring", "com.docker.compose.volume": "prometheus_data" },
      createdAt: new Date((NOW - 30 * 24 * HOUR) * 1000).toISOString(),
    }),
    createVolumeState({
      name: "monitoring_grafana_data",
      labels: { "com.docker.compose.project": "monitoring", "com.docker.compose.volume": "grafana_data" },
      createdAt: new Date((NOW - 30 * 24 * HOUR) * 1000).toISOString(),
    }),
    createVolumeState({
      name: "legacy-app_db_data",
      labels: { "com.docker.compose.project": "legacy-app", "com.docker.compose.volume": "db_data" },
      createdAt: new Date((NOW - 60 * 24 * HOUR) * 1000).toISOString(),
    }),
  ];

  // --- Disk usage ---

  const dfData: DfData = {
    Images: images.map((img) => ({
      Size: img.listInfo.Size ?? 0,
      SharedSize: Math.floor((img.listInfo.Size ?? 0) * 0.3),
      Containers: 1,
    })),
    Containers: containers.map((_c, i) => ({
      SizeRw: 500_000 * (i + 1),
      SizeRootFs: 50_000_000,
    })),
    Volumes: volumes.map((_v, i) => ({
      Name: volumes[i].name,
      UsageData: { Size: 50_000_000 * (i + 1) + 10_000_000, RefCount: 1 },
    })),
    BuildCache: [
      { Size: 150000000, InUse: true },
      { Size: 80000000, InUse: false },
    ],
  };

  // --- System info ---

  const systemInfo = {
    ServerVersion: "24.0.7",
    OperatingSystem: "Docker Desktop",
    OSType: "linux",
    Architecture: "x86_64",
    KernelVersion: "6.6.12-linuxkit",
    Driver: "overlay2",
    DockerRootDir: "/var/lib/docker",
    Containers: containers.length,
    ContainersRunning: containers.filter((c) => c.listInfo.State === "running").length,
    ContainersPaused: 0,
    ContainersStopped: containers.filter((c) => c.listInfo.State === "exited").length,
    Images: images.length,
    MemTotal: 8_589_934_592,
    NCPU: 4,
    SystemTime: new Date().toISOString(),
    LoggingDriver: "json-file",
    Warnings: [],
    Labels: [],
    Name: "docker-desktop",
  };

  return createDockerState(containers, {
    images,
    networks,
    volumes,
    dfData,
    systemInfo,
  });
}
