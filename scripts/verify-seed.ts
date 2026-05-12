import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const sb = createClient(url, key)

async function verify() {
  console.log('\n🔍 Verificando base de datos Panini 2026...\n')

  const checks = [
    { label: 'Total stickers',     table: 'stickers',    expected: 992 },
    { label: 'Total album_slots',  table: 'album_slots',  expected: 1984 },
    { label: 'Bonus stickers',     filter: { table: 'stickers',    col: 'is_bonus',      val: true  }, expected: 12 },
    { label: 'Foil stickers',      filter: { table: 'stickers',    col: 'is_foil',       val: true  }, expected: 68 },
    { label: 'Team photos',        filter: { table: 'stickers',    col: 'is_team_photo', val: true  }, expected: 48 },
    { label: 'Principal slots',    filter: { table: 'album_slots', col: 'album',         val: 'Principal'  }, expected: 992 },
    { label: 'Secundario slots',   filter: { table: 'album_slots', col: 'album',         val: 'Secundario' }, expected: 992 },
  ]

  let allPassed = true

  for (const check of checks) {
    let count: number
    if ('filter' in check && check.filter) {
      const { data, error } = await sb
        .from(check.filter.table)
        .select('*', { count: 'exact', head: true })
        .eq(check.filter.col, check.filter.val)
      if (error) { console.error(`❌ Error on ${check.label}:`, error.message); allPassed = false; continue }
      count = (data as unknown as { count: number })?.count ?? 0
      // @ts-expect-error Supabase count quirk
      count = error === null ? (await sb.from(check.filter.table).select('*', { count: 'exact', head: true }).eq(check.filter.col, check.filter.val)).count ?? 0 : 0
    } else {
      const t = (check as { table: string }).table
      const res = await sb.from(t).select('*', { count: 'exact', head: true })
      count = res.count ?? 0
    }

    const passed = count === check.expected
    if (!passed) allPassed = false
    console.log(`${passed ? '✅' : '❌'} ${check.label}: ${count} (expected ${check.expected})`)
  }

  console.log(allPassed ? '\n✅ Todo correcto — la base de datos está lista.\n' : '\n❌ Algunos checks fallaron. Revisá el schema.\n')
  process.exit(allPassed ? 0 : 1)
}

verify().catch((e) => { console.error(e); process.exit(1) })
