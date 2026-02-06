export interface ImageRef {
  registry: string;
  namespace: string;
  repository: string;
  tag: string;
}

export interface VersionInfo {
  currentDigest?: string;
  latestDigest?: string;
  currentVersion?: string;
  latestVersion?: string;
}
