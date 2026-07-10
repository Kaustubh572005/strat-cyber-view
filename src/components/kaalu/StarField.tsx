export function StarField() {
  return (
    <div aria-hidden className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(1200px 700px at 10% -10%, oklch(0.32 0.14 260 / 0.35), transparent 60%), radial-gradient(900px 600px at 110% 15%, oklch(0.35 0.15 200 / 0.28), transparent 60%), radial-gradient(700px 500px at 50% 120%, oklch(0.28 0.14 300 / 0.25), transparent 60%)",
        }}
      />
      <StarLayer count={90} size={1} opacity={0.5} duration={14} />
      <StarLayer count={40} size={2} opacity={0.8} duration={22} />
      <StarLayer count={15} size={3} opacity={1} duration={30} />
    </div>
  );
}

function StarLayer({
  count,
  size,
  opacity,
  duration,
}: {
  count: number;
  size: number;
  opacity: number;
  duration: number;
}) {
  const stars = Array.from({ length: count }, (_, i) => {
    const top = Math.random() * 100;
    const left = Math.random() * 100;
    const delay = Math.random() * duration;
    return (
      <span
        key={i}
        className="absolute rounded-full bg-white"
        style={{
          top: `${top}%`,
          left: `${left}%`,
          width: size,
          height: size,
          opacity,
          boxShadow: `0 0 ${size * 3}px oklch(0.9 0.1 210 / 0.6)`,
          animation: `kaalu-pulse ${duration}s ease-in-out ${delay}s infinite`,
        }}
      />
    );
  });
  return <div className="absolute inset-0">{stars}</div>;
}