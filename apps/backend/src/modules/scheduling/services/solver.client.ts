import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class SolverClient {
  private readonly logger = new Logger(SolverClient.name);
  private readonly baseUrl =
    process.env.SOLVER_URL || 'http://localhost:8000';

  async solve(problem: unknown): Promise<any> {
    try {
      const { data } = await axios.post(`${this.baseUrl}/solve`, problem, {
        timeout: 120_000,
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