'use client';

import { useEffect, useRef, useState } from 'react';
import { api, DEMO_CLAVE, DEMO_INSPECTOR_USUARIO, DEMO_VEEDOR_USUARIO, GOOGLE_CLIENT_ID } from '../lib/api';

export type RolPanel = 'chofer' | 'inspector' | 'veedor';

export interface SesionLogin {
  token: string;
  id: string;
  identificador: string;
  rol: RolPanel;
}

const FALTA_GOOGLE =
  'Falta GOOGLE_CLIENT_ID. El ingreso con Google no está disponible hasta configurar esa variable. Podés entrar con usuario y clave.';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential?: string }) => void;
            auto_select?: boolean;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              theme?: string;
              size?: string;
              shape?: string;
              text?: string;
              logo_alignment?: string;
              locale?: string;
              width?: number;
            },
          ) => void;
        };
      };
    };
  }
}

export default function LoginPanel({ onSession }: { onSession: (sesion: SesionLogin) => void }) {
  const [usuario, setUsuario] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [googleCargaError, setGoogleCargaError] = useState<string | null>(null);
  const [entrando, setEntrando] = useState(false);
  const botonRef = useRef<HTMLDivElement>(null);
  const entrarGoogleRef = useRef<(idToken: string) => void>(() => undefined);

  async function entrarConCredenciales(user: string, pass: string) {
    const identificador = user.trim();
    const password = pass.trim();
    if (!identificador || !password) {
      setError('Usuario y contraseña requeridos');
      return;
    }
    setEntrando(true);
    setError(null);
    try {
      const data = await api<SesionLogin>('/api/urbano/auth/login', null, {
        method: 'POST',
        body: JSON.stringify({ usuario: identificador, clave: password }),
      });
      onSession(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo entrar');
    } finally {
      setEntrando(false);
    }
  }

  async function entrarConGoogle(idToken: string) {
    setEntrando(true);
    setError(null);
    try {
      const data = await api<SesionLogin>('/api/urbano/auth/google', null, {
        method: 'POST',
        body: JSON.stringify({ idToken }),
      });
      onSession(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo entrar con Google';
      setError(
        message.includes('GOOGLE_CLIENT_ID')
          ? 'Falta GOOGLE_CLIENT_ID en el servidor. El ingreso con Google no está configurado.'
          : message,
      );
    } finally {
      setEntrando(false);
    }
  }

  entrarGoogleRef.current = (idToken: string) => {
    void entrarConGoogle(idToken);
  };

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    let cancelado = false;

    const pintar = () => {
      const parent = botonRef.current;
      const gis = window.google?.accounts?.id;
      if (cancelado || !parent || !gis) return;
      gis.initialize({
        client_id: GOOGLE_CLIENT_ID,
        auto_select: false,
        callback: (response) => {
          if (response.credential) entrarGoogleRef.current(response.credential);
        },
      });
      parent.replaceChildren();
      const ancho = Math.max(240, Math.min(320, parent.clientWidth || 320));
      gis.renderButton(parent, {
        theme: 'outline',
        size: 'large',
        shape: 'rectangular',
        text: 'signin_with',
        logo_alignment: 'left',
        locale: 'es',
        width: ancho,
      });
    };

    if (window.google?.accounts?.id) {
      pintar();
      return () => {
        cancelado = true;
      };
    }

    const existente = document.getElementById('google-gsi');
    const script = existente instanceof HTMLScriptElement ? existente : document.createElement('script');
    if (!(existente instanceof HTMLScriptElement)) {
      script.id = 'google-gsi';
      script.async = true;
      script.defer = true;
      script.src = 'https://accounts.google.com/gsi/client?hl=es';
      document.head.appendChild(script);
    }
    script.addEventListener('load', pintar);
    const alFallar = () => {
      if (!cancelado) {
        setGoogleCargaError('No se pudo cargar Google Sign-In. Entrá con usuario y clave.');
      }
    };
    script.addEventListener('error', alFallar);
    return () => {
      cancelado = true;
      script.removeEventListener('load', pintar);
      script.removeEventListener('error', alFallar);
    };
  }, []);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void entrarConCredenciales(usuario, clave);
      }}
      className="bg-white rounded-lg shadow p-6 border-2 border-[#e53935] space-y-4"
    >
      <h2 className="text-xl font-bold">Iniciar sesión</h2>
      <p className="text-sm text-gray-600">
        Inspector y veedor entran por acá. El rol define si podés editar o solo mirar.
      </p>

      {GOOGLE_CLIENT_ID ? (
        <div>
          <div ref={botonRef} className="min-h-[44px] flex justify-center" />
          {googleCargaError && (
            <p role="alert" className="mt-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
              {googleCargaError}
            </p>
          )}
        </div>
      ) : (
        <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
          {FALTA_GOOGLE}
        </p>
      )}

      <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-gray-500">
        <span className="h-px flex-1 bg-gray-200" />
        o con usuario y clave
        <span className="h-px flex-1 bg-gray-200" />
      </div>

      <div>
        <label className="block text-sm text-gray-600 mb-1" htmlFor="usuario">Usuario</label>
        <input
          id="usuario"
          value={usuario}
          onChange={(e) => setUsuario(e.target.value)}
          placeholder="inspector-demo"
          autoComplete="username"
          className="w-full border border-gray-300 rounded px-3 py-2"
        />
      </div>
      <div>
        <label className="block text-sm text-gray-600 mb-1" htmlFor="clave">Contraseña</label>
        <input
          id="clave"
          type="password"
          value={clave}
          onChange={(e) => setClave(e.target.value)}
          placeholder="••••••••"
          autoComplete="current-password"
          className="w-full border border-gray-300 rounded px-3 py-2"
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </p>
      )}
      <button type="submit" disabled={entrando} className="w-full bg-urbano-red text-white rounded py-2 font-medium disabled:opacity-60">
        {entrando ? 'Entrando…' : 'Entrar'}
      </button>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={entrando}
          onClick={() => {
            setUsuario(DEMO_INSPECTOR_USUARIO);
            setClave(DEMO_CLAVE);
            void entrarConCredenciales(DEMO_INSPECTOR_USUARIO, DEMO_CLAVE);
          }}
          className="rounded border-2 border-[#e53935] py-2 text-sm font-medium text-[#e53935] disabled:opacity-60"
        >
          Inspector demo
        </button>
        <button
          type="button"
          disabled={entrando}
          onClick={() => {
            setUsuario(DEMO_VEEDOR_USUARIO);
            setClave(DEMO_CLAVE);
            void entrarConCredenciales(DEMO_VEEDOR_USUARIO, DEMO_CLAVE);
          }}
          className="rounded border-2 border-[#e53935] py-2 text-sm font-medium text-[#e53935] disabled:opacity-60"
        >
          Veedor demo
        </button>
      </div>
      <p className="text-xs text-gray-500">Demos: inspector-demo / 1 y veedor-demo / 1. El veedor solo mira.</p>
    </form>
  );
}
