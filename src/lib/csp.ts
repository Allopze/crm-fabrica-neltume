// Content-Security-Policy de las páginas (auditoría M-01). La aplica src/proxy.ts con un nonce por petición.

export function politicaCsp(nonce: string, desarrollo: boolean): string {
  return [
    "default-src 'self'",
    // 'unsafe-eval' solo en desarrollo: React lo usa para reconstruir trazas; en producción no se usa eval.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${desarrollo ? " 'unsafe-eval'" : ""}`,
    // Con un nonce los navegadores ignoran 'unsafe-inline': sin nonce en estilos, para admitir atributos `style` de React.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}
