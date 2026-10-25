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
