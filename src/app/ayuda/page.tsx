'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AppShell } from '@/components/AppShell'

// ── Content ───────────────────────────────────────────────────────────────────

type Item = { q: string; a: string | string[] }
type Section = { id: string; title: string; items: Item[] }

const sections: Section[] = [
  {
    id: 'concepto',
    title: '🧠 Concepto básico',
    items: [
      {
        q: '¿Qué trackea esta app?',
        a: [
          'Dos álbumes Panini del Mundial 2026 en paralelo (Principal y Secundario), con 992 monas cada uno (980 base + 12 bonus Coca-Cola). Tú y Paul tienen sus mazos físicos separados. La app sabe qué está pegado, qué tienen en mano y qué falta.',
        ],
      },
      {
        q: '¿Cuáles son los 4 inventarios?',
        a: [
          '1. Monas pegadas en el Álbum Principal — permanentes, no se mueven.',
          '2. Monas pegadas en el Álbum Secundario — idem.',
          '3. Mazo de Simon — todas las monas físicas que Simon tiene en mano, sin importar a qué álbum estén etiquetadas.',
          '4. Mazo de Paul — idem para Paul.',
          'La etiqueta (Principal / Secundario / Repetida) es solo una sugerencia de destino. No separa el mazo en compartimentos — es solo un color de marcador.',
        ],
      },
      {
        q: '¿Qué significa la etiqueta de una mona?',
        a: [
          'Es una sugerencia de destino, nada más. Una mona etiquetada "Principal" no está reservada ni bloqueada — simplemente indica que el plan original era pegarla ahí. Puedes pegarla en Secundario en cualquier momento si así lo decides.',
          '"Repetida" significa que ya tienes cubiertos ambos álbumes con esa mona, y esta copia está disponible para intercambiar.',
        ],
      },
      {
        q: '¿Cómo se asigna la etiqueta automáticamente?',
        a: [
          'Al agregar una mona, la app revisa el estado actual:',
          '→ Si Principal no la tiene pegada ni reservada → etiqueta "Principal"',
          '→ Si Principal ya está cubierta pero Secundario no → etiqueta "Secundario"',
          '→ Si ambos álbumes ya la tienen cubierta → etiqueta "Repetida"',
          'Esta lógica es automática, pero siempre puedes cambiar la etiqueta manualmente desde el Mazo.',
        ],
      },
    ],
  },
  {
    id: 'agregar',
    title: '➕ Agregar monas',
    items: [
      {
        q: '¿Cómo agrego una sola mona?',
        a: [
          'Toca el botón central ➕ en la barra de navegación. Elige la sección (país o FIFA), luego toca el número de la mona en el teclado y toca "Agregar mona". La app etiqueta automáticamente y muestra un toast con el resultado.',
        ],
      },
      {
        q: '¿Cómo agrego varias monas de golpe?',
        a: [
          'En la pantalla de número, toca "Selección múltiple" (esquina superior derecha). Aparece una cuadrícula con todos los números de la sección. Toca los que tienes — se resaltan en morado. Luego toca "Agregar X monas" para registrarlas todas de una vez.',
          'Ideal para cuando abres varios sobres seguidos.',
        ],
      },
      {
        q: '¿A quién le asigno la mona?',
        a: [
          'Cada mona tiene un dueño físico — quien abrió el sobre. Usa el selector Simon / Paul en la pantalla de número antes de confirmar. La mona queda registrada en el mazo del dueño.',
        ],
      },
      {
        q: '¿Cómo funciona el toggle de agrupación?',
        a: [
          'En la esquina superior derecha verás "Grupos | Confed." Esto cambia cómo se listan las secciones:',
          '"Grupos" → agrupa por Grupo A, B, C… L (orden del torneo).',
          '"Confed." → agrupa por UEFA, CONMEBOL, CONCACAF, CAF, AFC, OFC.',
          'Esta preferencia se guarda y aplica en todas las pantallas (Agregar, Álbum, Mazo, Cambios).',
        ],
      },
    ],
  },
  {
    id: 'album',
    title: '📒 Vista del álbum',
    items: [
      {
        q: '¿Qué muestra la vista del álbum?',
        a: [
          'Lista de todas las secciones con barra de progreso. Toca una sección para ver su cuadrícula de monas. Cambia entre Álbum Principal y Secundario con las pestañas blancas debajo del encabezado.',
        ],
      },
      {
        q: '¿Qué significan los colores en la cuadrícula?',
        a: [
          '🟢 Verde — pegada en este álbum.',
          '🟣 Morado — alguien tiene esta mona en su mazo (cualquier etiqueta).',
          '⬜ Gris claro — nadie la tiene: falta completamente.',
          'El punto gris pequeño en una celda morada indica que AMBOS usuarios la tienen en el mazo.',
          'Un ✦ amarillo indica mona foil (escudo o portada).',
        ],
      },
      {
        q: '¿Cómo pego una mona desde la cuadrícula?',
        a: [
          'Toca la celda morada. Aparece un panel inferior mostrando todas las copias disponibles — de Simon y de Paul — con su etiqueta actual. Toca "Pegar ✓" junto a cualquier copia para pegarla en este álbum.',
          'No importa qué etiqueta tenga la mona: puedes pegar cualquier copia en cualquier álbum. La etiqueta es solo una sugerencia.',
        ],
      },
      {
        q: '¿Cómo deshago una pegada?',
        a: [
          'Toca la celda verde → "Deshacer pegada". Úsalo solo si cometiste un error — en la vida real las monas no se despegan.',
        ],
      },
    ],
  },
  {
    id: 'mazo',
    title: '📦 El mazo',
    items: [
      {
        q: '¿Cuáles son las 4 pestañas del Mazo?',
        a: [
          '"Mi mano" — todo lo que tú tienes físicamente (mazo de Simon si estás como Simon, mazo de Paul si estás como Paul). Monas de todos los destinos mezcladas, agrupadas por país.',
          '"De [otro]" — mazo completo del otro usuario. Solo lectura — útil para coordinar.',
          '"Intercambiar" — pool de monas disponibles para intercambio con terceros: repetidas de cualquier usuario, copias donde Principal ya está pegada, y todo el mazo de Paul (según la regla de trading).',
          '"Falta" — monas que genuinamente no tienen nadie en el mazo ni están pegadas. Sub-pestañas por Principal y Secundario.',
        ],
      },
      {
        q: '¿Cómo funciona el listado por país?',
        a: [
          'Los países aparecen como filas colapsadas bajo sus grupos (WC o confederación). Cada fila muestra cuántas monas tienes y cuántas tienen duplicado. Toca para expandir y ver las monas individualmente.',
          'Las monas con más de una copia muestran un badge ×N en lugar de aparecer repetidas.',
        ],
      },
      {
        q: '¿Qué puedo hacer al tocar una mona en el Mazo?',
        a: [
          'Se abre un panel con acciones:',
          '✅ Pegar en Principal — pega ESTA mona en Principal si ese slot está libre.',
          '✅ Pegar en Secundario — pega ESTA mona en Secundario si ese slot está libre.',
          '🅐 Etiquetar para Principal — cambia la sugerencia de destino (no pega nada).',
          '🅑 Etiquetar para Secundario — idem.',
          '🔄 Etiquetar como repetida — marca esta copia como disponible para intercambio.',
          '🤝 Quitar (intercambiada) — elimina la mona del inventario (la intercambiaste con alguien).',
        ],
      },
      {
        q: '¿Qué muestra la pestaña "Falta"?',
        a: [
          'Monas que están en estado Falta en el álbum Y que nadie tiene en el mazo. Es decir: las que realmente necesitas conseguir.',
          'Selecciona Principal o Secundario con las sub-pestañas. Si ves 🎉 "Álbum completo", todas las monas de ese álbum están o pegadas o en mano.',
        ],
      },
    ],
  },
  {
    id: 'cambios',
    title: '🔄 Cambios',
    items: [
      {
        q: '¿Qué son las "Internas"?',
        a: [
          'Transferencias entre Simon y Paul — cuando se pasan monas físicamente. Selecciona quién entrega, expande los países, usa el stepper para indicar cuántas copias de cada mona transferir (un toggle para copias únicas, − N/max + para múltiples), y confirma.',
          'Esto cambia el dueño registrado de las monas en la app.',
        ],
      },
      {
        q: '¿Cómo registro un intercambio con otra persona?',
        a: [
          'Pestaña "Con otras personas". Tiene dos secciones:',
          '"Das" — el pool de monas disponibles para intercambio, agrupado por país. Toca un país para expandir y seleccionar cuáles das. El badge ×N/M muestra cuántas seleccionaste de cuántas disponibles.',
          '"Recibes" — busca la sección y toca los números en la cuadrícula para agregar las monas que recibes. Soporta intercambios desiguales (1 por 3, 2 por 1, etc.).',
          'Al confirmar, las monas dadas se eliminan del inventario y las recibidas entran con etiqueta automática.',
        ],
      },
      {
        q: '¿Qué monas aparecen en el pool "Das"?',
        a: [
          'Todas las monas que se consideran disponibles para intercambio con terceros:',
          '→ Monas etiquetadas "Repetida" (de cualquier usuario)',
          '→ Todo el mazo de Paul (por convención de trading del equipo)',
          '→ Copias de monas donde el Álbum Principal ya está pegado',
        ],
      },
    ],
  },
  {
    id: 'inicio',
    title: '🏠 Pantalla de inicio',
    items: [
      {
        q: '¿Qué muestran las tarjetas del Inicio?',
        a: [
          '🅐 Álbum Principal / 🅑 Álbum Secundario — porcentaje de completitud, progreso de monas base y bonus por separado.',
          '📦 Para pegar — monas en mano etiquetadas para un álbum, desglosadas por Simon y Paul.',
          '🔄 Repetidas — copias extras de cada usuario.',
          '📊 Estado de la colección — desglose de los 980 códigos base en 4 estados:',
          '  · Verde: pegada en ambos álbumes',
          '  · Azul: pegada en uno + en mano para el otro',
          '  · Morado: en mano para ambos (sin pegar aún)',
          '  · Ámbar: en mano para un solo álbum',
        ],
      },
      {
        q: '¿Qué es el feed de actividad?',
        a: [
          'Los últimos movimientos registrados en tiempo real: quién agregó qué, quién pegó qué, transferencias, intercambios. Se actualiza automáticamente en ambos teléfonos.',
        ],
      },
    ],
  },
  {
    id: 'sync',
    title: '⚡ Tiempo real y acceso',
    items: [
      {
        q: '¿Cómo funciona la sincronización?',
        a: [
          'Cada cambio aparece en el otro teléfono en menos de 2 segundos sin necesidad de refrescar. Simon y Paul pueden usar la app al mismo tiempo.',
        ],
      },
      {
        q: '¿Cómo entro a la app?',
        a: [
          'Código familiar: 2026. Al entrar, selecciona tu usuario (Simon o Paul). Puedes cambiar de usuario en cualquier momento tocando tu nombre en la pantalla de Inicio.',
        ],
      },
      {
        q: '¿Cómo instalo la app en mi celular?',
        a: [
          'iPhone (Safari): compartir → "Agregar al inicio de pantalla".',
          'Android (Chrome): menú ⋮ → "Instalar app" o "Agregar a pantalla principal".',
          'Funciona como app nativa sin barra del navegador.',
        ],
      },
      {
        q: '¿Cómo cambio el código de acceso?',
        a: [
          'En Vercel → Settings → Environment Variables → edita HOUSEHOLD_PASSCODE → guarda → redeploy. No requiere tocar el código.',
        ],
      },
    ],
  },
  {
    id: 'codigos',
    title: '🔢 Referencia de códigos',
    items: [
      {
        q: 'Estructura de códigos',
        a: [
          'FWC00–FWC19 → FIFA World Cup (20 monas). FWC00 = logo Panini. FWC1–FWC19 = emblemas, mascotas, balón, sede, historia.',
          '[PAÍS]1–[PAÍS]20 → cada selección tiene 20 monas. #1 = escudo (foil ✦). #13 = foto del equipo. El resto son jugadores.',
          'COC1–COC12 → Bonus Coca-Cola. Se cuentan por separado en el progreso.',
        ],
      },
      {
        q: 'Selecciones por confederación',
        a: [
          'UEFA (16): ESP, FRA, ENG, GER, POR, NED, BEL, ITA*, CRO, AUT, SUI, SWE, SCO, NOR, CZE, BIH',
          'CONMEBOL (6): ARG, BRA, COL, URU, PAR, ECU',
          'CONCACAF (6): MEX, USA, CAN, PAN, HAI, CUW',
          'CAF (10): MAR, SEN, GHA, EGY, TUN, ALG, RSA, CIV, COD, CPV',
          'AFC (8): JPN, KOR, KSA, IRN, AUS*, QAT, IRQ, JOR, UZB',
          'OFC (2): NZL, AUS',
        ],
      },
      {
        q: '¿Las monas foil son especiales?',
        a: [
          'Sí — son las laminadas/brillantes. En la cuadrícula del álbum aparecen con un ✦ amarillo. Son el #1 de cada selección (el escudo) y las 20 monas de la sección FWC.',
        ],
      },
    ],
  },
]

// ── Components ────────────────────────────────────────────────────────────────

function AccordionItem({ item, isOpen, onToggle }: {
  item: Item; isOpen: boolean; onToggle: () => void
}) {
  return (
    <div className={cn('border rounded-2xl overflow-hidden transition-all',
      isOpen ? 'border-blush shadow-sm' : 'border-[#EEEEEE]')}>
      <button onClick={onToggle}
        className={cn('w-full flex items-start justify-between gap-3 px-4 py-3.5 text-left transition-colors',
          isOpen ? 'bg-blushLight/40' : 'bg-white active:bg-[#F5F5F5]')}>
        <span className="text-sm font-semibold text-gray-800 flex-1">{item.q}</span>
        <ChevronDown size={16}
          className={cn('text-rose shrink-0 mt-0.5 transition-transform duration-200',
            isOpen && 'rotate-180')} />
      </button>

      {isOpen && (
        <div className="px-4 pb-4 pt-1 bg-white border-t border-blush/20 space-y-1.5">
          {(Array.isArray(item.a) ? item.a : [item.a]).map((line, i) => (
            <p key={i} className={cn(
              'text-sm leading-relaxed',
              line.startsWith('→') || line.startsWith('·') || /^\d\./.test(line)
                ? 'text-gray-600 pl-2'
                : line.startsWith('"') || /^[🅐🅑🔄✅🟢🟣⬜📦📊]/.test(line)
                ? 'text-gray-600'
                : 'text-gray-700'
            )}>
              {line}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AyudaPage() {
  const [openKey, setOpenKey] = useState<string | null>(null)

  const toggle = (key: string) => setOpenKey(prev => prev === key ? null : key)

  return (
    <AppShell>
      <div className="min-h-screen bg-[#F9F9F9]">
        <header className="bg-primary pt-safe px-4 pb-4 flex items-center gap-3">
          <Link href="/settings" className="text-white/70 active:text-white">
            <ChevronLeft size={22} />
          </Link>
          <h1 className="text-white font-bold text-lg">Guía de uso</h1>
        </header>

        <div className="px-4 py-4 max-w-lg mx-auto space-y-6 pb-8">
          {sections.map(sec => (
            <div key={sec.id}>
              <p className="group-header mb-2">{sec.title}</p>
              <div className="space-y-2">
                {sec.items.map((item, i) => {
                  const key = `${sec.id}-${i}`
                  return (
                    <AccordionItem
                      key={key}
                      item={item}
                      isOpen={openKey === key}
                      onToggle={() => toggle(key)}
                    />
                  )
                })}
              </div>
            </div>
          ))}

          {/* Footer */}
          <div className="text-center text-xs text-gray-400 space-y-1 pt-2">
            <p className="font-semibold text-gray-500">Panini 2026 Tracker</p>
            <p>Edición Colombia · 992 monas · Simon &amp; Paul</p>
            <p>Checklist: Diamond Cards Online</p>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
