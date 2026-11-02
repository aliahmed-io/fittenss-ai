'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useFitnessStore, fitnessActions } from '@/lib/store/fitnessStore';
import { computeTargets, hydrationTargetMl, toDateKey } from '@/lib/fitness/engine';

export default function TodayPage() {
  const store = useFitnessStore();
  const [date, setDate] = useState(() => toDateKey(new Date()));
  const [saved, setSaved] = useState(false);
  const checkin = store.dailyCheckins?.[date];
  const meals = store.meals.filter(m => m.date === date);
  const logs = store.workoutLogs.filter(l => toDateKey(new Date(l.completedAt)) === date);
  const targets = store.macroOverride ?? computeTargets(store.profile, store.goal);
  const protein = meals.reduce((n, m) => n + m.protein, 0);
  const calories = meals.reduce((n, m) => n + m.calories, 0);
  const water = store.waterMlByDate[date] ?? 0;
  const waterTarget = hydrationTargetMl(store.profile.weightKg);
  function exportData() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(store, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `fittransform-${toDateKey(new Date())}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <div className="daily-hub">
    <div className="daily-heading"><div><p className="eyebrow">Your fitness hub</p><h1 className="d-lg">Make today count.</h1><p>Training, fuel, and recovery. One place to keep your routine moving.</p></div><label>View day<input aria-label="View day" type="date" max={toDateKey(new Date())} value={date} onChange={e => { if (e.target.value) { setDate(e.target.value); setSaved(false); } }} /></label></div>
    <div className="daily-grid">
      <section className="daily-panel"><h2>Daily essentials</h2><p className="daily-muted">Based on your saved profile and goals.</p>
        {[{ label: 'Protein', value: protein, target: targets.protein, unit: 'g', href: '/nutrition' }, { label: 'Food energy', value: calories, target: targets.calories, unit: 'kcal', href: '/nutrition' }, { label: 'Water', value: water, target: waterTarget, unit: 'ml', href: '/nutrition' }].map(item => <div className="daily-meter" key={item.label}><div><Link href={item.href}>{item.label}</Link><span>{Math.round(item.value)} / {item.target} {item.unit}</span></div><progress value={Math.min(item.value, item.target)} max={item.target} aria-label={item.label} /></div>)}
        <div className="daily-actions"><Link href="/nutrition" className="btn-ghost">Log a meal</Link><button className="btn-lime" disabled={date !== toDateKey(new Date())} onClick={() => fitnessActions.addWater(250)}>+250ml water</button></div>
      </section>
      <section className="daily-panel"><h2>Recovery check-in</h2><p className="daily-muted">Record how you feel before deciding how hard to train.</p>
        <details className="ft-disclosure"><summary>{checkin ? 'View or edit your check-in' : 'How are you feeling today?'}</summary><form key={`${date}-${checkin ? 'saved' : 'new'}`} onSubmit={e => { e.preventDefault(); const data = new FormData(e.currentTarget); fitnessActions.saveDailyCheckin(date, { sleepHours: Number(data.get('sleep')), energy: Number(data.get('energy')), soreness: Number(data.get('soreness')), steps: Number(data.get('steps')), notes: String(data.get('notes')).trim() }); setSaved(true); }}>
          <div className="daily-fields"><label>Sleep (hours)<input name="sleep" type="number" min="0" max="24" step="0.5" defaultValue={checkin?.sleepHours ?? 8} required /></label><label>Steps<input name="steps" type="number" min="0" max="100000" step="1" defaultValue={checkin?.steps ?? 0} required /></label><label>Energy<select name="energy" defaultValue={checkin?.energy ?? 3}>{['Very low', 'Low', 'Okay', 'Good', 'Excellent'].map((x, i) => <option key={x} value={i + 1}>{x}</option>)}</select></label><label>Muscle soreness<select name="soreness" defaultValue={checkin?.soreness ?? 1}>{['None', 'Mild', 'Moderate', 'High', 'Very high'].map((x, i) => <option key={x} value={i + 1}>{x}</option>)}</select></label></div>
          <label>Notes<textarea name="notes" maxLength={1000} defaultValue={checkin?.notes ?? ''} placeholder="How did training feel?" /></label><button className="btn-lime" type="submit">Save check-in</button><span role="status" className="daily-feedback">{saved ? 'Check-in saved.' : ''}</span>
        </form></details>
      </section>
      <section className="daily-panel"><h2>Your training</h2>{logs.length ? logs.map(log => <div className="daily-log" key={log.id}><strong>{log.planName}</strong><p>{Math.round(log.durationSec / 60)} min · {log.setsCompleted}/{log.setsTotal} sets · {log.calories} estimated kcal</p></div>) : <p className="daily-muted">No sessions logged for this day. Start a routine and your completed sets will appear here.</p>}
        {checkin && <p className="daily-note">{checkin.energy <= 2 || checkin.soreness >= 4 ? 'You logged low energy or high soreness. Consider an easier session or a recovery day.' : 'Use your check-in alongside how you feel to choose today’s intensity.'}</p>}
        <div className="daily-actions"><Link href="/workouts" className="btn-lime">Choose a workout</Link><Link href="/progress" className="btn-ghost">Log measurements</Link></div>
      </section>
      <section className="daily-panel"><h2>Your data, within reach</h2><p className="daily-muted">Your profile, meals, workouts, measurements, and recovery notes are saved in this browser. Download a copy for your records.</p><button className="btn-ghost" onClick={exportData}>Download fitness data</button><p className="daily-muted" style={{ marginTop: 20 }}>Explore your <Link href="/">3D physique preview</Link> or update your goals on the dashboard.</p></section>
    </div>
  </div>;
}
