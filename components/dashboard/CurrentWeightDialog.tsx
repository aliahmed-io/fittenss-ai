'use client';
import { useState } from 'react';
import { useFitnessStore, fitnessActions } from '@/lib/store/fitnessStore';
import { useDialogFocus } from '@/lib/hooks/useDialogFocus';

export default function CurrentWeightDialog({ onClose }: { onClose: () => void }) {
  const { profile } = useFitnessStore();
  const [weight, setWeight] = useState(String(profile.weightKg));
  const [error, setError] = useState('');
  const ref = useDialogFocus(true, onClose);
  return <div className="ft-dialog-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <section ref={ref} role="dialog" aria-modal="true" aria-labelledby="weight-dialog-title" className="ft-weight-dialog">
      <h2 id="weight-dialog-title">Update your current weight</h2>
      <p>Your 3D preview and daily targets will update automatically. The shape also uses your height and {profile.bodyFatPct}% body-fat estimate. Change that estimate in Your profile if needed. Use Progress to record a dated check-in.</p>
      <form onSubmit={e => { e.preventDefault(); const value = Number(weight); if (!Number.isFinite(value) || value < 30 || value > 250) { setError('Enter a weight between 30 and 250 kg.'); return; } fitnessActions.setCurrentWeight(value); onClose(); }}>
        <label htmlFor="current-weight">Current weight (kg)</label>
        <input id="current-weight" type="number" inputMode="decimal" step="0.1" min="30" max="250" required value={weight} onChange={e => setWeight(e.target.value)} />
        {error && <p role="alert" className="ft-error">{error}</p>}
        <div className="daily-actions"><button className="btn-lime" type="submit">Save weight</button><button className="btn-ghost" type="button" onClick={onClose}>Cancel</button></div>
      </form>
    </section>
  </div>;
}
