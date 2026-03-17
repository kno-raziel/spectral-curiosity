/**
 * Typed wrapper around `sdk.ls.rawRPC()` for discovered LS methods.
 *
 * All methods use `cascadeId` as the key (trajectoryId fails for most methods).
 * Methods were discovered by running `strings` on the LS binary and probing
 * via rawRPC in the Phase 1.0 spike.
 */

import type { AntigravitySDK } from "antigravity-sdk";
import type {
  ArtifactSnapshotsResponse,
  CascadeIndex,
  FullTrajectory,
  GeneratorMetadataResponse,
  TrajectoryStepsResponse,
} from "./ls-types";

export class LsClient {
  constructor(private readonly sdk: AntigravitySDK) {}

  /**
   * List all conversations with metadata.
   * SDK method: `GetAllCascadeTrajectories`
   */
  async listCascades(): Promise<CascadeIndex> {
    const result: unknown = await this.sdk.ls.listCascades();
    return result as CascadeIndex;
  }

  /**
   * Get the full trajectory for a conversation — all steps with content.
   * Undocumented RPC: `GetCascadeTrajectory`
   *
   * This is the primary method for conversation backup.
   * Returns 3-6+ MB of data for active conversations.
   */
  async getTrajectory(cascadeId: string): Promise<FullTrajectory> {
    const result: unknown = await this.sdk.ls.rawRPC("GetCascadeTrajectory", {
      cascadeId,
    });
    return result as FullTrajectory;
  }

  /**
   * Get only the steps array (lighter than `getTrajectory`).
   * Undocumented RPC: `GetCascadeTrajectorySteps`
   */
  async getTrajectorySteps(cascadeId: string): Promise<TrajectoryStepsResponse> {
    const result: unknown = await this.sdk.ls.rawRPC("GetCascadeTrajectorySteps", { cascadeId });
    return result as TrajectoryStepsResponse;
  }

  /**
   * Get artifact snapshots with full text content.
   * Undocumented RPC: `GetArtifactSnapshots`
   */
  async getArtifactSnapshots(cascadeId: string): Promise<ArtifactSnapshotsResponse> {
    const result: unknown = await this.sdk.ls.rawRPC("GetArtifactSnapshots", {
      cascadeId,
    });
    return result as ArtifactSnapshotsResponse;
  }

  /**
   * Get per-step model usage metadata (tokens, model names, timing).
   * Undocumented RPC: `GetCascadeTrajectoryGeneratorMetadata`
   */
  async getGeneratorMetadata(cascadeId: string): Promise<GeneratorMetadataResponse> {
    const result: unknown = await this.sdk.ls.rawRPC("GetCascadeTrajectoryGeneratorMetadata", {
      cascadeId,
    });
    return result as GeneratorMetadataResponse;
  }

  /**
   * Make an arbitrary RPC call to the Language Server.
   * Use for methods not yet wrapped by LsClient.
   */
  async rawRPC(method: string, payload: Record<string, unknown>): Promise<unknown> {
    return this.sdk.ls.rawRPC(method, payload);
  }
}
