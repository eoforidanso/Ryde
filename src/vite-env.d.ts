/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the payments service. Unset = run on simulated state only. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
