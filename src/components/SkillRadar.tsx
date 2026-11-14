interface SkillRadarProps {
  technique?: number | null;
  fitness?: number | null;
  tactics?: number | null;
  attitude?: number | null;
  size?: number;
}

export function SkillRadar({
  technique = 3,
  fitness = 3,
  tactics = 3,
  attitude = 3,
  size = 180,
}: SkillRadarProps) {
  const center = size / 2;
  const radius = (size / 2) * 0.72;

  // 4 axes: Top (Technique), Right (Fitness), Bottom (Tactics), Left (Attitude)
  const axes = [
    { label: "Technique", value: Math.min(5, Math.max(1, technique ?? 3)), angle: -Math.PI / 2 },
    { label: "Fitness", value: Math.min(5, Math.max(1, fitness ?? 3)), angle: 0 },
    { label: "Tactics", value: Math.min(5, Math.max(1, tactics ?? 3)), angle: Math.PI / 2 },
    { label: "Attitude", value: Math.min(5, Math.max(1, attitude ?? 3)), angle: Math.PI },
  ];

  const getCoordinates = (value: number, angle: number) => {
    const r = (value / 5) * radius;
    const x = center + r * Math.cos(angle);
    const y = center + r * Math.sin(angle);
    return { x, y };
  };

  // Build grid rings (for levels 1, 2, 3, 4, 5)
  const rings = [1, 2, 3, 4, 5].map((lvl) => {
    const pts = axes.map((a) => {
      const { x, y } = getCoordinates(lvl, a.angle);
      return `${x},${y}`;
    }).join(" ");
    return pts;
  });

  // Build player polygon
  const playerPoints = axes.map((a) => {
    const { x, y } = getCoordinates(a.value, a.angle);
    return `${x},${y}`;
  }).join(" ");

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} className="overflow-visible select-none">
        {/* Web Rings */}
        {rings.map((pts, i) => (
          <polygon
            key={i}
            points={pts}
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            className="text-line/60"
            strokeDasharray={i === 4 ? undefined : "2 2"}
          />
        ))}

        {/* Axis Crosslines */}
        {axes.map((a, i) => {
          const { x, y } = getCoordinates(5, a.angle);
          return (
            <line
              key={i}
              x1={center}
              y1={center}
              x2={x}
              y2={y}
              stroke="currentColor"
              strokeWidth="1"
              className="text-line"
            />
          );
        })}

        {/* Player Radar Area */}
        <polygon
          points={playerPoints}
          fill="rgba(15, 118, 110, 0.28)"
          stroke="#0f766e"
          strokeWidth="2.5"
          strokeLinejoin="round"
          className="transition-all duration-300"
        />

        {/* Data points */}
        {axes.map((a, i) => {
          const { x, y } = getCoordinates(a.value, a.angle);
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r="4"
              fill="#0f766e"
              stroke="#ffffff"
              strokeWidth="1.5"
            />
          );
        })}

        {/* Text Labels */}
        {axes.map((a, i) => {
          const { x, y } = getCoordinates(5.9, a.angle);
          let textAnchor: "middle" | "start" | "end" = "middle";
          let dy = "0.3em";
          if (a.angle === 0) {
            textAnchor = "start";
          } else if (a.angle === Math.PI) {
            textAnchor = "end";
          } else if (a.angle === -Math.PI / 2) {
            dy = "-0.5em";
          } else if (a.angle === Math.PI / 2) {
            dy = "1.2em";
          }

          return (
            <text
              key={i}
              x={x}
              y={y}
              textAnchor={textAnchor}
              dy={dy}
              className="text-[10px] font-bold fill-ink-soft uppercase tracking-wider"
            >
              {a.label} ({a.value}/5)
            </text>
          );
        })}
      </svg>
    </div>
  );
}
