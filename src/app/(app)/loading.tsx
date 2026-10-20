export default function Cargando() {
  return (
    <div aria-busy="true" aria-label="Cargando" className="animate-pulse space-y-6 motion-reduce:animate-none">
      <span className="sr-only">Cargando la pantalla…</span>
      <div className="h-3 w-40 rounded bg-papel-hundido" />
      <div className="h-10 w-full max-w-96 rounded bg-papel-hundido" />
      <div className="regla opacity-60" />
      <div className="h-64 rounded-lg bg-papel-hundido/70" />
    </div>
  );
}
