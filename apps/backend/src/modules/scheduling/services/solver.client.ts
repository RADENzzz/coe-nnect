import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import axios, { AxiosError, AxiosInstance } from 'axios';
import * as http from 'http';
import * as https from 'https';

@Injectable()
export class SolverClient implements OnModuleInit {
  private readonly logger = new Logger(SolverClient.name);
  private readonly baseUrl = process.env.SOLVER_URL || 'http://localhost:8000';

  private readonly http: AxiosInstance;
  private readonly healthHttp: AxiosInstance;

  private isWarm = false;
  private wakePromise: Promise<void> | null = null;
  private lastWarmAt = 0;

  private static readonly HEALTH_TIMEOUT_MS = 30_000;
  private static readonly WARM_TTL_MS = 10 * 60 * 1000;
  private static readonly SOLVE_TIMEOUT_MS = 120_000;
  private static readonly MAX_ATTEMPTS = 3;

  constructor() {
    const common = {
      baseURL: this.baseUrl,
      headers: { 'Content-Type': 'application/json' },
      httpAgent: new http.Agent({ keepAlive: true, maxSockets: 20 }),
      httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 20 }),
    };
    this.http = axios.create({
      ...common,
      timeout: SolverClient.SOLVE_TIMEOUT_MS,
    });
    this.healthHttp = axios.create({
      ...common,
      timeout: SolverClient.HEALTH_TIMEOUT_MS,
    });
  }

  async onModuleInit() {
    void this.wakeUp().catch(() => undefined);
  }

  private async wakeUp(): Promise<void> {
    if (
      this.isWarm &&
      Date.now() - this.lastWarmAt < SolverClient.WARM_TTL_MS
    ) {
      return;
    }
    if (this.wakePromise) return this.wakePromise;

    this.wakePromise = (async () => {
      this.logger.log(`Waking up solver service at ${this.baseUrl}...`);
      const started = Date.now();
      try {
        await this.healthHttp.get('/health');
        this.isWarm = true;
        this.lastWarmAt = Date.now();
        this.logger.log(`Solver awake in ${Date.now() - started}ms`);
      } catch (err) {
        this.isWarm = false;
        this.logger.warn(
          `Solver wake-up failed after ${Date.now() - started}ms: ${
            (err as Error).message
          }`,
        );
        throw err;
      } finally {
        this.wakePromise = null;
      }
    })();

    return this.wakePromise;
  }

  async solve(problem: unknown): Promise<any> {
    let lastErr: unknown;

    for (let attempt = 1; attempt <= SolverClient.MAX_ATTEMPTS; attempt++) {
      try {
        await this.wakeUp();
        const { data } = await this.http.post('/solve', problem);
        return data;
      } catch (err) {
        lastErr = err;
        const e = err as AxiosError;
        // /solve is deterministic (same input → same output), so retrying
        // on a lost response is safe — it just costs CPU, not correctness.
        const transient =
          !e.response ||
          e.response.status === 502 ||
          e.response.status === 503 ||
          e.response.status === 504 ||
          e.code === 'ECONNRESET' ||
          e.code === 'ETIMEDOUT';

        if (!transient || attempt === SolverClient.MAX_ATTEMPTS) {
          throw err;
        }

        this.isWarm = false;
        const delay = 2000 * attempt;
        this.logger.warn(
          `Solver /solve transient (${e.response?.status ?? e.code ?? 'network'}), ` +
            `attempt ${attempt}/${SolverClient.MAX_ATTEMPTS} failed, ` +
            `retry ${attempt + 1} in ${delay}ms`,
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    this.logger.error(
      `Solver service call failed: ${(lastErr as Error).message}`,
    );
    throw lastErr;
  }

  async health(): Promise<boolean> {
    try {
      const { data } = await this.healthHttp.get('/health');
      return data?.status === 'ok';
    } catch {
      return false;
    }
  }
}