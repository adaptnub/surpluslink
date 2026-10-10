import { ReasonList } from './bits.jsx';

export default function Toasts({ toasts }) {
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.kind}`}>
          <strong>{t.title}</strong>
          {t.reasons?.length > 0 && <ReasonList reasons={t.reasons} />}
        </div>
      ))}
    </div>
  );
}
