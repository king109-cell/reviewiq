interface Props {
  label: string;
  value: string;
  icon: string;
}

export default function MetricCard({ label, value, icon }: Props) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <div className="text-2xl mb-2">{icon}</div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-400 mt-1">{label}</p>
    </div>
  );
}