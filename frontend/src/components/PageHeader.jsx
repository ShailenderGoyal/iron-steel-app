export default function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-steel-900">{title}</h1>
        {subtitle && <p className="text-steel-500 text-sm mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
