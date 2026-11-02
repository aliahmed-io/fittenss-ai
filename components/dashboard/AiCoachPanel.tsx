'use client';

import React, { useState, useRef } from 'react';
import { Send, Loader2, ShieldCheck } from 'lucide-react';
import type { AnthropometricMetrics } from '@/lib/bodyModel/anthropometry';
import type { CoachResponse, GoalSettings, NutritionTargets, Profile } from '@/lib/fitness/types';

interface AiCoachPanelProps {
  profile: Profile;
  goal: GoalSettings;
  targets: NutritionTargets;
  metrics: AnthropometricMetrics;
  streak: number;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'coach';
  text: string;
  source?: 'gemini' | 'engine-fallback';
  confidence?: 'high' | 'medium' | 'low';
}

const QUICK_PROMPTS = [
  'What should my daily macros be?',
  'Best exercises for my silhouette?',
  'How fast should I lose fat?',
  'Tips for recovery and sleep',
];

export default function AiCoachPanel({
  profile,
  goal,
  targets,
  metrics,
  streak,
}: AiCoachPanelProps) {
  const msgCounter = useRef(0);
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: 'initial',
      sender: 'coach',
      text: `Your starting targets are ${targets.calories} kcal and ${targets.protein}g protein per day. Ask me about training, meals, or recovery`,
      source: 'engine-fallback',
      confidence: 'high',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSend = async (queryText?: string) => {
    const textToSend = (queryText ?? input).trim();
    if (!textToSend || loading) return;

    msgCounter.current += 1;
    const userMsg: ChatMessage = {
      id: `u-${msgCounter.current}`,
      sender: 'user',
      text: textToSend,
    };
    setMessages((prev) => [...prev, userMsg]);
    if (!queryText) setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/ai-coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'coach-chat',
          profile,
          goal,
          targets,
          message: textToSend,
          entries: [],
          streak,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as CoachResponse;

      msgCounter.current += 1;
      const replyMsg: ChatMessage = {
        id: `c-${msgCounter.current}`,
        sender: 'coach',
        text: data.reply ?? 'Stay consistent with progressive overload and hit your daily protein goal.',
        source: data.provenance.source,
        confidence: data.provenance.confidence,
      };
      setMessages((prev) => [...prev, replyMsg]);
    } catch {
      // Deterministic client fallback
      msgCounter.current += 1;
      const replyMsg: ChatMessage = {
        id: `c-${msgCounter.current}`,
        sender: 'coach',
        text: `Based on your ${metrics.archetype} silhouette and ${goal.type} goal, prioritize 3-4 structured training sessions per week and stick to your daily ${targets.calories} kcal target.`,
        source: 'engine-fallback',
        confidence: 'low',
      };
      setMessages((prev) => [...prev, replyMsg]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Messages Feed */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p className="eyebrow">AI Anatomical Coach</p>
          <span
            style={{
              fontSize: '9px',
              color: 'var(--ft-lime)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <ShieldCheck style={{ width: '11px', height: '11px' }} />
            Active Biometric Feed
          </span>
        </div>

        {messages.map((m) => (
          <div
            key={m.id}
            style={{
              alignSelf: m.sender === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '90%',
              padding: '12px 16px',
              background: m.sender === 'user' ? 'rgba(255,255,255,0.06)' : 'rgba(203,255,0,0.04)',
              border: `1px solid ${m.sender === 'user' ? 'var(--ft-rule)' : 'rgba(203,255,0,0.2)'}`,
              borderLeft: m.sender === 'coach' ? '3px solid var(--ft-lime)' : '1px solid var(--ft-rule)',
            }}
          >
            <p style={{ fontSize: '13px', lineHeight: 1.5, color: 'var(--ft-t1)', margin: 0 }}>
              {m.text}
            </p>
            {m.sender === 'coach' && m.source && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  marginTop: '8px',
                  fontSize: '9px',
                  color: 'var(--ft-t3)',
                  textTransform: 'uppercase',
                }}
              >
                <span>Source: {m.source === 'gemini' ? 'AI coach' : 'Built-in coach'}</span>
                {m.confidence && <span>· {m.confidence} confidence</span>}
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div
            style={{
              alignSelf: 'flex-start',
              padding: '10px 14px',
              background: 'rgba(203,255,0,0.04)',
              border: '1px solid rgba(203,255,0,0.2)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <Loader2 style={{ width: '13px', height: '13px', color: 'var(--ft-lime)', animation: 'spin 1s linear infinite' }} />
            <span style={{ fontSize: '11px', color: 'var(--ft-t2)' }}>Formulating biomechanical advice...</span>
          </div>
        )}
      </div>

      {/* Quick Prompts */}
      <div
        style={{
          padding: '8px 24px',
          borderTop: '1px solid var(--ft-rule)',
          display: 'flex',
          gap: '6px',
          overflowX: 'auto',
          whiteSpace: 'nowrap',
        }}
      >
        {QUICK_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            onClick={() => handleSend(prompt)}
            disabled={loading}
            className="btn-ghost"
            style={{
              padding: '4px 8px',
              fontSize: '9px',
              color: 'var(--ft-t2)',
              flexShrink: 0,
            }}
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* Input Field */}
      <div
        style={{
          padding: '12px 24px',
          borderTop: '1px solid var(--ft-rule)',
          display: 'flex',
          gap: '8px',
        }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Ask coach about exercises, macros, recovery..."
          disabled={loading}
          style={{
            flex: 1,
            background: 'var(--ft-surface)',
            border: '1px solid var(--ft-rule)',
            color: 'var(--ft-t1)',
            padding: '8px 12px',
            fontSize: '11px',
            outline: 'none',
          }}
        />
        <button
          onClick={() => handleSend()}
          disabled={loading || !input.trim()}
          className="btn-lime"
          style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '4px' }}
        >
          {loading ? (
            <Loader2 style={{ width: '12px', height: '12px', animation: 'spin 1s linear infinite' }} />
          ) : (
            <Send style={{ width: '12px', height: '12px' }} />
          )}
        </button>
      </div>
    </div>
  );
}
