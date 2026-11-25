// The ambient pattern: the position changes, the library gathers evidence, and your AI decides
// whether anything is worth saying. Ambient Context never makes that decision.
import { getEnvironmentalContext, type EnvironmentalContext } from 'ambient-context';

/** Keep what helps a decision; keep the limitations so the AI does not overstate the data. */
export function evidenceForAgent(context: EnvironmentalContext) {
  const forecast = context.forecast?.status === 'fulfilled' ? context.forecast.value : undefined;
  const rain = context.rain?.status === 'fulfilled' ? context.rain.value : undefined;
  const surroundings = context.surroundings?.status === 'fulfilled' ? context.surroundings.value : undefined;
  return {
    surroundings: surroundings && {state: surroundings.state, within: surroundings.evidence?.areas.slice(0, 5),
      nearby_lines: surroundings.evidence?.lines.slice(0, 5), limitations: surroundings.evidence?.limitations},
    forecast: forecast && {status: forecast.status, updated_at: forecast.updated_at, current: forecast.current,
      next_hours: forecast.forecast.slice(0, 6), limitations: forecast.limitations},
    nearby_rain: rain,
  };
}

/** Replace with your model call. Return null to stay silent; silence is a valid outcome. */
async function decide(evidence: ReturnType<typeof evidenceForAgent>): Promise<string | null> {
  void evidence;
  return null;
}

export async function onPositionChanged(position: {latitude: number; longitude: number; accuracy: number}) {
  const context = await getEnvironmentalContext(position, {userAgent: 'MyAmbientApp/0.1 (+https://example.com/contact)'});
  const message = await decide(evidenceForAgent(context));
  if (message) console.log(message);
}
