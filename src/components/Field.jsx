export default function Field({ label, error, options, ...props }) {
  return (
    <label className="block mb-3">
      <span className="text-sm text-gray-300">{label}</span>
      {options ? (
        <select {...props} className="input">
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input {...props} className="input" />
      )}
      {error && <span className="text-red-400 text-xs">{error}</span>}
    </label>
  )
}