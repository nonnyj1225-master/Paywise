export default function Goals() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <span className="text-6xl mb-4">🎯</span>
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Savings Goals</h2>
      <p className="text-gray-500 max-w-md">
        Coming soon! Track your savings targets for trips, items, and more. 
        Set goals, watch your progress, and celebrate every milestone.
      </p>
      <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-indigo-50 px-4 py-2 text-sm text-indigo-600">
        <span className="inline-block w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
        Feature in progress
      </div>
    </div>
  );
}
