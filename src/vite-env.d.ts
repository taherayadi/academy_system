/// <reference types="vite/client" />

// PubNub client keys — baked at build time from Cloudflare Pages environment
// variables (Production + Preview). Optional: absent keys ⇒ polling fallback.
interface ImportMetaEnv {
  readonly VITE_PUBNUB_PUBLISH_KEY?: string;
  readonly VITE_PUBNUB_SUBSCRIBE_KEY?: string;
}

interface Window {
  appAPI?: {
    onCloseRequest: (callback: () => void) => () => void;
    confirmClose: () => void;
  };
}
