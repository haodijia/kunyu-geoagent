export const RUNTIME_CONNECTION_CHANNEL = "runtime:get-connection";

export interface RuntimeConnection {
  readonly baseUrl: string;
  readonly apiVersion: "1";
  readonly sessionToken: string;
}
