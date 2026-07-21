import { useEffect } from 'react';

export default function Modal({ open, onClose, title, children, size = 'md' }) {
  // Escape-to-close: a standard, expected keyboard affordance for dialogs.
  useEffect(() => {
    if (!open) return;
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  const sizes = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className={`bg-white rounded-xl shadow-xl w-full ${sizes[size]} max-h-[90vh] flex flex-col`}>
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-steel-200">
          <h2 className="text-lg font-semibold text-steel-900">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="text-steel-500 hover:text-steel-700 hover:bg-steel-100 rounded-lg w-11 h-11 flex items-center justify-center text-2xl leading-none flex-shrink-0 -mr-2">×</button>
        </div>
        <div className="overflow-y-auto flex-1 px-4 sm:px-6 py-4">{children}</div>
      </div>
    </div>
  );
}
