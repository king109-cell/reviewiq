interface Props {
  current: number;
  total: number;
}

export default function ProgressBar({ current, total }: Props) {
  const pct = Math.round((current / total) * 100);
  return (
    <div className="w-full h-1 bg-gray-100">
      <div
        className="h-full bg-green-600 transition-all duration-400 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}