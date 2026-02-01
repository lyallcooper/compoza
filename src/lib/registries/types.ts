export interface ImageRef {
  registry: string;
  namespace: string;
  repository: string;
  tag: string;
}

export interface TagInfo {
  name: string;
  digest: string;
}

export interface VersionInfo {
  currentDigest?: string;
  latestDigest?: string;
  currentVersion?: string;
  latestVersion?: string;
}

export interface RegistryClient {
  listTags(namespace: string, repository: string): Promise<TagInfo[]>;
}
