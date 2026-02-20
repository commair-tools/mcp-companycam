export class CompanyCamApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly responseBody: string,
    public readonly endpoint: string,
  ) {
    super(
      `CompanyCam API error ${statusCode} on ${endpoint}: ${responseBody}`,
    );
    this.name = "CompanyCamApiError";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface ClientConfig {
  baseUrl?: string;
  maxRetries?: number;
  retryBaseDelayMs?: number;
}

export class CompanyCamClient {
  private token: string;
  private baseUrl: string;
  private maxRetries: number;
  private retryBaseDelayMs: number;

  constructor(config?: ClientConfig) {
    this.token = process.env.COMPANYCAM_API_TOKEN ?? "";
    if (!this.token) {
      throw new Error(
        "Missing COMPANYCAM_API_TOKEN environment variable. " +
          "Generate a token at app.companycam.com/access_tokens",
      );
    }
    this.baseUrl =
      config?.baseUrl ?? "https://api.companycam.com/v2";
    this.maxRetries = config?.maxRetries ?? 3;
    this.retryBaseDelayMs = config?.retryBaseDelayMs ?? 1000;
  }

  async get<T = unknown>(
    path: string,
    params?: Record<string, string>,
  ): Promise<T> {
    return this.request<T>("GET", path, { params });
  }

  async post<T = unknown>(
    path: string,
    body: unknown,
  ): Promise<T> {
    return this.request<T>("POST", path, { body });
  }

  async put<T = unknown>(
    path: string,
    body: unknown,
  ): Promise<T> {
    return this.request<T>("PUT", path, { body });
  }

  private async request<T>(
    method: "GET" | "POST" | "PUT",
    path: string,
    options?: { params?: Record<string, string>; body?: unknown },
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const url = this.buildUrl(path, options?.params);

      const fetchOptions: RequestInit = {
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: "application/json",
          ...(method !== "GET"
            ? { "Content-Type": "application/json" }
            : {}),
        },
        ...(options?.body ? { body: JSON.stringify(options.body) } : {}),
      };

      let response: Response;
      try {
        response = await fetch(url, fetchOptions);
      } catch (err) {
        lastError =
          err instanceof Error ? err : new Error(String(err));
        console.error(
          `Network error on ${method} ${path} (attempt ${attempt + 1}/${this.maxRetries + 1}): ${lastError.message}`,
        );
        if (attempt < this.maxRetries) {
          await sleep(this.retryBaseDelayMs * Math.pow(2, attempt));
          continue;
        }
        throw lastError;
      }

      if (response.ok) {
        return (await response.json()) as T;
      }

      if (response.status === 429) {
        const waitMs = this.retryBaseDelayMs * Math.pow(2, attempt);
        const jitter = Math.random() * 500;
        console.error(
          `Rate limited (429) on ${path}. Waiting ${Math.round(waitMs + jitter)}ms (attempt ${attempt + 1}/${this.maxRetries + 1})`,
        );
        await sleep(waitMs + jitter);
        continue;
      }

      const errorBody = await response.text();
      throw new CompanyCamApiError(response.status, errorBody, path);
    }

    throw (
      lastError ?? new Error(`Request to ${path} failed after max retries`)
    );
  }

  private buildUrl(
    path: string,
    params?: Record<string, string>,
  ): string {
    const cleanPath = path.startsWith("/") ? path.slice(1) : path;
    const url = new URL(cleanPath, this.baseUrl + "/");

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }

    return url.toString();
  }
}

let clientInstance: CompanyCamClient | null = null;

export function getClient(): CompanyCamClient {
  if (!clientInstance) {
    clientInstance = new CompanyCamClient();
  }
  return clientInstance;
}
