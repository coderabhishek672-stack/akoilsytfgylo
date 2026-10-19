import { getInstrument } from '@/lib/exchange'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const result = await getInstrument()
    return Response.json(result.data, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Instrument not verified' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
