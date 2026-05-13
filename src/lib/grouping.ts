import { SECTIONS } from '@/data/panini-stickers'
import {
  CONFEDERATION_ORDER, CONFEDERATION_LABELS, TEAM_CONFEDERATION,
  type Confederation,
} from '@/data/confederations'

export type GroupingMode = 'wc_group' | 'confederation'

export type SectionGroup = {
  groupId: string
  groupLabel: string
  sections: Array<{ code: string; label: string }>
}

// ── WC Group constants ────────────────────────────────────────────────────────

const WC_GROUP_ORDER = ['FIFA','A','B','C','D','E','F','G','H','I','J','K','L','Bonus']

const WC_GROUP_LABELS: Record<string, string> = {
  FIFA:'🏆 FIFA World Cup', Bonus:'⭐ Coca-Cola',
  A:'Grupo A', B:'Grupo B', C:'Grupo C', D:'Grupo D',
  E:'Grupo E', F:'Grupo F', G:'Grupo G', H:'Grupo H',
  I:'Grupo I', J:'Grupo J', K:'Grupo K', L:'Grupo L',
}

// ── Main function ─────────────────────────────────────────────────────────────

export function buildSectionGroups(mode: GroupingMode): SectionGroup[] {
  if (mode === 'wc_group') return buildWCGroups()
  return buildConfederationGroups()
}

function buildWCGroups(): SectionGroup[] {
  const byGroup: Record<string, typeof SECTIONS> = {}
  SECTIONS.forEach(s => {
    const g = s.group ?? (s.code === 'FWC' ? 'FIFA' : 'Bonus')
    if (!byGroup[g]) byGroup[g] = []
    byGroup[g].push(s)
  })

  return WC_GROUP_ORDER.flatMap(groupId => {
    const secs = byGroup[groupId]
    if (!secs?.length) return []
    return [{
      groupId,
      groupLabel: WC_GROUP_LABELS[groupId],
      sections: secs.map(s => ({ code: s.code, label: s.label })),
    }]
  })
}

function buildConfederationGroups(): SectionGroup[] {
  const groups: SectionGroup[] = []

  // FWC always first
  const fwc = SECTIONS.find(s => s.code === 'FWC')
  if (fwc) {
    groups.push({
      groupId: 'FIFA',
      groupLabel: '🏆 FIFA World Cup',
      sections: [{ code: fwc.code, label: fwc.label }],
    })
  }

  // Team sections grouped by confederation
  const teamSections = SECTIONS.filter(s => s.code !== 'FWC' && s.code !== 'COC')

  for (const conf of CONFEDERATION_ORDER) {
    const confSecs = teamSections
      .filter(s => TEAM_CONFEDERATION[s.code] === conf)
      .sort((a, b) => a.label.localeCompare(b.label)) // alphabetical within confederation

    if (confSecs.length) {
      groups.push({
        groupId: conf,
        groupLabel: CONFEDERATION_LABELS[conf],
        sections: confSecs.map(s => ({ code: s.code, label: s.label })),
      })
    }
  }

  // COC always last
  const coc = SECTIONS.find(s => s.code === 'COC')
  if (coc) {
    groups.push({
      groupId: 'Bonus',
      groupLabel: '⭐ Coca-Cola Bonus',
      sections: [{ code: coc.code, label: coc.label }],
    })
  }

  return groups
}

// ── Helper: get section's group label in current mode ─────────────────────────

export function getSectionGroupLabel(sectionCode: string, mode: GroupingMode): string {
  if (mode === 'wc_group') {
    const s = SECTIONS.find(sec => sec.code === sectionCode)
    const g = s?.group ?? (sectionCode === 'FWC' ? 'FIFA' : 'Bonus')
    return WC_GROUP_LABELS[g] ?? g
  } else {
    if (sectionCode === 'FWC') return '🏆 FIFA World Cup'
    if (sectionCode === 'COC') return '⭐ Coca-Cola Bonus'
    const conf = TEAM_CONFEDERATION[sectionCode]
    return conf ? CONFEDERATION_LABELS[conf] : sectionCode
  }
}

export function getSectionGroupId(sectionCode: string, mode: GroupingMode): string {
  if (mode === 'wc_group') {
    const s = SECTIONS.find(sec => sec.code === sectionCode)
    return s?.group ?? (sectionCode === 'FWC' ? 'FIFA' : 'Bonus')
  } else {
    if (sectionCode === 'FWC') return 'FIFA'
    if (sectionCode === 'COC') return 'Bonus'
    return TEAM_CONFEDERATION[sectionCode] ?? 'Other'
  }
}
