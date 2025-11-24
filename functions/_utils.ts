export type Env = { MOCK_MODE?: string };

export const isMock = (env: Env) => (env.MOCK_MODE ?? "true") === "true";

type Store = {
  payment?: string;
  jobs: Map<string, any>;
  menu: any[];
};
export const store: Store = globalThis.__TONOSAMA_STORE__ ||= {
  payment: "trial",
  jobs: new Map(),
  menu: [],
};

export const json = (data: any, init: ResponseInit = {}) =>
  new Response(JSON.stringify(data, null, 2), {
    ...init,
    headers: { "content-type": "application/json; charset=utf-8", ...(init.headers||{}) },
  });

export const bad = (status: number, code: string, message: string) =>
  json({ error_code: code, message }, { status });
