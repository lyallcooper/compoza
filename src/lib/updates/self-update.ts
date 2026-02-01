import { pullLatestImage } from "./pull";

export interface SelfUpdateResult {
  success: boolean;
  message: string;
}

/**
 * Update the Compoza container itself by pulling the latest image.
 * The container should be recreated by compose after this.
 */
export async function selfUpdate(): Promise<SelfUpdateResult> {
  const imageName = process.env.COMPOZA_IMAGE || "compoza:latest";

  try {
    await pullLatestImage(imageName);

    const containerId = process.env.HOSTNAME || "";

    if (!containerId) {
      return {
        success: false,
        message: "Could not determine current container ID",
      };
    }

    return {
      success: true,
      message: `Image ${imageName} pulled successfully. Container will be recreated.`,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to update",
    };
  }
}
