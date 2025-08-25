/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LIFF_ID?: string
  readonly VITE_GOOGLE_FORM_USERID_ENTRY?: string
  readonly VITE_GOOGLE_FORM_MESSAGE_ENTRY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}