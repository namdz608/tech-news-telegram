/**
 * Client gọi FlareSolverr để lấy HTML từ trang bị Cloudflare.
 */
import axios from 'axios';
import { env } from '../../config/env';

interface FlareSolverrResponse {
  status?: string;
  message?: string;
  solution?: {
    status?: number;
    response?: string;
    url?: string;
  };
}

export async function fetchHtmlViaFlareSolverr(targetUrl: string): Promise<{ data: string; status: number } | null> {
  const endpoint = env.FLARESOLVERR_URL.trim();

  // Unit tests inject HTML via the HTTP client; never hit a real FlareSolverr from vitest.
  if (!endpoint || env.NODE_ENV === 'test') {
    return null;
  }

  const client = axios.create({
    timeout: Math.max(env.REQUEST_TIMEOUT_MS, 60000),
    validateStatus: () => true,
  });

  const response = await client.post<FlareSolverrResponse>(endpoint, {
    cmd: 'request.get',
    url: targetUrl,
    maxTimeout: 60000,
  });

  if (response.status >= 400) {
    console.warn(`FlareSolverr HTTP ${response.status} for ${targetUrl}`);
    return null;
  }

  const payload = response.data;

  if (payload.status !== 'ok' || typeof payload.solution?.response !== 'string') {
    console.warn(`FlareSolverr failed for ${targetUrl}: ${payload.message ?? 'unknown error'}`);
    return null;
  }

  return {
    data: payload.solution.response,
    status: payload.solution.status ?? 200,
  };
}
