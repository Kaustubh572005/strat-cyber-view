export function StarField() {
  return (
    <div aria-hidden className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, oklch(0.985 0.006 250) 0%, oklch(0.965 0.006 255) 100%)",
        }}
      />
      <div
        className="absolute inset-x-0 top-0 h-72"
        style={{
          background:
            "radial-gradient(900px 340px at 12% -20%, oklch(0.47 0.15 262 / 0.10), transparent 70%), radial-gradient(700px 300px at 95% -10%, oklch(0.72 0.17 55 / 0.07), transparent 70%)",
        }}
      />
    </div>
  );
}
