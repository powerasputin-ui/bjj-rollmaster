// Minimal ambient typing for the Google Identity Services script
// (loaded via <script src="https://accounts.google.com/gsi/client"> in index.html —
// there is no official lightweight types package for this global API).
interface Window {
  google?: {
    accounts: {
      id: {
        initialize(config: {
          client_id: string;
          callback: (response: { credential: string }) => void;
        }): void;
        renderButton(
          parent: HTMLElement,
          options: { theme?: string; size?: string; width?: number; text?: string; shape?: string }
        ): void;
      };
    };
  };
}
