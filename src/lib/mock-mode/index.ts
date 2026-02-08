export function isMockMode(): boolean {
  return process.env.DOCKER_HOST?.startsWith("mock") ?? false;
}

export function showDemoBanner(): boolean {
  return isMockMode() && !process.env.DOCKER_HOST?.includes("+no-banner");
}
