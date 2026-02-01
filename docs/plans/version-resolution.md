# Image Version Resolution Plan

## Overview

Add best-effort version resolution for Docker images to display human-readable version information (e.g., `1.2.3 → 1.2.4`) instead of just showing image names in the update UI.

## Goals

1. Store current and latest digests in the update cache
2. Query registry APIs to resolve digests to semantic version tags
3. Display version info in update UIs where available
4. Gracefully fall back when version resolution fails

## Supported Registries

| Registry | Domain Pattern | API Type |
|----------|---------------|----------|
| Docker Hub | `docker.io`, `library/*`, no domain | Docker Hub API v2 |
| GitHub Container Registry | `ghcr.io` | OCI Distribution |
| LinuxServer.io | `lscr.io` | OCI Distribution |

## Architecture

### New Files

| File | Purpose |
|------|---------|
| `src/lib/registries/index.ts` | Registry client factory and exports |
| `src/lib/registries/types.ts` | Shared types for registry operations |
| `src/lib/registries/parse.ts` | Image reference parsing |
| `src/lib/registries/docker-hub.ts` | Docker Hub API client |
| `src/lib/registries/oci.ts` | OCI Distribution API client (GHCR, lscr.io) |
| `src/lib/registries/version.ts` | Version resolution logic |

### Modified Files

| File | Change |
|------|--------|
| `src/lib/updates/cache.ts` | Add digest and version fields to CachedUpdate |
| `src/lib/updates/index.ts` | Store digests, trigger version resolution |
| `src/hooks/use-image-updates.ts` | Expose version info to UI |
| `src/components/projects/update-all-modal.tsx` | Display versions |
| `src/app/containers/[name]/page.tsx` | Display version in badge |

---

## Detailed Implementation

### Phase 1: Image Reference Parsing

**File: `src/lib/registries/types.ts`**

```typescript
export interface ImageRef {
  registry: string;      // e.g., "docker.io", "ghcr.io"
  namespace: string;     // e.g., "library", "linuxserver"
  repository: string;    // e.g., "nginx", "sonarr"
  tag: string;           // e.g., "latest", "1.25.3"
  digest?: string;       // e.g., "sha256:abc..."
}

export interface TagInfo {
  name: string;          // Tag name
  digest: string;        // Manifest digest
}

export interface VersionInfo {
  currentDigest?: string;
  latestDigest?: string;
  currentVersion?: string;  // Resolved semantic version
  latestVersion?: string;   // Resolved semantic version
}

export interface RegistryClient {
  listTags(namespace: string, repository: string): Promise<TagInfo[]>;
  supportsTagDigests(): boolean;  // Some APIs return digests with tag list
}
```

**File: `src/lib/registries/parse.ts`**

```typescript
export function parseImageRef(image: string): ImageRef {
  // Handle various formats:
  // - nginx:latest → docker.io/library/nginx:latest
  // - nginx → docker.io/library/nginx:latest
  // - user/repo:tag → docker.io/user/repo:tag
  // - ghcr.io/owner/repo:tag
  // - lscr.io/linuxserver/sonarr:latest
  // - registry.example.com/repo:tag
}

export function getRegistryType(registry: string): "dockerhub" | "oci" | "unknown" {
  if (registry === "docker.io" || registry === "registry.hub.docker.com") {
    return "dockerhub";
  }
  if (registry === "ghcr.io" || registry === "lscr.io") {
    return "oci";
  }
  return "unknown";
}
```

### Phase 2: Registry Clients

**File: `src/lib/registries/docker-hub.ts`**

```typescript
// Docker Hub API: https://hub.docker.com/v2/repositories/{namespace}/{repo}/tags
// - Returns paginated list with digest per tag
// - No auth required for public images
// - Rate limited

export class DockerHubClient implements RegistryClient {
  async listTags(namespace: string, repository: string): Promise<TagInfo[]> {
    const tags: TagInfo[] = [];
    let url = `https://hub.docker.com/v2/repositories/${namespace}/${repository}/tags?page_size=100`;

    while (url) {
      const response = await fetch(url);
      if (!response.ok) {
        if (response.status === 404) return [];
        throw new Error(`Docker Hub API error: ${response.status}`);
      }

      const data = await response.json();
      for (const tag of data.results) {
        // Docker Hub returns digest in tag.images[].digest
        // Need to find the matching architecture
        const digest = findMatchingDigest(tag.images);
        if (digest) {
          tags.push({ name: tag.name, digest });
        }
      }

      url = data.next;  // Pagination
    }

    return tags;
  }

  supportsTagDigests() { return true; }
}
```

**File: `src/lib/registries/oci.ts`**

```typescript
// OCI Distribution API (GHCR, lscr.io):
// - GET /v2/{name}/tags/list - returns tag names only
// - GET /v2/{name}/manifests/{tag} - returns digest in header
// - May require auth token for rate limits

export class OciClient implements RegistryClient {
  constructor(private baseUrl: string) {}

  async listTags(namespace: string, repository: string): Promise<TagInfo[]> {
    const name = `${namespace}/${repository}`;

    // Get tag list
    const listRes = await fetch(`${this.baseUrl}/v2/${name}/tags/list`);
    if (!listRes.ok) {
      if (listRes.status === 404) return [];
      throw new Error(`OCI API error: ${listRes.status}`);
    }

    const { tags } = await listRes.json();

    // Fetch digest for each tag (this is expensive)
    // Consider limiting to semver-like tags only
    const tagInfos: TagInfo[] = [];
    for (const tag of tags.filter(isSemverLike).slice(0, 50)) {
      try {
        const manifestRes = await fetch(
          `${this.baseUrl}/v2/${name}/manifests/${tag}`,
          { headers: { "Accept": "application/vnd.oci.image.index.v1+json" } }
        );
        const digest = manifestRes.headers.get("docker-content-digest");
        if (digest) {
          tagInfos.push({ name: tag, digest });
        }
      } catch {
        // Skip tags we can't fetch
      }
    }

    return tagInfos;
  }

  supportsTagDigests() { return false; }
}
```

### Phase 3: Version Resolution

**File: `src/lib/registries/version.ts`**

```typescript
import { parseImageRef, getRegistryType } from "./parse";
import { DockerHubClient } from "./docker-hub";
import { OciClient } from "./oci";

// Semver-like pattern: starts with digit, contains dots
const SEMVER_PATTERN = /^\d+(\.\d+)*(-[\w.]+)?$/;

export function isSemverLike(tag: string): boolean {
  return SEMVER_PATTERN.test(tag) ||
         tag.startsWith("v") && SEMVER_PATTERN.test(tag.slice(1));
}

export function compareSemver(a: string, b: string): number {
  // Compare semantic versions, preferring more specific versions
  // e.g., "1.2.3" > "1.2" > "1"
}

export async function resolveVersions(
  image: string,
  currentDigest?: string,
  latestDigest?: string
): Promise<{ currentVersion?: string; latestVersion?: string }> {
  const ref = parseImageRef(image);
  const registryType = getRegistryType(ref.registry);

  // Skip if tag is already a semver (e.g., nginx:1.25.3)
  if (isSemverLike(ref.tag)) {
    return { currentVersion: ref.tag, latestVersion: ref.tag };
  }

  // Skip unsupported registries
  if (registryType === "unknown") {
    return {};
  }

  try {
    const client = createClient(registryType, ref.registry);
    const tags = await client.listTags(ref.namespace, ref.repository);

    // Find semver tags matching each digest
    const currentVersion = findVersionForDigest(tags, currentDigest);
    const latestVersion = findVersionForDigest(tags, latestDigest);

    return { currentVersion, latestVersion };
  } catch (error) {
    console.warn(`[Version Resolution] Failed for ${image}:`, error);
    return {};
  }
}

function findVersionForDigest(tags: TagInfo[], digest?: string): string | undefined {
  if (!digest) return undefined;

  // Find all tags pointing to this digest
  const matching = tags.filter(t => t.digest === digest && isSemverLike(t.name));

  if (matching.length === 0) return undefined;

  // Return the most specific version (most dots/segments)
  return matching.sort((a, b) => compareSemver(b.name, a.name))[0].name;
}

function createClient(type: "dockerhub" | "oci", registry: string): RegistryClient {
  if (type === "dockerhub") {
    return new DockerHubClient();
  }
  return new OciClient(`https://${registry}`);
}
```

### Phase 4: Cache Updates

**File: `src/lib/updates/cache.ts`**

```typescript
interface CachedUpdate {
  image: string;
  updateAvailable: boolean;
  status: "checked" | "unknown" | "error";
  checkedAt: number;
  // New fields
  currentDigest?: string;
  latestDigest?: string;
  currentVersion?: string;
  latestVersion?: string;
  versionStatus?: "resolved" | "pending" | "failed";
}
```

**File: `src/lib/updates/index.ts`**

Changes to `checkImagesDirectly()`:
1. Store `currentDigest` and `latestDigest` in cache
2. After caching, trigger async version resolution
3. Update cache with resolved versions when complete

```typescript
// After storing update info
setCachedUpdate(imageName, {
  ...result,
  currentDigest,
  latestDigest,
  versionStatus: "pending",
});

// Trigger async version resolution (don't await)
resolveVersions(imageName, currentDigest, latestDigest)
  .then(({ currentVersion, latestVersion }) => {
    if (currentVersion || latestVersion) {
      updateCachedVersions(imageName, currentVersion, latestVersion);
    }
  })
  .catch(() => {
    markVersionResolutionFailed(imageName);
  });
```

### Phase 5: API Updates

**File: `src/hooks/use-image-updates.ts`**

Update the interface to include version fields:

```typescript
interface ImageUpdateStatus {
  image: string;
  updateAvailable: boolean;
  status: "checked" | "unknown" | "error";
  checkedAt: number;
  currentVersion?: string;
  latestVersion?: string;
}
```

### Phase 6: UI Updates

**File: `src/components/projects/update-all-modal.tsx`**

In the confirmation view, show versions when available:

```tsx
{project.images.map((image) => {
  const update = imageUpdates?.find(u => u.image === image);
  const hasVersions = update?.currentVersion && update?.latestVersion;

  return (
    <div key={image} className="font-mono truncate">
      {image}
      {hasVersions && (
        <span className="text-accent ml-2">
          {update.currentVersion} → {update.latestVersion}
        </span>
      )}
    </div>
  );
})}
```

**File: `src/app/containers/[name]/page.tsx`**

Update the badge to show version info:

```tsx
{hasUpdate && (
  <Badge variant="accent">
    {updateInfo?.currentVersion && updateInfo?.latestVersion
      ? `${updateInfo.currentVersion} → ${updateInfo.latestVersion}`
      : "update available"}
  </Badge>
)}
```

---

## Implementation Order

1. **Types and parsing** - `types.ts`, `parse.ts`
2. **Docker Hub client** - Most common registry, good test case
3. **OCI client** - GHCR and lscr.io support
4. **Version resolution logic** - `version.ts`
5. **Cache updates** - Store digests, trigger resolution
6. **API/hook updates** - Expose version info
7. **UI updates** - Display versions

---

## Considerations

### Rate Limiting
- Docker Hub: 100 requests/6 hours (anonymous)
- GHCR: 60 requests/hour (anonymous)
- Cache tag lists aggressively (1 hour TTL)
- Limit OCI manifest fetches to ~50 semver tags

### Performance
- Version resolution is async and non-blocking
- UI shows "update available" immediately
- Versions appear when resolution completes
- Consider background refresh of tag caches

### Error Handling
- Network failures: fall back gracefully, no version shown
- Auth errors: skip private registries
- Parse errors: log and continue
- Never block update checks on version resolution

### Testing
- Unit tests for image reference parsing
- Integration tests with mock registry responses
- Manual testing with real registries

---

## Future Enhancements

1. **Auth support** - Allow configuring registry credentials
2. **More registries** - AWS ECR, Google GCR, Azure ACR
3. **Tag recommendations** - Suggest newer major/minor versions
4. **Changelog links** - Link to release notes when available
