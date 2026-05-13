'use client'

import { AppShell } from '@/components/AppShell'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState } from 'react'

const sections = [
  {
    id: 'glosario',
    title: '📖 Glosario',
    content: [
      { term: 'Mona', def: 'La figurita del álbum Panini. Cada mona tiene un código único (ej. COL10, FWC5, COC3).' },
      { term: 'Falta', def: 'El espacio en el álbum está vacío. Aún no tienes esa mona.' },
      { term: 'Tengo', def: 'Tienes la mona física en tu mazo, asignada a un álbum pero sin pegar.' },
      { term: 'Pegada', def: 'La mona ya está pegada en el álbum. Estado final.' },
      { term: 'Repetida', def: 'Tienes una copia extra — más de las que necesitas para los dos álbumes.' },
      { term: 'Principal', def: 'El álbum A. Siempre recibe la mona primero.' },
      { term: 'Secundario', def: 'El álbum B. Recibe la mona solo después de que Principal ya la tiene.' },
      { term: 'Mazo', def: 'Tu colección de monas físicas en mano — las que aún no están pegadas.' },
    ]
  },
  {
    id: 'agregar',
    title: '➕ Cómo agregar monas',
    content: [
      {
        step: '1. Una por una',
        desc: 'Toca el botón central (+) → elige la sección → escribe el número → toca "Agregar mona". La app decide automáticamente si va a Principal, Secundario o Repetidas.'
      },
      {
        step: '2. Selección múltiple',
        desc: 'En la pantalla de número, toca "Selección múltiple" (arriba a la derecha). Verás una cuadrícula con todos los números de la sección. Toca los que tienes → toca "Agregar X monas". Ideal para cuando acabas de abrir varios sobres.'
      },
      {
        step: '3. Lógica de asignación automática',
        desc: 'La app sigue esta regla: si Principal no tiene la mona → va a Principal. Si Principal ya la tiene pero Secundario no → va a Secundario. Si las dos ya la tienen → va a Repetidas.'
      },
      {
        step: '4. Propietario (Simon / Paul)',
        desc: 'Cada mona tiene un dueño físico — la persona cuyo sobre la contenía. Esto importa para las repetidas: cada uno sabe cuáles puede intercambiar.'
      },
    ]
  },
  {
    id: 'album',
    title: '📒 Vista del álbum',
    content: [
      {
        step: 'Seleccionar álbum',
        desc: 'En la pestaña Álbum, cambia entre Principal y Secundario con los botones de arriba.'
      },
      {
        step: 'Lista de secciones',
        desc: 'Cada sección muestra cuántas monas están pegadas vs. el total. La barra se vuelve verde cuando la sección está completa.'
      },
      {
        step: 'Cuadrícula de la sección',
        desc: 'Toca una sección para ver todos sus espacios:\n🟢 Verde = Pegada\n🟡 Ámbar = Tengo (en mazo, sin pegar)\n⚪ Gris = Falta\n✦ = Mona foil (brillante)'
      },
      {
        step: 'Pegar una mona',
        desc: 'Toca un espacio en ámbar → toca "Pegar ✓". El espacio se vuelve verde en ambos teléfonos al instante.'
      },
      {
        step: 'Deshacer una pegada',
        desc: 'Toca un espacio verde → toca "Deshacer pegada". Solo para errores — en la vida real las monas no se despegan fácil.'
      },
    ]
  },
  {
    id: 'mazo',
    title: '📦 El mazo',
    content: [
      {
        step: 'Para pegar',
        desc: 'Monas que tienes en mano, asignadas a Principal o Secundario. Agrupadas por dueño (Simon / Paul). Toca una fila para pegarla, moverla o marcarla como intercambiada.'
      },
      {
        step: 'Mis repetidas',
        desc: 'Tus monas extra. Puedes buscar por código o sección. Toca una para moverla a un álbum (si el espacio está disponible) o quitarla si la intercambiaste.'
      },
      {
        step: 'Repetidas del otro',
        desc: 'Vista de solo lectura de las repetidas de Simon o Paul. Útil para negociar intercambios.'
      },
    ]
  },
  {
    id: 'realtime',
    title: '⚡ Sincronización en tiempo real',
    content: [
      {
        step: '¿Cómo funciona?',
        desc: 'Cualquier cambio que hace Simon aparece en el teléfono de Paul en menos de 2 segundos, y viceversa. No necesitas refrescar.'
      },
      {
        step: 'Feed de actividad',
        desc: 'En la pantalla de Inicio, el feed muestra los últimos movimientos: quién agregó qué mona, quién pegó qué, etc.'
      },
    ]
  },
  {
    id: 'codigos',
    title: '🔢 Códigos de sección',
    content: [
      { term: 'FWC00–FWC19', def: 'Intro FIFA World Cup (20 monas). FWC00 es el logo Panini.' },
      { term: 'COL1–COL20', def: 'Colombia. #1 = escudo (foil). #13 = foto del equipo. #2–12 y #14–20 = jugadores.' },
      { term: 'COC1–COC12', def: 'Bonus Coca-Cola (12 monas). Se cuentan separado del álbum base.' },
      { term: 'ESP, ARG, BRA…', def: 'Cada selección tiene su código de 3 letras. 48 selecciones × 20 monas = 960.' },
    ]
  },
  {
    id: 'tips',
    title: '💡 Tips',
    content: [
      { step: 'Abre sobres con la app abierta', desc: 'Usa la selección múltiple mientras abres cada sobre — es más rápido que hacerlo después.' },
      { step: 'Pega desde el Mazo', desc: 'Cuando vayas a pegar físicamente, abre el Mazo → Para pegar → toca la mona → "Marcar como pegada". Así el álbum queda actualizado al instante.' },
      { step: 'Instala en la pantalla de inicio', desc: 'En iPhone: Safari → compartir → "Agregar al inicio". En Android: Chrome → menú → "Instalar app". Funciona como una app nativa sin barra del navegador.' },
      { step: 'Código familiar', desc: 'El código para entrar a la app es 2026.' },
    ]
  },
]

type ContentItem = { term?: string; def?: string; step?: string; desc?: string }

export default function AyudaPage() {
  const [open, setOpen] = useState<string | null>('agregar')

  return (
    <AppShell>
      <div className="min-h-screen bg-gray-50">
        <header className="bg-primary px-4 pt-safe pb-4 flex items-center gap-3">
          <Link href="/settings" className="text-white/70 active:text-white">
            <ChevronLeft size={22} />
          </Link>
          <h1 className="text-white font-bold text-lg">Guía de uso</h1>
        </header>

        <div className="px-4 py-4 max-w-lg mx-auto space-y-2">
          {sections.map((sec) => (
            <div key={sec.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
              <button
                onClick={() => setOpen(open === sec.id ? null : sec.id)}
                className="w-full flex items-center justify-between px-4 py-4 active:bg-gray-50 transition-colors"
              >
                <span className="font-bold text-gray-800">{sec.title}</span>
                <span className={cn('text-gray-400 text-lg transition-transform duration-200',
                  open === sec.id && 'rotate-180')}>
                  ›
                </span>
              </button>

              {open === sec.id && (
                <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
                  {sec.content.map((item: ContentItem, i) => (
                    <div key={i} className={cn(
                      'rounded-xl p-3',
                      item.term ? 'bg-primary/5' : 'bg-gray-50'
                    )}>
                      {item.term && (
                        <>
                          <p className="font-bold text-primary text-sm">{item.term}</p>
                          <p className="text-sm text-gray-600 mt-0.5">{item.def}</p>
                        </>
                      )}
                      {item.step && (
                        <>
                          <p className="font-bold text-gray-800 text-sm">{item.step}</p>
                          <p className="text-sm text-gray-600 mt-0.5 whitespace-pre-line">{item.desc}</p>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  )
}
