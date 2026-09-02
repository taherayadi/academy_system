/// <reference types="vite/client" />

interface Window {
  appAPI?: {
    onCloseRequest: (callback: () => void) => () => void;
    confirmClose: () => void;
  };
}
