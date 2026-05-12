import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { passcode } = await req.json()
  const expected = process.env.HOUSEHOLD_PASSCODE ?? 'panini2026'

  if (passcode === expected) {
    return new NextResponse(null, { status: 200 })
  }
  return new NextResponse(null, { status: 401 })
}
