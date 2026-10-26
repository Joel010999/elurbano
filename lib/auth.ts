/** Token de sesión: alcanza con 1 carácter (los demos usan "1"). */
export function validarToken(token: unknown): token is string {
  return typeof token === 'string' && token.trim().length >= 1;
}

export class ErrorApi extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ErrorApi';
    this.status = status;
  }
}

export function validateChoferToken(token: string): boolean {
  const validToken = process.env.URBANO_CHOFER_TOKEN;
  if (!validToken) {
    console.warn('URBANO_CHOFER_TOKEN not configured');
    return false;
  }
  return token === validToken;
}

export function validateInspectorToken(token: string): boolean {
  const validToken = process.env.URBANO_INSPECTOR_TOKEN;
  if (!validToken) {
    console.warn('URBANO_INSPECTOR_TOKEN not configured');
    return false;
  }
  return token === validToken;
}
