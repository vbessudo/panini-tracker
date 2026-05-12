'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { useAppStore } from '@/lib/store'
import type { Owner } from '@/lib/supabase'

const PASSCODE_LENGTH = 10 // 'panini2026'

const DIGIT_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']

export function PasscodeGate() {
  const [step, setStep] = useState<'passcode' | 'user'>('passcode')
  const [input, setInput] = useState('')
  const [shake, setShake] = useState(false)
  const { authenticate, setUser } = useAppStore()

  // Verify against env var exposed via API route to avoid leaking to client bundle
  const verify = async (code: string) => {
    const res = await fetch('/api/verify-passcode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passcode: code }),
    })
    return res.ok
  }

  const handleDigit = (d: string) => {
    if (input.length >= PASSCODE_LENGTH) return
    setInput((prev) => prev + d)
  }

  const handleDelete = () => {
    setInput((prev) => prev.slice(0, -1))
  }

  // Auto-submit when full length
  useEffect(() => {
    if (input.length === PASSCODE_LENGTH) {
      verify(input).then((ok) => {
        if (ok) {
          setStep('user')
        } else {
          setShake(true)
          setTimeout(() => {
            setShake(false)
            setInput('')
          }, 600)
          toast.error('Código incorrecto')
        }
      })
    }
  }, [input])

  const handlePickUser = (user: Owner) => {
    authenticate()
    setUser(user)
  }

  if (step === 'user') {
    return (
      <div className="min-h-screen bg-primary flex flex-col items-center justify-center px-6 gap-8">
        <div className="text-center">
          <div className="text-5xl mb-4">⚽</div>
          <h1 className="text-white text-2xl font-bold">Panini 2026</h1>
          <p className="text-white/70 mt-2">¿Quién sos?</p>
        </div>

        <div className="w-full max-w-xs flex flex-col gap-4">
          <button
            onClick={() => handlePickUser('Simon')}
            className="w-full bg-simon text-white font-bold text-xl rounded-2xl py-5
                       active:scale-95 transition-transform duration-100 shadow-lg"
          >
            🟦 Simon
          </button>
          <button
            onClick={() => handlePickUser('Paul')}
            className="w-full bg-paul text-white font-bold text-xl rounded-2xl py-5
                       active:scale-95 transition-transform duration-100 shadow-lg"
          >
            🟧 Paul
          </button>
        </div>
      </div>
    )
  }

  // Passcode screen
  return (
    <div className="min-h-screen bg-primary flex flex-col items-center justify-center px-6 select-none">
      <div className="text-center mb-10">
        <div className="text-5xl mb-4">⚽</div>
        <h1 className="text-white text-2xl font-bold">Panini 2026</h1>
        <p className="text-white/70 mt-1 text-sm">Ingresá el código familiar</p>
      </div>

      {/* Dots indicator */}
      <div
        className={`flex gap-3 mb-10 transition-all ${shake ? 'shake-anim' : ''}`}
      >
        {Array.from({ length: PASSCODE_LENGTH }).map((_, i) => (
          <div
            key={i}
            className={`w-3 h-3 rounded-full transition-colors duration-150 ${
              i < input.length ? 'bg-white' : 'bg-white/30'
            }`}
          />
        ))}
      </div>

      {/* Custom keypad */}
      <div className="grid grid-cols-3 gap-3 w-full max-w-xs">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((key) => {
          if (key === '') return <div key="empty" />
          if (key === 'del') {
            return (
              <button
                key="del"
                onPointerDown={handleDelete}
                className="bg-white/10 text-white rounded-2xl h-16 flex items-center justify-center
                           text-xl active:bg-white/25 transition-colors duration-100 font-medium"
              >
                ⌫
              </button>
            )
          }
          return (
            <button
              key={key}
              onPointerDown={() => handleDigit(key)}
              className="bg-white/10 text-white rounded-2xl h-16 flex items-center justify-center
                         text-2xl font-semibold active:bg-white/25 transition-colors duration-100"
            >
              {key}
            </button>
          )
        })}
      </div>

      <style>{`
        @keyframes panini-shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-8px); }
          80% { transform: translateX(8px); }
        }
        .shake-anim { animation: panini-shake 0.5s ease-in-out; }
      `}</style>
    </div>
  )
}
