import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import axios, { AxiosError, AxiosInstance } from 'axios';

@Injectable()
export class SolverClient implements OnModuleInit {
  private readonly logger = new Logger(SolverClient.name);
  private readonly baseUrl = process.env.SOLVER_URL || 'http://localhost:8000';

  private readonly http: AxiosInstance;
  private readonly healthHttp: AxiosInstance;

  /**
   * Shared warm-state. `wakePromise` is the single-flight guard:
   * if 50 requests arrive during a cold start, only ONE /health call
   * actually fires; the other 49 await the same promise.
   */
  private isWarm = false;
  private wakePromise: Promise<void> | null = null;
  private lastWarmAt = 0;

  /** Render's proxy gives up around 30s. We need the /health call to complete before that. */
  private static readonly HEALTH_TIMEOUT_MS = 30_000;
  private static readonly WARM_TTL_MS = 10 * 60 * 1000; // 10 min — Render sleeps at 15
  private static readonly SOLVE_TIMEOUT_MS = 120_000;

  constructor() {
    const common = {
      baseURL: this.baseUrl,
      headers: { 'Content-Type': 'application/json' },
      // Keep TCP connections alive between requests — huge win for warm instances
      httpAgent: new (require('http').Agent)({ keepAlive: true, maxSockets: 20 }),
      httpsAgent: new (require('https').Agent)({ keepAlive: true, maxSockets: 20 }),
    };
    this.http = axios.create({ ...common, timeout: SolverClient.SOLVE_TIMEOUT_MS });
    this.healthHttp = axios.create({
      ...common,
      // CRITICAL: /health must fail fast — we don't want to sit here 90s
      // waiting on a dead instance. Render will retry us anyway.
      timeout: SolverClient.HEALTH_TIMEOUT_MS,
    });
  }

  async onModuleInit() {
    // Warm up when the backend boots, not on first user request
    void this.wakeUp().catch(() => undefined);
  }

  /**
   * Single-flight warm-up. If already warm within TTL, returns immediately.
   * If a wake-up is in progress, awaits the same promise (no thundering herd).
   */
  private async wakeUp(): Promise<void> {
    if (this.isWarm && Date.now() - this.lastWarmAt < SolverClient.WARM_TTL_MS) {
      return;
    }
    if (this.wakePromise) {
      return this.wakePromise;
    }

    this.wakePromise = (async () => {
      this.logger.log(`Waking up solver service at ${this.baseUrl}...`);
      const started = Date.now();
      try {
        await this.healthHttp.get('/health', { timeout: SolverClient.HEALTH_TIMEOUT_MS });
        this.isWarm = true;
        this.lastWarmAt = Date.now();
        this.logger.log(`Solver awake in ${Date.now() - started}ms`);
      } catch (err) {
        // DON'T swallow — if we can't wake it, the /solve call WILL fail too.
        // Surface the error so the caller can return a clear "service unavailable"
        // message instead of a 120s timeout.
        this.isWarm = false;
        this.logger.warn(
          `Solver wake-up failed after ${Date.now() - started}ms: ${(err as Error).message}`,
        );
        throw err;
      } finally {
        this.wakePromise = null;
      }
    })();

    return this.wakePromise;
  }

  async solve(problem: unknown): Promise<any> {
    await this.wakeUp();

    const tryOnce = async (attempt: number) => {
      try {
        const { data } = await this.http.post('/solve', problem);
        return data;
      } catch (err) {
        const e = err as AxiosError;
        const transient =
          !e.response || // network / ECONNRESET / timeout
          e.response.status === 502 ||
          e.response.status === 503 ||
          e.response.status === 504;
        if (transient && attempt < 2) {
          const delay = 2000 * attempt; // 2s, 4s
          this.logger.warn(
            `Solver /solve transient error (${e.response?.status ?? 'network'}), retry ${attempt + 1}/2 in ${delay}ms`,
          );
          await new Promise((r) => setTimeout(r, delay));
          // Mark cold so next attempt re-wakes (proxy may have killed it)
          this.isWarm = false;
          await this.wakeUp();
          return tryOnce(attempt + 1);
        }
        throw err;
      }
    };

    try {
      return await tryOnce(1);
    } catch (err) {
      this.logger.error(`Solver service call failed: ${(err as Error).message}`);
      throw err;
    }
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