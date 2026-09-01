/// <reference types="vite/client" />

interface Window {
  teenCenterAPI?: {
    onCloseRequest: (callback: () => void) => () => void;
    confirmClose: () => void;
  };
}
