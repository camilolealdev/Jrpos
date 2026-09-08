import { useEffect, useRef } from "react";

const CLIENT_ID = (process.env.REACT_APP_GOOGLE_CLIENT_ID || "").trim();

export default function GoogleSignInButton({ onCredential, text = "signin_with", disabled = false }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!CLIENT_ID || disabled) return undefined;

    let cancelled = false;
    let pollId;

    const render = () => {
      if (cancelled || !window.google?.accounts?.id || !containerRef.current) return;
      window.google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: (response) => onCredential(response.credential),
      });
      containerRef.current.innerHTML = "";
      window.google.accounts.id.renderButton(containerRef.current, {
        type: "standard",
        theme: "filled_black",
        size: "large",
        shape: "pill",
        text,
        width: 320,
      });
    };

    if (window.google?.accounts?.id) {
      render();
    } else {
      // El script de GSI se carga con async/defer; sondea hasta que exista.
      pollId = setInterval(() => {
        if (window.google?.accounts?.id) {
          clearInterval(pollId);
          render();
        }
      }, 150);
    }

    return () => {
      cancelled = true;
      if (pollId) clearInterval(pollId);
    };
  }, [onCredential, text, disabled]);

  if (!CLIENT_ID) return null;

  return <div ref={containerRef} className="flex justify-center w-full" />;
}
