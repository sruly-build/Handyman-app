// Small helpers shared by every API route.

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers },
  })
}

/** Wraps a route so thrown errors come back as JSON instead of a crash page. */
export function route(fn: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    try {
      return await fn(req)
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status)
      console.error(e)
      return json({ error: 'Something went wrong. Please try again.' }, 500)
    }
  }
}

export function env(name: string): string {
  const v = process.env[name]
  if (!v) throw new HttpError(503, `${name} is not set up on the server yet.`)
  return v
}

export function hasEnv(...names: string[]): boolean {
  return names.every((n) => !!process.env[n])
}

/** The site's public address, used in links and OAuth redirects. */
export function origin(req: Request): string {
  return (process.env.APP_URL || new URL(req.url).origin).replace(/\/$/, '')
}

export async function body<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T
  } catch {
    throw new HttpError(400, 'Bad request')
  }
}

export function param(req: Request, name: string): string {
  const v = new URL(req.url).searchParams.get(name)
  if (!v) throw new HttpError(400, `Missing ${name}`)
  return v
}
