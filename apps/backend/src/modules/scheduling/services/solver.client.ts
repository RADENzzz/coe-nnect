import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class SolverClient {
  private readonly logger = new Logger(SolverClient.name);
  private readonly baseUrl =
    process.env.SOLVER_URL || 'http://localhost:8000';

  /**
   * Render's free tier spins down services after 15 minutes of inactivity.
   * If we send the heavy /solve request directly, Render throws a 502
   * because the instance takes too long to cold-start.
   *
   * This method pings /health first with a long timeout. It will hang
   * until the instance is awake, then return true. Once awake, the
   * /solve request will go through instantly.
   */
  private async wakeUp(): Promise<void> {
    try {
      this.logger.log(`Waking up solver service at ${this.baseUrl}...`);
      // 90 second timeout to allow Render to cold-start
      await axios.get(`${this.baseUrl}/health`, { timeout: 90_000 });
      this.logger.log(`Solver service is awake.`);
    } catch (err) {
      this.logger.warn(
        `Solver wake-up ping failed: ${(err as Error).message}. Proceeding to solve anyway.`,
      );
    }
  }

  async solve(problem: unknown): Promise<any> {
    // 1. Ensure the service is awake to avoid Render's 502 proxy timeout
    await this.wakeUp();

    try {
      // 2. Now send the actual solve request
      const { data } = await axios.post(`${this.baseUrl}/solve`, problem, {
        timeout: 120_000, // 2 minutes for the CP-SAT solver to crunch numbers
        headers: { 'Content-Type': 'application/json' },
      });
      return data;
    } catch (err) {
      this.logger.error(
        `Solver service call failed: ${(err as Error).message}`,
      );
      throw err;
    }
  }

  async health(): Promise<boolean> {
    try {
      const { data } = await axios.get(`${this.baseUrl}/health`, {
        timeout: 5_000,
      });
      return data?.status === 'ok';
    } catch {
      return false;
    }
  }
}